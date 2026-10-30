package com.formshq.controller;

import com.formshq.dto.customer.CustomerDto;
import com.formshq.dto.customer.CustomerLookupResponse;
import com.formshq.dto.customer.CustomerSaveRequest;
import com.formshq.dto.customer.CustomerWebhookLookupRequest;
import com.formshq.service.CustomerLookupService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.UUID;

@RestController
@RequestMapping("/api/v1/customers")
@RequiredArgsConstructor
@Tag(name = "Busca de Clientes & Webhook (POST)", description = "Integração via Webhook POST para puxar e salvar os 13 campos de dados da venda do cliente")
public class CustomerController {

    private final CustomerLookupService customerLookupService;

    @GetMapping("/lookup")
    @PreAuthorize("hasAuthority('ROLE_GESTOR')")
    @Operation(summary = "Busca dados cadastrais do cliente e histórico de gravações pelo número de telefone")
    public ResponseEntity<CustomerLookupResponse> lookupCustomerByPhone(
            @RequestParam("phone") String phone,
            @RequestParam(value = "analystId", required = false) UUID analystId
    ) {
        return ResponseEntity.ok(customerLookupService.lookupByPhone(phone, analystId));
    }

    @PostMapping("/webhook-lookup")
    @PreAuthorize("hasAuthority('ROLE_GESTOR')")
    @Operation(summary = "Aciona o Webhook (POST) enviando o contato para puxar e preencher os 13 campos da venda e do cliente")
    public ResponseEntity<CustomerLookupResponse> triggerWebhookLookup(
            @Valid @RequestBody CustomerWebhookLookupRequest request
    ) {
        return ResponseEntity.ok(customerLookupService.triggerWebhookLookup(request));
    }

    @PutMapping("/{id}")
    @PreAuthorize("hasAuthority('ROLE_GESTOR')")
    @Operation(summary = "Salva e atualiza os 13 campos cadastrais e de venda do cliente para seguir para os próximos passos")
    public ResponseEntity<CustomerDto> saveCustomerData(
            @PathVariable UUID id,
            @Valid @RequestBody CustomerSaveRequest request
    ) {
        return ResponseEntity.ok(customerLookupService.updateCustomerData(id, request));
    }
}
