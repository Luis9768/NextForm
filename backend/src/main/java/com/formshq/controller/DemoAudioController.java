package com.formshq.controller;

import com.formshq.service.DemoAudioService;
import com.formshq.service.DemoAudioService.AudioStreamSlice;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1/audio")
@RequiredArgsConstructor
@Tag(name = "Streaming de Áudio", description = "Endpoint de streaming de gravações com suporte a HTTP Range")
public class DemoAudioController {

    private final DemoAudioService demoAudioService;

    @GetMapping(value = "/{callIdentifier}.wav", produces = "audio/wav")
    @Operation(summary = "Reproduz o áudio da gravação da ligação com suporte a seek (Range requests)")
    public ResponseEntity<byte[]> streamAudio(
            @PathVariable String callIdentifier,
            @RequestParam(defaultValue = "25") int duration,
            @RequestHeader(value = HttpHeaders.RANGE, required = false) String rangeHeader
    ) {
        AudioStreamSlice slice = demoAudioService.resolveSynthesizedAudioSlice(callIdentifier, duration, rangeHeader);
        return toRangeResponse(slice);
    }

    @GetMapping("/files/{fileName:.+}")
    @Operation(summary = "Reproduz arquivo de áudio anexado pela gestora com suporte a Range requests")
    public ResponseEntity<byte[]> streamUploadedFile(
            @PathVariable String fileName,
            @RequestHeader(value = HttpHeaders.RANGE, required = false) String rangeHeader
    ) {
        AudioStreamSlice slice = demoAudioService.resolveUploadedFileAudioSlice(fileName, rangeHeader);
        return toRangeResponse(slice);
    }

    @GetMapping("/directus/{fileId:.+}")
    @Operation(summary = "Faz proxy e streaming com HTTP Range do arquivo de áudio real armazenado no Directus (/assets/{fileId})")
    public ResponseEntity<byte[]> streamDirectusAsset(
            @PathVariable String fileId,
            @RequestHeader(value = HttpHeaders.RANGE, required = false) String rangeHeader
    ) {
        AudioStreamSlice slice = demoAudioService.resolveDirectusAssetAudioSlice(fileId, rangeHeader);
        return toRangeResponse(slice);
    }

    private ResponseEntity<byte[]> toRangeResponse(AudioStreamSlice slice) {
        HttpHeaders headers = new HttpHeaders();
        headers.set(HttpHeaders.CONTENT_TYPE, slice.contentType());
        headers.set(HttpHeaders.ACCEPT_RANGES, "bytes");
        headers.setCacheControl("public, max-age=3600");

        if (slice.unsatisfiable()) {
            headers.set(HttpHeaders.CONTENT_RANGE, "bytes */" + slice.totalLength());
            return new ResponseEntity<>(HttpStatus.REQUESTED_RANGE_NOT_SATISFIABLE);
        }

        headers.setContentLength(slice.data().length);
        if (slice.partial()) {
            headers.set(
                    HttpHeaders.CONTENT_RANGE,
                    String.format("bytes %d-%d/%d", slice.start(), slice.end(), slice.totalLength())
            );
            return new ResponseEntity<>(slice.data(), headers, HttpStatus.PARTIAL_CONTENT);
        }

        return new ResponseEntity<>(slice.data(), headers, HttpStatus.OK);
    }
}
