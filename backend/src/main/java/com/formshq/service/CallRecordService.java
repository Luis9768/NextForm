package com.formshq.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.formshq.config.CacheConfig;
import com.formshq.domain.entity.CallRecord;
import com.formshq.domain.entity.Customer;
import com.formshq.domain.entity.User;
import com.formshq.domain.enums.CallStatus;
import com.formshq.domain.enums.Role;
import com.formshq.dto.call.CallRecordResponse;
import com.formshq.dto.call.N8nCallWebhookRequest;
import com.formshq.exception.DuplicateResourceException;
import com.formshq.exception.ResourceNotFoundException;
import com.formshq.repository.CallRecordRepository;
import com.formshq.repository.CustomerRepository;
import com.formshq.repository.UserRepository;
import com.formshq.security.SectorScopePolicy;
import com.formshq.security.UserPrincipal;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.cache.annotation.CacheEvict;
import org.springframework.cache.annotation.Cacheable;
import org.springframework.http.MediaType;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.client.RestClient;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.time.OffsetDateTime;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.CompletableFuture;

@Slf4j
@Service
@RequiredArgsConstructor
public class CallRecordService {

    private final CallRecordRepository callRecordRepository;
    private final CustomerRepository customerRepository;
    private final UserRepository userRepository;
    private final PasswordEncoder passwordEncoder;
    private final SectorScopePolicy sectorScopePolicy;
    private final R2ObjectStorageService r2ObjectStorageService;
    private final DirectusEvaluationSyncService directusEvaluationSyncService;
    private final ObjectMapper objectMapper;

    @Value("${app.integrations.customer-webhook.url:${CUSTOMER_WEBHOOK_URL:}}")
    private String customerWebhookUrl;

    @Transactional
    @CacheEvict(
            value = {CacheConfig.CACHE_DASHBOARD, CacheConfig.CACHE_EVALUATIONS, CacheConfig.CACHE_CALLS},
            allEntries = true
    )
    public CallRecordResponse ingestFromN8n(N8nCallWebhookRequest request) {
        String externalId = request.externalCallId().trim();
        if (callRecordRepository.existsByExternalCallId(externalId)) {
            throw new DuplicateResourceException(
                    "Ligação já registrada anteriormente com o externalCallId: " + externalId
            );
        }

        String normalizedEmail = request.analystEmail().trim().toLowerCase();
        User analyst = userRepository.findByEmailIgnoreCase(normalizedEmail)
                .orElseGet(() -> provisionAnalystFromWebhook(normalizedEmail));

        String normalizedPhone = CustomerLookupService.normalizePhone(request.customerIdentifier());
        String phoneKey = normalizedPhone.isEmpty() ? request.customerIdentifier().trim() : normalizedPhone;

        Customer customer = customerRepository.findByPhone(phoneKey)
                .orElseGet(() -> provisionCustomerFromWebhook(phoneKey));

        Map<String, Object> metadata = request.metadata() != null
                ? new HashMap<>(request.metadata())
                : new HashMap<>();

        String channel = extractMetadataString(metadata, "channel", "telefonia");
        String campaign = extractMetadataString(metadata, "campaign", "geral");

        CallRecord callRecord = CallRecord.builder()
                .externalCallId(externalId)
                .analyst(analyst)
                .customer(customer)
                .customerIdentifier(phoneKey)
                .callDate(request.callDate())
                .durationSeconds(request.durationSeconds())
                .audioUrl(request.audioUrl().trim())
                .status(CallStatus.PENDENTE)
                .channel(channel)
                .campaign(campaign)
                .metadata(metadata)
                .build();

        CallRecord saved = callRecordRepository.save(callRecord);
        log.info("Ligação recebida via n8n registrada com sucesso: externalCallId={}, analyst={}, customerPhone={}",
                externalId, normalizedEmail, phoneKey);
        return CallRecordResponse.fromEntity(saved);
    }

