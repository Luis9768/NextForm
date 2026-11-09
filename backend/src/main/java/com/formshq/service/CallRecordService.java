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

    @Value("${app.integrations.audio-evaluation-webhook.url:${AUDIO_EVALUATION_WEBHOOK_URL:https://projetos.n8n.hdstec.com.br/webhook/76f4953c-1049-4528-8923-1a1fb69890f7}}")
    private String audioEvaluationWebhookUrl;

    @Value("${app.integrations.directus.base-url:${DIRECTUS_BASE_URL:}}")
    private String directusBaseUrl;

    @Value("${app.integrations.directus.api-token:${DIRECTUS_API_TOKEN:}}")
    private String directusApiToken;

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
            String sector,
            String formTemplateId
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
        byte[] primaryAudioBytes = null;
        String primaryOriginalName = "recording.mp3";
        byte[] secondaryAudioBytes = null;
        String secondaryOriginalName = "recording_2.mp3";

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
                    if (i == 0) {
                        primaryAudioBytes = fileBytes;
                        primaryOriginalName = originalName;
                    } else if (i == 1) {
                        secondaryAudioBytes = fileBytes;
                        secondaryOriginalName = originalName;
                    }

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
        metadata.put("aiWebhookStatus", "PROCESSING");
        if (formTemplateId != null && !formTemplateId.isBlank()) {
            metadata.put("formTemplateId", formTemplateId.trim());
        }
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

        // Dispara imediatamente para https://projetos.n8n.hdstec.com.br/webhook/76f4953c-1049-4528-8923-1a1fb69890f7
        dispatchAudioWorkflowWebhookAsync(
                saved,
                customer,
                analyst,
                formTemplateId,
                primaryAudioBytes,
                primaryOriginalName,
                secondaryAudioBytes,
                secondaryOriginalName
        );

        return CallRecordResponse.fromEntity(saved);
    }

    @Transactional
    @CacheEvict(
            value = {CacheConfig.CACHE_DASHBOARD, CacheConfig.CACHE_EVALUATIONS, CacheConfig.CACHE_CALLS},
            allEntries = true
    )
    public CallRecordResponse retryAudioEvaluationWebhook(UUID callId, UserPrincipal currentUser) {
        CallRecord callRecord = callRecordRepository.findWithDetailsById(callId)
                .orElseThrow(() -> new ResourceNotFoundException("Ligação não encontrada com ID: " + callId));

        Map<String, Object> meta = new LinkedHashMap<>(callRecord.getMetadata() != null ? callRecord.getMetadata() : Map.of());
        meta.put("aiWebhookStatus", "PROCESSING");
        meta.remove("aiWebhookError");
        callRecord.setMetadata(meta);
        callRecord = callRecordRepository.save(callRecord);

        String formTemplateId = meta.get("formTemplateId") != null ? meta.get("formTemplateId").toString() : "";
        byte[] audioBytes = null;
        String fileName = "recording.mp3";
        byte[] secondBytes = null;
        String secondFileName = "recording_2.mp3";
        try {
            String audioUrl = callRecord.getAudioUrl();
            if (audioUrl != null && audioUrl.contains("/api/v1/audio/files/")) {
                fileName = audioUrl.substring(audioUrl.lastIndexOf("/") + 1);
                Path filePath = Paths.get("./data/uploads").toAbsolutePath().normalize().resolve(fileName);
                if (Files.exists(filePath)) {
                    audioBytes = Files.readAllBytes(filePath);
                }
            }
            Object retUrlObj = meta.get("returnAudioUrl");
            if (retUrlObj instanceof String retUrl && retUrl.contains("/api/v1/audio/files/")) {
                secondFileName = retUrl.substring(retUrl.lastIndexOf("/") + 1);
                Path retPath = Paths.get("./data/uploads").toAbsolutePath().normalize().resolve(secondFileName);
                if (Files.exists(retPath)) {
                    secondBytes = Files.readAllBytes(retPath);
                }
            }
        } catch (Exception ignored) {
        }

        dispatchAudioWorkflowWebhookAsync(
                callRecord,
                callRecord.getCustomer(),
                callRecord.getAnalyst(),
                formTemplateId,
                audioBytes,
                fileName,
                secondBytes,
                secondFileName
        );
        return CallRecordResponse.fromEntity(callRecord);
    }

    private void dispatchAudioWorkflowWebhookAsync(
            CallRecord callRecord,
            Customer customer,
            User analyst,
            String formTemplateId,
            byte[] primaryAudioBytes,
            String primaryOriginalName,
            byte[] secondaryAudioBytes,
            String secondaryOriginalName
    ) {
        final String targetUrl = (audioEvaluationWebhookUrl != null && !audioEvaluationWebhookUrl.isBlank())
                ? audioEvaluationWebhookUrl.trim()
                : (customerWebhookUrl != null ? customerWebhookUrl.trim() : "");
        if (targetUrl.isEmpty()) {
            return;
        }

        final UUID callUuid = callRecord.getId();
        final String callIdStr = callUuid.toString();
        final String extCallId = callRecord.getExternalCallId();
        final String audioUrl = callRecord.getAudioUrl();
        final Map<String, Object> initialMeta = callRecord.getMetadata() != null
                ? new LinkedHashMap<>(callRecord.getMetadata())
                : new LinkedHashMap<>();

        CompletableFuture.runAsync(() -> {
            String existingDirectusId = initialMeta.get("directusAudioFileId") != null
                    ? initialMeta.get("directusAudioFileId").toString()
                    : null;
            String directusUploadedId = (existingDirectusId != null && !existingDirectusId.isBlank())
                    ? existingDirectusId
                    : tryUploadAudioToDirectus(primaryAudioBytes, primaryOriginalName);

            String r2FileKey = (audioUrl != null && audioUrl.contains("/api/v1/audio/files/"))
                    ? audioUrl.substring(audioUrl.lastIndexOf("/") + 1)
                    : extCallId;

            String effectiveLigacaoId = (directusUploadedId != null && !directusUploadedId.isBlank())
                    ? directusUploadedId
                    : r2FileKey;

            String directusReturnId = initialMeta.get("returnAudioFileId") != null
                    ? initialMeta.get("returnAudioFileId").toString()
                    : tryUploadAudioToDirectus(secondaryAudioBytes, secondaryOriginalName);

            if (directusUploadedId != null || directusReturnId != null) {
                callRecordRepository.findById(callUuid).ifPresent(cr -> {
                    Map<String, Object> m = new LinkedHashMap<>(cr.getMetadata() != null ? cr.getMetadata() : Map.of());
                    if (directusUploadedId != null) {
                        m.put("directusAudioFileId", directusUploadedId);
                        if (primaryAudioBytes != null && primaryAudioBytes.length > 0 && r2ObjectStorageService.isConfigured()) {
                            String ext = (primaryOriginalName != null && primaryOriginalName.toLowerCase().endsWith(".wav")) ? ".wav" : ".mp3";
                            String ct = ext.equals(".wav") ? "audio/wav" : "audio/mpeg";
                            r2ObjectStorageService.uploadAudioObject(directusUploadedId, primaryAudioBytes, ct);
                            r2ObjectStorageService.uploadAudioObject("directus_" + directusUploadedId + ext, primaryAudioBytes, ct);
                        }
                    }
                    if (directusReturnId != null) {
                        m.put("returnAudioFileId", directusReturnId);
                    }
                    cr.setMetadata(m);
                    callRecordRepository.save(cr);
                });
            }

            String cleanDirectusBase = (directusBaseUrl != null && !directusBaseUrl.isBlank())
                    ? directusBaseUrl.trim().replaceAll("/+$", "")
                    : "";

            String presignedR2Url = r2ObjectStorageService.generatePresignedGetUrl(r2FileKey, 86400)
                    .orElse(null);

            Map<String, Object> payload = new LinkedHashMap<>();
            payload.put("id", callIdStr);
            payload.put("id_formullario", callIdStr);
            payload.put("id_formulario", callIdStr);
            payload.put("formTemplateId", formTemplateId != null ? formTemplateId : "");
            payload.put("externalCallId", extCallId);
            payload.put("telefone", customer.getPhone());
            payload.put("Telefone_Portabilidade", customer.getPhone());
            payload.put("ligacao", effectiveLigacaoId);
            payload.put("Ligacao", effectiveLigacaoId);
            payload.put("Audio_Chamada", effectiveLigacaoId);
            payload.put("audio_chamada", effectiveLigacaoId);
            payload.put("Audio_Ligacao", effectiveLigacaoId);
            payload.put("r2ObjectKey", r2FileKey);
            if (presignedR2Url != null) {
                payload.put("r2PresignedUrl", presignedR2Url);
            }
            if (!cleanDirectusBase.isEmpty()) {
                payload.put("directusAssetUrl", cleanDirectusBase + "/assets/" + effectiveLigacaoId);
            }
            if (directusReturnId != null && !directusReturnId.isBlank()) {
                payload.put("Ligacao_Retorno", directusReturnId);
                payload.put("Audio_Ligacao_Retorno", directusReturnId);
                payload.put("audio_chamada_retorno", directusReturnId);
            }
            payload.put("audioUrl", audioUrl);
            payload.put("Operador", analyst.getId().toString());
            payload.put("operadorNome", analyst.getName());
            payload.put("operadorEmail", analyst.getEmail());
            payload.put("Ticket", initialMeta.getOrDefault("ticket", customer.getProtocol()));
            payload.put("Data_do_Atendimento", initialMeta.getOrDefault("attendanceDate", customer.getSaleDate()));
            payload.put("Data_monitoria", initialMeta.getOrDefault("monitoringDate", ""));
            payload.put("Setor", initialMeta.getOrDefault("sector", analyst.getDepartment()));
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

            String responseBody = null;
            String lastErrorMsg = null;

            // Tenta primeiro a URL de produção (/webhook/...) e, se 404 (modo de teste no n8n), tenta /webhook-test/...
            List<String> candidateUrls = new java.util.ArrayList<>();
            candidateUrls.add(targetUrl);
            if (targetUrl.contains("/webhook/")) {
                candidateUrls.add(targetUrl.replace("/webhook/", "/webhook-test/"));
            }

            for (String candidateUrl : candidateUrls) {
                try {
                    log.info("Disparando webhook de avaliação de áudio para {} (callId={}, ligacao={})",
                            candidateUrl, callIdStr, effectiveLigacaoId);
                    responseBody = RestClient.create()
                            .post()
                            .uri(candidateUrl)
                            .contentType(MediaType.APPLICATION_JSON)
                            .body(payload)
                            .retrieve()
                            .body(String.class);
                    lastErrorMsg = null;
                    break;
                } catch (Exception e) {
                    lastErrorMsg = e.getMessage();
                    log.warn("Aviso ao disparar webhook de áudio para {}: {}", candidateUrl, e.getMessage());
                }
            }

            if (responseBody != null && !responseBody.isBlank()) {
                try {
                    Object parsed = objectMapper.readValue(responseBody, Object.class);
                    directusEvaluationSyncService.upsertFromWorkflowPayload(callIdStr, "AUTO", parsed);
                    log.info("Resposta do webhook n8n processada com sucesso para a ligação {}", extCallId);
                    return;
                } catch (Exception parseEx) {
                    lastErrorMsg = "Erro ao ler JSON de resposta do webhook: " + parseEx.getMessage();
                }
            }

            if (lastErrorMsg != null) {
                final String finalErr = lastErrorMsg.contains("404")
                        ? "O webhook n8n retornou 404 (Workflow inativo no n8n). Ative a chave 'Active' no topo direito do n8n (ou clique em 'Execute workflow' se estiver em modo de teste) e clique em 'Reenviar / Sincronizar Webhook'."
                        : ("Falha ao contatar webhook n8n: " + lastErrorMsg);
                callRecordRepository.findById(callUuid).ifPresent(cr -> {
                    Map<String, Object> m = new LinkedHashMap<>(cr.getMetadata() != null ? cr.getMetadata() : Map.of());
                    m.put("aiWebhookStatus", "ERROR");
                    m.put("aiWebhookError", finalErr);
                    cr.setMetadata(m);
                    callRecordRepository.save(cr);
                });
            }
        });
    }

    @SuppressWarnings("unchecked")
    private String tryUploadAudioToDirectus(byte[] fileBytes, String fileName) {
        if (fileBytes == null || fileBytes.length == 0 || directusBaseUrl == null || directusBaseUrl.isBlank()) {
            return null;
        }
        try {
            String cleanBase = directusBaseUrl.trim().replaceAll("/+$", "");
            String safeFileName = (fileName != null && !fileName.isBlank()) ? fileName : "recording.mp3";
            MediaType partMediaType = safeFileName.toLowerCase().endsWith(".wav")
                    ? MediaType.parseMediaType("audio/wav")
                    : MediaType.parseMediaType("audio/mpeg");

            org.springframework.core.io.ByteArrayResource resource = new org.springframework.core.io.ByteArrayResource(fileBytes) {
                @Override
                public String getFilename() {
                    return safeFileName;
                }
            };

            org.springframework.http.HttpHeaders partHeaders = new org.springframework.http.HttpHeaders();
            partHeaders.setContentType(partMediaType);
            org.springframework.http.HttpEntity<org.springframework.core.io.ByteArrayResource> filePart =
                    new org.springframework.http.HttpEntity<>(resource, partHeaders);

            org.springframework.util.MultiValueMap<String, Object> parts = new org.springframework.util.LinkedMultiValueMap<>();
            parts.add("file", filePart);

            RestClient.Builder builder = RestClient.builder().baseUrl(cleanBase);
            if (directusApiToken != null && !directusApiToken.isBlank()) {
                builder.defaultHeader("Authorization", "Bearer " + directusApiToken.trim());
            }
            Map<String, Object> res = builder.build()
                    .post()
                    .uri("/files")
                    .contentType(MediaType.MULTIPART_FORM_DATA)
                    .body(parts)
                    .retrieve()
                    .body(Map.class);
            if (res != null && res.get("data") instanceof Map<?, ?> dataMap) {
                Object idObj = dataMap.get("id");
                if (idObj != null) {
                    String uploadedId = idObj.toString();
                    log.info("Áudio enviado para Directus /files com sucesso: directusFileId={}, fileName={}", uploadedId, safeFileName);
                    return uploadedId;
                }
            }
        } catch (Exception e) {
            log.warn("Aviso ao enviar áudio para Directus /files: {}", e.getMessage());
        }
        return null;
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
