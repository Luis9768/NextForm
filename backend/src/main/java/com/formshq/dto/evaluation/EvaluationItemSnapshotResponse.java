package com.formshq.dto.evaluation;

import com.formshq.domain.entity.EvaluationItemSnapshot;

import java.io.Serializable;
import java.util.UUID;

public record EvaluationItemSnapshotResponse(
        UUID id,
        UUID originalItemId,
        String label,
        String description,
        String category,
        boolean fatalError,
        Integer points,
        Integer displayOrder,
        boolean checked,
        String observation
) implements Serializable {
    public static EvaluationItemSnapshotResponse fromEntity(EvaluationItemSnapshot snapshot) {
        return new EvaluationItemSnapshotResponse(
                snapshot.getId(),
                snapshot.getOriginalItemId(),
                snapshot.getLabelSnapshot(),
                snapshot.getDescriptionSnapshot(),
                snapshot.getCategorySnapshot(),
                snapshot.isFatalErrorSnapshot(),
                snapshot.getPointsSnapshot(),
                snapshot.getDisplayOrder(),
                snapshot.isChecked(),
                snapshot.getObservation()
        );
    }
}
