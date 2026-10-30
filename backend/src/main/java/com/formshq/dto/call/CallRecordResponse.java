package com.formshq.dto.call;

import com.formshq.domain.entity.CallRecord;
import com.formshq.domain.entity.Evaluation;
import com.formshq.domain.enums.CallStatus;
import com.formshq.domain.enums.EvaluationStatus;
import com.formshq.dto.auth.UserSummaryDto;
import com.formshq.dto.customer.CustomerDto;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
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
) {
    public static CallRecordResponse fromEntity(CallRecord callRecord) {
        Evaluation eval = callRecord.getEvaluation();
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
                callRecord.getMetadata(),
                eval != null ? eval.getId() : null,
                eval != null ? eval.getFinalScorePercentage() : null,
                eval != null ? eval.getStatus() : null,
                eval != null ? eval.isFatalErrorTriggered() : null,
                callRecord.getCreatedAt()
        );
    }
}
