package com.formshq.repository;

import com.formshq.domain.entity.EvaluationFormTemplate;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Repository
public interface EvaluationFormTemplateRepository extends JpaRepository<EvaluationFormTemplate, UUID> {

    @EntityGraph(attributePaths = {"items", "createdBy"})
    List<EvaluationFormTemplate> findAllByOrderByCreatedAtDesc();

    @EntityGraph(attributePaths = {"items", "createdBy"})
    List<EvaluationFormTemplate> findByActiveTrueOrderByCreatedAtDesc();

    @EntityGraph(attributePaths = {"items", "createdBy"})
    List<EvaluationFormTemplate> findBySectorIgnoreCaseAndActiveTrueOrderByVersionDesc(String sector);

    @EntityGraph(attributePaths = {"items", "createdBy"})
    Optional<EvaluationFormTemplate> findWithItemsById(UUID id);
}