    @Transactional
    @CacheEvict(
            value = {CacheConfig.CACHE_DASHBOARD, CacheConfig.CACHE_EVALUATIONS, CacheConfig.CACHE_CALLS},
            allEntries = true
    )
    public CallRecordResponse uploadCallWithAudioFile(
            MultipartFile audioFile,
            UUID analystId,
            String customerPhone,
            String customerName,
            String campaign,
            Integer durationSeconds
    ) {
        return uploadCallWithAudioFiles(
                audioFile,
                audioFile != null ? List.of(audioFile) : List.of(),
                analystId,
                customerPhone,
                customerName,
                campaign,
                durationSeconds,
                durationSeconds != null ? List.of(durationSeconds) : List.of(),
                null,
                null,
                null,
                null
        );
    }

    @Transactional
    @CacheEvict(
            value = {CacheConfig.CACHE_DASHBOARD, CacheConfig.CACHE_EVALUATIONS, CacheConfig.CACHE_CALLS},
            allEntries = true
    )
    public CallRecordResponse uploadCallWithAudioFiles(
            MultipartFile singleFile,
            List<MultipartFile> multiFiles,
            UUID analystId,
            String customerPhone,
            String customerName,
            String campaign,
            Integer durationSeconds,
            List<Integer> durations,
            String ticket,
            String attendanceDate,
            String monitoringDate,
            String sector
    ) {
        User analyst = userRepository.findById(analystId)
                .orElseThrow(() -> new ResourceNotFoundException("Analista não encontrada com ID: " + analystId));

        String normalizedPhone = CustomerLookupService.normalizePhone(customerPhone);
        String phoneKey = normalizedPhone.isEmpty() ? customerPhone.trim() : normalizedPhone;

        Customer customer = customerRepository.findByPhone(phoneKey)
                .orElseGet(() -> provisionCustomerFromWebhook(phoneKey));

        if (customerName != null && !customerName.isBlank()) {
            customer.setName(customerName.trim());
            customer = customerRepository.save(customer);
        }

        int hash = UUID.randomUUID().hashCode() & 0x7fffffff;
        String extCallId = "call_" + (100000 + (hash % 899999));

        List<MultipartFile> allFiles = new java.util.ArrayList<>();
        if (multiFiles != null && !multiFiles.isEmpty()) {
            for (MultipartFile mf : multiFiles) {
                if (mf != null && !mf.isEmpty()) {
                    allFiles.add(mf);
                }
            }
        }
        if (allFiles.isEmpty() && singleFile != null && !singleFile.isEmpty()) {
            allFiles.add(singleFile);
        }

        List<Map<String, Object>> recordingsMeta = new java.util.ArrayList<>();
        List<String> audioUrlsList = new java.util.ArrayList<>();
        int totalDurationSecs = 0;

        if (!allFiles.isEmpty()) {
            try {
                Path uploadDir = Paths.get("./data/uploads").toAbsolutePath().normalize();
                Files.createDirectories(uploadDir);

                for (int i = 0; i < allFiles.size(); i++) {
                    MultipartFile currentFile = allFiles.get(i);
                    String originalName = currentFile.getOriginalFilename() != null
                            ? currentFile.getOriginalFilename().replaceAll("[^a-zA-Z0-9._-]", "_")
                            : ("recording_" + (i + 1) + ".mp3");
                    String storedFileName = extCallId + "_" + (i + 1) + "_" + originalName;
                    byte[] fileBytes = currentFile.getBytes();

                    String contentType = currentFile.getContentType() != null ? currentFile.getContentType() : "audio/mpeg";
                    r2ObjectStorageService.uploadAudioObject(storedFileName, fileBytes, contentType);

                    Path targetPath = uploadDir.resolve(storedFileName);
                    Files.write(targetPath, fileBytes);

                    String itemUrl = r2ObjectStorageService.resolveStoredAudioUrl(storedFileName);
                    int itemDur = (durations != null && i < durations.size() && durations.get(i) != null && durations.get(i) > 0)
                            ? durations.get(i)
                            : ((durationSeconds != null && durationSeconds > 0) ? durationSeconds : 180);
                    totalDurationSecs += itemDur;
                    audioUrlsList.add(itemUrl);

                    Map<String, Object> recItem = new LinkedHashMap<>();
                    recItem.put("index", i + 1);
                    recItem.put("label", "Ligação " + (i + 1));
                    recItem.put("fileName", originalName);
                    recItem.put("storedFileName", storedFileName);
                    recItem.put("audioUrl", itemUrl);
                    recItem.put("durationSeconds", itemDur);
                    recordingsMeta.add(recItem);
                }
            } catch (IOException e) {
                log.error("Falha ao salvar arquivo(s) de áudio anexado(s)", e);
                throw new RuntimeException("Não foi possível armazenar os arquivos de áudio enviados.");
            }
        }

        int finalDuration = totalDurationSecs > 0
                ? totalDurationSecs
                : ((durationSeconds != null && durationSeconds > 0) ? durationSeconds : 180);
        String resolvedAudioUrl = !audioUrlsList.isEmpty()
                ? audioUrlsList.get(0)
                : ("/api/v1/audio/" + extCallId + ".wav?duration=" + Math.min(finalDuration, 40));

        String resolvedCampaign = (campaign != null && !campaign.isBlank()) ? campaign.trim() : "auditoria-manual";

        Map<String, Object> metadata = new LinkedHashMap<>();
        metadata.put("channel", "upload-manual");
        metadata.put("campaign", resolvedCampaign);
        metadata.put("recordingsCount", recordingsMeta.size());
        metadata.put("recordings", recordingsMeta);
        metadata.put("audioUrls", audioUrlsList);
        if (audioUrlsList.size() >= 2) {
            metadata.put("returnAudioUrl", audioUrlsList.get(1));
        }
        if (ticket != null && !ticket.isBlank()) {
            metadata.put("ticket", ticket.trim());
        }
        if (attendanceDate != null && !attendanceDate.isBlank()) {
            metadata.put("attendanceDate", attendanceDate.trim());
        }
        if (monitoringDate != null && !monitoringDate.isBlank()) {
            metadata.put("monitoringDate", monitoringDate.trim());
        }
        if (sector != null && !sector.isBlank()) {
            metadata.put("sector", sector.trim());
        }

        CallRecord callRecord = CallRecord.builder()
                .externalCallId(extCallId)
                .analyst(analyst)
                .customer(customer)
                .customerIdentifier(phoneKey)
                .callDate(OffsetDateTime.now())
                .durationSeconds(finalDuration)
                .audioUrl(resolvedAudioUrl)
                .status(CallStatus.PENDENTE)
                .channel("upload-manual")
                .campaign(resolvedCampaign)
                .metadata(metadata)
                .build();

        CallRecord saved = callRecordRepository.save(callRecord);
        log.info("Gravação(ões) anexada(s) pela gestora registrada(s): externalCallId={}, analyst={}, qtdAudios={}",
                extCallId, analyst.getEmail(), recordingsMeta.size());

        // Dispara automaticamente o webhook do workflow n8n com os áudios e os dados do cliente/formulário
        dispatchAudioWorkflowWebhookAsync(saved, customer, analyst);

        return CallRecordResponse.fromEntity(saved);
    }

