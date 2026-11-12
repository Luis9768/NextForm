package com.formshq.service;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.formshq.domain.entity.CallRecord;
import com.formshq.domain.entity.Customer;
import com.formshq.domain.entity.User;
import com.formshq.domain.enums.CallStatus;
import com.formshq.domain.enums.Role;
import com.formshq.dto.call.CallRecordResponse;
import com.formshq.dto.customer.CustomerDto;
import com.formshq.dto.customer.CustomerLookupResponse;
import com.formshq.dto.customer.CustomerSaveRequest;
import com.formshq.dto.customer.CustomerWebhookLookupRequest;
import com.formshq.exception.BusinessRuleException;
import com.formshq.exception.ResourceNotFoundException;
import com.formshq.repository.CallRecordRepository;
import com.formshq.repository.CustomerRepository;
import com.formshq.repository.UserRepository;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.ParameterizedTypeReference;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.client.RestClient;

import java.net.InetAddress;
import java.net.URI;
import java.time.OffsetDateTime;
import java.util.*;

@Slf4j
@Service
public class CustomerLookupService {

    private final CustomerRepository customerRepository;
    private final CallRecordRepository callRecordRepository;
    private final UserRepository userRepository;
    private final ObjectMapper objectMapper;
    private final R2ObjectStorageService r2ObjectStorageService;
    private final RestClient restClient;
    private final boolean externalApiEnabled;
    private final String defaultWebhookUrl;
    private final String sacRetencaoWebhookUrl;
    private final String directusBaseUrl;
    private final String directusApiToken;
    private volatile boolean probeWavUploaded = false;

    public CustomerLookupService(
            CustomerRepository customerRepository,
            CallRecordRepository callRecordRepository,
            UserRepository userRepository,
            ObjectMapper objectMapper,
            R2ObjectStorageService r2ObjectStorageService,
            @Value("${app.integrations.customer-api.base-url:https://api.crm-externo.empresa.com/v1}") String baseUrl,
            @Value("${app.integrations.customer-api.api-token:crm-external-bearer-token-2026}") String apiToken,
            @Value("${app.integrations.customer-api.enabled:false}") boolean externalApiEnabled,
            @Value("${app.integrations.customer-webhook.url:${CUSTOMER_WEBHOOK_URL:}}") String defaultWebhookUrl,
            @Value("${app.integrations.sac-retencao-webhook.url:${SAC_RETENCAO_WEBHOOK_URL:}}") String sacRetencaoWebhookUrl,
            @Value("${app.integrations.directus.base-url:${DIRECTUS_BASE_URL:}}") String directusBaseUrl,
            @Value("${app.integrations.directus.api-token:${DIRECTUS_API_TOKEN:}}") String directusApiToken
    ) {
        this.customerRepository = customerRepository;
        this.callRecordRepository = callRecordRepository;
        this.userRepository = userRepository;
        this.objectMapper = objectMapper;
        this.r2ObjectStorageService = r2ObjectStorageService;
        this.externalApiEnabled = externalApiEnabled;
        this.defaultWebhookUrl = defaultWebhookUrl;
        this.sacRetencaoWebhookUrl = sacRetencaoWebhookUrl;
        this.directusBaseUrl = directusBaseUrl;
        this.directusApiToken = directusApiToken;
        this.restClient = RestClient.builder()
                .baseUrl(baseUrl)
                .defaultHeader(HttpHeaders.AUTHORIZATION, "Bearer " + apiToken)
                .defaultHeader(HttpHeaders.ACCEPT, MediaType.APPLICATION_JSON_VALUE)
                .build();
    }

    @Transactional
    public CustomerLookupResponse lookupByPhone(String rawKey) {
        return lookupByPhone(rawKey, null);
    }

    @Transactional
    public CustomerLookupResponse lookupByPhone(String rawKey, UUID analystId) {
        return triggerWebhookLookup(new CustomerWebhookLookupRequest(rawKey, rawKey, "AUTO", analystId, null));
    }

