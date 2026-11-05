package com.formshq.dto.dashboard;

import java.io.Serializable;
import java.math.BigDecimal;

public record ScoreTimelinePointDto(
        String label,
        BigDecimal averageScore,
        long evaluationsCount
) implements Serializable {}