    private void dispatchAudioWorkflowWebhookAsync(CallRecord callRecord, Customer customer, User analyst) {
        if (customerWebhookUrl == null || customerWebhookUrl.isBlank()) {
            return;
        }
        final String targetUrl = customerWebhookUrl.trim();
        final String callIdStr = callRecord.getId().toString();
        final String extCallId = callRecord.getExternalCallId();
        final String audioUrl = callRecord.getAudioUrl();
        final String audioFileKey = audioUrl != null && audioUrl.contains("/")
                ? audioUrl.substring(audioUrl.lastIndexOf("/") + 1)
                : extCallId;

        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("id", callIdStr);
        payload.put("id_formullario", callIdStr);
        payload.put("externalCallId", extCallId);
        payload.put("telefone", customer.getPhone());
        payload.put("Telefone_Portabilidade", customer.getPhone());
        payload.put("ligacao", audioFileKey);
        payload.put("Audio_Ligacao", Map.of(
                "service", "nexform",
                "source", audioFileKey,
                "url", audioUrl != null ? audioUrl : ""
        ));
        payload.put("audioUrl", audioUrl);
        payload.put("Operador", analyst.getId().toString());
        payload.put("operadorNome", analyst.getName());
        payload.put("operadorEmail", analyst.getEmail());
        payload.put("Nome", customer.getName());
        payload.put("CPF", customer.getDocument());
        payload.put("Proposta", customer.getProposal());
        payload.put("Data_de_nascimento", customer.getBirthDate());
        payload.put("Nome_da_mae", customer.getMotherName());
        payload.put("Email", customer.getEmail());
        payload.put("Forma_de_Pagamento", customer.getPaymentMethod());
        payload.put("Tipo_de_Fatura", customer.getInvoiceType());
        payload.put("Vencimento", customer.getDueDate());
        payload.put("Portabilidade_Antecipada", customer.getEarlyPortability());
        payload.put("Data_da_venda", customer.getSaleDate());
        payload.put("Plano_Contratado", customer.getContractedPlan());
        payload.put("Endereco_Completo", customer.getFullAddress());
        payload.put("callbackUrl", "/api/v1/integrations/directus/workflow-upsert/" + callIdStr);

        CompletableFuture.runAsync(() -> {
            try {
                String responseBody = RestClient.create()
                        .post()
                        .uri(targetUrl)
                        .contentType(MediaType.APPLICATION_JSON)
                        .body(payload)
                        .retrieve()
                        .body(String.class);

                if (responseBody != null && !responseBody.isBlank()
                        && (responseBody.contains("Transcricao") || responseBody.contains("Nota_Final") || responseBody.contains("valores_plano"))) {
                    Object parsed = objectMapper.readValue(responseBody, Object.class);
                    directusEvaluationSyncService.upsertFromWorkflowPayload(callIdStr, "Monitoria_Tim_Aquisicao", parsed);
                    log.info("Avaliação do workflow n8n aplicada automaticamente para a ligação {}", extCallId);
                }
            } catch (Exception e) {
                log.warn("Aviso ao disparar webhook de áudio/workflow para {}: {}", targetUrl, e.getMessage());
            }
        });
    }

