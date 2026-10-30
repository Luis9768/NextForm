package com.formshq.dto.studio;

public record StudioExtensionDto(
        String id,
        String name,
        String packageName,
        String type,
        String version,
        String author,
        String description,
        boolean installed,
        boolean enabled,
        int downloads,
        boolean verified
) {}
