package com.formshq.dto.directus;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.Map;

public record DirectusUserSyncResultDto(
        String source,
        int totalDirectusUsersFetched,
        int syncedUsersCount,
        int purgedFictionalUsers,
        int purgedFictionalEvaluations,
        int purgedFictionalCalls,
        int purgedFictionalForms,
        int purgedFictionalSectors,
        Map<String, Integer> usersBySector,
        List<String> managersAndAdmins,
        OffsetDateTime syncedAt
) {
}
