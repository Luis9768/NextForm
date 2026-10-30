package com.formshq.dto.dashboard;

import com.formshq.dto.evaluation.EvaluationResponse;

import java.math.BigDecimal;
import java.util.List;

public record DashboardSummaryResponse(
        long totalCalls,
        long pendingCalls,
        long evaluatedCalls,
        long monthlyEvaluationsCount,
        BigDecimal averageScorePercentage,
        BigDecimal approvalRatePercentage,
        BigDecimal fatalErrorRatePercentage,
        long approvedCount,
        long failedCount,
        long fatalErrorCount,
        AnalystPerformanceDto topAnalyst,
        List<ScoreTimelinePointDto> scoreTimeline,
        List<AnalystPerformanceDto> analystRanking,
        List<SectorPerformanceDto> sectorAverages,
        List<CriteriaPerformanceDto> criteriaComparison,
        List<EvaluationResponse> recentEvaluations
) {}
