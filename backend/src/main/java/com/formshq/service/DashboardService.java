package com.formshq.service;

import com.formshq.domain.entity.CallRecord;
import com.formshq.domain.entity.Evaluation;
import com.formshq.domain.entity.EvaluationItemSnapshot;
import com.formshq.domain.entity.User;
import com.formshq.domain.enums.CallStatus;
import com.formshq.domain.enums.EvaluationStatus;
import com.formshq.domain.enums.Role;
import com.formshq.dto.dashboard.*;
import com.formshq.dto.evaluation.EvaluationResponse;
import com.formshq.repository.CallRecordRepository;
import com.formshq.repository.EvaluationRepository;
import com.formshq.repository.UserRepository;
import com.formshq.security.UserPrincipal;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.format.DateTimeFormatter;
import java.util.*;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
public class DashboardService {

    private static final DateTimeFormatter DAY_FMT = DateTimeFormatter.ofPattern("dd/MM");

    private final CallRecordRepository callRecordRepository;
    private final EvaluationRepository evaluationRepository;
    private final UserRepository userRepository;

    @Transactional(readOnly = true)
    public DashboardSummaryResponse getSummary(UserPrincipal currentUser) {
        return getSummary(currentUser, null, null, null, null);
    }

    @Transactional(readOnly = true)
    public DashboardSummaryResponse getSummary(
            UserPrincipal currentUser,
            String sectorFilter,
            UUID analystIdFilter,
            LocalDate startDate,
            LocalDate endDate
    ) {
        List<CallRecord> calls;
        List<Evaluation> evaluations;
        List<User> analysts;

        if (currentUser.isAnalista()) {
            UUID selfId = currentUser.getId();
            calls = callRecordRepository.findByAnalystIdOrderByCallDateDesc(selfId);
            evaluations = evaluationRepository.findByAnalystIdOrderByEvaluatedAtDesc(selfId);
            analysts = userRepository.findById(selfId).map(List::of).orElse(List.of());
        } else {
            calls = callRecordRepository.findAllByOrderByCallDateDesc();
            evaluations = evaluationRepository.findAllByOrderByEvaluatedAtDesc();
            analysts = userRepository.findByRoleOrderByNameAsc(Role.ROLE_ANALISTA);

            // Escopo de setores para Gestor (Admin vê todos os setores)
            if (!currentUser.isAdmin() && currentUser.isGestor()) {
                User manager = userRepository.findById(currentUser.getId()).orElse(null);
                if (manager != null && manager.getAllowedSectors() != null && !manager.getAllowedSectors().isBlank()) {
                    Set<String> allowed = Arrays.stream(manager.getAllowedSectors().split(","))
                            .map(s -> s.trim().toLowerCase())
                            .filter(s -> !s.isEmpty())
                            .collect(Collectors.toSet());
                    if (!allowed.isEmpty()) {
                        analysts = analysts.stream()
                                .filter(a -> a.getDepartment() != null && allowed.contains(a.getDepartment().trim().toLowerCase()))
                                .toList();
                        evaluations = evaluations.stream()
                                .filter(e -> allowed.contains(resolveEvaluationSector(e).toLowerCase()))
                                .toList();
                        calls = calls.stream()
                                .filter(c -> c.getAnalyst() != null && c.getAnalyst().getDepartment() != null
                                        && allowed.contains(c.getAnalyst().getDepartment().trim().toLowerCase()))
                                .toList();
                    }
                }
            }
        }

        // Calcula médias gerais por setor antes de aplicar o filtro de setor único, ou dentro do escopo permitido
        List<SectorPerformanceDto> sectorAverages = buildSectorAverages(evaluations);

        if (sectorFilter != null && !sectorFilter.isBlank() && !currentUser.isAnalista()) {
            String sec = sectorFilter.trim().toLowerCase();
            analysts = analysts.stream()
                    .filter(a -> a.getDepartment() != null && a.getDepartment().trim().equalsIgnoreCase(sec))
                    .toList();
            evaluations = evaluations.stream()
                    .filter(e -> resolveEvaluationSector(e).equalsIgnoreCase(sec))
                    .toList();
            calls = calls.stream()
                    .filter(c -> c.getAnalyst() != null && c.getAnalyst().getDepartment() != null
                            && c.getAnalyst().getDepartment().trim().equalsIgnoreCase(sec))
                    .toList();
        }

        if (analystIdFilter != null && !currentUser.isAnalista()) {
            analysts = analysts.stream().filter(a -> a.getId().equals(analystIdFilter)).toList();
            evaluations = evaluations.stream().filter(e -> e.getAnalyst().getId().equals(analystIdFilter)).toList();
            calls = calls.stream().filter(c -> c.getAnalyst().getId().equals(analystIdFilter)).toList();
        }

        if (startDate != null) {
            evaluations = evaluations.stream()
                    .filter(e -> e.getEvaluatedAt() != null && !e.getEvaluatedAt().toLocalDate().isBefore(startDate))
                    .toList();
        }

        if (endDate != null) {
            evaluations = evaluations.stream()
                    .filter(e -> e.getEvaluatedAt() != null && !e.getEvaluatedAt().toLocalDate().isAfter(endDate))
                    .toList();
        }

        long totalCalls = calls.size();
        long pendingCalls = calls.stream().filter(c -> c.getStatus() == CallStatus.PENDENTE).count();
        long evaluatedCalls = evaluations.size();

        OffsetDateTime thirtyDaysAgo = OffsetDateTime.now().minusDays(30);
        long monthlyEvaluationsCount = evaluations.stream()
                .filter(e -> e.getEvaluatedAt() != null && e.getEvaluatedAt().isAfter(thirtyDaysAgo))
                .count();

        long approvedCount = evaluations.stream().filter(e -> e.getStatus() == EvaluationStatus.APROVADO).count();
        long failedCount = evaluations.stream().filter(e -> e.getStatus() == EvaluationStatus.REPROVADO).count();
        long fatalErrorCount = evaluations.stream().filter(e -> e.getStatus() == EvaluationStatus.ZERADO_ERRO_GRAVE).count();

        BigDecimal averageScorePercentage = BigDecimal.ZERO.setScale(2, RoundingMode.HALF_UP);
        BigDecimal approvalRatePercentage = BigDecimal.ZERO.setScale(2, RoundingMode.HALF_UP);
        BigDecimal fatalErrorRatePercentage = BigDecimal.ZERO.setScale(2, RoundingMode.HALF_UP);

        if (evaluatedCalls > 0) {
            BigDecimal sumScores = evaluations.stream()
                    .map(Evaluation::getFinalScorePercentage)
                    .reduce(BigDecimal.ZERO, BigDecimal::add);
            averageScorePercentage = sumScores.divide(BigDecimal.valueOf(evaluatedCalls), 2, RoundingMode.HALF_UP);

            approvalRatePercentage = BigDecimal.valueOf(approvedCount)
                    .multiply(new BigDecimal("100.00"))
                    .divide(BigDecimal.valueOf(evaluatedCalls), 2, RoundingMode.HALF_UP);

            fatalErrorRatePercentage = BigDecimal.valueOf(fatalErrorCount)
                    .multiply(new BigDecimal("100.00"))
                    .divide(BigDecimal.valueOf(evaluatedCalls), 2, RoundingMode.HALF_UP);
        }

        Map<UUID, List<CallRecord>> callsByAnalyst = calls.stream()
                .collect(Collectors.groupingBy(c -> c.getAnalyst().getId()));
        Map<UUID, List<Evaluation>> evalsByAnalyst = evaluations.stream()
                .collect(Collectors.groupingBy(e -> e.getAnalyst().getId()));

        List<AnalystPerformanceDto> ranking = new ArrayList<>();
        for (User analyst : analysts) {
            List<CallRecord> aCalls = callsByAnalyst.getOrDefault(analyst.getId(), List.of());
            List<Evaluation> aEvals = evalsByAnalyst.getOrDefault(analyst.getId(), List.of());

            long aTotalCalls = aCalls.size();
            long aPending = aCalls.stream().filter(c -> c.getStatus() == CallStatus.PENDENTE).count();
            long aEvaluated = aEvals.size();
            long aApproved = aEvals.stream().filter(e -> e.getStatus() == EvaluationStatus.APROVADO).count();
            long aFailed = aEvals.stream().filter(e -> e.getStatus() == EvaluationStatus.REPROVADO).count();
            long aFatal = aEvals.stream().filter(e -> e.getStatus() == EvaluationStatus.ZERADO_ERRO_GRAVE).count();

            BigDecimal aAvg = BigDecimal.ZERO.setScale(2, RoundingMode.HALF_UP);
            if (aEvaluated > 0) {
                BigDecimal sum = aEvals.stream()
                        .map(Evaluation::getFinalScorePercentage)
                        .reduce(BigDecimal.ZERO, BigDecimal::add);
                aAvg = sum.divide(BigDecimal.valueOf(aEvaluated), 2, RoundingMode.HALF_UP);
            }

            ranking.add(new AnalystPerformanceDto(
                    analyst.getId(),
                    analyst.getName(),
                    analyst.getEmail(),
                    analyst.getDepartment(),
                    aTotalCalls,
                    aEvaluated,
                    aPending,
                    aAvg,
                    aApproved,
                    aFailed,
                    aFatal
            ));
        }

        ranking.sort(Comparator.comparing(AnalystPerformanceDto::averageScore).reversed());

        AnalystPerformanceDto topAnalyst = ranking.stream()
                .filter(a -> a.evaluatedCalls() > 0)
                .findFirst()
                .orElse(ranking.isEmpty() ? null : ranking.get(0));

        List<ScoreTimelinePointDto> scoreTimeline = buildTimeline(evaluations);
        List<CriteriaPerformanceDto> criteriaComparison = buildCriteriaComparison(evaluations);

        List<EvaluationResponse> recentEvaluations = evaluations.stream()
                .limit(10)
                .map(EvaluationResponse::fromEntity)
                .toList();

        return new DashboardSummaryResponse(
                totalCalls,
                pendingCalls,
                evaluatedCalls,
                monthlyEvaluationsCount,
                averageScorePercentage,
                approvalRatePercentage,
                fatalErrorRatePercentage,
                approvedCount,
                failedCount,
                fatalErrorCount,
                topAnalyst,
                scoreTimeline,
                ranking,
                sectorAverages,
                criteriaComparison,
                recentEvaluations
        );
    }

