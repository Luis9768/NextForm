package com.formshq.dto.customer;

import jakarta.validation.constraints.NotBlank;

public record CustomerSaveRequest(
        String phone,
        String saleDate,

        @NotBlank(message = "O nome do cliente é obrigatório")
        String name,

        @NotBlank(message = "O CPF do cliente é obrigatório")
        String document,

        String birthDate,
        String motherName,
        String fatherName,
        String contractedPlan,
        String proposal,
        String email,
        String paymentMethod,
        String invoiceType,
        String fullAddress,
        String dueDate,
        String earlyPortability
) {}
