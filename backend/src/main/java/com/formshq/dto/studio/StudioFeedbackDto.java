package com.formshq.dto.studio;

public record StudioFeedbackDto(
        String id,
        String type,
        String title,
        String module,
        String severity,
        String status,
        int votes,
        String author,
        String createdAt,
        String description
) {}
