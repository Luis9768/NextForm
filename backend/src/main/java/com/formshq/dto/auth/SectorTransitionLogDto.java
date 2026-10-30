package com.formshq.dto.auth;

import com.formshq.domain.entity.SectorTransitionLog;

import java.time.OffsetDateTime;
import java.util.UUID;

public record SectorTransitionLogDto(
        UUID id,
        UUID analystId,
        String analystName,
        String previousSector,
        String newSector,
        UUID changedById,
        String changedByName,
        String reason,
        OffsetDateTime changedAt
) {
    public static SectorTransitionLogDto fromEntity(SectorTransitionLog log) {
        return new SectorTransitionLogDto(
                log.getId(),
                log.getAnalyst().getId(),
                log.getAnalyst().getName(),
                log.getPreviousSector(),
                log.getNewSector(),
                log.getChangedBy().getId(),
                log.getChangedBy().getName(),
                log.getReason(),
                log.getChangedAt()
        );
    }
}
