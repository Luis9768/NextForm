package com.formshq.dto.studio;

import java.time.OffsetDateTime;

public record StudioActivityDto(
        String id,
        String action,
        String collection,
        String itemKey,
        String actorName,
        String actorRole,
        String summary,
        OffsetDateTime timestamp
) {}