    @Transactional
    public CustomerLookupResponse triggerWebhookLookup(CustomerWebhookLookupRequest request) {
        String rawKey = request.resolvedKey();
        if (rawKey.isBlank() || rawKey.length() < 3) {
            throw new BusinessRuleException("Informe um telefone ou chave válida (mín. 3 caracteres) para puxar os dados de contato.");
        }

        String detectedType = resolveKeyType(rawKey, request.keyType());
        String cleanTicket = rawKey.replace("#", "").trim();
        String cleanPhone = normalizePhone(request.phone() != null && !request.phone().isBlank() ? request.phone() : rawKey);
        String digitsOnlyKey = rawKey.replaceAll("\\D", "");
        String cleanValue = "TELEFONE".equals(detectedType)
                ? cleanPhone
                : ("TICKET".equals(detectedType) ? cleanTicket : rawKey.trim());

        String paramCpf = (request.cpf() != null && !request.cpf().isBlank())
                ? request.cpf().replaceAll("\\D", "")
                : ("CPF".equals(detectedType) ? digitsOnlyKey : "");
        String paramMotherName = (request.motherName() != null && !request.motherName().isBlank())
                ? request.motherName().trim()
                : "";
        String paramFatherName = (request.fatherName() != null && !request.fatherName().isBlank())
                ? request.fatherName().trim()
                : "";
        String paramPersonName = (request.name() != null && !request.name().isBlank())
                ? request.name().trim()
                : ("NOME".equals(detectedType) ? cleanValue : "");

        // Fluxo dedicado de busca por Ticket (sem #) para SAC e Retenção
        if ("TICKET".equalsIgnoreCase(detectedType) && sacRetencaoWebhookUrl != null && !sacRetencaoWebhookUrl.isBlank()) {
            try {
                String probeAudioUrl = resolveProbeAudioUrlForTicketLookup();
                String encodedAudiUrl = java.net.URLEncoder.encode(probeAudioUrl != null ? probeAudioUrl : "", java.nio.charset.StandardCharsets.UTF_8);
                String encodedTicket = java.net.URLEncoder.encode(cleanTicket, java.nio.charset.StandardCharsets.UTF_8);
                String baseSacUrl = sacRetencaoWebhookUrl.trim();
                String sep = baseSacUrl.contains("?") ? "&" : "?";
                URI getUri = URI.create(baseSacUrl + sep + "audiUrl=" + encodedAudiUrl + "&ticket=" + encodedTicket);

                String rawSacBody = RestClient.create()
                        .get()
                        .uri(getUri)
                        .retrieve()
                        .body(String.class);

                Map<String, Object> sacResponse = parseWebhookJsonToMap(rawSacBody);
                if (hasMeaningfulContactData(sacResponse)) {
                    Customer synced = syncCustomerFromExternalMap(
                            cleanTicket,
                            sacResponse,
                            paramPersonName,
                            paramCpf,
                            paramMotherName,
                            paramFatherName
                    );
                    List<CallRecordResponse> calls = findOrProvisionCallsForCustomer(synced, synced.getPhone(), request.analystId());
                    return new CustomerLookupResponse(CustomerDto.fromEntity(synced), "WEBHOOK_SAC_RETENCAO_TICKET", calls, sacResponse);
                }
            } catch (Exception e) {
                log.warn("Aviso ao consultar webhook SAC/Retenção por ticket={}: {}", cleanTicket, e.getMessage());
            }
        }

        String targetWebhook = resolveSafeWebhookUrl(request.webhookUrl());
        String source = "WEBHOOK_CRM_SYNC (" + detectedType + ")";

        if (targetWebhook != null) {
            try {
                Map<String, Object> webhookPayload = new LinkedHashMap<>();
                webhookPayload.put("telefone", !cleanPhone.isEmpty() ? cleanPhone : cleanValue);
                webhookPayload.put("ticket", cleanTicket);
                webhookPayload.put("Ticket", cleanTicket);
                webhookPayload.put("cpf", !paramCpf.isEmpty() ? paramCpf : (!digitsOnlyKey.isEmpty() ? digitsOnlyKey : cleanValue));
                webhookPayload.put("nome_da_mae", paramMotherName);
                webhookPayload.put("nome_do_pai", paramFatherName);
                webhookPayload.put("nome", paramPersonName);
                webhookPayload.put("nome_da_pessoa", paramPersonName);

                webhookPayload.put("CPF", !paramCpf.isEmpty() ? paramCpf : (!digitsOnlyKey.isEmpty() ? digitsOnlyKey : cleanValue));
                webhookPayload.put("Nome_da_mae", paramMotherName);
                webhookPayload.put("Nome_do_pai", paramFatherName);
                webhookPayload.put("Nome", paramPersonName);
                webhookPayload.put("Telefone_Portabilidade", !cleanPhone.isEmpty() ? cleanPhone : cleanValue);
                webhookPayload.put("proposta", cleanValue);
                webhookPayload.put("Proposta", cleanValue);
                webhookPayload.put("chave", cleanValue);
                webhookPayload.put("searchKey", cleanValue);
                webhookPayload.put("keyType", detectedType);
                webhookPayload.put("phone", !cleanPhone.isEmpty() ? cleanPhone : cleanValue);
                webhookPayload.put("contato", cleanValue);
                webhookPayload.put("email", "EMAIL".equals(detectedType) ? cleanValue : "");
                if (request.analystId() != null) {
                    webhookPayload.put("analystId", request.analystId().toString());
                }

                String rawResponseBody = RestClient.create()
                        .post()
                        .uri(targetWebhook)
                        .contentType(MediaType.APPLICATION_JSON)
                        .body(webhookPayload)
                        .retrieve()
                        .body(String.class);

                Map<String, Object> webhookResponse = parseWebhookJsonToMap(rawResponseBody);

                if (hasMeaningfulContactData(webhookResponse)) {
                    Customer synced = syncCustomerFromExternalMap(
                            cleanPhone.isEmpty() ? cleanValue : cleanPhone,
                            webhookResponse,
                            paramPersonName,
                            paramCpf,
                            paramMotherName,
                            paramFatherName
                    );
                    source = "WEBHOOK_POST_DIRECTUS";
                    List<CallRecordResponse> calls = findOrProvisionCallsForCustomer(synced, synced.getPhone(), request.analystId());
                    return new CustomerLookupResponse(CustomerDto.fromEntity(synced), source, calls, webhookResponse);
                }
            } catch (Exception e) {
                log.warn("Webhook externo ({}) indisponível ou sem retorno para key={}: {}. Tentando fallback Directus.",
                        targetWebhook, cleanValue, e.getMessage());
            }
        }

        // Fallback direto na API REST do Directus (quando configurado no .env)
        if (directusBaseUrl != null && !directusBaseUrl.isBlank() && !cleanPhone.isEmpty()) {
            try {
                String cleanDirBase = directusBaseUrl.trim().replaceAll("/+$", "");
                RestClient.Builder dirBuilder = RestClient.builder()
                        .baseUrl(cleanDirBase)
                        .defaultHeader(HttpHeaders.ACCEPT, MediaType.APPLICATION_JSON_VALUE);
                if (directusApiToken != null && !directusApiToken.isBlank()) {
                    dirBuilder.defaultHeader(HttpHeaders.AUTHORIZATION, "Bearer " + directusApiToken.trim());
                }
                String dirRaw = dirBuilder.build()
                        .get()
                        .uri(uriBuilder -> uriBuilder
                                .path("/items/Monitoria_Tim_Aquisicao")
                                .queryParam("filter[Telefone_Portabilidade][_contains]", cleanPhone)
                                .queryParam("limit", 1)
                                .build())
                        .retrieve()
                        .body(String.class);

                Map<String, Object> dirMap = parseDirectusFirstItemToMap(dirRaw);
                if (hasMeaningfulContactData(dirMap)) {
                    Customer synced = syncCustomerFromExternalMap(
                            cleanPhone,
                            dirMap,
                            paramPersonName,
                            paramCpf,
                            paramMotherName,
                            paramFatherName
                    );
                    source = "DIRECTUS_REST_API";
                    List<CallRecordResponse> calls = findOrProvisionCallsForCustomer(synced, synced.getPhone(), request.analystId());
                    return new CustomerLookupResponse(CustomerDto.fromEntity(synced), source, calls);
                }
            } catch (Exception e) {
                log.debug("Fallback Directus sem retorno para phone={}: {}", cleanPhone, e.getMessage());
            }
        }

        if (externalApiEnabled) {
            try {
                Map<String, Object> externalData = restClient.get()
                        .uri(uriBuilder -> uriBuilder
                                .path("/customers/lookup")
                                .queryParam("phone", cleanValue)
                                .queryParam("key", cleanValue)
                                .queryParam("type", detectedType)
                                .build())
                        .retrieve()
                        .body(new ParameterizedTypeReference<>() {});

                if (hasMeaningfulContactData(externalData)) {
                    Customer synced = syncCustomerFromExternalMap(
                            cleanValue,
                            externalData,
                            paramPersonName,
                            paramCpf,
                            paramMotherName,
                            paramFatherName
                    );
                    source = "EXTERNAL_REST_API";
                    List<CallRecordResponse> calls = findOrProvisionCallsForCustomer(synced, synced.getPhone(), request.analystId());
                    return new CustomerLookupResponse(CustomerDto.fromEntity(synced), source, calls);
                }
            } catch (Exception e) {
                log.warn("API externa indisponível para key={}: {}", cleanValue, e.getMessage());
            }
        }

        Optional<Customer> matchedCustomer = findCustomerByFlexibleKey(rawKey, detectedType)
                .filter(c -> c.getName() != null
                        && !c.getName().isBlank()
                        && !c.getName().startsWith("Contato ")
                        && !c.getName().startsWith("Cliente ")
                        && !c.getName().startsWith("Ticket "));

        if (matchedCustomer.isEmpty()) {
            CustomerDto emptyDto = new CustomerDto(
                    null,
                    cleanPhone,
                    "",
                    paramPersonName,
                    paramCpf,
                    "",
                    paramMotherName,
                    paramFatherName,
                    "",
                    "",
                    "",
                    "",
                    "",
                    "",
                    "",
                    "",
                    ""
            );
            return new CustomerLookupResponse(emptyDto, "NOT_FOUND", List.of());
        }

        Customer customer = ensureWebhookFieldsPopulated(matchedCustomer.get());

        if (customer.getPhone() != null && customer.getPhone().startsWith("+55")) {
            customer.setPhone(normalizePhone(customer.getPhone()));
            customer = customerRepository.save(customer);
        }

        String phoneDigits = customer.getPhone().replaceAll("\\D", "");
        String searchSuffix = phoneDigits.length() >= 9 ? phoneDigits.substring(phoneDigits.length() - 9) : phoneDigits;
        List<CallRecordResponse> recordings = findOrProvisionCallsForCustomer(customer, searchSuffix, request.analystId());

        return new CustomerLookupResponse(CustomerDto.fromEntity(customer), source, recordings);
    }