    private List<SectorPerformanceDto> buildSectorAverages(List<Evaluation> evaluations) {
        Map<String, List<Evaluation>> bySector = evaluations.stream()
                .collect(Collectors.groupingBy(this::resolveEvaluationSector, LinkedHashMap::new, Collectors.toList()));

        List<SectorPerformanceDto> result = new ArrayList<>();
        for (Map.Entry<String, List<Evaluation>> entry : bySector.entrySet()) {
            List<Evaluation> sectorEvals = entry.getValue();
            long count = sectorEvals.size();
            if (count == 0) continue;

            BigDecimal sum = sectorEvals.stream()
                    .map(Evaluation::getFinalScorePercentage)
                    .reduce(BigDecimal.ZERO, BigDecimal::add);
            BigDecimal avg = sum.divide(BigDecimal.valueOf(count), 2, RoundingMode.HALF_UP);

            long approved = sectorEvals.stream().filter(e -> e.getStatus() == EvaluationStatus.APROVADO).count();
            BigDecimal approvalRate = BigDecimal.valueOf(approved)
                    .multiply(new BigDecimal("100.00"))
                    .divide(BigDecimal.valueOf(count), 2, RoundingMode.HALF_UP);

            result.add(new SectorPerformanceDto(entry.getKey(), count, avg, approvalRate));
        }
        result.sort(Comparator.comparing(SectorPerformanceDto::averageScore).reversed());
        return result;
    }

