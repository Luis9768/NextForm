package com.formshq.dto.studio;

import java.time.OffsetDateTime;
import java.util.List;

public record StudioFlowDto(
        String id,
        String name,
        String description,
        String status,
        String triggerType,
        String triggerCollection,
        List<FlowOperationDto> operations,
        long totalExecutions,
        OffsetDateTime lastExecutedAt,
        String lastExecutionStatus
) {
    public record FlowOperationDto(
            String id,
            String name,
            String type,
            String configSummary
    ) {}
}
