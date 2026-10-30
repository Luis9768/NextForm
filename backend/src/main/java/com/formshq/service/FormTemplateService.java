package com.formshq.service;

import com.formshq.domain.entity.EvaluationFormItem;
import com.formshq.domain.entity.EvaluationFormTemplate;
import com.formshq.domain.entity.User;
import com.formshq.dto.form.FormItemRequest;
import com.formshq.dto.form.FormTemplateRequest;
import com.formshq.dto.form.FormTemplateResponse;
import com.formshq.exception.BusinessRuleException;
import com.formshq.exception.ResourceNotFoundException;
import com.formshq.repository.EvaluationFormTemplateRepository;
import com.formshq.repository.UserRepository;
import com.formshq.security.UserPrincipal;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

@Service
@RequiredArgsConstructor
public class FormTemplateService {

    private final EvaluationFormTemplateRepository formTemplateRepository;
    private final UserRepository userRepository;

    @Transactional(readOnly = true)
    public List<FormTemplateResponse> listTemplates(boolean onlyActive) {
        List<EvaluationFormTemplate> templates = onlyActive
                ? formTemplateRepository.findByActiveTrueOrderByCreatedAtDesc()
                : formTemplateRepository.findAllByOrderByCreatedAtDesc();

        return templates.stream()
                .map(FormTemplateResponse::fromEntity)
                .toList();
    }

    @Transactional(readOnly = true)
    public FormTemplateResponse getActiveTemplateForSector(String sector) {
        if (sector != null && !sector.isBlank()) {
            List<EvaluationFormTemplate> bySector = formTemplateRepository
                    .findBySectorIgnoreCaseAndActiveTrueOrderByVersionDesc(sector.trim());
            if (!bySector.isEmpty()) {
                return FormTemplateResponse.fromEntity(bySector.get(0));
            }
        }
        List<EvaluationFormTemplate> activeAll = formTemplateRepository.findByActiveTrueOrderByCreatedAtDesc();
        if (activeAll.isEmpty()) {
            throw new ResourceNotFoundException("Nenhum formulário ativo encontrado para o setor: " + sector);
        }
        return FormTemplateResponse.fromEntity(activeAll.get(0));
    }

    @Transactional(readOnly = true)
    public FormTemplateResponse getById(UUID id) {
        EvaluationFormTemplate template = formTemplateRepository.findWithItemsById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Formulário de avaliação não encontrado com ID: " + id));
        return FormTemplateResponse.fromEntity(template);
    }

    @Transactional
    public FormTemplateResponse createTemplate(FormTemplateRequest request, UserPrincipal creatorPrincipal) {
        validateAtLeastOneStandardItem(request.items());

        User creator = userRepository.findById(creatorPrincipal.getId())
                .orElseThrow(() -> new ResourceNotFoundException("Usuário criador não encontrado."));

        String resolvedSector = (request.sector() != null && !request.sector().isBlank())
                ? request.sector().trim()
                : "Geral";

        EvaluationFormTemplate template = EvaluationFormTemplate.builder()
                .name(request.name().trim())
                .description(request.description())
                .sector(resolvedSector)
                .passingScorePercentage(request.passingScorePercentage())
                .version(1)
                .active(request.active() == null || request.active())
                .createdBy(creator)
                .build();

        List<EvaluationFormItem> items = mapRequestItems(request.items());
        template.clearAndSetItems(items);

        EvaluationFormTemplate saved = formTemplateRepository.save(template);
        return FormTemplateResponse.fromEntity(saved);
    }

    @Transactional
    public FormTemplateResponse updateTemplate(UUID id, FormTemplateRequest request) {
        validateAtLeastOneStandardItem(request.items());

        EvaluationFormTemplate template = formTemplateRepository.findWithItemsById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Formulário de avaliação não encontrado com ID: " + id));

        template.setName(request.name().trim());
        template.setDescription(request.description());
        if (request.sector() != null && !request.sector().isBlank()) {
            template.setSector(request.sector().trim());
        }
        template.setPassingScorePercentage(request.passingScorePercentage());
        if (request.active() != null) {
            template.setActive(request.active());
        }
        template.setVersion(template.getVersion() + 1);

        List<EvaluationFormItem> items = mapRequestItems(request.items());
        template.clearAndSetItems(items);

        EvaluationFormTemplate saved = formTemplateRepository.save(template);
        return FormTemplateResponse.fromEntity(saved);
    }

    @Transactional
    public FormTemplateResponse toggleActive(UUID id) {
        EvaluationFormTemplate template = formTemplateRepository.findWithItemsById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Formulário de avaliação não encontrado com ID: " + id));
        template.setActive(!template.isActive());
        return FormTemplateResponse.fromEntity(formTemplateRepository.save(template));
    }

    private void validateAtLeastOneStandardItem(List<FormItemRequest> items) {
        boolean hasStandardItem = items.stream().anyMatch(item -> !item.fatalError());
        if (!hasStandardItem) {
            throw new BusinessRuleException(
                    "O formulário deve conter pelo menos 1 item pontuável padrão (não marcado como Erro Grave)."
            );
        }
    }

    private List<EvaluationFormItem> mapRequestItems(List<FormItemRequest> itemRequests) {
        List<EvaluationFormItem> entities = new ArrayList<>();
        for (int i = 0; i < itemRequests.size(); i++) {
            FormItemRequest req = itemRequests.get(i);
            int resolvedWeight = req.fatalError()
                    ? 0
                    : (req.weight() != null && req.weight() > 0 ? req.weight() : 1);

            EvaluationFormItem item = EvaluationFormItem.builder()
                    .label(req.label().trim())
                    .description(req.description())
                    .category(req.category().trim())
                    .fatalError(req.fatalError())
                    .points(resolvedWeight)
                    .displayOrder(req.displayOrder() != null ? req.displayOrder() : (i + 1))
                    .build();
            entities.add(item);
        }
        return entities;
    }
}
