package com.formshq.dto.auth;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record ChangeOwnPasswordRequest(
        @NotBlank(message = "A nova senha é obrigatória.")
        @Size(min = 6, max = 100, message = "A nova senha deve ter no mínimo 6 caracteres.")
        String newPassword,

        @NotBlank(message = "A confirmação da senha é obrigatória.")
        String confirmPassword
) {
}
