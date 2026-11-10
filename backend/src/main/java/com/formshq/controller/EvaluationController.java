package com.formshq.controller;

import com.formshq.dto.evaluation.CreateEvaluationRequest;
import com.formshq.dto.evaluation.EvaluationResponse;
import com.formshq.dto.evaluation.UpdateEvaluationRequest;
import com.formshq.security.UserPrincipal;
import com.formshq.service.EvaluationService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/v1/evaluations")
@RequiredArgsConstructor
@Tag(name = "Central de Avaliações", description = "Submissão e consulta avançada de avaliações com filtros por código, analista, período e setor")
public class EvaluationController {

    private final EvaluationService evaluationService;

    @PostMapping
    @PreAuthorize("hasAuthority('ROLE_GESTOR')")
    @Operation(summary = "Submete a avaliação de uma ligação com snapshot de formulário e setor (exclusivo Gestor/Admin)")
    public ResponseEntity<EvaluationResponse> submitEvaluation(
            @Valid @RequestBody CreateEvaluationRequest request,
            @AuthenticationPrincipal UserPrincipal evaluator
    ) {
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(evaluationService.submitEvaluation(request, evaluator));
    }

    @GetMapping
    @Operation(summary = "Lista avaliações com busca avançada por código/ID, nome do analista, intervalo de datas e setor")
    public ResponseEntity<List<EvaluationResponse>> listEvaluations(
            @AuthenticationPrincipal UserPrincipal currentUser,
            @RequestParam(required = false) UUID analystId,
            @RequestParam(required = false) String code,
            @RequestParam(required = false) String analystName,
            @RequestParam(required = false) String sector,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate startDate,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate endDate
    ) {
        return ResponseEntity.ok(evaluationService.listEvaluations(
                currentUser,
                analystId,
                code,
                analystName,
                sector,
                startDate,
                endDate
        ));
    }

    @GetMapping("/{id}")
    @Operation(summary = "Busca avaliação detalhada com itens do snapshot por ID")
    public ResponseEntity<EvaluationResponse> getEvaluationById(
            @PathVariable UUID id,
            @AuthenticationPrincipal UserPrincipal currentUser
    ) {
        return ResponseEntity.ok(evaluationService.getEvaluationById(id, currentUser));
    }

    @GetMapping("/by-call/{callRecordId}")
    @Operation(summary = "Busca avaliação associada a uma ligação específica")
    public ResponseEntity<EvaluationResponse> getEvaluationByCallId(
            @PathVariable UUID callRecordId,
            @AuthenticationPrincipal UserPrincipal currentUser
    ) {
        return ResponseEntity.ok(evaluationService.getEvaluationByCallId(callRecordId, currentUser));
    }

    @PutMapping("/{id}")
    @PreAuthorize("hasAuthority('ROLE_GESTOR')")
    @Operation(summary = "Atualiza nota, status de falta grave, critérios e feedback de uma avaliação (exclusivo Gestor/Admin)")
    public ResponseEntity<EvaluationResponse> updateEvaluation(
            @PathVariable UUID id,
            @RequestBody UpdateEvaluationRequest request,
            @AuthenticationPrincipal UserPrincipal currentUser
    ) {
        return ResponseEntity.ok(evaluationService.updateEvaluation(id, request, currentUser));
    }
}
