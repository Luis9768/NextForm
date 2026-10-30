package com.formshq.repository;

import com.formshq.domain.entity.Sector;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Repository
public interface SectorRepository extends JpaRepository<Sector, UUID> {

    List<Sector> findAllByOrderByNameAsc();

    List<Sector> findByActiveTrueOrderByNameAsc();

    Optional<Sector> findByNameIgnoreCase(String name);

    boolean existsByNameIgnoreCase(String name);
}
