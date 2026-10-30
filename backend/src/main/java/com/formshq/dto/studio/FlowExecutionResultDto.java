package com.formshq.dto.studio;

import java.time.OffsetDateTime;
import java.util.List;

public record FlowExecutionResultDto(
        String flowId,
        String flowName,
        String status,
        long durationMs,
        OffsetDateTime executedAt,
        List<StepLogDto> steps
) {
    public record StepLogDto(
            String stepName,
            String operationType,
            String status,
            long durationMs,
            String outputDetail
    ) {}
}
