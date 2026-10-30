package com.formshq.dto.studio;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record CreateFlowRequest(
        @NotBlank(message = "O nome do fluxo é obrigatório")
        @Size(max = 180)
        String name,

        @Size(max = 500)
        String description,

        @Size(max = 60)
        String triggerType,

        @Size(max = 120)
        String triggerCollection,

        @Size(max = 1000)
        String conditionSummary,

        @Size(max = 1000)
        String actionSummary
) {}
