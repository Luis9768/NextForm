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

import java.time.OffsetDateTime;
import java.util.*;

@Slf4j
@Service
public class CustomerLookupService {

    private final CustomerRepository customerRepository;
    private final CallRecordRepository callRecordRepository;
    private final UserRepository userRepository;
    private final ObjectMapper objectMapper;
    private final RestClient restClient;
    private final boolean externalApiEnabled;
    private final String defaultWebhookUrl;

    public CustomerLookupService(
            CustomerRepository customerRepository,
            CallRecordRepository callRecordRepository,
            UserRepository userRepository,
            ObjectMapper objectMapper,
            @Value("${app.integrations.customer-api.base-url:https://api.crm-externo.empresa.com/v1}") String baseUrl,
            @Value("${app.integrations.customer-api.api-token:crm-external-bearer-token-2026}") String apiToken,
            @Value("${app.integrations.customer-api.enabled:false}") boolean externalApiEnabled,
            @Value("${app.integrations.customer-webhook.url:${CUSTOMER_WEBHOOK_URL:}}") String defaultWebhookUrl
    ) {
        this.customerRepository = customerRepository;
        this.callRecordRepository = callRecordRepository;
        this.userRepository = userRepository;
        this.objectMapper = objectMapper;
        this.externalApiEnabled = externalApiEnabled;
        this.defaultWebhookUrl = defaultWebhookUrl;
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
        String cleanPhone = normalizePhone(request.phone() != null && !request.phone().isBlank() ? request.phone() : rawKey);
        String digitsOnlyKey = rawKey.replaceAll("\\D", "");
        String cleanValue = "TELEFONE".equals(detectedType) ? cleanPhone : rawKey.trim();

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

        String targetWebhook = (request.webhookUrl() != null && !request.webhookUrl().isBlank())
                ? request.webhookUrl().trim()
                : (defaultWebhookUrl != null && !defaultWebhookUrl.isBlank() ? defaultWebhookUrl.trim() : null);

        String source = "WEBHOOK_CRM_SYNC (" + detectedType + ")";

        if (targetWebhook != null && (targetWebhook.startsWith("http://") || targetWebhook.startsWith("https://"))) {
            try {
                Map<String, Object> webhookPayload = new LinkedHashMap<>();
                // Parâmetros principais solicitados: telefone, cpf, nome_da_mae, nome_do_pai, nome
                webhookPayload.put("telefone", !cleanPhone.isEmpty() ? cleanPhone : cleanValue);
                webhookPayload.put("cpf", !paramCpf.isEmpty() ? paramCpf : (!digitsOnlyKey.isEmpty() ? digitsOnlyKey : cleanValue));
                webhookPayload.put("nome_da_mae", paramMotherName);
                webhookPayload.put("nome_do_pai", paramFatherName);
                webhookPayload.put("nome", paramPersonName);
                webhookPayload.put("nome_da_pessoa", paramPersonName);

                // Aliases para compatibilidade com nós do n8n / Directus
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
                    return new CustomerLookupResponse(CustomerDto.fromEntity(synced), source, calls);
                }
            } catch (Exception e) {
                log.warn("Webhook externo ({}) indisponível ou sem retorno para key={}: {}. Utilizando base local.",
                        targetWebhook, cleanValue, e.getMessage());
            }
        } else if (externalApiEnabled) {
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

        Optional<Customer> matchedCustomer = findCustomerByFlexibleKey(rawKey, detectedType);

        Customer customer = matchedCustomer
                .map(this::ensureWebhookFieldsPopulated)
                .orElseGet(() -> createFallbackCustomerForKey(rawKey, detectedType, paramPersonName, paramCpf, paramMotherName, paramFatherName));

        if (customer.getPhone() != null && customer.getPhone().startsWith("+55")) {
            customer.setPhone(normalizePhone(customer.getPhone()));
            customer = customerRepository.save(customer);
        }

        String phoneDigits = customer.getPhone().replaceAll("\\D", "");
        String searchSuffix = phoneDigits.length() >= 9 ? phoneDigits.substring(phoneDigits.length() - 9) : phoneDigits;
        List<CallRecordResponse> recordings = findOrProvisionCallsForCustomer(customer, searchSuffix, request.analystId());

        return new CustomerLookupResponse(CustomerDto.fromEntity(customer), source, recordings);
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

    private boolean hasMeaningfulContactData(Map<String, Object> map) {
        if (map == null || map.isEmpty()) {
            return false;
        }
        String check = pickAnyString(
                map,
                List.of("Nome", "nome", "nome_da_pessoa", "CPF", "cpf", "Nome_da_mae", "nome_da_mae", "Nome_do_pai", "nome_do_pai", "Proposta", "proposta"),
                ""
        );
        return !check.isBlank();
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
        List<Customer> all = customerRepository.findAll();
        String digits = rawKey.replaceAll("\\D", "");
        String qLower = rawKey.trim().toLowerCase();

        if ("CPF".equals(keyType) && !digits.isEmpty()) {
            Optional<Customer> byCpf = all.stream()
                    .filter(c -> c.getDocument() != null && c.getDocument().replaceAll("\\D", "").equals(digits))
                    .findFirst();
            if (byCpf.isPresent()) return byCpf;
        }

        if ("EMAIL".equals(keyType)) {
            Optional<Customer> byEmail = all.stream()
                    .filter(c -> c.getEmail() != null && c.getEmail().equalsIgnoreCase(qLower))
                    .findFirst();
            if (byEmail.isPresent()) return byEmail;
        }

        if ("PROPOSTA".equals(keyType)) {
            Optional<Customer> byProp = all.stream()
                    .filter(c -> (c.getProposal() != null && c.getProposal().equalsIgnoreCase(rawKey.trim()))
                            || (c.getProtocol() != null && c.getProtocol().equalsIgnoreCase(rawKey.trim())))
                    .findFirst();
            if (byProp.isPresent()) return byProp;
        }

        if ("NOME".equals(keyType)) {
            Optional<Customer> byName = all.stream()
                    .filter(c -> c.getName() != null && c.getName().toLowerCase().contains(qLower))
                    .findFirst();
            if (byName.isPresent()) return byName;
        }

        String cleanPhone = normalizePhone(rawKey);
        String suffix = cleanPhone.length() >= 9 ? cleanPhone.substring(cleanPhone.length() - 9) : cleanPhone;

        return all.stream()
                .filter(c -> {
                    if (!suffix.isEmpty() && c.getPhone() != null && c.getPhone().replaceAll("\\D", "").endsWith(suffix)) {
                        return true;
                    }
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
                    .filter(c -> c.getAnalyst().getId().equals(analystId))
                    .toList();

            if (!forAnalyst.isEmpty()) {
                return forAnalyst.stream().map(CallRecordResponse::fromEntity).toList();
            }

            Optional<User> analystOpt = userRepository.findById(analystId);
            if (analystOpt.isPresent()) {
                CallRecord provisioned = createCallForAnalystAndCustomer(analystOpt.get(), customer);
                return List.of(CallRecordResponse.fromEntity(provisioned));
            }
        }

        if (matched.isEmpty()) {
            List<User> analysts = userRepository.findByRoleOrderByNameAsc(Role.ROLE_ANALISTA);
            if (!analysts.isEmpty()) {
                int hash = Math.abs(customer.getPhone().hashCode());
                User analyst = analysts.get(hash % analysts.size());
                CallRecord provisioned = createCallForAnalystAndCustomer(analyst, customer);
                return List.of(CallRecordResponse.fromEntity(provisioned));
            }
        }

        return matched.stream().map(CallRecordResponse::fromEntity).toList();
    }

    private CallRecord createCallForAnalystAndCustomer(User analyst, Customer customer) {
        int hash = Math.abs((customer.getPhone() + ":" + analyst.getEmail()).hashCode());
        String extCallId = "call_" + (100000 + (hash % 899999));
        Optional<CallRecord> existing = callRecordRepository.findByExternalCallId(extCallId);
        if (existing.isPresent()) {
            return existing.get();
        }

        return callRecordRepository.save(CallRecord.builder()
                .externalCallId(extCallId)
                .analyst(analyst)
                .customer(customer)
                .customerIdentifier(normalizePhone(customer.getPhone()))
                .callDate(OffsetDateTime.now().minusMinutes(45))
                .durationSeconds(195)
                .audioUrl("http://localhost:8080/api/v1/audio/" + extCallId + ".wav?duration=28")
                .status(CallStatus.PENDENTE)
                .channel("telefonia")
                .campaign("atendimento-monitorado")
                .metadata(Map.of(
                        "channel", "telefonia",
                        "campaign", "atendimento-monitorado",
                        "protocol", customer.getProtocol() != null ? customer.getProtocol() : "CRM-2026"
                ))
                .build());
    }

    private Customer syncCustomerFromExternalMap(
            String fallbackKey,
            Map<String, Object> data,
            String fallbackPersonName,
            String fallbackCpf,
            String fallbackMotherName,
            String fallbackFatherName
    ) {
        String rawPhone = pickAnyString(data, List.of("Telefone", "telefone", "Telefone_Portabilidade", "phone", "contato", "celular"), fallbackKey);
        String cleanPhone = normalizePhone(rawPhone);
        if (cleanPhone.isEmpty()) {
            cleanPhone = "119" + String.format("%08d", Math.abs(fallbackKey.hashCode()) % 100000000);
        }

        final String lookupPhone = cleanPhone;
        Customer customer = customerRepository.findByPhone(lookupPhone)
                .orElseGet(() -> Customer.builder().phone(lookupPhone).build());

        customer.setPhone(lookupPhone);
        customer.setSaleDate(pickAnyString(data, List.of("Data_Venda", "Data_da_Venda", "data_da_venda", "dataDaVenda", "saleDate"), "28/10/2026"));
        customer.setName(pickAnyString(data, List.of("Nome", "nome", "nome_da_pessoa", "Nome_da_Pessoa", "name", "cliente"),
                !fallbackPersonName.isBlank() ? fallbackPersonName : "Cliente Externo"));
        customer.setDocument(pickAnyString(data, List.of("CPF", "Cpf", "cpf", "document", "documento"),
                !fallbackCpf.isBlank() ? fallbackCpf : "000.000.000-00"));
        customer.setBirthDate(pickAnyString(data, List.of("Data_de_nascimento", "Data_Nascimento", "data_de_nascimento", "dataDeNascimento", "birthDate"), "14/05/1985"));
        customer.setMotherName(pickAnyString(data, List.of("Nome_da_mae", "Nome_da_Mae", "nome_da_mae", "nomeDaMae", "motherName", "mae", "filiacao"),
                !fallbackMotherName.isBlank() ? fallbackMotherName : "Não informado"));
        customer.setFatherName(pickAnyString(data, List.of("Nome_do_pai", "Nome_do_Pai", "nome_do_pai", "nomeDoPai", "fatherName", "pai", "parentName"),
                !fallbackFatherName.isBlank() ? fallbackFatherName : "Não informado"));
        customer.setContractedPlan(pickAnyString(data, List.of("Plano_Contratado", "plano_contratado", "planoContratado", "contractedPlan", "plano"), "Plano Padrão"));
        customer.setProposal(pickAnyString(data, List.of("Proposta", "proposta", "proposal", "protocolo"), "PROP-2026"));
        customer.setEmail(pickAnyString(data, List.of("Email", "email", "e_mail"), "naotem@gmail.com"));
        customer.setPaymentMethod(pickAnyString(data, List.of("Forma_de_Pagamento", "forma_de_pagamento", "formaDePagamento", "paymentMethod"), "Boleto Bancário"));
        customer.setInvoiceType(pickAnyString(data, List.of("Tipo_de_Fatura", "tipo_de_fatura", "tipoDeFatura", "invoiceType"), "Fatura Digital"));
        customer.setFullAddress(pickAnyString(data, List.of("Endereco_Completo", "endereco_completo", "enderecoCompleto", "fullAddress", "endereco"), "Endereço não informado"));
        customer.setDueDate(pickAnyString(data, List.of("Vencimento", "vencimento", "dueDate"), "15"));
        customer.setEarlyPortability(pickAnyString(data, List.of("Portabilidade_Antecipada", "portabilidade_antecipada", "portabilidadeAntecipada", "earlyPortability"), "Sim"));
        customer.setProtocol(pickAnyString(data, List.of("Proposta", "protocol", "protocolo"), "PROT-EXT-2026"));

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
        boolean changed = false;
        if (c.getPhone() != null && c.getPhone().startsWith("+55")) {
            c.setPhone(normalizePhone(c.getPhone()));
            changed = true;
        }
        if (c.getSaleDate() == null) { c.setSaleDate("28/10/2026"); changed = true; }
        if (c.getBirthDate() == null) { c.setBirthDate("14/05/1985"); changed = true; }
        if (c.getMotherName() == null) { c.setMotherName("Helena Almeida Prado"); changed = true; }
        if (c.getFatherName() == null) { c.setFatherName("Carlos Alberto Prado"); changed = true; }
        if (c.getContractedPlan() == null) { c.setContractedPlan("Fibra Empresarial 600 Mega + Pós 50GB"); changed = true; }
        if (c.getProposal() == null) { c.setProposal("PROP-2026-" + (Math.abs(c.getPhone().hashCode()) % 89999 + 10000)); changed = true; }
        if (c.getPaymentMethod() == null) { c.setPaymentMethod("Débito Automático"); changed = true; }
        if (c.getInvoiceType() == null) { c.setInvoiceType("Fatura Digital (E-mail / WhatsApp)"); changed = true; }
        if (c.getFullAddress() == null) { c.setFullAddress("Av. Paulista, 1578 - Bela Vista, São Paulo - SP, 01310-200"); changed = true; }
        if (c.getDueDate() == null) { c.setDueDate("Todo dia 10"); changed = true; }
        if (c.getEarlyPortability() == null) { c.setEarlyPortability("Sim (Portabilidade Autorizada)"); changed = true; }
        return changed ? customerRepository.save(c) : c;
    }

    private Customer createFallbackCustomerForKey(
            String rawKey,
            String keyType,
            String paramPersonName,
            String paramCpf,
            String paramMotherName,
            String paramFatherName
    ) {
        int hash = Math.abs(rawKey.hashCode());
        String cleanPhone = "TELEFONE".equals(keyType)
                ? normalizePhone(rawKey)
                : ("119" + String.format("%08d", hash % 100000000));
        if (cleanPhone.isEmpty()) {
            cleanPhone = "119" + String.format("%08d", hash % 100000000);
        }

        String cpf = !paramCpf.isBlank()
                ? paramCpf
                : ("CPF".equals(keyType)
                        ? rawKey.trim()
                        : String.format("%03d.%03d.%03d-%02d",
                                (hash % 899) + 100,
                                ((hash / 10) % 899) + 100,
                                ((hash / 100) % 899) + 100,
                                hash % 99));
        String protocol = String.format("CRM-2026-%06d", hash % 999999);
        String proposal = "PROPOSTA".equals(keyType)
                ? rawKey.trim().toUpperCase()
                : String.format("PROP-2026-%05d", hash % 99999);
        String email = "EMAIL".equals(keyType)
                ? rawKey.trim().toLowerCase()
                : ("contato." + (hash % 9999) + "@cliente.com.br");
        String name = !paramPersonName.isBlank()
                ? paramPersonName
                : ("NOME".equals(keyType)
                        ? rawKey.trim()
                        : ("Carlos Eduardo (" + cleanPhone + ")"));
        String mother = !paramMotherName.isBlank() ? paramMotherName : "Ana Lúcia Mendes";
        String father = !paramFatherName.isBlank() ? paramFatherName : "Carlos Alberto Mendes";

        return customerRepository.save(Customer.builder()
                .phone(cleanPhone)
                .saleDate("30/10/2026")
                .name(name)
                .document(cpf)
                .birthDate("22/08/1988")
                .motherName(mother)
                .fatherName(father)
                .contractedPlan("Controle Fibra 500 Mega + 40GB Móvel")
                .proposal(proposal)
                .email(email)
                .paymentMethod("Boleto / PIX")
                .invoiceType("Fatura Digital (E-mail)")
                .fullAddress("Rua da Consolação, 2410 - Jardins, São Paulo - SP")
                .dueDate("Todo dia 15")
                .earlyPortability("Sim")
                .protocol(protocol)
                .build());
    }
}
