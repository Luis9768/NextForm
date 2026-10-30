package com.formshq.dto.studio;

import java.util.List;

public record StudioPolicyDto(
        String id,
        String name,
        String roleCode,
        String description,
        String ipAccess,
        boolean adminAccess,
        boolean appAccess,
        List<PolicyRuleDto> rules
) {
    public record PolicyRuleDto(
            String collection,
            String create,
            String read,
            String update,
            String delete,
            String share,
            String filterRule
    ) {}
}
