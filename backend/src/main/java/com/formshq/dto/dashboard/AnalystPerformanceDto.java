package com.formshq.dto.dashboard;

import java.math.BigDecimal;
import java.util.UUID;

public record AnalystPerformanceDto(
        UUID analystId,
        String analystName,
        String analystEmail,
        String department,
        long totalCalls,
        long evaluatedCalls,
        long pendingCalls,
        BigDecimal averageScore,
        long approvedCount,
        long failedCount,
        long fatalErrorCount
) {}
