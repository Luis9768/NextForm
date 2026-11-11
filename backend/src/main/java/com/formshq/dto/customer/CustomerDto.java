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
                customer.getPhone() != null ? customer.getPhone() : "",
                customer.getSaleDate() != null ? customer.getSaleDate() : "",
                customer.getName() != null ? customer.getName() : "",
                customer.getDocument() != null ? customer.getDocument() : "",
                customer.getBirthDate() != null ? customer.getBirthDate() : "",
                customer.getMotherName() != null ? customer.getMotherName() : "",
                customer.getFatherName() != null ? customer.getFatherName() : "",
                customer.getContractedPlan() != null ? customer.getContractedPlan() : "",
                customer.getProposal() != null ? customer.getProposal() : "",
                customer.getEmail() != null ? customer.getEmail() : "",
                customer.getPaymentMethod() != null ? customer.getPaymentMethod() : "",
                customer.getInvoiceType() != null ? customer.getInvoiceType() : "",
                customer.getFullAddress() != null ? customer.getFullAddress() : "",
                customer.getDueDate() != null ? customer.getDueDate() : "",
                customer.getEarlyPortability() != null ? customer.getEarlyPortability() : "",
                customer.getProtocol() != null ? customer.getProtocol() : ""
        );
    }
}
