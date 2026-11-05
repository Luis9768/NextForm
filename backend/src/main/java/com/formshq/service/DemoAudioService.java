package com.formshq.service;

import com.formshq.exception.BusinessRuleException;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClient;

import java.io.ByteArrayOutputStream;
import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.nio.channels.SeekableByteChannel;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.nio.file.StandardOpenOption;
import java.util.Arrays;

/**
 * Serviço responsável pela geração sintética de áudio WAV, leitura segura por chunks (SeekableByteChannel)
 * de arquivos de áudio enviados pela gestão ou sincronizados do Directus (/assets/{fileId}) e suporte HTTP Range (RFC 7233).
 */
@Slf4j
@Service
public class DemoAudioService {

    private static final int MAX_RANGE_CHUNK_BYTES = 2 * 1024 * 1024; // 2 MB por fatia Range

    private final String directusBaseUrl;
    private final String directusApiToken;
    private final R2ObjectStorageService r2ObjectStorageService;

    public DemoAudioService(
            @Value("${app.integrations.directus.base-url:${DIRECTUS_BASE_URL:}}") String directusBaseUrl,
            @Value("${app.integrations.directus.api-token:${DIRECTUS_API_TOKEN:}}") String directusApiToken,
            R2ObjectStorageService r2ObjectStorageService
    ) {
        this.directusBaseUrl = directusBaseUrl;
        this.directusApiToken = directusApiToken;
        this.r2ObjectStorageService = r2ObjectStorageService;
    }

    public record AudioStreamSlice(
            byte[] data,
            String contentType,
            int totalLength,
            int start,
            int end,
            boolean partial,
            boolean unsatisfiable
    ) {}

    public AudioStreamSlice resolveSynthesizedAudioSlice(String callIdentifier, int durationSeconds, String rangeHeader) {
        byte[] fullWav = generateSimulatedCallWav(callIdentifier, durationSeconds);
        return sliceBytesForRange(fullWav, "audio/wav", rangeHeader);
    }

    public AudioStreamSlice resolveDirectusAssetAudioSlice(String fileId, String rangeHeader) {
        if (fileId == null || !fileId.matches("^[a-zA-Z0-9._-]+$")) {
            throw new BusinessRuleException("ID de arquivo de áudio do Directus inválido.");
        }

        try {
            Path uploadDir = Paths.get("./data/uploads").toAbsolutePath().normalize();
            Files.createDirectories(uploadDir);

            String cachedMp3 = "directus_" + fileId + ".mp3";
            String cachedWav = "directus_" + fileId + ".wav";

            if (Files.exists(uploadDir.resolve(cachedMp3))) {
                return resolveUploadedFileAudioSlice(cachedMp3, rangeHeader);
            }
            if (Files.exists(uploadDir.resolve(cachedWav))) {
                return resolveUploadedFileAudioSlice(cachedWav, rangeHeader);
            }

            // Verifica se já está salvo no Cloudflare R2
            if (r2ObjectStorageService.isConfigured()) {
                var r2Mp3 = r2ObjectStorageService.downloadAudioObject(cachedMp3);
                if (r2Mp3.isPresent()) {
                    Files.write(uploadDir.resolve(cachedMp3), r2Mp3.get());
                    return resolveUploadedFileAudioSlice(cachedMp3, rangeHeader);
                }
                var r2Wav = r2ObjectStorageService.downloadAudioObject(cachedWav);
                if (r2Wav.isPresent()) {
                    Files.write(uploadDir.resolve(cachedWav), r2Wav.get());
                    return resolveUploadedFileAudioSlice(cachedWav, rangeHeader);
                }
            }

            if (directusBaseUrl != null && !directusBaseUrl.isBlank()) {
                String cleanBase = directusBaseUrl.trim().replaceAll("/+$", "");
                RestClient.Builder builder = RestClient.builder().baseUrl(cleanBase);
                if (directusApiToken != null && !directusApiToken.isBlank()) {
                    builder.defaultHeader(HttpHeaders.AUTHORIZATION, "Bearer " + directusApiToken.trim());
                }
                ResponseEntity<byte[]> assetRes = builder.build()
                        .get()
                        .uri("/assets/{id}", fileId)
                        .retrieve()
                        .toEntity(byte[].class);

                byte[] body = assetRes.getBody();
                if (body != null && body.length > 0) {
                    String ct = assetRes.getHeaders().getFirst(HttpHeaders.CONTENT_TYPE);
                    boolean isWav = ct != null && ct.toLowerCase().contains("wav");
                    String targetFileName = isWav ? cachedWav : cachedMp3;
                    Files.write(uploadDir.resolve(targetFileName), body);

                    // Faz backup automático do áudio no Cloudflare R2 quando configurado
                    r2ObjectStorageService.uploadAudioObject(
                            targetFileName,
                            body,
                            isWav ? "audio/wav" : "audio/mpeg"
                    );
                    return resolveUploadedFileAudioSlice(targetFileName, rangeHeader);
                }
            }
        } catch (Exception e) {
            log.warn("Não foi possível baixar o áudio real {} do Directus ({}). Usando fallback sintético.", fileId, e.getMessage());
        }

        return resolveSynthesizedAudioSlice(fileId, 32, rangeHeader);
    }

