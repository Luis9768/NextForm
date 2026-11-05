package com.formshq.service;

import com.formshq.domain.entity.*;
import com.formshq.domain.enums.CallStatus;
import com.formshq.domain.enums.EvaluationStatus;
import com.formshq.dto.evaluation.CreateEvaluationRequest;
import com.formshq.dto.evaluation.EvaluationResponse;
import com.formshq.dto.evaluation.ItemEvaluationInput;
import com.formshq.exception.BusinessRuleException;
import com.formshq.exception.DuplicateResourceException;
import com.formshq.exception.ResourceNotFoundException;
import com.formshq.repository.CallRecordRepository;
import com.formshq.repository.EvaluationFormTemplateRepository;
import com.formshq.repository.EvaluationRepository;
import com.formshq.repository.UserRepository;
import com.formshq.security.SectorScopePolicy;
import com.formshq.security.UserPrincipal;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;

@Slf4j
@Service
@RequiredArgsConstructor
public class EvaluationService {

    private final EvaluationRepository evaluationRepository;
    private final CallRecordRepository callRecordRepository;
    private final EvaluationFormTemplateRepository formTemplateRepository;
    private final UserRepository userRepository;
    private final SectorScopePolicy sectorScopePolicy;

    @Transactional
    public EvaluationResponse submitEvaluation(CreateEvaluationRequest request, UserPrincipal evaluatorPrincipal) {
        if (!evaluatorPrincipal.isGestor()) {
            throw new AccessDeniedException("Apenas usuários com perfil GESTOR podem avaliar ligações.");
        }

        CallRecord callRecord = callRecordRepository.findWithDetailsById(request.callRecordId())
                .orElseThrow(() -> new ResourceNotFoundException("Ligação não encontrada com ID: " + request.callRecordId()));

        if (callRecord.getStatus() == CallStatus.AVALIADA || evaluationRepository.existsByCallRecordId(callRecord.getId())) {
            throw new DuplicateResourceException("Esta ligação já foi avaliada anteriormente.");
        }

        EvaluationFormTemplate formTemplate = formTemplateRepository.findWithItemsById(request.formTemplateId())
                .orElseThrow(() -> new ResourceNotFoundException("Modelo de formulário não encontrado com ID: " + request.formTemplateId()));

        if (formTemplate.getItems() == null || formTemplate.getItems().isEmpty()) {
            throw new BusinessRuleException("O formulário selecionado não possui itens configurados.");
        }

        String analystSector = callRecord.getAnalyst() != null ? callRecord.getAnalyst().getDepartment() : null;
        sectorScopePolicy.assertCallerCanAccessSector(evaluatorPrincipal, analystSector, formTemplate.getSector());

        User evaluator = userRepository.findById(evaluatorPrincipal.getId())
                .orElseThrow(() -> new ResourceNotFoundException("Avaliador não encontrado."));

        Map<UUID, ItemEvaluationInput> answerMap = request.answers().stream()
                .collect(Collectors.toMap(
                        ItemEvaluationInput::formItemId,
                        Function.identity(),
                        (existing, replacement) -> replacement
                ));

        int obtainedPoints = 0;
        int maxPossiblePoints = 0;
        boolean fatalErrorTriggered = false;

        Evaluation evaluation = Evaluation.builder()
                .callRecord(callRecord)
                .evaluator(evaluator)
                .analyst(callRecord.getAnalyst())
                .analystSectorSnapshot(
                        analystSector != null
                                ? analystSector
                                : (formTemplate.getSector() != null ? formTemplate.getSector() : "Geral")
                )
                .formTemplate(formTemplate)
                .formNameSnapshot(formTemplate.getName())
                .formVersionSnapshot(formTemplate.getVersion())
                .passingScoreSnapshot(formTemplate.getPassingScorePercentage())
                .generalFeedback(request.generalFeedback() != null ? request.generalFeedback().trim() : null)
                .evaluatedAt(OffsetDateTime.now())
                .build();

        for (EvaluationFormItem templateItem : formTemplate.getItems()) {
            ItemEvaluationInput answer = answerMap.get(templateItem.getId());
            boolean isChecked = answer != null && answer.checked();
            String observation = (answer != null && answer.observation() != null && !answer.observation().isBlank())
                    ? answer.observation().trim()
                    : null;

            int itemWeight = templateItem.isFatalError()
                    ? 0
                    : (templateItem.getPoints() != null && templateItem.getPoints() > 0 ? templateItem.getPoints() : 1);

            if (templateItem.isFatalError()) {
                if (isChecked) {
                    fatalErrorTriggered = true;
                }
            } else {
                maxPossiblePoints += itemWeight;
                if (isChecked) {
                    obtainedPoints += itemWeight;
                }
            }

            EvaluationItemSnapshot snapshot = EvaluationItemSnapshot.builder()
                    .originalItemId(templateItem.getId())
                    .labelSnapshot(templateItem.getLabel())
                    .descriptionSnapshot(templateItem.getDescription())
                    .categorySnapshot(templateItem.getCategory())
                    .fatalErrorSnapshot(templateItem.isFatalError())
                    .pointsSnapshot(itemWeight)
                    .displayOrder(templateItem.getDisplayOrder())
                    .checked(isChecked)
                    .observation(observation)
                    .build();

            evaluation.addItemSnapshot(snapshot);
        }

        BigDecimal rawPercentage;
        if (maxPossiblePoints > 0) {
            rawPercentage = BigDecimal.valueOf(obtainedPoints)
                    .multiply(new BigDecimal("100.00"))
                    .divide(BigDecimal.valueOf(maxPossiblePoints), 2, RoundingMode.HALF_UP);
        } else {
            rawPercentage = new BigDecimal("100.00");
        }

        BigDecimal finalScorePercentage;
        EvaluationStatus status;

        if (fatalErrorTriggered) {
            finalScorePercentage = new BigDecimal("0.00");
            status = EvaluationStatus.ZERADO_ERRO_GRAVE;
        } else {
            finalScorePercentage = rawPercentage;
            if (finalScorePercentage.compareTo(formTemplate.getPassingScorePercentage()) >= 0) {
                status = EvaluationStatus.APROVADO;
            } else {
                status = EvaluationStatus.REPROVADO;
            }
        }

        evaluation.setObtainedPoints(obtainedPoints);
        evaluation.setMaxPossiblePoints(maxPossiblePoints);
        evaluation.setRawScorePercentage(rawPercentage);
        evaluation.setFinalScorePercentage(finalScorePercentage);
        evaluation.setFatalErrorTriggered(fatalErrorTriggered);
        evaluation.setStatus(status);

        callRecord.setStatus(CallStatus.AVALIADA);
        callRecord.setEvaluation(evaluation);

        Evaluation saved = evaluationRepository.save(evaluation);
        callRecordRepository.save(callRecord);

        log.info("Avaliação concluída: callId={}, analyst={}, obtained={}/{}, fatalError={}, finalScore={}%, status={}",
                callRecord.getExternalCallId(),
                callRecord.getAnalyst().getEmail(),
                obtainedPoints,
                maxPossiblePoints,
                fatalErrorTriggered,
                finalScorePercentage,
                status);

        return EvaluationResponse.fromEntity(saved);
    }

