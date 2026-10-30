package com.formshq.dto.auth;

import com.formshq.domain.entity.User;
import com.formshq.domain.enums.Role;

import java.util.Arrays;
import java.util.List;
import java.util.UUID;

public record UserSummaryDto(
        UUID id,
        String name,
        String email,
        Role role,
        String department,
        UUID managerId,
        String managerName,
        List<String> allowedSectors,
        boolean active
) {
    public static UserSummaryDto fromEntity(User user) {
        if (user == null) {
            return null;
        }
        List<String> parsedSectors = (user.getAllowedSectors() == null || user.getAllowedSectors().isBlank())
                ? List.of()
                : Arrays.stream(user.getAllowedSectors().split(","))
                .map(String::trim)
                .filter(s -> !s.isEmpty())
                .toList();

        return new UserSummaryDto(
                user.getId(),
                user.getName(),
                user.getEmail(),
                user.getRole(),
                user.getDepartment(),
                user.getManager() != null ? user.getManager().getId() : null,
                user.getManager() != null ? user.getManager().getName() : null,
                parsedSectors,
                user.isActive()
        );
    }
}
