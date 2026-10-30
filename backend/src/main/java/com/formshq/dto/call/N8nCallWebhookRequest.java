package com.formshq.dto.call;

import com.fasterxml.jackson.annotation.JsonAlias;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.PositiveOrZero;

import java.time.OffsetDateTime;
import java.util.Map;

public record N8nCallWebhookRequest(
        @NotBlank(message = "externalCallId é obrigatório")
        String externalCallId,

        @NotBlank(message = "analystEmail é obrigatório")
        @Email(message = "analystEmail deve ser um e-mail válido")
        String analystEmail,

        @JsonAlias({"customerPhone", "customerIdentifier"})
        @NotBlank(message = "customerIdentifier / customerPhone é obrigatório")
        String customerIdentifier,

        @NotNull(message = "callDate é obrigatório")
        OffsetDateTime callDate,

        @NotNull(message = "durationSeconds é obrigatório")
        @PositiveOrZero(message = "durationSeconds não pode ser negativo")
        Integer durationSeconds,

        @NotBlank(message = "audioUrl é obrigatório")
        String audioUrl,

        Map<String, Object> metadata
) {}
