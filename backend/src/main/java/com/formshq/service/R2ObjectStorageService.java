package com.formshq.service;

import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Duration;
import java.time.ZoneOffset;
import java.time.ZonedDateTime;
import java.time.format.DateTimeFormatter;
import java.util.HexFormat;
import java.util.Optional;

/**
 * Adapter S3-Compatible (Hexagonal Port/Adapter) para armazenamento e leitura de gravações de áudio
 * no Cloudflare R2 utilizando assinatura AWS Signature V4 (AWS4-HMAC-SHA256) nativa em Java 21.
 */
@Slf4j
@Service
public class R2ObjectStorageService {

    private static final DateTimeFormatter AMZ_DATE_FORMAT =
            DateTimeFormatter.ofPattern("yyyyMMdd'T'HHmmss'Z'").withZone(ZoneOffset.UTC);
    private static final DateTimeFormatter DATE_STAMP_FORMAT =
            DateTimeFormatter.ofPattern("yyyyMMdd").withZone(ZoneOffset.UTC);

    private final String endpoint;
    private final String bucket;
    private final String accessKeyId;
    private final String secretAccessKey;
    private final String region;
    private final String publicBaseUrl;
    private final HttpClient httpClient;

    public R2ObjectStorageService(
            @Value("${app.storage.r2.endpoint:${R2_ENDPOINT:}}") String endpoint,
            @Value("${app.storage.r2.bucket:${R2_BUCKET:}}") String bucket,
            @Value("${app.storage.r2.access-key-id:${R2_ACCESS_KEY_ID:}}") String accessKeyId,
            @Value("${app.storage.r2.secret-access-key:${R2_SECRET_ACCESS_KEY:}}") String secretAccessKey,
            @Value("${app.storage.r2.region:${R2_REGION:auto}}") String region,
            @Value("${app.storage.r2.public-url:${R2_PUBLIC_URL:}}") String publicBaseUrl
    ) {
        this.endpoint = endpoint != null ? endpoint.trim().replaceAll("/+$", "") : "";
        this.bucket = bucket != null ? bucket.trim() : "";
        this.accessKeyId = accessKeyId != null ? accessKeyId.trim() : "";
        this.secretAccessKey = secretAccessKey != null ? secretAccessKey.trim() : "";
        this.region = (region != null && !region.isBlank()) ? region.trim() : "auto";
        this.publicBaseUrl = publicBaseUrl != null ? publicBaseUrl.trim().replaceAll("/+$", "") : "";
        this.httpClient = HttpClient.newBuilder()
                .connectTimeout(Duration.ofSeconds(15))
                .build();
    }

    public boolean isConfigured() {
        return !endpoint.isEmpty()
                && !bucket.isEmpty()
                && !accessKeyId.isEmpty()
                && !secretAccessKey.isEmpty();
    }

    /**
     * Faz upload de um arquivo de áudio para o bucket do Cloudflare R2 via PUT S3 assinado (AWS4-HMAC-SHA256).
     */
    public boolean uploadAudioObject(String objectKey, byte[] data, String contentType) {
        if (!isConfigured() || objectKey == null || objectKey.isBlank() || data == null || data.length == 0) {
            return false;
        }
        try {
            String safeKey = sanitizeKey(objectKey);
            String canonicalUri = "/" + encodeUriSegment(bucket) + "/" + encodeUriSegment(safeKey);
            URI targetUri = URI.create(endpoint + canonicalUri);
            String host = targetUri.getHost() + (targetUri.getPort() > 0 ? ":" + targetUri.getPort() : "");

            ZonedDateTime now = ZonedDateTime.now(ZoneOffset.UTC);
            String amzDate = AMZ_DATE_FORMAT.format(now);
            String dateStamp = DATE_STAMP_FORMAT.format(now);
            String payloadHash = sha256Hex(data);

            String authorization = buildAwsV4AuthorizationHeader(
                    "PUT",
                    canonicalUri,
                    "",
                    host,
                    amzDate,
                    dateStamp,
                    payloadHash
            );

            HttpRequest request = HttpRequest.newBuilder()
                    .uri(targetUri)
                    .timeout(Duration.ofSeconds(45))
                    .header("x-amz-date", amzDate)
                    .header("x-amz-content-sha256", payloadHash)
                    .header("Authorization", authorization)
                    .header("Content-Type", contentType != null ? contentType : "audio/mpeg")
                    .PUT(HttpRequest.BodyPublishers.ofByteArray(data))
                    .build();

            HttpResponse<Void> response = httpClient.send(request, HttpResponse.BodyHandlers.discarding());
            if (response.statusCode() >= 200 && response.statusCode() < 300) {
                log.info("Áudio armazenado com sucesso no Cloudflare R2: bucket={}, key={}, bytes={}",
                        bucket, safeKey, data.length);
                return true;
            }
            log.warn("Resposta inesperada ao enviar áudio para Cloudflare R2 (status={}): key={}",
                    response.statusCode(), safeKey);
        } catch (Exception e) {
            log.warn("Falha ao enviar áudio '{}' para o Cloudflare R2: {}", objectKey, e.getMessage());
        }
        return false;
    }

