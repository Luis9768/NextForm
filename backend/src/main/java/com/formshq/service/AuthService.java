package com.formshq.service;

import com.formshq.domain.entity.User;
import com.formshq.dto.auth.AuthResponse;
import com.formshq.dto.auth.ChangeOwnPasswordRequest;
import com.formshq.dto.auth.LoginRequest;
import com.formshq.dto.auth.UserSummaryDto;
import com.formshq.exception.BusinessRuleException;
import com.formshq.exception.ResourceNotFoundException;
import com.formshq.repository.UserRepository;
import com.formshq.security.JwtService;
import com.formshq.security.UserPrincipal;
import lombok.RequiredArgsConstructor;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.authentication.BadCredentialsException;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.OffsetDateTime;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

@Service
@RequiredArgsConstructor
public class AuthService {

    private static final int MAX_FAILED_ATTEMPTS = 10;
    private static final long LOCKOUT_WINDOW_MS = 5 * 60 * 1000L; // 5 minutos

    private final AuthenticationManager authenticationManager;
    private final JwtService jwtService;
    private final UserRepository userRepository;
    private final PasswordEncoder passwordEncoder;

    private final Map<String, LoginAttemptState> loginAttempts = new ConcurrentHashMap<>();

    private record LoginAttemptState(int count, long firstAttemptEpochMs) {}

    @Transactional(readOnly = true)
    public AuthResponse login(LoginRequest request) {
        String normalizedEmail = request.email().trim().toLowerCase();
        checkLoginRateLimit(normalizedEmail);

        Authentication authentication;
        try {
            authentication = authenticationManager.authenticate(
                    new UsernamePasswordAuthenticationToken(normalizedEmail, request.password())
            );
            loginAttempts.remove(normalizedEmail);
        } catch (BadCredentialsException e) {
            recordFailedAttempt(normalizedEmail);
            throw e;
        }

        UserPrincipal principal = (UserPrincipal) authentication.getPrincipal();
        String token = jwtService.generateToken(principal);

        User user = userRepository.findById(principal.getId())
                .orElseThrow(() -> new ResourceNotFoundException("Usuário não encontrado."));

        return new AuthResponse(token, "Bearer", UserSummaryDto.fromEntity(user));
    }

    private void checkLoginRateLimit(String emailKey) {
        LoginAttemptState state = loginAttempts.get(emailKey);
        if (state == null) {
            return;
        }
        long now = System.currentTimeMillis();
        if (now - state.firstAttemptEpochMs() > LOCKOUT_WINDOW_MS) {
            loginAttempts.remove(emailKey);
            return;
        }
        if (state.count() >= MAX_FAILED_ATTEMPTS) {
            throw new BusinessRuleException(
                    "Muitas tentativas de login sem sucesso. Aguarde 5 minutos antes de tentar novamente."
            );
        }
    }

    private void recordFailedAttempt(String emailKey) {
        long now = System.currentTimeMillis();
        loginAttempts.compute(emailKey, (k, existing) -> {
            if (existing == null || (now - existing.firstAttemptEpochMs() > LOCKOUT_WINDOW_MS)) {
                return new LoginAttemptState(1, now);
            }
            return new LoginAttemptState(existing.count() + 1, existing.firstAttemptEpochMs());
        });
    }

    @Transactional(readOnly = true)
    public UserSummaryDto getCurrentUser(UserPrincipal principal) {
        User user = userRepository.findById(principal.getId())
                .orElseThrow(() -> new ResourceNotFoundException("Usuário autenticado não encontrado."));
        return UserSummaryDto.fromEntity(user);
    }

    @Transactional
    public UserSummaryDto changeOwnPassword(ChangeOwnPasswordRequest request, UserPrincipal principal) {
        String newPwd = request.newPassword() != null ? request.newPassword().trim() : "";
        String confirmPwd = request.confirmPassword() != null ? request.confirmPassword().trim() : "";

        if (newPwd.length() < 6) {
            throw new BusinessRuleException("A nova senha deve possuir no mínimo 6 caracteres.");
        }
        if (!newPwd.equals(confirmPwd)) {
            throw new BusinessRuleException("A confirmação de senha não confere com a nova senha digitada.");
        }

        User user = userRepository.findById(principal.getId())
                .orElseThrow(() -> new ResourceNotFoundException("Usuário não encontrado."));

        if (passwordEncoder.matches(newPwd, user.getPasswordHash())) {
            throw new BusinessRuleException("Sua nova senha pessoal deve ser diferente da senha atual de primeiro acesso.");
        }

        user.setPasswordHash(passwordEncoder.encode(newPwd));
        user.setMustChangePassword(false);
        user.setPasswordChangedAt(OffsetDateTime.now());

        return UserSummaryDto.fromEntity(userRepository.save(user));
    }
}
