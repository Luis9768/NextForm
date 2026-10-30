package com.formshq.dto.form;

import com.formshq.domain.entity.EvaluationFormTemplate;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

public record FormTemplateResponse(
        UUID id,
        String name,
        String description,
        String sector,
        BigDecimal passingScorePercentage,
        Integer version,
        boolean active,
        int maxPossiblePoints,
        int standardItemsCount,
        int fatalItemsCount,
        List<FormItemResponse> items,
        OffsetDateTime createdAt,
        OffsetDateTime updatedAt
) {
    public static FormTemplateResponse fromEntity(EvaluationFormTemplate template) {
        List<FormItemResponse> itemDtos = template.getItems() == null
                ? List.of()
                : template.getItems().stream().map(FormItemResponse::fromEntity).toList();

        int standardCount = (int) itemDtos.stream().filter(i -> !i.fatalError()).count();
        int fatalCount = (int) itemDtos.stream().filter(FormItemResponse::fatalError).count();
        int maxPossiblePoints = itemDtos.stream()
                .filter(i -> !i.fatalError())
                .mapToInt(i -> i.weight() != null && i.weight() > 0 ? i.weight() : 1)
                .sum();

        return new FormTemplateResponse(
                template.getId(),
                template.getName(),
                template.getDescription(),
                template.getSector() != null ? template.getSector() : "Geral",
                template.getPassingScorePercentage(),
                template.getVersion(),
                template.isActive(),
                maxPossiblePoints,
                standardCount,
                fatalCount,
                itemDtos,
                template.getCreatedAt(),
                template.getUpdatedAt()
        );
    }
}
