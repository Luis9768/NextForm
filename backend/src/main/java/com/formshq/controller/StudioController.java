package com.formshq.controller;

import com.formshq.dto.studio.*;
import com.formshq.dto.studio.StudioCollectionDto.StudioFieldDto;
import com.formshq.security.UserPrincipal;
import com.formshq.service.StudioService;
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
import java.util.Map;

@RestController
@RequestMapping("/api/v1/studio")
@PreAuthorize("hasAuthority('ROLE_GESTOR')")
@RequiredArgsConstructor
@Tag(name = "Administração, Modelo de Dados, Fluxos & Benchmarks (NEXFORM)", description = "Módulos avançados de automação, webhooks, benchmarks e introspecção de coleções (exclusivo ROLE_GESTOR)")
public class StudioController {

    private final StudioService studioService;

    // =========================================================================
    // 1. MODELO DE DADOS & COLEÇÕES
    // =========================================================================

    @GetMapping("/collections")
    @Operation(summary = "Lista metadados das coleções de dados, schema de campos e matriz RBAC")
    public ResponseEntity<List<StudioCollectionDto>> listCollections() {
        return ResponseEntity.ok(studioService.listCollections());
    }

    @PostMapping("/collections")
    @Operation(summary = "Cria uma nova coleção no Modelo de Dados")
    public ResponseEntity<StudioCollectionDto> createCollection(
            @Valid @RequestBody CreateCollectionRequest request,
            @AuthenticationPrincipal UserPrincipal currentUser
    ) {
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(studioService.createCollection(request, currentUser));
    }

    @PostMapping("/collections/{collection}/fields")
    @Operation(summary = "Adiciona um novo campo a uma coleção existente no Modelo de Dados")
    public ResponseEntity<StudioFieldDto> addFieldToCollection(
            @PathVariable String collection,
            @Valid @RequestBody CreateFieldRequest request,
            @AuthenticationPrincipal UserPrincipal currentUser
    ) {
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(studioService.addFieldToCollection(collection, request, currentUser));
    }

    @GetMapping("/activity")
    @Operation(summary = "Retorna trilha de auditoria e revisões do sistema")
    public ResponseEntity<List<StudioActivityDto>> listActivity() {
        return ResponseEntity.ok(studioService.listActivity());
    }

    // =========================================================================
    // 2. FLUXOS DE AUTOMAÇÃO
    // =========================================================================

    @GetMapping("/flows")
    @Operation(summary = "Lista todos os Fluxos de Automação configurados no NEXFORM")
    public ResponseEntity<List<StudioFlowDto>> listFlows() {
        return ResponseEntity.ok(studioService.listFlows());
    }

    @PostMapping("/flows")
    @Operation(summary = "Cria um novo Fluxo de Automação")
    public ResponseEntity<StudioFlowDto> createFlow(
            @Valid @RequestBody CreateFlowRequest request
    ) {
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(studioService.createFlow(request));
    }

    @PostMapping("/flows/{id}/operations")
    @Operation(summary = "Adiciona um novo nó de Operação ao Canvas de um Fluxo")
    public ResponseEntity<StudioFlowDto> addFlowOperation(
            @PathVariable String id,
            @Valid @RequestBody CreateFlowOperationRequest request
    ) {
        return ResponseEntity.ok(studioService.addFlowOperation(id, request));
    }

    @DeleteMapping("/flows/{id}/operations/{opId}")
    @Operation(summary = "Remove um nó de Operação de um Fluxo")
    public ResponseEntity<StudioFlowDto> deleteFlowOperation(
            @PathVariable String id,
            @PathVariable String opId
    ) {
        return ResponseEntity.ok(studioService.deleteFlowOperation(id, opId));
    }

    @PatchMapping("/flows/{id}/toggle")
    @Operation(summary = "Ativa ou pausa um Fluxo de Automação")
    public ResponseEntity<StudioFlowDto> toggleFlow(@PathVariable String id) {
        return ResponseEntity.ok(studioService.toggleFlow(id));
    }

    @PostMapping("/flows/{id}/trigger")
    @Operation(summary = "Executa manualmente um Fluxo e retorna o log detalhado de cada etapa")
    public ResponseEntity<FlowExecutionResultDto> triggerFlow(
            @PathVariable String id,
            @AuthenticationPrincipal UserPrincipal currentUser
    ) {
        return ResponseEntity.ok(studioService.triggerFlow(id, currentUser));
    }

    // =========================================================================
    // 3. PERFIS DE USUÁRIO & POLÍTICAS DE ACESSO RBAC
    // =========================================================================

    @GetMapping("/roles")
    @Operation(summary = "Lista os Perfis de Usuário com usuários reais vinculados")
    public ResponseEntity<List<StudioRoleDto>> listRoles() {
        return ResponseEntity.ok(studioService.listRoles());
    }

    @PostMapping("/roles")
    @Operation(summary = "Cria um novo Perfil de Usuário customizado")
    public ResponseEntity<StudioRoleDto> createRole(
            @Valid @RequestBody CreateRoleRequest request
    ) {
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(studioService.createRole(request));
    }

    @GetMapping("/policies")
    @Operation(summary = "Lista as Políticas de Acesso RBAC")
    public ResponseEntity<List<StudioPolicyDto>> listPolicies() {
        return ResponseEntity.ok(studioService.listPolicies());
    }

    @PostMapping("/policies")
    @Operation(summary = "Cria uma nova Política de Acesso RBAC")
    public ResponseEntity<StudioPolicyDto> createPolicy(
            @Valid @RequestBody CreatePolicyRequest request
    ) {
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(studioService.createPolicy(request));
    }

    // =========================================================================
    // 4. CONFIGURAÇÕES & APARÊNCIA
    // =========================================================================