    public AudioStreamSlice resolveUploadedFileAudioSlice(String fileName, String rangeHeader) {
        if (fileName == null || fileName.isBlank() || fileName.contains("..") || fileName.contains("/") || fileName.contains("\\")) {
            throw new BusinessRuleException("Nome de arquivo de áudio inválido.");
        }

        try {
            Path uploadDir = Paths.get("./data/uploads").toAbsolutePath().normalize();
            Files.createDirectories(uploadDir);
            Path filePath = uploadDir.resolve(fileName).normalize();

            if (filePath.startsWith(uploadDir) && !Files.exists(filePath) && r2ObjectStorageService.isConfigured()) {
                var r2Data = r2ObjectStorageService.downloadAudioObject(fileName);
                if (r2Data.isPresent()) {
                    Files.write(filePath, r2Data.get());
                }
            }

            if (!filePath.startsWith(uploadDir) || !Files.exists(filePath)) {
                byte[] fallbackWav = generateSimulatedCallWav(fileName, 25);
                return sliceBytesForRange(fallbackWav, "audio/wav", rangeHeader);
            }

            long fileSizeLong = Files.size(filePath);
            int totalLength = (int) Math.min(fileSizeLong, Integer.MAX_VALUE);
            String lower = fileName.toLowerCase();
            String contentType = lower.endsWith(".mp3")
                    ? "audio/mpeg"
                    : lower.endsWith(".ogg")
                    ? "audio/ogg"
                    : lower.endsWith(".m4a")
                    ? "audio/mp4"
                    : "audio/wav";

            if (totalLength == 0) {
                byte[] fallbackWav = generateSimulatedCallWav(fileName, 25);
                return sliceBytesForRange(fallbackWav, "audio/wav", rangeHeader);
            }

            boolean isPartial = rangeHeader != null && rangeHeader.startsWith("bytes=");
            int start = 0;
            int end = Math.min(totalLength - 1, MAX_RANGE_CHUNK_BYTES - 1);

            if (isPartial) {
                String rangeValue = rangeHeader.substring("bytes=".length());
                String[] parts = rangeValue.split("-");
                start = Integer.parseInt(parts[0]);
                if (parts.length > 1 && !parts[1].isEmpty()) {
                    end = Math.min(Integer.parseInt(parts[1]), totalLength - 1);
                } else {
                    end = Math.min(start + MAX_RANGE_CHUNK_BYTES - 1, totalLength - 1);
                }
                if (start < 0 || start >= totalLength || start > end) {
                    return new AudioStreamSlice(new byte[0], contentType, totalLength, start, end, false, true);
                }
            } else {
                end = Math.min(totalLength - 1, MAX_RANGE_CHUNK_BYTES - 1);
            }

            int sliceLength = end - start + 1;
            ByteBuffer buffer = ByteBuffer.allocate(sliceLength);
            try (SeekableByteChannel channel = Files.newByteChannel(filePath, StandardOpenOption.READ)) {
                channel.position(start);
                while (buffer.hasRemaining() && channel.read(buffer) != -1) {
                    // Lê apenas os bytes necessários da fatia solicitada
                }
            }

            return new AudioStreamSlice(buffer.array(), contentType, totalLength, start, end, isPartial, false);
        } catch (Exception e) {
            byte[] fallbackWav = generateSimulatedCallWav(fileName, 25);
            return sliceBytesForRange(fallbackWav, "audio/wav", rangeHeader);
        }
    }

