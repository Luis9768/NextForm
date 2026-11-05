package com.formshq.repository;

import com.formshq.domain.entity.Evaluation;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Repository
public interface EvaluationRepository extends JpaRepository<Evaluation, UUID> {

    @EntityGraph(attributePaths = {
            "callRecord",
            "callRecord.customer",
            "evaluator",
            "evaluator.manager",
            "analyst",
            "analyst.manager",
            "formTemplate",
            "itemSnapshots"
    })
    List<Evaluation> findAllByOrderByEvaluatedAtDesc();

    @EntityGraph(attributePaths = {
            "callRecord",
            "callRecord.customer",
            "evaluator",
            "evaluator.manager",
            "analyst",
            "analyst.manager",
            "formTemplate",
            "itemSnapshots"
    })
    List<Evaluation> findByAnalystIdOrderByEvaluatedAtDesc(UUID analystId);

    @EntityGraph(attributePaths = {
            "callRecord",
            "callRecord.customer",
            "evaluator",
            "evaluator.manager",
            "analyst",
            "analyst.manager",
            "formTemplate"
    })
    @Query("SELECT e FROM Evaluation e ORDER BY e.evaluatedAt DESC")
    List<Evaluation> findAllSummaryByOrderByEvaluatedAtDesc();

    @EntityGraph(attributePaths = {
            "callRecord",
            "callRecord.customer",
            "evaluator",
            "evaluator.manager",
            "analyst",
            "analyst.manager",
            "formTemplate"
    })
    @Query("SELECT e FROM Evaluation e WHERE e.analyst.id = :analystId ORDER BY e.evaluatedAt DESC")
    List<Evaluation> findSummaryByAnalystIdOrderByEvaluatedAtDesc(@Param("analystId") UUID analystId);

    @EntityGraph(attributePaths = {
            "callRecord",
            "callRecord.customer",
            "evaluator",
            "evaluator.manager",
            "analyst",
            "analyst.manager",
            "formTemplate",
            "itemSnapshots"
    })
    Optional<Evaluation> findWithDetailsById(UUID id);

    @EntityGraph(attributePaths = {
            "callRecord",
            "callRecord.customer",
            "evaluator",
            "evaluator.manager",
            "analyst",
            "analyst.manager",
            "formTemplate",
            "itemSnapshots"
    })
    Optional<Evaluation> findByCallRecordId(UUID callRecordId);

    boolean existsByCallRecordId(UUID callRecordId);
}
