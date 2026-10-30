package com.formshq.dto.form;

import jakarta.validation.Valid;
import jakarta.validation.constraints.*;

import java.math.BigDecimal;
import java.util.List;

public record FormTemplateRequest(
        @NotBlank(message = "O nome do formulário é obrigatório")
        @Size(max = 180, message = "O nome deve ter no máximo 180 caracteres")
        String name,

        String description,

        @Size(max = 100)
        String sector,

        @NotNull(message = "O percentual mínimo de aprovação é obrigatório")
        @DecimalMin(value = "0.0", message = "O percentual mínimo deve ser maior ou igual a 0")
        @DecimalMax(value = "100.0", message = "O percentual mínimo deve ser menor ou igual a 100")
        BigDecimal passingScorePercentage,

        Boolean active,

        @NotEmpty(message = "O formulário deve possuir pelo menos um item")
        @Valid
        List<FormItemRequest> items
) {
    public FormTemplateRequest(
            String name,
            String description,
            BigDecimal passingScorePercentage,
            Boolean active,
            List<FormItemRequest> items
    ) {
        this(name, description, "Geral", passingScorePercentage, active, items);
    }
}
