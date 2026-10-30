package com.formshq.dto.sector;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record SectorRequest(
        @NotBlank(message = "O nome do setor é obrigatório")
        @Size(max = 120, message = "O nome do setor deve ter no máximo 120 caracteres")
        String name,

        @Size(max = 60)
        String code,

        @Size(max = 500)
        String description,

        Boolean active
) {}
