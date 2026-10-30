package com.formshq.dto.sector;

import com.formshq.domain.entity.Sector;

import java.time.OffsetDateTime;
import java.util.UUID;

public record SectorResponse(
        UUID id,
        String name,
        String code,
        String description,
        boolean active,
        OffsetDateTime createdAt,
        OffsetDateTime updatedAt
) {
    public static SectorResponse fromEntity(Sector sector) {
        return new SectorResponse(
                sector.getId(),
                sector.getName(),
                sector.getCode(),
                sector.getDescription(),
                sector.isActive(),
                sector.getCreatedAt(),
                sector.getUpdatedAt()
        );
    }
}
