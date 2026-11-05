package com.formshq.service;

import com.formshq.domain.entity.SectorTransitionLog;
import com.formshq.domain.entity.User;
import com.formshq.domain.enums.Role;
import com.formshq.dto.auth.AdminChangePasswordRequest;
import com.formshq.dto.auth.ChangeSectorRequest;
import com.formshq.dto.auth.CreateUserRequest;
import com.formshq.dto.auth.SectorTransitionLogDto;
import com.formshq.dto.auth.UserSummaryDto;
import com.formshq.exception.BusinessRuleException;
import com.formshq.exception.DuplicateResourceException;
import com.formshq.exception.ResourceNotFoundException;
import com.formshq.repository.SectorTransitionLogRepository;
import com.formshq.repository.UserRepository;
import com.formshq.security.SectorScopePolicy;
import com.formshq.security.UserPrincipal;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.security.SecureRandom;
import java.time.OffsetDateTime;
import java.util.Base64;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;

@Service
public class UserService {

    private static final SecureRandom SECURE_RANDOM = new SecureRandom();

    private final UserRepository userRepository;
    private final SectorTransitionLogRepository sectorTransitionLogRepository;
    private final PasswordEncoder passwordEncoder;
    private final SectorScopePolicy sectorScopePolicy;
    private final String configuredFirstAccessPassword;

    public UserService(
            UserRepository userRepository,
            SectorTransitionLogRepository sectorTransitionLogRepository,
            PasswordEncoder passwordEncoder,
            SectorScopePolicy sectorScopePolicy,
            @Value("${app.security.first-access-password:}") String configuredFirstAccessPassword
    ) {
        this.userRepository = userRepository;
        this.sectorTransitionLogRepository = sectorTransitionLogRepository;
        this.passwordEncoder = passwordEncoder;
        this.sectorScopePolicy = sectorScopePolicy;
        this.configuredFirstAccessPassword = configuredFirstAccessPassword;
    }

    public String resolveFirstAccessPassword() {
        if (configuredFirstAccessPassword != null && !configuredFirstAccessPassword.isBlank()) {
            return configuredFirstAccessPassword.trim();
        }
        byte[] bytes = new byte[12];
        SECURE_RANDOM.nextBytes(bytes);
        return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
    }

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
            Set<String> allowed = sectorScopePolicy.resolveAllowedSectorsForCaller(caller);
            users = users.stream()
                    .filter(u -> {
                        if (u.getId().equals(caller.getId())) {
                            return true;
                        }
                        if (u.getRole() == Role.ROLE_GESTOR) {
                            Set<String> managerSectors = sectorScopePolicy.extractAllowedSectors(u);
                            return allowed.isEmpty() || managerSectors.stream().anyMatch(allowed::contains);
                        }
                        if (u.getRole() != Role.ROLE_ANALISTA) {
                            return false;
                        }
                        return sectorScopePolicy.isSectorAllowed(allowed, u.getDepartment());
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
        return createUser(request, null);
    }

    @Transactional
    public UserSummaryDto createUser(CreateUserRequest request, UserPrincipal caller) {
        String targetDept = request.department() != null && !request.department().isBlank()
                ? request.department().trim()
                : "SAC";

        if (caller != null && caller.getRole() != Role.ROLE_ADMIN) {
            if (request.role() != Role.ROLE_ANALISTA) {
                throw new AccessDeniedException("Apenas o Administrador pode criar usuários com perfil de Gestor ou Administrador.");
            }
            sectorScopePolicy.assertCallerCanAccessSector(caller, targetDept);
        }

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

        boolean usingFirstAccessDefault = request.password() == null || request.password().isBlank();
        String rawPassword = usingFirstAccessDefault ? resolveFirstAccessPassword() : request.password().trim();

        User user = User.builder()
                .name(request.name().trim())
                .email(normalizedEmail)
                .passwordHash(passwordEncoder.encode(rawPassword))
                .role(request.role())
                .department(targetDept)
                .manager(defaultManager)
                .allowedSectors(request.role() == Role.ROLE_GESTOR ? "SAC,Cobrança & Retenção,Aquisição" : null)
                .active(true)
                .mustChangePassword(true)
                .build();

        return UserSummaryDto.fromEntity(userRepository.save(user));
    }

    @Transactional
    public UserSummaryDto toggleUserStatus(UUID targetUserId, Boolean active, UserPrincipal caller) {
        User target = userRepository.findById(targetUserId)
                .orElseThrow(() -> new ResourceNotFoundException("Usuário não encontrado com ID: " + targetUserId));

        if (caller.getRole() != Role.ROLE_ADMIN) {
            if (target.getRole() != Role.ROLE_ANALISTA) {
                throw new AccessDeniedException("Apenas o Administrador pode inativar ou reativar Gestores e Administradores.");
            }
            sectorScopePolicy.assertCallerCanAccessSector(caller, target.getDepartment());
        }

        boolean nextStatus = (active != null) ? active : !target.isActive();
        target.setActive(nextStatus);
        return UserSummaryDto.fromEntity(userRepository.save(target));
    }

    @Transactional
    public UserSummaryDto changeUserPassword(
            UUID targetUserId,
            AdminChangePasswordRequest request,
            UserPrincipal caller
    ) {
        User target = assertCallerCanChangeTargetPassword(targetUserId, caller);

        String newPwd = request.newPassword() != null ? request.newPassword().trim() : "";
        String confirmPwd = request.confirmPassword() != null ? request.confirmPassword().trim() : "";

        if (newPwd.length() < 6) {
            throw new BusinessRuleException("A nova senha deve possuir no mínimo 6 caracteres.");
        }
        if (!newPwd.equals(confirmPwd)) {
            throw new BusinessRuleException("A confirmação de senha não confere com a nova senha.");
        }

        boolean requireChangeOnNextLogin = Boolean.TRUE.equals(request.forceChangeOnNextLogin());

        target.setPasswordHash(passwordEncoder.encode(newPwd));
        target.setMustChangePassword(requireChangeOnNextLogin);
        target.setPasswordChangedAt(requireChangeOnNextLogin ? null : OffsetDateTime.now());

        return UserSummaryDto.fromEntity(userRepository.save(target));
    }

    @Transactional
    public UserSummaryDto resetToFirstAccessPassword(UUID targetUserId, UserPrincipal caller) {
        User target = assertCallerCanChangeTargetPassword(targetUserId, caller);

        String initialPassword = resolveFirstAccessPassword();
        target.setPasswordHash(passwordEncoder.encode(initialPassword));
        target.setMustChangePassword(true);
        target.setPasswordChangedAt(null);

        return UserSummaryDto.fromEntity(userRepository.save(target));
    }

    private User assertCallerCanChangeTargetPassword(UUID targetUserId, UserPrincipal caller) {
        User target = userRepository.findById(targetUserId)
                .orElseThrow(() -> new ResourceNotFoundException("Usuário não encontrado com ID: " + targetUserId));

        if (caller.getRole() != Role.ROLE_ADMIN) {
            if (target.getRole() != Role.ROLE_ANALISTA) {
                throw new AccessDeniedException("Gestores só têm permissão para alterar a senha de Analistas.");
            }
            sectorScopePolicy.assertCallerCanAccessSector(caller, target.getDepartment());
        }
        return target;
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
}
