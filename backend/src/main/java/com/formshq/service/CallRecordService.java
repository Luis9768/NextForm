package com.formshq.service;

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
import com.formshq.security.UserPrincipal;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.nio.file.StandardCopyOption;
import java.time.OffsetDateTime;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

@Slf4j
@Service
@RequiredArgsConstructor
public class CallRecordService {

    private final CallRecordRepository callRecordRepository;
    private final CustomerRepository customerRepository;
    private final UserRepository userRepository;
    private final PasswordEncoder passwordEncoder;

    @Transactional
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
    public CallRecordResponse uploadCallWithAudioFile(
            MultipartFile audioFile,
            UUID analystId,
            String customerPhone,
            String customerName,
            String campaign,
            Integer durationSeconds
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

        String extCallId = "call_" + (100000 + Math.abs(UUID.randomUUID().hashCode() % 899999));
        int duration = (durationSeconds != null && durationSeconds > 0) ? durationSeconds : 180;
        String resolvedAudioUrl;

        if (audioFile != null && !audioFile.isEmpty()) {
            try {
                Path uploadDir = Paths.get("./data/uploads").toAbsolutePath().normalize();
                Files.createDirectories(uploadDir);

                String originalName = audioFile.getOriginalFilename() != null
                        ? audioFile.getOriginalFilename().replaceAll("[^a-zA-Z0-9._-]", "_")
                        : "recording.mp3";
                String storedFileName = extCallId + "_" + originalName;
                Path targetPath = uploadDir.resolve(storedFileName);
                Files.copy(audioFile.getInputStream(), targetPath, StandardCopyOption.REPLACE_EXISTING);

                resolvedAudioUrl = "http://localhost:8080/api/v1/audio/files/" + storedFileName;
            } catch (IOException e) {
                log.error("Falha ao salvar arquivo de áudio anexado", e);
                throw new RuntimeException("Não foi possível armazenar o arquivo de áudio enviado.");
            }
        } else {
            resolvedAudioUrl = "http://localhost:8080/api/v1/audio/" + extCallId + ".wav?duration=" + Math.min(duration, 40);
        }

        String resolvedCampaign = (campaign != null && !campaign.isBlank()) ? campaign.trim() : "auditoria-manual";

        CallRecord callRecord = CallRecord.builder()
                .externalCallId(extCallId)
                .analyst(analyst)
                .customer(customer)
                .customerIdentifier(phoneKey)
                .callDate(OffsetDateTime.now())
                .durationSeconds(duration)
                .audioUrl(resolvedAudioUrl)
                .status(CallStatus.PENDENTE)
                .channel("upload-manual")
                .campaign(resolvedCampaign)
                .metadata(Map.of(
                        "channel", "upload-manual",
                        "campaign", resolvedCampaign,
                        "uploadedFileName", audioFile != null && audioFile.getOriginalFilename() != null
                                ? audioFile.getOriginalFilename()
                                : (extCallId + ".wav")
                ))
                .build();

        CallRecord saved = callRecordRepository.save(callRecord);
        log.info("Gravação anexada pela gestora registrada: externalCallId={}, analyst={}, phone={}",
                extCallId, analyst.getEmail(), phoneKey);
        return CallRecordResponse.fromEntity(saved);
    }

    @Transactional(readOnly = true)
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
        }

        return records.stream()
                .map(CallRecordResponse::fromEntity)
                .toList();
    }

    @Transactional(readOnly = true)
    public CallRecordResponse getCallById(UUID id, UserPrincipal currentUser) {
        CallRecord callRecord = callRecordRepository.findWithDetailsById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Ligação não encontrada com ID: " + id));

        if (currentUser.isAnalista() && !callRecord.getAnalyst().getId().equals(currentUser.getId())) {
            throw new AccessDeniedException("Analistas só podem visualizar suas próprias ligações.");
        }

        return CallRecordResponse.fromEntity(callRecord);
    }

    private Customer provisionCustomerFromWebhook(String phone) {
        int hash = Math.abs(phone.hashCode());
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
