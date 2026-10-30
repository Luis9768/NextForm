package com.formshq.controller;

import com.formshq.domain.enums.Role;
import com.formshq.dto.auth.ChangeSectorRequest;
import com.formshq.dto.auth.CreateUserRequest;
import com.formshq.dto.auth.SectorTransitionLogDto;
import com.formshq.dto.auth.UserSummaryDto;
import com.formshq.security.UserPrincipal;
import com.formshq.service.UserService;
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
import java.util.UUID;

@RestController
@RequestMapping("/api/v1/users")
@RequiredArgsConstructor
@Tag(name = "Usuários, Hierarquia & Setores", description = "Gestão centralizada de usuários, ativação/inativação com RBAC e vínculo de setores")
public class UserController {

    private final UserService userService;

    @GetMapping
    @PreAuthorize("hasAuthority('ROLE_GESTOR')")
    @Operation(summary = "Lista usuários com filtros de perfil (Admin, Gestor, Analista) e status (Ativo/Inativo)")
    public ResponseEntity<List<UserSummaryDto>> listUsers(
            @RequestParam(required = false) Role role,
            @RequestParam(required = false) Boolean active,
            @AuthenticationPrincipal UserPrincipal currentUser
    ) {
        return ResponseEntity.ok(userService.listUsersForCaller(role, active, currentUser));
    }

    @GetMapping("/{id}")
    @PreAuthorize("hasAuthority('ROLE_GESTOR')")
    @Operation(summary = "Busca dados do perfil de um Analista, Gestor ou Administrador pelo ID")
    public ResponseEntity<UserSummaryDto> getUserById(@PathVariable UUID id) {
        return ResponseEntity.ok(userService.getUserById(id));
    }

    @PostMapping
    @PreAuthorize("hasAuthority('ROLE_GESTOR')")
    @Operation(summary = "Cadastra um novo Analista, Gestor ou Administrador")
    public ResponseEntity<UserSummaryDto> createUser(@Valid @RequestBody CreateUserRequest request) {
        return ResponseEntity.status(HttpStatus.CREATED).body(userService.createUser(request));
    }

    @PatchMapping("/{id}/status")
    @PreAuthorize("hasAuthority('ROLE_GESTOR')")
    @Operation(summary = "Inativa ou reativa um usuário (Admin pode inativar qualquer perfil; Gestor apenas analistas dos seus setores)")
    public ResponseEntity<UserSummaryDto> toggleUserStatus(
            @PathVariable UUID id,
            @RequestBody(required = false) Map<String, Boolean> body,
            @AuthenticationPrincipal UserPrincipal currentUser
    ) {
        Boolean desiredActive = (body != null) ? body.get("active") : null;
        return ResponseEntity.ok(userService.toggleUserStatus(id, desiredActive, currentUser));
    }

    @PatchMapping("/{id}/sector")
    @PreAuthorize("hasAuthority('ROLE_GESTOR')")
    @Operation(summary = "Altera o setor de um analista (exclusivo para o Gestor responsável ou Admin), preservando o histórico")
    public ResponseEntity<UserSummaryDto> changeAnalystSector(
            @PathVariable UUID id,
            @Valid @RequestBody ChangeSectorRequest request,
            @AuthenticationPrincipal UserPrincipal currentUser
    ) {
        return ResponseEntity.ok(userService.changeAnalystSector(id, request, currentUser));
    }

    @GetMapping("/{id}/sector-history")
    @PreAuthorize("hasAuthority('ROLE_GESTOR')")
    @Operation(summary = "Retorna o histórico de transições de setor de um analista")
    public ResponseEntity<List<SectorTransitionLogDto>> getSectorHistory(@PathVariable UUID id) {
        return ResponseEntity.ok(userService.listSectorHistory(id));
    }

    @PutMapping("/{id}/allowed-sectors")
    @PreAuthorize("hasAuthority('ROLE_ADMIN')")
    @Operation(summary = "Define a quais setores um Gestor terá acesso (Exclusivo ROLE_ADMIN)")
    public ResponseEntity<UserSummaryDto> updateAllowedSectors(
            @PathVariable UUID id,
            @RequestBody List<String> allowedSectors
    ) {
        return ResponseEntity.ok(userService.updateManagerAllowedSectors(id, allowedSectors));
    }
}
