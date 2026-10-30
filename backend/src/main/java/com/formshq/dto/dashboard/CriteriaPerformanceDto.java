package com.formshq.dto.dashboard;

import java.math.BigDecimal;

public record CriteriaPerformanceDto(
        String category,
        String criterionLabel,
        long totalEvaluated,
        long compliantCount,
        BigDecimal complianceRatePercentage
) {}
