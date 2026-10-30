package com.formshq.dto.studio;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record CreateRoleRequest(
        @NotBlank(message = "O nome do perfil é obrigatório")
        @Size(max = 120)
        String name,

        @NotBlank(message = "O código do perfil é obrigatório")
        @Size(max = 60)
        String code,

        @Size(max = 500)
        String description,

        boolean adminAccess,

        boolean appAccess
) {}