    @GetMapping("/settings")
    @Operation(summary = "Retorna as configurações globais do projeto e aparência")
    public ResponseEntity<Map<String, Object>> getSettings() {
        return ResponseEntity.ok(studioService.getSettings());
    }

    @PutMapping("/settings")
    @Operation(summary = "Atualiza as configurações de projeto ou aparência")
    public ResponseEntity<Map<String, Object>> updateSettings(
            @RequestBody Map<String, Object> updates,
            @AuthenticationPrincipal UserPrincipal currentUser
    ) {
        return ResponseEntity.ok(studioService.updateSettings(updates, currentUser));
    }

    // =========================================================================
    // 5. FAVORITOS & FILTROS SALVOS
    // =========================================================================

    @GetMapping("/bookmarks")
    @Operation(summary = "Lista todos os Favoritos e Filtros salvos")
    public ResponseEntity<List<StudioBookmarkDto>> listBookmarks() {
        return ResponseEntity.ok(studioService.listBookmarks());
    }

    @PostMapping("/bookmarks")
    @Operation(summary = "Salva um novo Favorito / Filtro de visualização")
    public ResponseEntity<StudioBookmarkDto> createBookmark(
            @Valid @RequestBody CreateBookmarkRequest request
    ) {
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(studioService.createBookmark(request));
    }

    @DeleteMapping("/bookmarks/{id}")
    @Operation(summary = "Remove um Favorito salvo")
    public ResponseEntity<Void> deleteBookmark(@PathVariable String id) {
        studioService.deleteBookmark(id);
        return ResponseEntity.noContent().build();
    }

    // =========================================================================
    // 6. TRADUÇÕES
    // =========================================================================

    @GetMapping("/translations")
    @Operation(summary = "Lista as chaves do dicionário de traduções")
    public ResponseEntity<List<StudioTranslationDto>> listTranslations() {
        return ResponseEntity.ok(studioService.listTranslations());
    }

    @PostMapping("/translations")
    @Operation(summary = "Adiciona uma nova chave de tradução")
    public ResponseEntity<StudioTranslationDto> createTranslation(
            @Valid @RequestBody CreateTranslationRequest request
    ) {
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(studioService.createTranslation(request));
    }

    @DeleteMapping("/translations/{id}")
    @Operation(summary = "Remove uma chave de tradução")
    public ResponseEntity<Void> deleteTranslation(@PathVariable String id) {
        studioService.deleteTranslation(id);
        return ResponseEntity.noContent().build();
    }

    // =========================================================================
    // 7. CATÁLOGO DE MÓDULOS & EXTENSÕES
    // =========================================================================

    @GetMapping("/extensions")
    @Operation(summary = "Lista módulos do catálogo e extensões instaladas")
    public ResponseEntity<List<StudioExtensionDto>> listExtensions() {
        return ResponseEntity.ok(studioService.listExtensions());
    }

    @PostMapping("/extensions/{id}/toggle")
    @Operation(summary = "Ativa/desativa ou instala um módulo do catálogo")
    public ResponseEntity<StudioExtensionDto> toggleExtension(@PathVariable String id) {
        return ResponseEntity.ok(studioService.toggleExtension(id));
    }

    // =========================================================================
    // 8. REPORTAR PROBLEMA & SOLICITAR FUNCIONALIDADE
    // =========================================================================

    @GetMapping("/feedback")
    @Operation(summary = "Lista relatos de problemas e solicitações de funcionalidade")
    public ResponseEntity<List<StudioFeedbackDto>> listFeedback() {
        return ResponseEntity.ok(studioService.listFeedback());
    }

    @PostMapping("/feedback")
    @Operation(summary = "Registra um novo relato de problema ou sugestão de funcionalidade")
    public ResponseEntity<StudioFeedbackDto> createFeedback(
            @Valid @RequestBody CreateFeedbackRequest request,
            @AuthenticationPrincipal UserPrincipal currentUser
    ) {
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(studioService.createFeedback(request, currentUser));
    }

    @PostMapping("/feedback/{id}/upvote")
    @Operation(summary = "Adiciona +1 voto em uma solicitação de funcionalidade")
    public ResponseEntity<StudioFeedbackDto> upvoteFeedback(@PathVariable String id) {
        return ResponseEntity.ok(studioService.upvoteFeedback(id));
    }

    // =========================================================================
    // 9. WEBHOOKS DE SAÍDA
    // =========================================================================

    @GetMapping("/webhooks")
    @Operation(summary = "Lista todos os Webhooks de saída registrados")
    public ResponseEntity<List<StudioWebhookDto>> listWebhooks() {
        return ResponseEntity.ok(studioService.listWebhooks());
    }

    @PostMapping("/webhooks")
    @Operation(summary = "Registra um novo Webhook de saída")
    public ResponseEntity<StudioWebhookDto> createWebhook(
            @Valid @RequestBody CreateWebhookRequest request
    ) {
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(studioService.createWebhook(request));
    }

    @PatchMapping("/webhooks/{id}/toggle")
    @Operation(summary = "Ativa ou inativa um Webhook")
    public ResponseEntity<StudioWebhookDto> toggleWebhook(@PathVariable String id) {
        return ResponseEntity.ok(studioService.toggleWebhook(id));
    }

    // =========================================================================
    // 10. BENCHMARKS & INDICADORES DE PERFORMANCE
    // =========================================================================

    @GetMapping("/benchmarks")
    @Operation(summary = "Calcula Benchmarks de Qualidade por Categoria/Analista e mede latência real de banco e API")
    public ResponseEntity<StudioBenchmarkResponse> getBenchmarks() {
        return ResponseEntity.ok(studioService.calculateBenchmarks());
    }
}
