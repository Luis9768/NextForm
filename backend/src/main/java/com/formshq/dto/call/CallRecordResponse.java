package com.formshq.dto.call;

import com.formshq.domain.entity.CallRecord;
import com.formshq.domain.entity.Evaluation;
import com.formshq.domain.enums.CallStatus;
import com.formshq.domain.enums.EvaluationStatus;
import com.formshq.dto.auth.UserSummaryDto;
import com.formshq.dto.customer.CustomerDto;

import java.io.Serializable;
import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;

public record CallRecordResponse(
        UUID id,
        String externalCallId,
        UserSummaryDto analyst,
        CustomerDto customer,
        String customerIdentifier,
        OffsetDateTime callDate,
        Integer durationSeconds,
        String audioUrl,
        CallStatus status,
        String channel,
        String campaign,
        Map<String, Object> metadata,
        UUID evaluationId,
        BigDecimal finalScorePercentage,
        EvaluationStatus evaluationStatus,
        Boolean fatalErrorTriggered,
        OffsetDateTime createdAt
) implements Serializable {
    public static CallRecordResponse fromEntity(CallRecord callRecord) {
        return buildResponse(callRecord, false);
    }

    public static CallRecordResponse fromEntitySummary(CallRecord callRecord) {
        return buildResponse(callRecord, true);
    }

    private static CallRecordResponse buildResponse(CallRecord callRecord, boolean omitLargeTranscript) {
        if (callRecord == null) {
            return null;
        }
        Evaluation eval = callRecord.getEvaluation();
        Map<String, Object> rawMeta = callRecord.getMetadata();
        Map<String, Object> finalMeta = rawMeta;
        if (omitLargeTranscript && rawMeta != null && rawMeta.containsKey("transcricao")) {
            finalMeta = new LinkedHashMap<>(rawMeta);
            finalMeta.remove("transcricao");
        }
        return new CallRecordResponse(
                callRecord.getId(),
                callRecord.getExternalCallId(),
                UserSummaryDto.fromEntity(callRecord.getAnalyst()),
                CustomerDto.fromEntity(callRecord.getCustomer()),
                callRecord.getCustomerIdentifier(),
                callRecord.getCallDate(),
                callRecord.getDurationSeconds(),
                callRecord.getAudioUrl(),
                callRecord.getStatus(),
                callRecord.getChannel(),
                callRecord.getCampaign(),
                finalMeta,
                eval != null ? eval.getId() : null,
                eval != null ? eval.getFinalScorePercentage() : null,
                eval != null ? eval.getStatus() : null,
                eval != null ? eval.isFatalErrorTriggered() : null,
                callRecord.getCreatedAt()
        );
    }
}
