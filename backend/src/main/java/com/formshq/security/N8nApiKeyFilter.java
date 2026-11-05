package com.formshq.security;

import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.lang.NonNull;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Map;

@Component
public class N8nApiKeyFilter extends OncePerRequestFilter {

    public static final String API_KEY_HEADER = "X-API-KEY";
    private static final String N8N_PATH_PREFIX = "/api/v1/integrations/n8n";
    private static final String DIRECTUS_PATH_PREFIX = "/api/v1/integrations/directus";

    private final String expectedApiKey;
    private final String directusApiToken;
    private final ObjectMapper objectMapper;

    public N8nApiKeyFilter(
            @Value("${app.security.n8n-api-key}") String expectedApiKey,
            @Value("${app.integrations.directus.api-token:${DIRECTUS_API_TOKEN:}}") String directusApiToken,
            ObjectMapper objectMapper
    ) {
        this.expectedApiKey = expectedApiKey;
        this.directusApiToken = directusApiToken;
        this.objectMapper = objectMapper;
    }

    private String resolveStaticToken(HttpServletRequest request) {
        String providedKey = request.getHeader(API_KEY_HEADER);
        if (providedKey != null && !providedKey.isBlank()) {
            return providedKey.trim();
        }
        String authHeader = request.getHeader("Authorization");
        if (authHeader != null && authHeader.startsWith("Bearer ")) {
            String token = authHeader.substring(7).trim();
            // Tokens estáticos de integração (n8n / Directus) não possuem estrutura JWT de 3 partes separadas por ponto
            if (!token.isEmpty() && !token.contains(".")) {
                return token;
            }
        }
        return null;
    }

    @Override
    protected boolean shouldNotFilter(@NonNull HttpServletRequest request) {
        if ("OPTIONS".equalsIgnoreCase(request.getMethod())) {
            return true;
        }
        String path = request.getServletPath();
        if (path == null || path.isEmpty()) {
            path = request.getRequestURI();
        }
        if (path.startsWith(N8N_PATH_PREFIX)) {
            return false;
        }
        if (path.startsWith(DIRECTUS_PATH_PREFIX)) {
            String token = resolveStaticToken(request);
            return token == null || token.isBlank();
        }
        return true;
    }

    @Override
    protected void doFilterInternal(
            @NonNull HttpServletRequest request,
            @NonNull HttpServletResponse response,
            @NonNull FilterChain filterChain
    ) throws ServletException, IOException {
        String providedKey = resolveStaticToken(request);
        boolean matchesN8nKey = providedKey != null && constantTimeEquals(expectedApiKey, providedKey);
        boolean matchesDirectusToken = providedKey != null
                && directusApiToken != null
                && !directusApiToken.isBlank()
                && constantTimeEquals(directusApiToken.trim(), providedKey);

        if (!matchesN8nKey && !matchesDirectusToken) {
            response.setStatus(HttpStatus.UNAUTHORIZED.value());
            response.setContentType(MediaType.APPLICATION_JSON_VALUE);
            response.setCharacterEncoding(StandardCharsets.UTF_8.name());

            Map<String, Object> errorBody = Map.of(
                    "status", HttpStatus.UNAUTHORIZED.value(),
                    "error", "Unauthorized",
                    "message", "Header X-API-KEY ausente ou inválido para integração.",
                    "path", request.getRequestURI(),
                    "timestamp", OffsetDateTime.now().toString()
            );
            response.getWriter().write(objectMapper.writeValueAsString(errorBody));
            return;
        }

        UsernamePasswordAuthenticationToken authentication = new UsernamePasswordAuthenticationToken(
                "n8n-integration-agent",
                null,
                List.of(
                        new SimpleGrantedAuthority("ROLE_N8N_INTEGRATION"),
                        new SimpleGrantedAuthority("ROLE_GESTOR")
                )
        );
        SecurityContextHolder.getContext().setAuthentication(authentication);

        filterChain.doFilter(request, response);
    }

    private boolean constantTimeEquals(String a, String b) {
        return MessageDigest.isEqual(
                a.getBytes(StandardCharsets.UTF_8),
                b.getBytes(StandardCharsets.UTF_8)
        );
    }
}