    /**
     * Baixa um arquivo de áudio do bucket do Cloudflare R2 via GET S3 assinado (AWS4-HMAC-SHA256).
     */
    public Optional<byte[]> downloadAudioObject(String objectKey) {
        if (!isConfigured() || objectKey == null || objectKey.isBlank()) {
            return Optional.empty();
        }
        try {
            String safeKey = sanitizeKey(objectKey);
            String canonicalUri = "/" + encodeUriSegment(bucket) + "/" + encodeUriSegment(safeKey);
            URI targetUri = URI.create(endpoint + canonicalUri);
            String host = targetUri.getHost() + (targetUri.getPort() > 0 ? ":" + targetUri.getPort() : "");

            ZonedDateTime now = ZonedDateTime.now(ZoneOffset.UTC);
            String amzDate = AMZ_DATE_FORMAT.format(now);
            String dateStamp = DATE_STAMP_FORMAT.format(now);
            String emptyPayloadHash = sha256Hex(new byte[0]);

            String authorization = buildAwsV4AuthorizationHeader(
                    "GET",
                    canonicalUri,
                    "",
                    host,
                    amzDate,
                    dateStamp,
                    emptyPayloadHash
            );

            HttpRequest request = HttpRequest.newBuilder()
                    .uri(targetUri)
                    .timeout(Duration.ofSeconds(30))
                    .header("x-amz-date", amzDate)
                    .header("x-amz-content-sha256", emptyPayloadHash)
                    .header("Authorization", authorization)
                    .GET()
                    .build();

            HttpResponse<byte[]> response = httpClient.send(request, HttpResponse.BodyHandlers.ofByteArray());
            if (response.statusCode() == 200 && response.body() != null && response.body().length > 0) {
                log.info("Áudio recuperado com sucesso do Cloudflare R2: bucket={}, key={}, bytes={}",
                        bucket, safeKey, response.body().length);
                return Optional.of(response.body());
            }
            log.warn("Não foi possível recuperar áudio do Cloudflare R2 (status={}): bucket={}, key={}",
                    response.statusCode(), bucket, safeKey);
        } catch (Exception e) {
            log.warn("Erro ao baixar áudio '{}' do Cloudflare R2: {}", objectKey, e.getMessage());
        }
        return Optional.empty();
    }

