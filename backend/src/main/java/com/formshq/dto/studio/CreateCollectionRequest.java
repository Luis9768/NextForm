package com.formshq.dto.studio;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record CreateCollectionRequest(
        @NotBlank(message = "A chave da coleção é obrigatória")
        @Size(max = 80, message = "A chave da coleção deve ter no máximo 80 caracteres")
        String collection,

        @Size(max = 120)
        String displayName,

        @Size(max = 500)
        String description,

        @Size(max = 40)
        String primaryKeyType
) {}