    @Transactional(readOnly = true)
    @Cacheable(
            value = CacheConfig.CACHE_CALLS,
            key = "#currentUser.id + ':' + (#statusFilter ?: 'ALL') + ':' + (#analystIdFilter ?: 'ALL')"
    )
    public List<CallRecordResponse> listCalls(UserPrincipal currentUser, CallStatus statusFilter, UUID analystIdFilter) {
        List<CallRecord> records;

        if (currentUser.isAnalista()) {
            UUID selfId = currentUser.getId();
            records = (statusFilter != null)
                    ? callRecordRepository.findByAnalystIdAndStatusOrderByCallDateDesc(selfId, statusFilter)
                    : callRecordRepository.findByAnalystIdOrderByCallDateDesc(selfId);
        } else {
            if (analystIdFilter != null && statusFilter != null) {
                records = callRecordRepository.findByAnalystIdAndStatusOrderByCallDateDesc(analystIdFilter, statusFilter);
            } else if (analystIdFilter != null) {
                records = callRecordRepository.findByAnalystIdOrderByCallDateDesc(analystIdFilter);
            } else if (statusFilter != null) {
                records = callRecordRepository.findByStatusOrderByCallDateDesc(statusFilter);
            } else {
                records = callRecordRepository.findAllByOrderByCallDateDesc();
            }

            if (!currentUser.isAdmin() && currentUser.isGestor()) {
                Set<String> allowed = sectorScopePolicy.resolveAllowedSectorsForCaller(currentUser);
                if (!allowed.isEmpty()) {
                    records = records.stream()
                            .filter(c -> {
                                String analystDept = c.getAnalyst() != null ? c.getAnalyst().getDepartment() : null;
                                return sectorScopePolicy.isSectorAllowed(allowed, analystDept);
                            })
                            .toList();
                }
            }
        }

        return records.stream()
                .map(CallRecordResponse::fromEntitySummary)
                .toList();
    }

