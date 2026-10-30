package com.formshq.dto.studio;

import java.util.List;

public record StudioWebhookDto(
        String id,
        String name,
        String method,
        String url,
        String status,
        List<String> actions,
        List<String> collections,
        long deliveriesCount,
        String lastHttpStatus
) {}
