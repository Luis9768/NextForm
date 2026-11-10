package com.formshq.dto.evaluation;

import java.math.BigDecimal;
import java.util.List;
import java.util.UUID;

public record UpdateEvaluationRequest(
        BigDecimal manualFinalScore,
        Boolean fatalErrorTriggered,
        String generalFeedback,
        List<SnapshotItemUpdateInput> items
) {
    public record SnapshotItemUpdateInput(
            UUID id,
            boolean checked,
            String observation
    ) {}
}
