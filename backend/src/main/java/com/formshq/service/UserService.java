package com.formshq.service;

import com.formshq.domain.entity.SectorTransitionLog;
import com.formshq.domain.entity.User;
import com.formshq.domain.enums.Role;
import com.formshq.dto.auth.ChangeSectorRequest;
import com.formshq.dto.auth.CreateUserRequest;
import com.formshq.dto.auth.SectorTransitionLogDto;
import com.formshq.dto.auth.UserSummaryDto;
import com.formshq.exception.BusinessRuleException;
import com.formshq.exception.DuplicateResourceException;
import com.formshq.exception.ResourceNotFoundException;
import com.formshq.repository.SectorTransitionLogRepository;
import com.formshq.repository.UserRepository;
import com.formshq.security.UserPrincipal;
import lombok.RequiredArgsConstructor;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.OffsetDateTime;
import java.util.Arrays;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
public class UserService {

    private final UserRepository userRepository;
    private final SectorTransitionLogRepository sectorTransitionLogRepository;
    private final PasswordEncoder passwordEncoder;

    @Transactional(readOnly = true)
    public List<UserSummaryDto> listAllUsers(Role roleFilter) {
        List<User> users = (roleFilter != null)
                ? userRepository.findByRoleOrderByNameAsc(roleFilter)
                : userRepository.findAllByOrderByNameAsc();
        return users.stream().map(UserSummaryDto::fromEntity).toList();
    }

    @Transactional(readOnly = true)
    public List<UserSummaryDto> listUsersForCaller(Role roleFilter, Boolean activeFilter, UserPrincipal caller) {
        List<User> users = (roleFilter != null)
                ? userRepository.findByRoleOrderByNameAsc(roleFilter)
                : userRepository.findAllByOrderByNameAsc();

        if (activeFilter != null) {
            users = users.stream()
                    .filter(u -> u.isActive() == activeFilter)
                    .toList();
        }

        if (caller != null && caller.getRole() == Role.ROLE_GESTOR) {
            User manager = userRepository.findById(caller.getId()).orElse(null);
            Set<String> allowed = extractAllowedSectors(manager);
            users = users.stream()
                    .filter(u -> {
                        if (u.getId().equals(caller.getId())) {
                            return true;
                        }
                        if (u.getRole() != Role.ROLE_ANALISTA) {
                            return false;
                        }
                        if (allowed.isEmpty()) {
                            return true;
                        }
                        return u.getDepartment() != null && allowed.contains(u.getDepartment().trim().toLowerCase());
                    })
                    .toList();
        }

        return users.stream().map(UserSummaryDto::fromEntity).toList();
    }

    @Transactional(readOnly = true)
    public UserSummaryDto getUserById(UUID id) {
        User user = userRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Analista/Usuário não encontrado com ID: " + id));
        return UserSummaryDto.fromEntity(user);
    }

    @Transactional
    public UserSummaryDto createUser(CreateUserRequest request) {
        String normalizedEmail = request.email().trim().toLowerCase();
        if (userRepository.existsByEmailIgnoreCase(normalizedEmail)) {
            throw new DuplicateResourceException("Já existe um usuário cadastrado com o e-mail: " + normalizedEmail);
        }

        User defaultManager = null;
        if (request.role() == Role.ROLE_ANALISTA) {
            List<User> gestores = userRepository.findByRoleOrderByNameAsc(Role.ROLE_GESTOR);
            if (!gestores.isEmpty()) {
                defaultManager = gestores.get(0);
            }
        }

        User user = User.builder()
                .name(request.name().trim())
                .email(normalizedEmail)
                .passwordHash(passwordEncoder.encode(request.password()))
                .role(request.role())
                .department(request.department() != null && !request.department().isBlank() ? request.department().trim() : "SAC")
                .manager(defaultManager)
                .allowedSectors(request.role() == Role.ROLE_GESTOR ? "SAC,Cobrança & Retenção,Suporte N1,Retenção & Ouvidoria" : null)
                .active(true)
                .build();

        return UserSummaryDto.fromEntity(userRepository.save(user));
    }

