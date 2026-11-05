package com.formshq.controller;

import com.formshq.dto.auth.AuthResponse;
import com.formshq.dto.auth.ChangeOwnPasswordRequest;
import com.formshq.dto.auth.LoginRequest;
import com.formshq.dto.auth.UserSummaryDto;
import com.formshq.security.UserPrincipal;
import com.formshq.service.AuthService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1/auth")
@RequiredArgsConstructor
@Tag(name = "Autenticação", description = "Endpoints de login JWT, sessão do usuário e troca de senha no primeiro acesso")
public class AuthController {

    private final AuthService authService;

    @PostMapping("/login")
    @Operation(summary = "Autentica usuário (Admin, Gestor ou Analista) e retorna token JWT")
    public ResponseEntity<AuthResponse> login(@Valid @RequestBody LoginRequest request) {
        return ResponseEntity.ok(authService.login(request));
    }

    @GetMapping("/me")
    @Operation(summary = "Retorna os dados do usuário autenticado")
    public ResponseEntity<UserSummaryDto> me(@AuthenticationPrincipal UserPrincipal principal) {
        return ResponseEntity.ok(authService.getCurrentUser(principal));
    }

    @PostMapping("/change-password")
    @Operation(summary = "Permite ao usuário autenticado definir sua nova senha pessoal (obrigatório no primeiro acesso)")
    public ResponseEntity<UserSummaryDto> changeOwnPassword(
            @Valid @RequestBody ChangeOwnPasswordRequest request,
            @AuthenticationPrincipal UserPrincipal principal
    ) {
        return ResponseEntity.ok(authService.changeOwnPassword(request, principal));
    }
}