    @Transactional(readOnly = true)
    public List<EvaluationResponse> listEvaluations(UserPrincipal currentUser, UUID analystIdFilter) {
        return listEvaluations(currentUser, analystIdFilter, null, null, null, null, null);
    }

    @Transactional(readOnly = true)
    public List<EvaluationResponse> listEvaluations(
            UserPrincipal currentUser,
            UUID analystIdFilter,
            String codeFilter,
            String analystNameFilter,
            String sectorFilter,
            LocalDate startDate,
            LocalDate endDate
    ) {
        List<Evaluation> evaluations;

        if (currentUser.isAnalista()) {
            evaluations = evaluationRepository.findByAnalystIdOrderByEvaluatedAtDesc(currentUser.getId());
        } else if (analystIdFilter != null) {
            evaluations = evaluationRepository.findByAnalystIdOrderByEvaluatedAtDesc(analystIdFilter);
        } else {
            evaluations = evaluationRepository.findAllByOrderByEvaluatedAtDesc();
        }

        if (!currentUser.isAdmin() && currentUser.isGestor()) {
            Set<String> allowed = sectorScopePolicy.resolveAllowedSectorsForCaller(currentUser);
            if (!allowed.isEmpty()) {
                evaluations = evaluations.stream()
                        .filter(e -> {
                            String evalSector = sectorScopePolicy.resolveEvaluationSector(e);
                            String currentDept = e.getAnalyst() != null ? e.getAnalyst().getDepartment() : null;
                            return sectorScopePolicy.isSectorAllowed(allowed, evalSector, currentDept);
                        })
                        .toList();
            }
        }

        if (codeFilter != null && !codeFilter.isBlank()) {
            String q = codeFilter.trim().toLowerCase();
            evaluations = evaluations.stream()
                    .filter(e -> e.getId().toString().toLowerCase().contains(q)
                            || (e.getCallRecord() != null && e.getCallRecord().getExternalCallId() != null
                            && e.getCallRecord().getExternalCallId().toLowerCase().contains(q)))
                    .toList();
        }

        if (analystNameFilter != null && !analystNameFilter.isBlank()) {
            String q = analystNameFilter.trim().toLowerCase();
            evaluations = evaluations.stream()
                    .filter(e -> e.getAnalyst() != null
                            && e.getAnalyst().getName() != null
                            && e.getAnalyst().getName().toLowerCase().contains(q))
                    .toList();
        }

        if (sectorFilter != null && !sectorFilter.isBlank()) {
            String sec = sectorFilter.trim().toLowerCase();
            evaluations = evaluations.stream()
                    .filter(e -> sectorScopePolicy.resolveEvaluationSector(e).equalsIgnoreCase(sec)
                            || (e.getAnalyst() != null && e.getAnalyst().getDepartment() != null
                            && e.getAnalyst().getDepartment().trim().equalsIgnoreCase(sec)))
                    .toList();
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

        return evaluations.stream()
                .map(EvaluationResponse::fromEntity)
                .toList();
    }

    @Transactional(readOnly = true)
    public EvaluationResponse getEvaluationById(UUID id, UserPrincipal currentUser) {
        Evaluation evaluation = evaluationRepository.findWithDetailsById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Avaliação não encontrada com ID: " + id));

        if (currentUser.isAnalista() && !evaluation.getAnalyst().getId().equals(currentUser.getId())) {
            throw new AccessDeniedException("Analistas só podem visualizar suas próprias avaliações.");
        }
        String evalSector = sectorScopePolicy.resolveEvaluationSector(evaluation);
        String analystDept = evaluation.getAnalyst() != null ? evaluation.getAnalyst().getDepartment() : null;
        sectorScopePolicy.assertCallerCanAccessSector(currentUser, evalSector, analystDept);

        return EvaluationResponse.fromEntity(evaluation);
    }

    @Transactional(readOnly = true)
    public EvaluationResponse getEvaluationByCallId(UUID callRecordId, UserPrincipal currentUser) {
        Evaluation evaluation = evaluationRepository.findByCallRecordId(callRecordId)
                .orElseThrow(() -> new ResourceNotFoundException("Nenhuma avaliação encontrada para a ligação: " + callRecordId));

        if (currentUser.isAnalista() && !evaluation.getAnalyst().getId().equals(currentUser.getId())) {
            throw new AccessDeniedException("Analistas só podem visualizar suas próprias avaliações.");
        }
        String evalSector = sectorScopePolicy.resolveEvaluationSector(evaluation);
        String analystDept = evaluation.getAnalyst() != null ? evaluation.getAnalyst().getDepartment() : null;
        sectorScopePolicy.assertCallerCanAccessSector(currentUser, evalSector, analystDept);

        return EvaluationResponse.fromEntity(evaluation);
    }
}
