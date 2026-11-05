package com.formshq.service;

import com.formshq.domain.entity.EvaluationFormTemplate;
import com.formshq.domain.entity.Sector;
import com.formshq.domain.entity.User;
import com.formshq.domain.enums.Role;
import com.formshq.dto.sector.SectorRequest;
import com.formshq.dto.sector.SectorResponse;
import com.formshq.exception.BusinessRuleException;
import com.formshq.exception.DuplicateResourceException;
import com.formshq.exception.ResourceNotFoundException;
import com.formshq.repository.EvaluationFormTemplateRepository;
import com.formshq.repository.SectorRepository;
import com.formshq.repository.UserRepository;
import com.formshq.security.UserPrincipal;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.text.Normalizer;
import java.util.Arrays;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
public class SectorService {

    private final SectorRepository sectorRepository;
    private final UserRepository userRepository;
    private final EvaluationFormTemplateRepository formTemplateRepository;

    @Transactional(readOnly = true)
    public List<SectorResponse> listSectors(boolean onlyActive, UserPrincipal caller) {
        List<Sector> sectors = onlyActive
                ? sectorRepository.findByActiveTrueOrderByNameAsc()
                : sectorRepository.findAllByOrderByNameAsc();

        if (caller != null && caller.getRole() == Role.ROLE_GESTOR) {
            User manager = userRepository.findById(caller.getId()).orElse(null);
            if (manager != null && manager.getAllowedSectors() != null && !manager.getAllowedSectors().isBlank()) {
                Set<String> allowed = Arrays.stream(manager.getAllowedSectors().split(","))
                        .map(s -> s.trim().toLowerCase())
                        .filter(s -> !s.isEmpty())
                        .collect(Collectors.toSet());
                if (!allowed.isEmpty()) {
                    sectors = sectors.stream()
                            .filter(s -> allowed.contains(s.getName().trim().toLowerCase()))
                            .toList();
                }
            }
        }

        return sectors.stream()
                .map(SectorResponse::fromEntity)
                .toList();
    }

    @Transactional
    public SectorResponse createSector(SectorRequest request) {
        String name = request.name().trim();
        if (sectorRepository.existsByNameIgnoreCase(name)) {
            throw new DuplicateResourceException("Já existe um setor cadastrado com o nome: " + name);
        }

        String code = (request.code() != null && !request.code().isBlank())
                ? request.code().trim().toUpperCase()
                : toSlugCode(name);

        Sector sector = Sector.builder()
                .name(name)
                .code(code)
                .description(request.description() != null ? request.description().trim() : null)
                .active(request.active() == null || request.active())
                .build();

        return SectorResponse.fromEntity(sectorRepository.save(sector));
    }

    @Transactional
    public SectorResponse updateSector(UUID id, SectorRequest request) {
        Sector sector = sectorRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Setor não encontrado com ID: " + id));

        String oldName = sector.getName().trim();
        String newName = request.name().trim();
        sectorRepository.findByNameIgnoreCase(newName).ifPresent(existing -> {
            if (!existing.getId().equals(id)) {
                throw new DuplicateResourceException("Já existe outro setor com o nome: " + newName);
            }
        });

        sector.setName(newName);
        if (request.code() != null && !request.code().isBlank()) {
            sector.setCode(request.code().trim().toUpperCase());
        } else {
            sector.setCode(toSlugCode(newName));
        }
        sector.setDescription(request.description() != null ? request.description().trim() : null);
        if (request.active() != null) {
            sector.setActive(request.active());
        }

        Sector saved = sectorRepository.save(sector);

        // Propaga renomeação do setor para colaboradores e matrizes vinculadas (evitando órfãos)
        if (!oldName.equalsIgnoreCase(newName)) {
            for (User u : userRepository.findAll()) {
                boolean userChanged = false;
                if (u.getDepartment() != null && u.getDepartment().trim().equalsIgnoreCase(oldName)) {
                    u.setDepartment(newName);
                    userChanged = true;
                }
                if (u.getAllowedSectors() != null && !u.getAllowedSectors().isBlank()) {
                    List<String> updatedAllowed = Arrays.stream(u.getAllowedSectors().split(","))
                            .map(String::trim)
                            .filter(s -> !s.isEmpty())
                            .map(s -> s.equalsIgnoreCase(oldName) ? newName : s)
                            .toList();
                    String joined = String.join(",", updatedAllowed);
                    if (!joined.equals(u.getAllowedSectors())) {
                        u.setAllowedSectors(joined);
                        userChanged = true;
                    }
                }
                if (userChanged) {
                    userRepository.save(u);
                }
            }
            for (EvaluationFormTemplate ft : formTemplateRepository.findAll()) {
                if (ft.getSector() != null && ft.getSector().trim().equalsIgnoreCase(oldName)) {
                    ft.setSector(newName);
                    formTemplateRepository.save(ft);
                }
            }
        }

        return SectorResponse.fromEntity(saved);
    }

    @Transactional
    public void deleteSector(UUID id) {
        Sector sector = sectorRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Setor não encontrado com ID: " + id));

        String sectorName = sector.getName().trim();
        long linkedUsersCount = userRepository.findAll().stream()
                .filter(u -> u.isActive() && u.getDepartment() != null && u.getDepartment().trim().equalsIgnoreCase(sectorName))
                .count();

        if (linkedUsersCount > 0) {
            throw new BusinessRuleException(
                    "Não é possível excluir o setor '" + sectorName + "' pois existem " + linkedUsersCount
                            + " colaboradores ativos vinculados a ele. Transfira os colaboradores antes de excluir."
            );
        }

        sectorRepository.delete(sector);
    }

    private String toSlugCode(String value) {
        String normalized = Normalizer.normalize(value, Normalizer.Form.NFD)
                .replaceAll("[\\p{InCombiningDiacriticalMarks}]", "")
                .replaceAll("[^a-zA-Z0-9]+", "_")
                .replaceAll("^_+|_+$", "")
                .toUpperCase();
        return normalized.isEmpty() ? "SETOR_" + UUID.randomUUID().toString().substring(0, 4).toUpperCase() : normalized;
    }
}