    @Transactional
    public UserSummaryDto toggleUserStatus(UUID targetUserId, Boolean active, UserPrincipal caller) {
        User target = userRepository.findById(targetUserId)
                .orElseThrow(() -> new ResourceNotFoundException("Usuário não encontrado com ID: " + targetUserId));

        if (caller.getRole() != Role.ROLE_ADMIN) {
            // Gestor só tem permissão para inativar/reativar analistas subordinados aos seus setores autorizados
            if (target.getRole() != Role.ROLE_ANALISTA) {
                throw new AccessDeniedException("Apenas o Administrador pode inativar ou reativar Gestores e Administradores.");
            }
            User manager = userRepository.findById(caller.getId()).orElse(null);
            Set<String> allowed = extractAllowedSectors(manager);
            if (!allowed.isEmpty()) {
                String targetSector = target.getDepartment() != null ? target.getDepartment().trim().toLowerCase() : "";
                if (!allowed.contains(targetSector)) {
                    throw new AccessDeniedException("Você não possui permissão para inativar analistas fora dos seus setores atribuídos.");
                }
            }
        }

        boolean nextStatus = (active != null) ? active : !target.isActive();
        target.setActive(nextStatus);
        return UserSummaryDto.fromEntity(userRepository.save(target));
    }

    @Transactional
    public UserSummaryDto changeAnalystSector(UUID analystId, ChangeSectorRequest request, UserPrincipal caller) {
        User analyst = userRepository.findById(analystId)
                .orElseThrow(() -> new ResourceNotFoundException("Analista não encontrado com ID: " + analystId));

        if (analyst.getRole() != Role.ROLE_ANALISTA) {
            throw new BusinessRuleException("Apenas colaboradores com perfil de Analista possuem transição de setor operacional.");
        }

        User callerEntity = userRepository.findById(caller.getId())
                .orElseThrow(() -> new ResourceNotFoundException("Gestor autenticado não encontrado."));

        if (!caller.isAdmin() && analyst.getManager() != null && !analyst.getManager().getId().equals(caller.getId())) {
            throw new AccessDeniedException(
                    "Apenas o Gestor responsável direto por este analista (" + analyst.getManager().getName() + ") tem permissão para alterar seu setor."
            );
        }

        String previousSector = analyst.getDepartment() != null ? analyst.getDepartment() : "Geral";
        String nextSector = request.newSector().trim();

        if (!previousSector.equalsIgnoreCase(nextSector)) {
            analyst.setDepartment(nextSector);
            userRepository.save(analyst);

            SectorTransitionLog logEntry = SectorTransitionLog.builder()
                    .analyst(analyst)
                    .previousSector(previousSector)
                    .newSector(nextSector)
                    .changedBy(callerEntity)
                    .reason(request.reason() != null ? request.reason().trim() : "Transferência operacional de setor")
                    .changedAt(OffsetDateTime.now())
                    .build();
            sectorTransitionLogRepository.save(logEntry);
        }

        return UserSummaryDto.fromEntity(analyst);
    }

    @Transactional
    public UserSummaryDto updateManagerAllowedSectors(UUID managerId, List<String> allowedSectors) {
        User manager = userRepository.findById(managerId)
                .orElseThrow(() -> new ResourceNotFoundException("Gestor não encontrado com ID: " + managerId));

        String joined = (allowedSectors == null || allowedSectors.isEmpty())
                ? ""
                : allowedSectors.stream().map(String::trim).filter(s -> !s.isEmpty()).collect(Collectors.joining(","));

        manager.setAllowedSectors(joined);
        return UserSummaryDto.fromEntity(userRepository.save(manager));
    }

    @Transactional(readOnly = true)
    public List<SectorTransitionLogDto> listSectorHistory(UUID analystId) {
        return sectorTransitionLogRepository.findByAnalystIdOrderByChangedAtDesc(analystId)
                .stream()
                .map(SectorTransitionLogDto::fromEntity)
                .toList();
    }

    private Set<String> extractAllowedSectors(User manager) {
        if (manager == null || manager.getAllowedSectors() == null || manager.getAllowedSectors().isBlank()) {
            return Set.of();
        }
        return Arrays.stream(manager.getAllowedSectors().split(","))
                .map(s -> s.trim().toLowerCase())
                .filter(s -> !s.isEmpty())
                .collect(Collectors.toSet());
    }
}
