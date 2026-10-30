package com.formshq.dto.studio;

import java.math.BigDecimal;
import java.util.List;

public record StudioBenchmarkResponse(
        BigDecimal companyTargetScore,
        BigDecimal currentTeamAverage,
        BigDecimal complianceRateWithoutFatal,
        int averageCallDurationSeconds,
        long dbQueryLatencyMs,
        long apiSerializationLatencyMs,
        long audioStreamThroughputKbps,
        List<CategoryBenchmarkDto> categoryBenchmarks,
        List<AnalystBenchmarkDto> analystBenchmarks
) {
    public record CategoryBenchmarkDto(
            String category,
            long totalItemsEvaluated,
            long checkedItemsCount,
            BigDecimal adherencePercentage,
            BigDecimal targetPercentage
    ) {}

    public record AnalystBenchmarkDto(
            String analystId,
            String analystName,
            String department,
            long evaluatedCalls,
            BigDecimal averageScore,
            BigDecimal targetScore,
            BigDecimal deltaFromTarget,
            BigDecimal complianceRate
    ) {}
}
