package com.formshq.repository;

import com.formshq.domain.entity.User;
import com.formshq.domain.enums.Role;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Repository
public interface UserRepository extends JpaRepository<User, UUID> {

    @EntityGraph(attributePaths = {"manager"})
    Optional<User> findByEmailIgnoreCase(String email);

    @Override
    @EntityGraph(attributePaths = {"manager"})
    Optional<User> findById(UUID id);

    boolean existsByEmailIgnoreCase(String email);

    @EntityGraph(attributePaths = {"manager"})
    List<User> findByRoleOrderByNameAsc(Role role);

    @EntityGraph(attributePaths = {"manager"})
    List<User> findAllByOrderByNameAsc();
}
