package com.formshq.controller;

import com.formshq.dto.call.CallRecordResponse;
import com.formshq.dto.call.N8nCallWebhookRequest;
import com.formshq.service.CallRecordService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1/integrations/n8n")
@RequiredArgsConstructor
@Tag(name = "Integração n8n", description = "Webhook REST seguro para ingestão de ligações do agente n8n")
public class N8nIntegrationController {

    private final CallRecordService callRecordService;

    @PostMapping("/calls")
    @Operation(
            summary = "Recebe nova ligação gravada enviada pelo agente n8n",
            security = @SecurityRequirement(name = "n8nApiKey")
    )
    public ResponseEntity<CallRecordResponse> receiveCallWebhook(
            @Valid @RequestBody N8nCallWebhookRequest request
    ) {
        CallRecordResponse created = callRecordService.ingestFromN8n(request);
        return ResponseEntity.status(HttpStatus.CREATED).body(created);
    }
}
