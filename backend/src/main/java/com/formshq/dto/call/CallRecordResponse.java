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
        Integer resolvedDuration = callRecord.getDurationSeconds();
        if ((resolvedDuration == null || resolvedDuration == 210) && rawMeta != null) {
            Object trObj = rawMeta.get("transcricao");
            if (trObj instanceof String tr && !tr.isBlank()) {
                java.util.regex.Matcher mTime = java.util.regex.Pattern
                        .compile("\\[(\\d{1,2}):(\\d{2})(?::(\\d{2}))?\\]")
                        .matcher(tr);
                int maxSecs = 0;
                while (mTime.find()) {
                    try {
                        int p1 = Integer.parseInt(mTime.group(1));
                        int p2 = Integer.parseInt(mTime.group(2));
                        String g3 = mTime.group(3);
                        int s = (g3 != null) ? (p1 * 3600 + p2 * 60 + Integer.parseInt(g3)) : (p1 * 60 + p2);
                        if (s > maxSecs && s <= 7200) {
                            maxSecs = s;
                        }
                    } catch (NumberFormatException ignored) {
                    }
                }
                if (maxSecs >= 10) {
                    resolvedDuration = maxSecs;
                }
            }
        }
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
                resolvedDuration,
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