    @Transactional(readOnly = true)
    public CallRecordResponse getCallById(UUID id, UserPrincipal currentUser) {
        CallRecord callRecord = callRecordRepository.findWithDetailsById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Ligação não encontrada com ID: " + id));

        if (currentUser.isAnalista() && !callRecord.getAnalyst().getId().equals(currentUser.getId())) {
            throw new AccessDeniedException("Analistas só podem visualizar suas próprias ligações.");
        }
        String analystDept = callRecord.getAnalyst() != null ? callRecord.getAnalyst().getDepartment() : null;
        sectorScopePolicy.assertCallerCanAccessSector(currentUser, analystDept);

        return CallRecordResponse.fromEntity(callRecord);
    }

    @Transactional
    @CacheEvict(
            value = {CacheConfig.CACHE_DASHBOARD, CacheConfig.CACHE_EVALUATIONS, CacheConfig.CACHE_CALLS},
            allEntries = true
    )
    public void updateCallDurationByExternalId(String externalCallId, int durationSeconds) {
        if (externalCallId == null || externalCallId.isBlank() || durationSeconds <= 0 || durationSeconds > 14400) {
            return;
        }
        callRecordRepository.findByExternalCallId(externalCallId.trim()).ifPresent(call -> {
            if (call.getDurationSeconds() == null || Math.abs(call.getDurationSeconds() - durationSeconds) > 2) {
                call.setDurationSeconds(durationSeconds);
                callRecordRepository.save(call);
            }
        });
    }

    private Customer provisionCustomerFromWebhook(String phone) {
        int hash = phone.hashCode() & 0x7fffffff;
        String cpf = String.format("%03d.%03d.%03d-%02d",
                (hash % 899) + 100,
                ((hash / 10) % 899) + 100,
                ((hash / 100) % 899) + 100,
                hash % 99);
        return customerRepository.save(Customer.builder()
                .phone(phone)
                .name("Cliente " + phone)
                .document(cpf)
                .email("cliente." + (hash % 9999) + "@email.com.br")
                .protocol(String.format("PROT-2026-%06d", hash % 999999))
                .build());
    }

    private User provisionAnalystFromWebhook(String email) {
        String localPart = email.contains("@") ? email.substring(0, email.indexOf('@')) : email;
        String formattedName = formatNameFromEmail(localPart);
        log.info("Provisionando automaticamente novo analista a partir do webhook n8n: {}", email);

        User newAnalyst = User.builder()
                .name(formattedName)
                .email(email)
                .passwordHash(passwordEncoder.encode("Analista@123"))
                .role(Role.ROLE_ANALISTA)
                .department("Atendimento / Operação")
                .active(true)
                .build();

        return userRepository.save(newAnalyst);
    }

    private String formatNameFromEmail(String localPart) {
        String[] parts = localPart.replace('.', ' ').replace('_', ' ').replace('-', ' ').split("\\s+");
        StringBuilder sb = new StringBuilder();
        for (String part : parts) {
            if (!part.isBlank()) {
                if (!sb.isEmpty()) sb.append(" ");
                sb.append(Character.toUpperCase(part.charAt(0)));
                if (part.length() > 1) {
                    sb.append(part.substring(1).toLowerCase());
                }
            }
        }
        return sb.isEmpty() ? "Analista Operação" : sb.toString();
    }

    private String extractMetadataString(Map<String, Object> metadata, String key, String defaultValue) {
        Object val = metadata.get(key);
        if (val != null && !val.toString().isBlank()) {
            return val.toString().trim();
        }
        return defaultValue;
    }
}
