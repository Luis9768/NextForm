package com.formshq.controller;

import com.formshq.domain.enums.CallStatus;
import com.formshq.dto.call.CallRecordResponse;
import com.formshq.security.UserPrincipal;
import com.formshq.service.CallRecordService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/v1/calls")
@RequiredArgsConstructor
@Tag(name = "Ligações", description = "Consulta e upload manual de ligações gravadas")
public class CallRecordController {

    private final CallRecordService callRecordService;

    @GetMapping
    @Operation(summary = "Lista ligações (Gestor vê todas; Analista vê apenas as próprias)")
    public ResponseEntity<List<CallRecordResponse>> listCalls(
            @AuthenticationPrincipal UserPrincipal currentUser,
            @RequestParam(required = false) CallStatus status,
            @RequestParam(required = false) UUID analystId
    ) {
        return ResponseEntity.ok(callRecordService.listCalls(currentUser, status, analystId));
    }

    @GetMapping("/{id}")
    @Operation(summary = "Busca detalhes de uma ligação por ID")
    public ResponseEntity<CallRecordResponse> getCallById(
            @PathVariable UUID id,
            @AuthenticationPrincipal UserPrincipal currentUser
    ) {
        return ResponseEntity.ok(callRecordService.getCallById(id, currentUser));
    }

    @PostMapping(value = "/upload", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    @PreAuthorize("hasAuthority('ROLE_GESTOR')")
    @Operation(summary = "Anexa um ou mais arquivos de áudio de ligações baixadas pela gestora e vincula à analista e cliente/ticket")
    public ResponseEntity<CallRecordResponse> uploadCallRecording(
            @RequestPart(value = "file", required = false) MultipartFile file,
            @RequestPart(value = "files", required = false) List<MultipartFile> files,
            @RequestParam("analystId") UUID analystId,
            @RequestParam("customerPhone") String customerPhone,
            @RequestParam(value = "customerName", required = false) String customerName,
            @RequestParam(value = "campaign", required = false) String campaign,
            @RequestParam(value = "durationSeconds", required = false) Integer durationSeconds,
            @RequestParam(value = "durations", required = false) List<Integer> durations,
            @RequestParam(value = "ticket", required = false) String ticket,
            @RequestParam(value = "attendanceDate", required = false) String attendanceDate,
            @RequestParam(value = "monitoringDate", required = false) String monitoringDate,
            @RequestParam(value = "sector", required = false) String sector
    ) {
        CallRecordResponse created = callRecordService.uploadCallWithAudioFiles(
                file,
                files,
                analystId,
                customerPhone,
                customerName,
                campaign,
                durationSeconds,
                durations,
                ticket,
                attendanceDate,
                monitoringDate,
                sector
        );
        return ResponseEntity.status(HttpStatus.CREATED).body(created);
    }

    @PatchMapping("/by-external/{externalCallId}/duration")
    @Operation(summary = "Atualiza a duração real detectada pelo player de áudio na gravação")
    public ResponseEntity<Void> updateDetectedDuration(
            @PathVariable String externalCallId,
            @RequestParam("durationSeconds") int durationSeconds
    ) {
        callRecordService.updateCallDurationByExternalId(externalCallId, durationSeconds);
        return ResponseEntity.noContent().build();
    }
}