    /**
     * Valida a URL do Webhook contra SSRF (OWASP A10), bloqueando endereços internos, loopback e link-local.
     */
    private String resolveSafeWebhookUrl(String requestedUrl) {
        String candidate = (defaultWebhookUrl != null && !defaultWebhookUrl.isBlank())
                ? defaultWebhookUrl.trim()
                : (requestedUrl != null && !requestedUrl.isBlank() ? requestedUrl.trim() : null);

        if (candidate == null || candidate.isBlank()) {
            return null;
        }

        try {
            URI uri = URI.create(candidate);
            String scheme = uri.getScheme();
            String host = uri.getHost();
            if (scheme == null || host == null || (!"https".equalsIgnoreCase(scheme) && !"http".equalsIgnoreCase(scheme))) {
                return null;
            }
            // Se a URL veio da variável de ambiente configurada no servidor (CUSTOMER_WEBHOOK_URL), permite resolução em rede Docker (Easypanel)
            if (defaultWebhookUrl != null && !defaultWebhookUrl.isBlank()
                    && candidate.equalsIgnoreCase(defaultWebhookUrl.trim())) {
                return uri.toString();
            }
            if (!"https".equalsIgnoreCase(scheme)) {
                return null;
            }
            String lowerHost = host.toLowerCase();
            if ("localhost".equals(lowerHost)
                    || "127.0.0.1".equals(lowerHost)
                    || "0.0.0.0".equals(lowerHost)
                    || "169.254.169.254".equals(lowerHost)
                    || lowerHost.endsWith(".internal")
                    || lowerHost.endsWith(".local")) {
                log.warn("Tentativa de SSRF bloqueada para host não permitido: {}", host);
                return null;
            }
            InetAddress address = InetAddress.getByName(host);
            if (address.isLoopbackAddress() || address.isLinkLocalAddress() || address.isSiteLocalAddress() || address.isAnyLocalAddress()) {
                log.warn("Tentativa de SSRF bloqueada para IP privado/interno: {}", address.getHostAddress());
                return null;
            }
            return uri.toString();
        } catch (Exception e) {
            log.warn("URL de webhook inválida ou não resolvida ({}): {}", candidate, e.getMessage());
            return null;
        }
    }

