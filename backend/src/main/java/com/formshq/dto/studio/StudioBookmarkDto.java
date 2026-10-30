package com.formshq.dto.studio;

public record StudioBookmarkDto(
        String id,
        String name,
        String collection,
        String layout,
        String filterJson,
        String scope,
        String icon,
        String targetHref
) {}
