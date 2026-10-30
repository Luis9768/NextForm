package com.formshq.dto.studio;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record CreateTranslationRequest(
        @NotBlank(message = "A chave de tradução é obrigatória")
        @Size(max = 120)
        String key,

        @Size(max = 500)
        String ptBR,

        @Size(max = 500)
        String enUS,

        @Size(max = 500)
        String esES
) {}
