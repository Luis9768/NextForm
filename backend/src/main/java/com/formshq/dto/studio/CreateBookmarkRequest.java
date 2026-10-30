package com.formshq.dto.studio;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record CreateBookmarkRequest(
        @NotBlank(message = "O nome do favorito é obrigatório")
        @Size(max = 140)
        String name,

        @NotBlank(message = "A coleção alvo é obrigatória")
        @Size(max = 80)
        String collection,

        @Size(max = 40)
        String layout,

        @Size(max = 1000)
        String filterJson,

        @Size(max = 60)
        String scope,

        @Size(max = 250)
        String targetHref
) {}
