package com.formshq.dto.customer;

import java.util.UUID;

public record CustomerWebhookLookupRequest(
        String phone,
        String cpf,
        String motherName,
        String fatherName,
        String name,
        String searchKey,
        String keyType,
        UUID analystId,
        String webhookUrl
) {
    public CustomerWebhookLookupRequest(
            String phone,
            String searchKey,
            String keyType,
            UUID analystId,
            String webhookUrl
    ) {
        this(phone, null, null, null, null, searchKey, keyType, analystId, webhookUrl);
    }

    public String resolvedKey() {
        if (phone != null && !phone.isBlank()) {
            return phone.trim();
        }
        if (searchKey != null && !searchKey.isBlank()) {
            return searchKey.trim();
        }
        if (cpf != null && !cpf.isBlank()) {
            return cpf.trim();
        }
        if (name != null && !name.isBlank()) {
            return name.trim();
        }
        return "";
    }
}
