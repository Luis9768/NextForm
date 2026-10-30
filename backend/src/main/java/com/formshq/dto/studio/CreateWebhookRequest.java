package com.formshq.dto.studio;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record CreateWebhookRequest(
        @NotBlank(message = "O nome do webhook é obrigatório")
        @Size(max = 150)
        String name,

        @NotBlank(message = "A URL do webhook é obrigatória")
        @Size(max = 1000)
        String url,

        @Size(max = 80)
        String collection,

        @Size(max = 40)
        String action
) {}
