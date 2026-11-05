package com.formshq.dto.evaluation;

import com.formshq.domain.entity.Evaluation;
import com.formshq.domain.enums.EvaluationStatus;
import com.formshq.dto.auth.UserSummaryDto;
import com.formshq.dto.call.CallRecordResponse;

import java.io.Serializable;
import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

public record EvaluationResponse(
        UUID id,
        CallRecordResponse callRecord,
        UserSummaryDto evaluator,
        UserSummaryDto analyst,
        String analystSectorSnapshot,
        UUID formTemplateId,
        String formNameSnapshot,
        Integer formVersionSnapshot,
        BigDecimal passingScoreSnapshot,
        Integer obtainedPoints,
        Integer maxPossiblePoints,
        BigDecimal rawScorePercentage,
        BigDecimal finalScorePercentage,
        boolean fatalErrorTriggered,
        EvaluationStatus status,
        String generalFeedback,
        List<EvaluationItemSnapshotResponse> items,
        OffsetDateTime evaluatedAt
) implements Serializable {
    public static EvaluationResponse fromEntity(Evaluation evaluation) {
        return buildResponse(evaluation, true, false);
    }

    /**
     * Versão enxuta para listagens de alta densidade (/api/v1/evaluations):
     * omite os 32 itemSnapshots individuais e a transcrição bruta de 20KB, reduzindo o payload de 26MB para ~400KB.
     */
    public static EvaluationResponse fromEntityListSummary(Evaluation evaluation) {
        return buildResponse(evaluation, false, true);
    }

    /**
     * Versão para o modal rápido do Dashboard: mantém os itens da ficha mas omite a transcrição bruta na listagem.
     */
    public static EvaluationResponse fromEntityDashboardSummary(Evaluation evaluation) {
        return buildResponse(evaluation, true, true);
    }

    private static EvaluationResponse buildResponse(
            Evaluation evaluation,
            boolean includeItems,
            boolean omitLargeTranscript
    ) {
        List<EvaluationItemSnapshotResponse> itemResponses = (!includeItems || evaluation.getItemSnapshots() == null)
                ? List.of()
                : evaluation.getItemSnapshots().stream()
                .map(EvaluationItemSnapshotResponse::fromEntity)
                .toList();

        String resolvedSectorSnapshot = evaluation.getAnalystSectorSnapshot() != null
                ? evaluation.getAnalystSectorSnapshot()
                : (evaluation.getAnalyst() != null ? evaluation.getAnalyst().getDepartment() : "Geral");

        return new EvaluationResponse(
                evaluation.getId(),
                omitLargeTranscript
                        ? CallRecordResponse.fromEntitySummary(evaluation.getCallRecord())
                        : CallRecordResponse.fromEntity(evaluation.getCallRecord()),
                UserSummaryDto.fromEntity(evaluation.getEvaluator()),
                UserSummaryDto.fromEntity(evaluation.getAnalyst()),
                resolvedSectorSnapshot,
                evaluation.getFormTemplate() != null ? evaluation.getFormTemplate().getId() : null,
                evaluation.getFormNameSnapshot(),
                evaluation.getFormVersionSnapshot(),
                evaluation.getPassingScoreSnapshot(),
                evaluation.getObtainedPoints(),
                evaluation.getMaxPossiblePoints(),
                evaluation.getRawScorePercentage(),
                evaluation.getFinalScorePercentage(),
                evaluation.isFatalErrorTriggered(),
                evaluation.getStatus(),
                evaluation.getGeneralFeedback(),
                itemResponses,
                evaluation.getEvaluatedAt()
        );
    }
}
