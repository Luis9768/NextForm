package com.formshq.dto.dashboard;

import java.math.BigDecimal;

public record ScoreTimelinePointDto(
        String label,
        BigDecimal averageScore,
        long evaluationsCount
) {}