    @SuppressWarnings("unchecked")
    private Map<String, Object> parseWebhookJsonToMap(String rawJson) {
        if (rawJson == null || rawJson.isBlank()) {
            return Collections.emptyMap();
        }
        try {
            String trimmed = rawJson.trim();
            Map<String, Object> parsed = Collections.emptyMap();
            if (trimmed.startsWith("[")) {
                List<Map<String, Object>> list = objectMapper.readValue(trimmed, new TypeReference<>() {});
                if (!list.isEmpty() && list.get(0) != null) {
                    parsed = new LinkedHashMap<>(list.get(0));
                }
            } else if (trimmed.startsWith("{")) {
                parsed = new LinkedHashMap<>(objectMapper.readValue(trimmed, new TypeReference<>() {}));
            }
            if (parsed.containsKey("data") && parsed.get("data") instanceof Map<?, ?> nestedData) {
                Map<String, Object> merged = new LinkedHashMap<>(parsed);
                merged.putAll((Map<String, Object>) nestedData);
                return merged;
            }
            return parsed;
        } catch (Exception e) {
            log.warn("Não foi possível converter resposta JSON do webhook: {}", e.getMessage());
        }
        return Collections.emptyMap();
    }

    @SuppressWarnings("unchecked")
    private Map<String, Object> parseDirectusFirstItemToMap(String rawJson) {
        if (rawJson == null || rawJson.isBlank()) {
            return Collections.emptyMap();
        }
        try {
            Map<String, Object> root = objectMapper.readValue(rawJson, new TypeReference<>() {});
            Object dataObj = root.get("data");
            if (dataObj instanceof List<?> list && !list.isEmpty() && list.get(0) instanceof Map<?, ?> first) {
                return (Map<String, Object>) first;
            }
        } catch (Exception ignored) {
        }
        return Collections.emptyMap();
    }

