package com.formshq.dto.dashboard;

import java.math.BigDecimal;

public record SectorPerformanceDto(
        String sector,
        long evaluationsCount,
        BigDecimal averageScore,
        BigDecimal approvalRatePercentage
) {}
