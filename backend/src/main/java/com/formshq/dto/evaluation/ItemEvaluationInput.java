package com.formshq.dto.evaluation;

import jakarta.validation.constraints.NotNull;

import java.util.UUID;

public record ItemEvaluationInput(
        @NotNull(message = "O ID do item do formulário é obrigatório")
        UUID formItemId,

        boolean checked,

        String observation
) {}