    private boolean hasMeaningfulContactData(Map<String, Object> map) {
        if (map == null || map.isEmpty()) {
            return false;
        }
        String check = pickAnyString(
                map,
                List.of(
                        "Nome", "nome", "nome_completo", "nome_da_pessoa",
                        "CPF", "cpf", "telefone_origem", "ticket_id", "protocolo",
                        "administradora", "operadora",
                        "Nome_da_mae", "nome_da_mae", "Nome_do_pai", "nome_do_pai",
                        "Proposta", "proposta"
                ),
                ""
        );
        return !check.isBlank();
    }

    private String resolveProbeAudioUrlForTicketLookup() {
        String probeKey = "probe_ticket_lookup.wav";
        if (r2ObjectStorageService != null && r2ObjectStorageService.isConfigured()) {
            if (!probeWavUploaded) {
                try {
                    byte[] silentWav = buildMinimalSilentWav();
                    r2ObjectStorageService.uploadAudioObject(probeKey, silentWav, "audio/wav");
                    probeWavUploaded = true;
                } catch (Exception ignored) {
                }
            }
            String presigned = r2ObjectStorageService.generatePresignedGetUrl(probeKey, 86400).orElse(null);
            if (presigned != null) {
                return presigned.replace("%2F", "/");
            }
        }
        return "";
    }

    private byte[] buildMinimalSilentWav() {
        int sampleRate = 8000;
        int numSamples = 1600; // 0.2s mono 16-bit
        int dataSize = numSamples * 2;
        java.nio.ByteBuffer buf = java.nio.ByteBuffer.allocate(44 + dataSize).order(java.nio.ByteOrder.LITTLE_ENDIAN);
        buf.put("RIFF".getBytes(java.nio.charset.StandardCharsets.US_ASCII));
        buf.putInt(36 + dataSize);
        buf.put("WAVE".getBytes(java.nio.charset.StandardCharsets.US_ASCII));
        buf.put("fmt ".getBytes(java.nio.charset.StandardCharsets.US_ASCII));
        buf.putInt(16);
        buf.putShort((short) 1);
        buf.putShort((short) 1);
        buf.putInt(sampleRate);
        buf.putInt(sampleRate * 2);
        buf.putShort((short) 2);
        buf.putShort((short) 16);
        buf.put("data".getBytes(java.nio.charset.StandardCharsets.US_ASCII));
        buf.putInt(dataSize);
        return buf.array();
    }

