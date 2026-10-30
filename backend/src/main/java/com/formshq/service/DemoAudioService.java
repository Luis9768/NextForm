package com.formshq.service;

import com.formshq.exception.BusinessRuleException;
import org.springframework.stereotype.Service;

import java.io.ByteArrayOutputStream;
import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.Arrays;

/**
 * Serviço responsável pela geração sintética de áudio WAV, leitura segura de arquivos de áudio
 * enviados pela gestão (com prevenção contra Path Traversal) e fatiamento HTTP Range (RFC 7233).
 */
@Service
public class DemoAudioService {

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

    public AudioStreamSlice resolveUploadedFileAudioSlice(String fileName, String rangeHeader) {
        if (fileName == null || fileName.isBlank() || fileName.contains("..") || fileName.contains("/") || fileName.contains("\\")) {
            throw new BusinessRuleException("Nome de arquivo de áudio inválido.");
        }

        try {
            Path uploadDir = Paths.get("./data/uploads").toAbsolutePath().normalize();
            Path filePath = uploadDir.resolve(fileName).normalize();
            if (!filePath.startsWith(uploadDir) || !Files.exists(filePath)) {
                byte[] fallbackWav = generateSimulatedCallWav(fileName, 25);
                return sliceBytesForRange(fallbackWav, "audio/wav", rangeHeader);
            }

            byte[] fileBytes = Files.readAllBytes(filePath);
            String lower = fileName.toLowerCase();
            String contentType = lower.endsWith(".mp3")
                    ? "audio/mpeg"
                    : lower.endsWith(".ogg")
                    ? "audio/ogg"
                    : lower.endsWith(".m4a")
                    ? "audio/mp4"
                    : "audio/wav";

            return sliceBytesForRange(fileBytes, contentType, rangeHeader);
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
        int seed = seedKey != null ? Math.abs(seedKey.hashCode()) : 42;

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
