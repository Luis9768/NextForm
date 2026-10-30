package com.formshq.repository;

import com.formshq.domain.entity.CallRecord;
import com.formshq.domain.enums.CallStatus;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Repository
public interface CallRecordRepository extends JpaRepository<CallRecord, UUID> {

    boolean existsByExternalCallId(String externalCallId);

    Optional<CallRecord> findByExternalCallId(String externalCallId);

    @EntityGraph(attributePaths = {"analyst", "customer", "evaluation"})
    List<CallRecord> findAllByOrderByCallDateDesc();

    @EntityGraph(attributePaths = {"analyst", "customer", "evaluation"})
    List<CallRecord> findByStatusOrderByCallDateDesc(CallStatus status);

    @EntityGraph(attributePaths = {"analyst", "customer", "evaluation"})
    List<CallRecord> findByAnalystIdOrderByCallDateDesc(UUID analystId);

    @EntityGraph(attributePaths = {"analyst", "customer", "evaluation"})
    List<CallRecord> findByAnalystIdAndStatusOrderByCallDateDesc(UUID analystId, CallStatus status);

    @EntityGraph(attributePaths = {"analyst", "customer", "evaluation"})
    List<CallRecord> findByCustomerIdOrderByCallDateDesc(UUID customerId);

    @EntityGraph(attributePaths = {"analyst", "customer", "evaluation"})
    List<CallRecord> findByCustomerIdentifierContainingOrderByCallDateDesc(String phoneFragment);

    @EntityGraph(attributePaths = {"analyst", "customer", "evaluation"})
    Optional<CallRecord> findWithDetailsById(UUID id);

    long countByStatus(CallStatus status);

    long countByAnalystIdAndStatus(UUID analystId, CallStatus status);
}
