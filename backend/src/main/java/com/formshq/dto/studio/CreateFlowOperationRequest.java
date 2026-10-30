package com.formshq.dto.studio;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record CreateFlowOperationRequest(
        @NotBlank(message = "O nome da operação é obrigatório")
        @Size(max = 160)
        String name,

        @NotBlank(message = "O tipo da operação é obrigatório")
        @Size(max = 60)
        String type,

        @Size(max = 2000)
        String configSummary
) {}
