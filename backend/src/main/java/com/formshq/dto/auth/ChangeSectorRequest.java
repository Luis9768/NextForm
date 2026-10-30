package com.formshq.dto.auth;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record ChangeSectorRequest(
        @NotBlank(message = "O novo setor do analista é obrigatório")
        @Size(max = 100)
        String newSector,

        @Size(max = 500)
        String reason
) {}
