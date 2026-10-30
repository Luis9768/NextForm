package com.formshq.dto.studio;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record CreateFeedbackRequest(
        @NotBlank(message = "O tipo é obrigatório")
        @Size(max = 30)
        String type,

        @NotBlank(message = "O título é obrigatório")
        @Size(max = 220)
        String title,

        @Size(max = 100)
        String module,

        @Size(max = 40)
        String severity,

        @Size(max = 2000)
        String description
) {}
