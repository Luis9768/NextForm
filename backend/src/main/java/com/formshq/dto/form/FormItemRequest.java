package com.formshq.dto.form;

import com.fasterxml.jackson.annotation.JsonAlias;
import jakarta.validation.constraints.NotBlank;

public record FormItemRequest(
        @NotBlank(message = "O texto do item é obrigatório")
        String label,

        String description,

        @NotBlank(message = "A categoria do item é obrigatória")
        String category,

        boolean fatalError,

        @JsonAlias({"points", "weight"})
        Integer weight,

        Integer displayOrder
) {}
