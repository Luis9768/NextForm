package com.formshq.dto.directus;

import java.time.OffsetDateTime;
import java.util.List;

public record DirectusSyncResultDto(
        String source,
        List<String> processedCollections,
        int totalReceived,
        int importedCount,
        int skippedDuplicates,
        int failedCount,
        List<String> provisionedAnalysts,
        List<String> importedEvaluationCodes,
        List<String> warnings,
        OffsetDateTime syncedAt
) {
}
