package com.formshq.controller;

import com.formshq.dto.sector.SectorRequest;
import com.formshq.dto.sector.SectorResponse;
import com.formshq.security.UserPrincipal;
import com.formshq.service.SectorService;
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
@RequestMapping("/api/v1/sectors")
@RequiredArgsConstructor
@Tag(name = "Gestão de Setores", description = "Cadastro e manutenção de setores operacionais (criação/edição/exclusão exclusiva do ROLE_ADMIN)")
public class SectorController {

    private final SectorService sectorService;

    @GetMapping
    @PreAuthorize("hasAuthority('ROLE_GESTOR')")
    @Operation(summary = "Lista setores cadastrados (Admin vê todos; Gestor vê seus setores atribuídos)")
    public ResponseEntity<List<SectorResponse>> listSectors(
            @RequestParam(defaultValue = "false") boolean onlyActive,
            @AuthenticationPrincipal UserPrincipal currentUser
    ) {
        return ResponseEntity.ok(sectorService.listSectors(onlyActive, currentUser));
    }

    @PostMapping
    @PreAuthorize("hasAuthority('ROLE_ADMIN')")
    @Operation(summary = "Cadastra um novo setor operacional (Exclusivo ROLE_ADMIN)")
    public ResponseEntity<SectorResponse> createSector(@Valid @RequestBody SectorRequest request) {
        return ResponseEntity.status(HttpStatus.CREATED).body(sectorService.createSector(request));
    }

    @PutMapping("/{id}")
    @PreAuthorize("hasAuthority('ROLE_ADMIN')")
    @Operation(summary = "Edita/renomeia um setor operacional (Exclusivo ROLE_ADMIN)")
    public ResponseEntity<SectorResponse> updateSector(
            @PathVariable UUID id,
            @Valid @RequestBody SectorRequest request
    ) {
        return ResponseEntity.ok(sectorService.updateSector(id, request));
    }

    @DeleteMapping("/{id}")
    @PreAuthorize("hasAuthority('ROLE_ADMIN')")
    @Operation(summary = "Exclui um setor operacional (Exclusivo ROLE_ADMIN)")
    public ResponseEntity<Void> deleteSector(@PathVariable UUID id) {
        sectorService.deleteSector(id);
        return ResponseEntity.noContent().build();
    }
}
