package com.formshq.dto.auth;

public record AuthResponse(
        String accessToken,
        String tokenType,
        UserSummaryDto user
) {}