    @Transactional
    public CustomerDto updateCustomerData(UUID id, CustomerSaveRequest request) {
        Customer customer = customerRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Cliente não encontrado com ID: " + id));

        if (request.phone() != null && !request.phone().isBlank()) {
            customer.setPhone(normalizePhone(request.phone()));
        }
        if (request.saleDate() != null) customer.setSaleDate(request.saleDate());
        customer.setName(request.name().trim());
        customer.setDocument(request.document().trim());
        if (request.birthDate() != null) customer.setBirthDate(request.birthDate());
        if (request.motherName() != null) customer.setMotherName(request.motherName());
        if (request.fatherName() != null) customer.setFatherName(request.fatherName());
        if (request.contractedPlan() != null) customer.setContractedPlan(request.contractedPlan());
        if (request.proposal() != null) customer.setProposal(request.proposal());
        if (request.email() != null) customer.setEmail(request.email());
        if (request.paymentMethod() != null) customer.setPaymentMethod(request.paymentMethod());
        if (request.invoiceType() != null) customer.setInvoiceType(request.invoiceType());
        if (request.fullAddress() != null) customer.setFullAddress(request.fullAddress());
        if (request.dueDate() != null) customer.setDueDate(request.dueDate());
        if (request.earlyPortability() != null) customer.setEarlyPortability(request.earlyPortability());

        return CustomerDto.fromEntity(customerRepository.save(customer));
    }

    /**
     * Padroniza o telefone SEM +55 (ex: "+55 (11) 99999-9999" -> "11999999999")
     */
    public static String normalizePhone(String rawPhone) {
        if (rawPhone == null) return "";
        String trimmed = rawPhone.trim();
        if (trimmed.startsWith("+55")) {
            trimmed = trimmed.substring(3).trim();
        }
        String digits = trimmed.replaceAll("\\D", "");
        if (digits.isEmpty()) return "";
        if (digits.startsWith("55") && (digits.length() == 12 || digits.length() == 13)) {
            digits = digits.substring(2);
        }
        return digits;
    }

    private String resolveKeyType(String rawKey, String requestedType) {
        if (requestedType != null && !requestedType.isBlank() && !"AUTO".equalsIgnoreCase(requestedType)) {
            return requestedType.trim().toUpperCase();
        }
        String trimmed = rawKey.trim();
        if (trimmed.contains("@")) {
            return "EMAIL";
        }
        if (trimmed.toUpperCase().startsWith("PROP") || trimmed.toUpperCase().startsWith("CRM") || trimmed.toUpperCase().startsWith("PROT")) {
            return "PROPOSTA";
        }
        if (trimmed.matches("\\d{3}\\.\\d{3}\\.\\d{3}-\\d{2}")) {
            return "CPF";
        }
        String digits = trimmed.replaceAll("\\D", "");
        if (digits.length() >= 8 && digits.length() <= 13 && !trimmed.matches(".*[a-zA-Z]{2,}.*")) {
            return "TELEFONE";
        }
        if (trimmed.matches(".*[a-zA-Z]{2,}.*")) {
            return "NOME";
        }
        return "TELEFONE";
    }