    /**
     * Gera uma URL pré-assinada (AWS Signature V4 Query Auth) para leitura direta do objeto no Cloudflare R2,
     * funcionando mesmo quando R2_PUBLIC_URL não está configurada e o bucket é privado.
     */
    public Optional<String> generatePresignedGetUrl(String objectKey, int expirationSeconds) {
        if (!isConfigured() || objectKey == null || objectKey.isBlank()) {
            return Optional.empty();
        }
        try {
            String safeKey = sanitizeKey(objectKey);
            String canonicalUri = "/" + encodeUriSegment(bucket) + "/" + encodeUriSegment(safeKey);
            URI targetUri = URI.create(endpoint + canonicalUri);
            String host = targetUri.getHost() + (targetUri.getPort() > 0 ? ":" + targetUri.getPort() : "");

            ZonedDateTime now = ZonedDateTime.now(ZoneOffset.UTC);
            String amzDate = AMZ_DATE_FORMAT.format(now);
            String dateStamp = DATE_STAMP_FORMAT.format(now);
            String credentialScope = dateStamp + "/" + region + "/s3/aws4_request";
            String credential = accessKeyId + "/" + credentialScope;

            String canonicalQueryString = "X-Amz-Algorithm=AWS4-HMAC-SHA256"
                    + "&X-Amz-Credential=" + encodeUriSegment(credential)
                    + "&X-Amz-Date=" + amzDate
                    + "&X-Amz-Expires=" + Math.max(60, Math.min(expirationSeconds, 604800))
                    + "&X-Amz-SignedHeaders=host";

            String canonicalHeaders = "host:" + host.toLowerCase() + "\n";
            String signedHeaders = "host";
            String payloadHash = "UNSIGNED-PAYLOAD";

            String canonicalRequest = "GET\n"
                    + canonicalUri + "\n"
                    + canonicalQueryString + "\n"
                    + canonicalHeaders + "\n"
                    + signedHeaders + "\n"
                    + payloadHash;

            String stringToSign = "AWS4-HMAC-SHA256\n"
                    + amzDate + "\n"
                    + credentialScope + "\n"
                    + sha256Hex(canonicalRequest.getBytes(StandardCharsets.UTF_8));

            byte[] signingKey = getSignatureKey(secretAccessKey, dateStamp, region, "s3");
            String signature = HexFormat.of().formatHex(hmacSha256(signingKey, stringToSign));

            String presignedUrl = endpoint + canonicalUri + "?" + canonicalQueryString + "&X-Amz-Signature=" + signature;
            return Optional.of(presignedUrl);
        } catch (Exception e) {
            log.warn("Falha ao gerar URL pré-assinada do R2 para '{}': {}", objectKey, e.getMessage());
            return Optional.empty();
        }
    }

    public String resolveStoredAudioUrl(String fileName) {
        if (!publicBaseUrl.isEmpty() && isConfigured()) {
            return publicBaseUrl + "/" + sanitizeKey(fileName);
        }
        return "/api/v1/audio/files/" + sanitizeKey(fileName);
    }

    private String buildAwsV4AuthorizationHeader(
            String httpMethod,
            String canonicalUri,
            String canonicalQueryString,
            String host,
            String amzDate,
            String dateStamp,
            String payloadHash
    ) throws Exception {
        String canonicalHeaders = "host:" + host.toLowerCase() + "\n"
                + "x-amz-content-sha256:" + payloadHash + "\n"
                + "x-amz-date:" + amzDate + "\n";
        String signedHeaders = "host;x-amz-content-sha256;x-amz-date";

        String canonicalRequest = httpMethod + "\n"
                + canonicalUri + "\n"
                + canonicalQueryString + "\n"
                + canonicalHeaders + "\n"
                + signedHeaders + "\n"
                + payloadHash;

        String credentialScope = dateStamp + "/" + region + "/s3/aws4_request";
        String stringToSign = "AWS4-HMAC-SHA256\n"
                + amzDate + "\n"
                + credentialScope + "\n"
                + sha256Hex(canonicalRequest.getBytes(StandardCharsets.UTF_8));

        byte[] signingKey = getSignatureKey(secretAccessKey, dateStamp, region, "s3");
        String signature = HexFormat.of().formatHex(hmacSha256(signingKey, stringToSign));

        return "AWS4-HMAC-SHA256 Credential=" + accessKeyId + "/" + credentialScope
                + ", SignedHeaders=" + signedHeaders
                + ", Signature=" + signature;
    }

    private static byte[] hmacSha256(byte[] key, String data) throws Exception {
        Mac mac = Mac.getInstance("HmacSHA256");
        mac.init(new SecretKeySpec(key, "HmacSHA256"));
        return mac.doFinal(data.getBytes(StandardCharsets.UTF_8));
    }

    private static byte[] getSignatureKey(String key, String dateStamp, String regionName, String serviceName) throws Exception {
        byte[] kSecret = ("AWS4" + key).getBytes(StandardCharsets.UTF_8);
        byte[] kDate = hmacSha256(kSecret, dateStamp);
        byte[] kRegion = hmacSha256(kDate, regionName);
        byte[] kService = hmacSha256(kRegion, serviceName);
        return hmacSha256(kService, "aws4_request");
    }

    private static String sha256Hex(byte[] data) throws Exception {
        MessageDigest digest = MessageDigest.getInstance("SHA-256");
        return HexFormat.of().formatHex(digest.digest(data));
    }

    private static String sanitizeKey(String key) {
        return key.trim().replaceAll("[^a-zA-Z0-9._-]", "_");
    }

    private static String encodeUriSegment(String segment) {
        return URLEncoder.encode(segment, StandardCharsets.UTF_8)
                .replace("+", "%20")
                .replace("%2F", "/");
    }
}
