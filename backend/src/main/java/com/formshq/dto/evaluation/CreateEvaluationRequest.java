package com.formshq.dto.evaluation;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;

import java.util.List;
import java.util.UUID;

public record CreateEvaluationRequest(
        @NotNull(message = "O ID da ligação (callRecordId) é obrigatório")
        UUID callRecordId,

        @NotNull(message = "O ID do modelo de formulário (formTemplateId) é obrigatório")
        UUID formTemplateId,

        @NotEmpty(message = "A lista de respostas dos itens do formulário não pode ser vazia")
        @Valid
        List<ItemEvaluationInput> answers,

        String generalFeedback,

        String transcricao
) {
    public CreateEvaluationRequest(
            UUID callRecordId,
            UUID formTemplateId,
            List<ItemEvaluationInput> answers,
            String generalFeedback
    ) {
        this(callRecordId, formTemplateId, answers, generalFeedback, null);
    }
}
