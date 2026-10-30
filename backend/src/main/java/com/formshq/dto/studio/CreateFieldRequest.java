package com.formshq.dto.studio;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record CreateFieldRequest(
        @NotBlank(message = "O nome do campo é obrigatório")
        @Size(max = 80)
        String field,

        @Size(max = 60)
        String type,

        @Size(max = 60)
        String interfaceType,

        @Size(max = 20)
        String width,

        boolean required,

        @Size(max = 500)
        String description
) {}