    public AudioStreamSlice sliceBytesForRange(byte[] fullBytes, String contentType, String rangeHeader) {
        int totalLength = fullBytes.length;

        if (rangeHeader == null || !rangeHeader.startsWith("bytes=")) {
            return new AudioStreamSlice(fullBytes, contentType, totalLength, 0, totalLength - 1, false, false);
        }

        try {
            String rangeValue = rangeHeader.substring("bytes=".length());
            String[] parts = rangeValue.split("-");
            int start = Integer.parseInt(parts[0]);
            int end = (parts.length > 1 && !parts[1].isEmpty())
                    ? Math.min(Integer.parseInt(parts[1]), totalLength - 1)
                    : totalLength - 1;

            if (start < 0 || start >= totalLength || start > end) {
                return new AudioStreamSlice(new byte[0], contentType, totalLength, start, end, false, true);
            }

            byte[] slice = Arrays.copyOfRange(fullBytes, start, end + 1);
            return new AudioStreamSlice(slice, contentType, totalLength, start, end, true, false);
        } catch (Exception e) {
            return new AudioStreamSlice(fullBytes, contentType, totalLength, 0, totalLength - 1, false, false);
        }
    }

    public byte[] generateSimulatedCallWav(String seedKey, int durationSeconds) {
        int clampedDuration = Math.max(8, Math.min(durationSeconds, 45));
        int sampleRate = 8000;
        int numSamples = sampleRate * clampedDuration;
        int dataSize = numSamples * 2;
        int seed = seedKey != null ? (seedKey.hashCode() & 0x7fffffff) : 42;

        ByteArrayOutputStream out = new ByteArrayOutputStream(44 + dataSize);
        ByteBuffer header = ByteBuffer.allocate(44).order(ByteOrder.LITTLE_ENDIAN);

        header.put(new byte[]{'R', 'I', 'F', 'F'});
        header.putInt(36 + dataSize);
        header.put(new byte[]{'W', 'A', 'V', 'E'});

        header.put(new byte[]{'f', 'm', 't', ' '});
        header.putInt(16);
        header.putShort((short) 1);
        header.putShort((short) 1);
        header.putInt(sampleRate);
        header.putInt(sampleRate * 2);
        header.putShort((short) 2);
        header.putShort((short) 16);

        header.put(new byte[]{'d', 'a', 't', 'a'});
        header.putInt(dataSize);

        out.writeBytes(header.array());

        ByteBuffer samples = ByteBuffer.allocate(dataSize).order(ByteOrder.LITTLE_ENDIAN);
        for (int i = 0; i < numSamples; i++) {
            double t = (double) i / sampleRate;
            double cadence = Math.sin(2 * Math.PI * 2.8 * t + (seed % 7)) * Math.sin(2 * Math.PI * 0.45 * t);
            boolean speaking = cadence > -0.15;

            short sampleValue = 0;
            if (speaking) {
                boolean speakerA = Math.sin(2 * Math.PI * 0.18 * t) >= 0;
                double baseFreq = speakerA ? (185.0 + (seed % 30)) : (240.0 + (seed % 25));
                double vibrato = 8.0 * Math.sin(2 * Math.PI * 5.2 * t);
                double f = baseFreq + vibrato;

                double wave = 0.55 * Math.sin(2 * Math.PI * f * t)
                        + 0.25 * Math.sin(2 * Math.PI * (f * 2.0) * t)
                        + 0.12 * Math.sin(2 * Math.PI * (f * 3.0) * t);

                double envelope = Math.min(1.0, Math.abs(cadence) * 1.3);
                sampleValue = (short) (wave * envelope * 9500);
            }
            samples.putShort(sampleValue);
        }

        out.writeBytes(samples.array());
        return out.toByteArray();
    }
}
