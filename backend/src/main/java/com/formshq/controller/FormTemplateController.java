package com.formshq.controller;

import com.formshq.dto.form.FormTemplateRequest;
import com.formshq.dto.form.FormTemplateResponse;
import com.formshq.security.UserPrincipal;
import com.formshq.service.FormTemplateService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/v1/forms")
@RequiredArgsConstructor
@Tag(name = "Formulários de Avaliação por Setor", description = "Matrizes de formulários padronizadas por setor com versionamento e Erro Grave")
public class FormTemplateController {

    private final FormTemplateService formTemplateService;

    @GetMapping
    @Operation(summary = "Lista modelos de formulários de avaliação")
    public ResponseEntity<List<FormTemplateResponse>> listTemplates(
            @RequestParam(defaultValue = "false") boolean onlyActive
    ) {
        return ResponseEntity.ok(formTemplateService.listTemplates(onlyActive));
    }

    @GetMapping("/by-sector")
    @Operation(summary = "Retorna automaticamente o formulário ativo pré-definido para o setor do analista")
    public ResponseEntity<FormTemplateResponse> getBySector(
            @RequestParam("sector") String sector
    ) {
        return ResponseEntity.ok(formTemplateService.getActiveTemplateForSector(sector));
    }

    @GetMapping("/{id}")
    @Operation(summary = "Busca detalhes de um modelo de formulário pelo ID")
    public ResponseEntity<FormTemplateResponse> getById(@PathVariable UUID id) {
        return ResponseEntity.ok(formTemplateService.getById(id));
    }

    @PostMapping
    @PreAuthorize("hasAuthority('ROLE_GESTOR')")
    @Operation(summary = "Cria um novo modelo de formulário de avaliação atrelado a um setor (exclusivo ROLE_GESTOR)")
    public ResponseEntity<FormTemplateResponse> createTemplate(
            @Valid @RequestBody FormTemplateRequest request,
            @AuthenticationPrincipal UserPrincipal principal
    ) {
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(formTemplateService.createTemplate(request, principal));
    }

    @PutMapping("/{id}")
    @PreAuthorize("hasAuthority('ROLE_GESTOR')")
    @Operation(summary = "Atualiza um modelo de formulário incrementando sua versão sem quebrar avaliações antigas")
    public ResponseEntity<FormTemplateResponse> updateTemplate(
            @PathVariable UUID id,
            @Valid @RequestBody FormTemplateRequest request
    ) {
        return ResponseEntity.ok(formTemplateService.updateTemplate(id, request));
    }

    @PatchMapping("/{id}/toggle-active")
    @PreAuthorize("hasAuthority('ROLE_GESTOR')")
    @Operation(summary = "Ativa ou inativa um modelo de formulário")
    public ResponseEntity<FormTemplateResponse> toggleActive(@PathVariable UUID id) {
        return ResponseEntity.ok(formTemplateService.toggleActive(id));
    }
}
