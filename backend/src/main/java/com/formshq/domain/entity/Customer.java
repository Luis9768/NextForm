package com.formshq.domain.entity;

import jakarta.persistence.*;
import lombok.*;

import java.time.OffsetDateTime;
import java.util.UUID;

@Entity
@Table(name = "customers")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class Customer {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(nullable = false, unique = true, length = 40)
    private String phone;

    @Column(name = "sale_date", length = 60)
    private String saleDate;

    @Column(nullable = false, length = 180)
    private String name;

    @Column(nullable = false, length = 40)
    private String document;

    @Column(name = "birth_date", length = 40)
    private String birthDate;

    @Column(name = "mother_name", length = 180)
    private String motherName;

    @Column(name = "father_name", length = 180)
    private String fatherName;

    @Column(name = "contracted_plan", length = 150)
    private String contractedPlan;

    @Column(length = 100)
    private String proposal;

    @Column(length = 180)
    private String email;

    @Column(name = "payment_method", length = 100)
    private String paymentMethod;

    @Column(name = "invoice_type", length = 100)
    private String invoiceType;

    @Column(name = "full_address", length = 350)
    private String fullAddress;

    @Column(name = "due_date", length = 60)
    private String dueDate;

    @Column(name = "early_portability", length = 60)
    private String earlyPortability;

    @Column(length = 80)
    private String protocol;

    @Column(name = "created_at", nullable = false)
    private OffsetDateTime createdAt;

    @Column(name = "updated_at", nullable = false)
    private OffsetDateTime updatedAt;

    @PrePersist
    protected void onCreate() {
        OffsetDateTime now = OffsetDateTime.now();
        if (this.createdAt == null) {
            this.createdAt = now;
        }
        this.updatedAt = now;
    }

    @PreUpdate
    protected void onUpdate() {
        this.updatedAt = OffsetDateTime.now();
    }
}
