package com.formshq.dto.studio;

import java.util.List;

public record StudioCollectionDto(
        String collection,
        String displayName,
        String description,
        String icon,
        long itemCount,
        boolean readOnlyForAnalyst,
        List<StudioFieldDto> fields,
        StudioPermissionDto permissions
) {
    public record StudioFieldDto(
            String field,
            String type,
            boolean primaryKey,
            boolean required,
            String description
    ) {}

    public record StudioPermissionDto(
            String create,
            String read,
            String update,
            String delete
    ) {}
}