    private Optional<Customer> findCustomerByFlexibleKey(String rawKey, String keyType) {
        String cleanPhone = normalizePhone(rawKey);
        if (!cleanPhone.isEmpty()) {
            Optional<Customer> directByPhone = customerRepository.findByPhone(cleanPhone);
            if (directByPhone.isPresent()) return directByPhone;

            String suffix = cleanPhone.length() >= 9 ? cleanPhone.substring(cleanPhone.length() - 9) : cleanPhone;
            Optional<Customer> bySuffix = customerRepository.findFirstByPhoneEndingWith(suffix);
            if (bySuffix.isPresent()) return bySuffix;
        }

        if ("EMAIL".equals(keyType)) {
            Optional<Customer> byEmail = customerRepository.findFirstByEmailIgnoreCase(rawKey.trim());
            if (byEmail.isPresent()) return byEmail;
        }

        if ("PROPOSTA".equals(keyType)) {
            String trimmed = rawKey.trim();
            Optional<Customer> byProp = customerRepository.findFirstByProposalIgnoreCaseOrProtocolIgnoreCase(trimmed, trimmed);
            if (byProp.isPresent()) return byProp;
        }

        if ("NOME".equals(keyType)) {
            Optional<Customer> byName = customerRepository.findFirstByNameContainingIgnoreCase(rawKey.trim());
            if (byName.isPresent()) return byName;
        }

        String digits = rawKey.replaceAll("\\D", "");
        String qLower = rawKey.trim().toLowerCase();
        return customerRepository.findAll().stream()
                .filter(c -> {
                    if (!digits.isEmpty() && c.getDocument() != null && c.getDocument().replaceAll("\\D", "").equals(digits)) {
                        return true;
                    }
                    if (c.getProposal() != null && c.getProposal().equalsIgnoreCase(rawKey.trim())) {
                        return true;
                    }
                    if (c.getProtocol() != null && c.getProtocol().equalsIgnoreCase(rawKey.trim())) {
                        return true;
                    }
                    if (c.getEmail() != null && c.getEmail().equalsIgnoreCase(qLower)) {
                        return true;
                    }
                    return c.getName() != null && c.getName().toLowerCase().contains(qLower);
                })
                .findFirst();
    }

    private List<CallRecordResponse> findOrProvisionCallsForCustomer(
            Customer customer,
            String phoneFragment,
            UUID analystId
    ) {
        List<CallRecord> matched = callRecordRepository.findByCustomerIdOrderByCallDateDesc(customer.getId());
        if (matched.isEmpty() && phoneFragment != null && !phoneFragment.isBlank()) {
            matched = callRecordRepository.findByCustomerIdentifierContainingOrderByCallDateDesc(phoneFragment);
        }

        if (analystId != null) {
            List<CallRecord> forAnalyst = matched.stream()
                    .filter(c -> c.getAnalyst() != null && c.getAnalyst().getId().equals(analystId))
                    .toList();
            if (!forAnalyst.isEmpty()) {
                return forAnalyst.stream().map(CallRecordResponse::fromEntity).toList();
            }
        }

        return matched.stream().map(CallRecordResponse::fromEntity).toList();
    }

    private Customer syncCustomerFromExternalMap(
            String fallbackKey,
            Map<String, Object> data,
            String fallbackPersonName,
            String fallbackCpf,
            String fallbackMotherName,
            String fallbackFatherName
    ) {
        String rawPhone = pickAnyString(data, List.of("Telefone", "telefone", "telefone_origem", "Telefone_Portabilidade", "phone", "contato", "celular"), fallbackKey);
        String cleanPhone = normalizePhone(rawPhone);
        if (cleanPhone.isEmpty()) {
            int hash = fallbackKey.hashCode() & 0x7fffffff;
            cleanPhone = "119" + String.format("%08d", hash % 100000000);
        }

        final String lookupPhone = cleanPhone;
        Customer customer = customerRepository.findByPhone(lookupPhone)
                .orElseGet(() -> Customer.builder().phone(lookupPhone).build());

        customer.setPhone(lookupPhone);
        customer.setSaleDate(pickAnyString(data, List.of("Data_Venda", "Data_da_Venda", "data_da_venda", "dataDaVenda", "saleDate"), ""));
        customer.setName(pickAnyString(data, List.of("Nome", "nome", "nome_completo", "nome_da_pessoa", "Nome_da_Pessoa", "name", "cliente"),
                fallbackPersonName));
        customer.setDocument(pickAnyString(data, List.of("CPF", "Cpf", "cpf", "document", "documento"),
                !fallbackCpf.isBlank() ? fallbackCpf : ""));
        customer.setBirthDate(pickAnyString(data, List.of("Data_de_nascimento", "Data_Nascimento", "data_de_nascimento", "dataDeNascimento", "birthDate"), ""));
        customer.setMotherName(pickAnyString(data, List.of("Nome_da_mae", "Nome_da_Mae", "nome_da_mae", "nomeDaMae", "motherName", "mae", "filiacao"),
                !fallbackMotherName.isBlank() ? fallbackMotherName : ""));
        customer.setFatherName(pickAnyString(data, List.of("Nome_do_pai", "Nome_do_Pai", "nome_do_pai", "nomeDoPai", "fatherName", "pai", "parentName"),
                !fallbackFatherName.isBlank() ? fallbackFatherName : ""));
        customer.setContractedPlan(pickAnyString(data, List.of("Plano_Contratado", "plano_contratado", "planoContratado", "contractedPlan", "plano", "operadora", "administradora"), ""));
        customer.setProposal(pickAnyString(data, List.of("Proposta", "proposta", "proposal", "ticket_id", "ticket", "protocolo"), "").replace("#", "").trim());
        customer.setEmail(pickAnyString(data, List.of("Email", "email", "e_mail"), ""));
        customer.setPaymentMethod(pickAnyString(data, List.of("Forma_de_Pagamento", "forma_de_pagamento", "formaDePagamento", "paymentMethod"), ""));
        customer.setInvoiceType(pickAnyString(data, List.of("Tipo_de_Fatura", "tipo_de_fatura", "tipoDeFatura", "invoiceType"), ""));
        customer.setFullAddress(pickAnyString(data, List.of("Endereco_Completo", "endereco_completo", "enderecoCompleto", "fullAddress", "endereco"), ""));
        customer.setDueDate(pickAnyString(data, List.of("Vencimento", "vencimento", "dueDate"), ""));
        customer.setEarlyPortability(pickAnyString(data, List.of("Portabilidade_Antecipada", "portabilidade_antecipada", "portabilidadeAntecipada", "earlyPortability"), ""));
        customer.setProtocol(pickAnyString(data, List.of("protocolo", "Proposta", "protocol", "ticket_id", "ticket"), "").replace("#", "").trim());

        return customerRepository.save(customer);
    }

