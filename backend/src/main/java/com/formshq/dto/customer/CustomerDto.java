package com.formshq.dto.customer;

import com.formshq.domain.entity.Customer;

import java.io.Serializable;
import java.util.UUID;

public record CustomerDto(
        UUID id,
        String phone,
        String saleDate,
        String name,
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
        String earlyPortability,
        String protocol
) implements Serializable {
    public static CustomerDto fromEntity(Customer customer) {
        if (customer == null) return null;
        return new CustomerDto(
                customer.getId(),
                customer.getPhone(),
                customer.getSaleDate() != null ? customer.getSaleDate() : "28/10/2026",
                customer.getName(),
                customer.getDocument(),
                customer.getBirthDate() != null ? customer.getBirthDate() : "14/05/1985",
                customer.getMotherName() != null ? customer.getMotherName() : "Helena Almeida Prado",
                customer.getFatherName() != null ? customer.getFatherName() : "Não informado",
                customer.getContractedPlan() != null ? customer.getContractedPlan() : "Fibra Empresarial 600 Mega + Pós 50GB",
                customer.getProposal() != null ? customer.getProposal() : "PROP-2026-88412",
                customer.getEmail(),
                customer.getPaymentMethod() != null ? customer.getPaymentMethod() : "Débito Automático",
                customer.getInvoiceType() != null ? customer.getInvoiceType() : "Fatura Digital (E-mail / WhatsApp)",
                customer.getFullAddress() != null ? customer.getFullAddress() : "Av. Paulista, 1578 - Bela Vista, São Paulo - SP",
                customer.getDueDate() != null ? customer.getDueDate() : "Todo dia 10",
                customer.getEarlyPortability() != null ? customer.getEarlyPortability() : "Sim (Portabilidade Autorizada)",
                customer.getProtocol()
        );
    }
}
