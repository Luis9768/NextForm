package com.formshq.dto.form;

import com.formshq.domain.entity.EvaluationFormItem;

import java.util.UUID;

public record FormItemResponse(
        UUID id,
        String label,
        String description,
        String category,
        boolean fatalError,
        Integer points,
        Integer weight,
        Integer displayOrder
) {
    public static FormItemResponse fromEntity(EvaluationFormItem item) {
        int resolvedWeight = item.isFatalError() ? 0 : (item.getPoints() != null && item.getPoints() > 0 ? item.getPoints() : 1);
        return new FormItemResponse(
                item.getId(),
                item.getLabel(),
                item.getDescription(),
                item.getCategory(),
                item.isFatalError(),
                resolvedWeight,
                resolvedWeight,
                item.getDisplayOrder()
        );
    }
}