    private String pickAnyString(Map<String, Object> map, List<String> candidateKeys, String fallback) {
        for (String candidate : candidateKeys) {
            Object direct = map.get(candidate);
            if (direct != null && !String.valueOf(direct).isBlank()) {
                return String.valueOf(direct).trim();
            }
            for (Map.Entry<String, Object> entry : map.entrySet()) {
                if (entry.getKey().equalsIgnoreCase(candidate) && entry.getValue() != null && !String.valueOf(entry.getValue()).isBlank()) {
                    return String.valueOf(entry.getValue()).trim();
                }
            }
        }
        return fallback;
    }

    private Customer ensureWebhookFieldsPopulated(Customer c) {
        if (c.getPhone() != null && c.getPhone().startsWith("+55")) {
            c.setPhone(normalizePhone(c.getPhone()));
            return customerRepository.save(c);
        }
        return c;
    }

    private Customer createFallbackCustomerForKey(
            String rawKey,
            String keyType,
            String paramPersonName,
            String paramCpf,
            String paramMotherName,
            String paramFatherName
    ) {
        int hash = rawKey.hashCode() & 0x7fffffff;
        String cleanPhone = "TELEFONE".equals(keyType)
                ? normalizePhone(rawKey)
                : ("119" + String.format("%08d", hash % 100000000));
        if (cleanPhone.isEmpty()) {
            cleanPhone = "119" + String.format("%08d", hash % 100000000);
        }

        String cpf = !paramCpf.isBlank()
                ? paramCpf
                : ("CPF".equals(keyType) ? rawKey.trim() : "");
        String proposal = "PROPOSTA".equals(keyType) ? rawKey.trim().toUpperCase() : "";
        String email = "EMAIL".equals(keyType) ? rawKey.trim().toLowerCase() : "";
        String name = !paramPersonName.isBlank()
                ? paramPersonName
                : ("NOME".equals(keyType) ? rawKey.trim() : ("Contato " + cleanPhone));

        return customerRepository.save(Customer.builder()
                .phone(cleanPhone)
                .saleDate("")
                .name(name)
                .document(cpf)
                .birthDate("")
                .motherName(paramMotherName)
                .fatherName(paramFatherName)
                .contractedPlan("")
                .proposal(proposal)
                .email(email)
                .paymentMethod("")
                .invoiceType("")
                .fullAddress("")
                .dueDate("")
                .earlyPortability("")
                .protocol(proposal)
                .build());
    }
}
