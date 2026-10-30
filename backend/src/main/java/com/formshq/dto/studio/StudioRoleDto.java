package com.formshq.dto.studio;

import java.util.List;

public record StudioRoleDto(
        String id,
        String code,
        String name,
        String description,
        String icon,
        boolean adminAccess,
        boolean appAccess,
        boolean enforceTwoFactor,
        List<String> policies,
        List<RoleMemberDto> users,
        int usersCount
) {
    public record RoleMemberDto(
            String id,
            String name,
            String email,
            String department
    ) {}
}
