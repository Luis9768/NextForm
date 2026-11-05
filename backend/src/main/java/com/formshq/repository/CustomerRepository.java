package com.formshq.repository;

import com.formshq.domain.entity.Customer;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.Optional;
import java.util.UUID;

@Repository
public interface CustomerRepository extends JpaRepository<Customer, UUID> {

    Optional<Customer> findByPhone(String phone);

    Optional<Customer> findFirstByPhoneEndingWith(String phoneSuffix);

    Optional<Customer> findFirstByEmailIgnoreCase(String email);

    Optional<Customer> findFirstByProposalIgnoreCaseOrProtocolIgnoreCase(String proposal, String protocol);

    Optional<Customer> findFirstByNameContainingIgnoreCase(String nameFragment);
}
