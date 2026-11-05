package com.formshq.dto.dashboard;

import java.io.Serializable;
import java.math.BigDecimal;

public record SectorPerformanceDto(
        String sector,
        long evaluationsCount,
        BigDecimal averageScore,
        BigDecimal approvalRatePercentage
) implements Serializable {}
