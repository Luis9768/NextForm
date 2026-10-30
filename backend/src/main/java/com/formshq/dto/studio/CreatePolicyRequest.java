package com.formshq.dto.studio;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record CreatePolicyRequest(
        @NotBlank(message = "O nome da política é obrigatório")
        @Size(max = 150)
        String name,

        @NotBlank(message = "O código do perfil é obrigatório")
        @Size(max = 60)
        String roleCode,

        @Size(max = 500)
        String description,

        boolean adminAccess,

        boolean appAccess
) {}
