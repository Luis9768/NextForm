package com.formshq.repository;

import com.formshq.domain.entity.Evaluation;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Repository
public interface EvaluationRepository extends JpaRepository<Evaluation, UUID> {

    @EntityGraph(attributePaths = {"callRecord", "evaluator", "analyst", "itemSnapshots"})
    List<Evaluation> findAllByOrderByEvaluatedAtDesc();

    @EntityGraph(attributePaths = {"callRecord", "evaluator", "analyst", "itemSnapshots"})
    List<Evaluation> findByAnalystIdOrderByEvaluatedAtDesc(UUID analystId);

    @EntityGraph(attributePaths = {"callRecord", "evaluator", "analyst", "itemSnapshots"})
    Optional<Evaluation> findWithDetailsById(UUID id);

    @EntityGraph(attributePaths = {"callRecord", "evaluator", "analyst", "itemSnapshots"})
    Optional<Evaluation> findByCallRecordId(UUID callRecordId);

    boolean existsByCallRecordId(UUID callRecordId);
}
