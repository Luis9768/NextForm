package com.formshq.security;

import com.formshq.domain.entity.Evaluation;
import com.formshq.domain.entity.User;
import com.formshq.domain.enums.Role;
import com.formshq.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.stereotype.Component;

import java.util.Arrays;
import java.util.Set;
import java.util.stream.Collectors;

@Component
@RequiredArgsConstructor
public class SectorScopePolicy {

    private static final Set<String> WILDCARD_SECTORS = Set.of(
            "geral",
            "atendimento / operação",
            "qualidade & monitoria"
    );

    private final UserRepository userRepository;

    public Set<String> extractAllowedSectors(User manager) {
        if (manager == null || manager.getAllowedSectors() == null || manager.getAllowedSectors().isBlank()) {
            return Set.of();
        }
        return Arrays.stream(manager.getAllowedSectors().split(","))
                .map(s -> s.trim().toLowerCase())
                .filter(s -> !s.isEmpty())
                .collect(Collectors.toUnmodifiableSet());
    }

    public Set<String> resolveAllowedSectorsForCaller(UserPrincipal caller) {
        if (caller == null || caller.isAdmin() || caller.getRole() != Role.ROLE_GESTOR) {
            return Set.of();
        }
        User manager = userRepository.findById(caller.getId()).orElse(null);
        return extractAllowedSectors(manager);
    }

    public boolean isSectorAllowed(Set<String> allowedSectors, String... candidateSectors) {
        if (allowedSectors == null || allowedSectors.isEmpty()) {
            return true;
        }
        for (String sector : candidateSectors) {
            if (sector == null || sector.isBlank()) {
                continue;
            }
            String normalized = sector.trim().toLowerCase();
            if (WILDCARD_SECTORS.contains(normalized) || allowedSectors.contains(normalized)) {
                return true;
            }
        }
        return false;
    }

    public void assertCallerCanAccessSector(UserPrincipal caller, String... candidateSectors) {
        if (caller == null || caller.isAdmin() || caller.getRole() != Role.ROLE_GESTOR) {
            return;
        }
        Set<String> allowed = resolveAllowedSectorsForCaller(caller);
        if (!isSectorAllowed(allowed, candidateSectors)) {
            throw new AccessDeniedException("Acesso negado: este registro pertence a um setor fora do seu escopo autorizado.");
        }
    }

    public String resolveEvaluationSector(Evaluation evaluation) {
        if (evaluation == null) {
            return "Geral";
        }
        if (evaluation.getAnalystSectorSnapshot() != null && !evaluation.getAnalystSectorSnapshot().isBlank()) {
            return evaluation.getAnalystSectorSnapshot().trim();
        }
        if (evaluation.getAnalyst() != null && evaluation.getAnalyst().getDepartment() != null) {
            return evaluation.getAnalyst().getDepartment().trim();
        }
        return "Geral";
    }
}