    private List<CriteriaPerformanceDto> buildCriteriaComparison(List<Evaluation> evaluations) {
        Map<String, List<EvaluationItemSnapshot>> byCategory = new LinkedHashMap<>();
        for (Evaluation ev : evaluations) {
            if (ev.getItemSnapshots() == null) continue;
            for (EvaluationItemSnapshot item : ev.getItemSnapshots()) {
                if (item.isFatalErrorSnapshot()) continue;
                String key = item.getCategorySnapshot() != null ? item.getCategorySnapshot() : "Geral";
                byCategory.computeIfAbsent(key, k -> new ArrayList<>()).add(item);
            }
        }

        List<CriteriaPerformanceDto> list = new ArrayList<>();
        for (Map.Entry<String, List<EvaluationItemSnapshot>> entry : byCategory.entrySet()) {
            List<EvaluationItemSnapshot> items = entry.getValue();
            long total = items.size();
            if (total == 0) continue;
            long compliant = items.stream().filter(EvaluationItemSnapshot::isChecked).count();
            BigDecimal rate = BigDecimal.valueOf(compliant)
                    .multiply(new BigDecimal("100.00"))
                    .divide(BigDecimal.valueOf(total), 1, RoundingMode.HALF_UP);
            String sampleLabel = items.get(0).getLabelSnapshot();
            list.add(new CriteriaPerformanceDto(entry.getKey(), sampleLabel, total, compliant, rate));
        }
        list.sort(Comparator.comparing(CriteriaPerformanceDto::complianceRatePercentage).reversed());
        return list;
    }

    private List<ScoreTimelinePointDto> buildTimeline(List<Evaluation> evaluations) {
        Map<String, List<Evaluation>> groupedByDay = new LinkedHashMap<>();
        List<Evaluation> chronological = new ArrayList<>(evaluations);
        chronological.sort(Comparator.comparing(Evaluation::getEvaluatedAt));

        for (Evaluation ev : chronological) {
            String key = ev.getEvaluatedAt() != null ? ev.getEvaluatedAt().format(DAY_FMT) : "Hoje";
            groupedByDay.computeIfAbsent(key, k -> new ArrayList<>()).add(ev);
        }

        List<ScoreTimelinePointDto> points = new ArrayList<>();
        for (Map.Entry<String, List<Evaluation>> entry : groupedByDay.entrySet()) {
            List<Evaluation> dayEvals = entry.getValue();
            BigDecimal sum = dayEvals.stream()
                    .map(Evaluation::getFinalScorePercentage)
                    .reduce(BigDecimal.ZERO, BigDecimal::add);
            BigDecimal avg = sum.divide(BigDecimal.valueOf(dayEvals.size()), 1, RoundingMode.HALF_UP);
            points.add(new ScoreTimelinePointDto(entry.getKey(), avg, dayEvals.size()));
        }
        return points;
    }

    private String resolveEvaluationSector(Evaluation e) {
        if (e.getAnalystSectorSnapshot() != null && !e.getAnalystSectorSnapshot().isBlank()) {
            return e.getAnalystSectorSnapshot().trim();
        }
        if (e.getAnalyst() != null && e.getAnalyst().getDepartment() != null) {
            return e.getAnalyst().getDepartment().trim();
        }
        return "Geral";
    }
}
