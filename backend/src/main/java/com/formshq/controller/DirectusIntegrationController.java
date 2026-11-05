package com.formshq.controller;

import com.formshq.dto.directus.DirectusBatchImportRequest;
import com.formshq.dto.directus.DirectusPullRequest;
import com.formshq.dto.directus.DirectusSyncResultDto;
import com.formshq.dto.directus.DirectusUserSyncResultDto;
import com.formshq.service.DirectusEvaluationSyncService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1/integrations/directus")
@RequiredArgsConstructor
@Tag(
        name = "Integração Directus (Sync de Usuários, Setores & Avaliações)",
        description = "Endpoints para sincronizar usuários/operadores reais do Directus (/users) e avaliações (/items/{collection}?fields=*.*)"
)
public class DirectusIntegrationController {

    private final DirectusEvaluationSyncService directusSyncService;

    @PostMapping("/sync-users")
    @Operation(
            summary = "Sincroniza os usuários reais do Directus (/users?fields=id,first_name,last_name,email,role.*), atribui aos setores e apaga usuários/avaliações fictícias"
    )
    public ResponseEntity<DirectusUserSyncResultDto> syncUsersAndPurgeFictional(
            @RequestParam(required = false) String baseUrl,
            @RequestParam(required = false) String apiToken
    ) {
        return ResponseEntity.ok(directusSyncService.syncUsersAndPurgeFictionalData(baseUrl, apiToken));
    }

    @PostMapping("/items/{collection}/{itemId}")
    @Operation(
            summary = "Puxa uma avaliação específica por ID da API do Directus (GET /items/{collection}/{itemId}?fields=*.*)"
    )
    public ResponseEntity<DirectusSyncResultDto> pullSingleItemFromDirectus(
            @PathVariable String collection,
            @PathVariable String itemId,
            @RequestParam(required = false) String baseUrl,
            @RequestParam(required = false) String apiToken
    ) {
        return ResponseEntity.ok(directusSyncService.pullSingleItemFromDirectus(collection, itemId, baseUrl, apiToken));
    }

    @PostMapping("/pull")
    @Operation(
            summary = "Puxa avaliações da API REST do Directus (GET /items/{collection}?fields=*.*) usando Base URL + Static Token"
    )
    public ResponseEntity<DirectusSyncResultDto> pullEvaluationsFromDirectus(
            @RequestBody(required = false) DirectusPullRequest request
    ) {
        return ResponseEntity.ok(directusSyncService.pullFromDirectusApi(request));
    }

    @PostMapping("/import")
    @Operation(
            summary = "Recebe e importa um lote JSON de avaliações do Directus (via Webhook Flow, Postman ou JSON Export)"
    )
    public ResponseEntity<DirectusSyncResultDto> importDirectusBatch(
            @Valid @RequestBody DirectusBatchImportRequest request
    ) {
        return ResponseEntity.ok(directusSyncService.importBatch(request));
    }

    @PostMapping("/import-samples")
    @Operation(
            summary = "Sincroniza um lote ao vivo das 3 coleções do Directus (Monitoria_SAC, Monitoria_Retencao e Monitoria_Tim_Aquisicao com ?fields=*.*)"
    )
    public ResponseEntity<DirectusSyncResultDto> importLocalDirectusSamples(
            @RequestParam(required = false, defaultValue = "5") Integer limitPerCollection
    ) {
        return ResponseEntity.ok(directusSyncService.importLocalSamples(limitPerCollection));
    }
}
