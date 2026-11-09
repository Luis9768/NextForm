package com.formshq.service;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.formshq.config.CacheConfig;
import com.formshq.domain.entity.*;
import com.formshq.domain.enums.CallStatus;
import com.formshq.domain.enums.EvaluationStatus;
import com.formshq.domain.enums.Role;
import com.formshq.dto.directus.DirectusBatchImportRequest;
import com.formshq.dto.directus.DirectusPullRequest;
import com.formshq.dto.directus.DirectusSyncResultDto;
import com.formshq.dto.directus.DirectusUserSyncResultDto;
import com.formshq.exception.BusinessRuleException;
import com.formshq.repository.*;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.cache.annotation.CacheEvict;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.client.RestClient;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.net.InetAddress;
import java.net.URI;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;
import java.util.*;

@Slf4j
@Service
public class DirectusEvaluationSyncService {

    public static final String COL_SAC = "Monitoria_SAC";
    public static final String COL_RETENCAO = "Monitoria_Retencao";
    public static final String COL_AQUISICAO = "Monitoria_Tim_Aquisicao";

    private static final java.util.regex.Pattern TRANSCRIPT_TIME_PATTERN =
            java.util.regex.Pattern.compile("\\[(\\d{1,2}):(\\d{2})(?::(\\d{2}))?\\]");

    private static final java.util.regex.Pattern ANALYST_INTRO_PATTERN =
            java.util.regex.Pattern.compile("(?:Meu nome é|Me chamo)\\s+([A-ZÀ-Úa-zà-ú]+(?:\\s+[A-ZÀ-Úa-zà-ú]+)?)", java.util.regex.Pattern.CASE_INSENSITIVE);

    private static final Set<String> HEAVY_METADATA_EXCLUDED_KEYS = Set.of(
            "Transcricao", "transcricao", "user_created", "user_updated",
            "Operador", "ligacao", "Ligacao", "Audio_Chamada", "audio_chamada",
            "Audio_Ligacao", "Ligacao_Retorno", "Audio_Ligacao_Retorno", "audio_chamada_retorno"
    );

    private final EvaluationRepository evaluationRepository;
    private final CallRecordRepository callRecordRepository;
    private final EvaluationFormTemplateRepository formTemplateRepository;
    private final UserRepository userRepository;
    private final CustomerRepository customerRepository;
    private final SectorRepository sectorRepository;
    private final SectorTransitionLogRepository sectorTransitionLogRepository;
    private final UserService userService;
    private final PasswordEncoder passwordEncoder;
    private final ObjectMapper objectMapper;
    private final DemoAudioService demoAudioService;

    private final String configuredDirectusBaseUrl;
    private final String configuredDirectusToken;
    private final String bootstrapAdminEmail;

    public DirectusEvaluationSyncService(
            EvaluationRepository evaluationRepository,
            CallRecordRepository callRecordRepository,
            EvaluationFormTemplateRepository formTemplateRepository,
            UserRepository userRepository,
            CustomerRepository customerRepository,
            SectorRepository sectorRepository,
            SectorTransitionLogRepository sectorTransitionLogRepository,
            UserService userService,
            PasswordEncoder passwordEncoder,
            ObjectMapper objectMapper,
            DemoAudioService demoAudioService,
            @Value("${app.integrations.directus.base-url:${DIRECTUS_BASE_URL:}}") String configuredDirectusBaseUrl,
            @Value("${app.integrations.directus.api-token:${DIRECTUS_API_TOKEN:}}") String configuredDirectusToken,
            @Value("${app.security.bootstrap-admin.email:}") String bootstrapAdminEmail
    ) {
        this.evaluationRepository = evaluationRepository;
        this.callRecordRepository = callRecordRepository;
        this.formTemplateRepository = formTemplateRepository;
        this.userRepository = userRepository;
        this.customerRepository = customerRepository;
        this.sectorRepository = sectorRepository;
        this.sectorTransitionLogRepository = sectorTransitionLogRepository;
        this.userService = userService;
        this.passwordEncoder = passwordEncoder;
        this.objectMapper = objectMapper;
        this.demoAudioService = demoAudioService;
        this.configuredDirectusBaseUrl = configuredDirectusBaseUrl;
        this.configuredDirectusToken = configuredDirectusToken;
        this.bootstrapAdminEmail = bootstrapAdminEmail;
    }

    private boolean isCorruptedNov5CallRecord(CallRecord cr) {
        if (cr == null) return false;
        String callDateStr = cr.getCallDate() != null ? cr.getCallDate().toString() : "";
        String audioUrl = cr.getAudioUrl() != null ? cr.getAudioUrl() : "";
        String custName = cr.getCustomer() != null && cr.getCustomer().getName() != null ? cr.getCustomer().getName() : "";
        return callDateStr.startsWith("2026-11-05T18:")
                || callDateStr.startsWith("2026-11-05T19:")
                || "Undefined".equalsIgnoreCase(custName)
                || audioUrl.contains(".wav?duration=")
                || audioUrl.contains("sem-audio-");
    }

    private Map<String, Object> extractSlimAiEvaluationCriteria(Map<String, Object> item) {
        if (item == null || item.isEmpty()) {
            return Map.of();
        }
        Map<String, Object> slim = new LinkedHashMap<>();
        for (Map.Entry<String, Object> entry : item.entrySet()) {
            String k = entry.getKey();
            Object v = entry.getValue();
            if (k == null || v == null || HEAVY_METADATA_EXCLUDED_KEYS.contains(k)) {
                continue;
            }
            if (v instanceof Boolean || v instanceof Number || (v instanceof String s && s.length() <= 4000)) {
                slim.put(k, v);
            }
        }
        return slim;
    }

    /**
     * Repara imediatamente no banco local todas as ligações com duração legada 210s (03:30),
     * compacta metadata_json duplicado e remove registros corrompidos de 05/11 (15:10 e 16:27).
     */
    @Transactional
    @CacheEvict(
            value = {CacheConfig.CACHE_DASHBOARD, CacheConfig.CACHE_EVALUATIONS, CacheConfig.CACHE_CALLS},
            allEntries = true
    )
    @SuppressWarnings("unchecked")
    public void repairLocalDatabaseRecords() {
        List<Evaluation> allEvals = evaluationRepository.findAllSummaryByOrderByEvaluatedAtDesc();
        for (Evaluation ev : allEvals) {
            CallRecord cr = ev.getCallRecord();
            if (isCorruptedNov5CallRecord(cr)) {
                cr.setEvaluation(null);
                callRecordRepository.save(cr);
                evaluationRepository.delete(ev);
            }
        }
        evaluationRepository.flush();

        List<CallRecord> allCalls = callRecordRepository.findAllByOrderByCallDateDesc();
        for (CallRecord cr : allCalls) {
            if (isCorruptedNov5CallRecord(cr)) {
                callRecordRepository.delete(cr);
                continue;
            }

            boolean modified = false;
            Map<String, Object> meta = cr.getMetadata();

            if (cr.getDurationSeconds() == null || cr.getDurationSeconds() == 210) {
                int newDuration = extractCallDurationSeconds(meta != null ? meta : Map.of(), cr.getExternalCallId());
                if (newDuration != 210) {
                    cr.setDurationSeconds(newDuration);
                    modified = true;
                }
            }

            if (meta != null && meta.get("aiEvaluationData") instanceof Map<?, ?> aiMap) {
                if (aiMap.containsKey("Transcricao") || aiMap.containsKey("transcricao") || aiMap.containsKey("user_created")) {
                    Map<String, Object> updatedMeta = new LinkedHashMap<>(meta);
                    updatedMeta.put("aiEvaluationData", extractSlimAiEvaluationCriteria((Map<String, Object>) aiMap));
                    cr.setMetadata(updatedMeta);
                    modified = true;
                }
            }

            if (modified) {
                callRecordRepository.save(cr);
            }
        }
        callRecordRepository.flush();
    }

    /**
     * Faz o download físico das gravações de áudio recentes disponíveis no Directus para o volume persistente
     * local (/app/data/uploads) e para o Cloudflare R2 (quando configurado).
     */
    public Map<String, Object> backupAllDirectusAudios() {
        List<CallRecord> recentCalls = callRecordRepository.findAllByOrderByCallDateDesc().stream()
                .limit(12)
                .toList();
        int totalChecked = 0;
        int backedUpCount = 0;
        int unavailableOnOriginCount = 0;

        for (CallRecord call : recentCalls) {
            String url = call.getAudioUrl();
            if (url != null && url.contains("/api/v1/audio/directus/")) {
                totalChecked++;
                String fileId = url.substring(url.lastIndexOf("/") + 1).trim();
                if (demoAudioService.ensureDirectusAudioBackedUp(fileId)) {
                    backedUpCount++;
                } else {
                    unavailableOnOriginCount++;
                }
            }
        }

        Map<String, Object> summary = new LinkedHashMap<>();
        summary.put("totalChecked", totalChecked);
        summary.put("backedUpCount", backedUpCount);
        summary.put("unavailableOnOriginCount", unavailableOnOriginCount);
        summary.put("syncedAt", OffsetDateTime.now());
        return summary;
    }

    /**
     * Busca todos os usuários reais do Directus (/users?fields=id,first_name,last_name,email,role.*),
     * vincula cada operador/monitor/admin ao seu setor real (Aquisição, SAC ou Cobrança & Retenção),
     * e apaga todos os usuários fictícios, ligações de exemplo, formulários de teste e avaliações locais.
     */
    @Transactional
    @CacheEvict(
            value = {CacheConfig.CACHE_DASHBOARD, CacheConfig.CACHE_EVALUATIONS, CacheConfig.CACHE_CALLS},
            allEntries = true
    )
    @SuppressWarnings("unchecked")
    public DirectusUserSyncResultDto syncUsersAndPurgeFictionalData(String customBaseUrl, String customApiToken) {
        String baseUrl = firstNonBlank(customBaseUrl, configuredDirectusBaseUrl);
        String apiToken = firstNonBlank(customApiToken, configuredDirectusToken);

        if (baseUrl == null || baseUrl.isBlank()) {
            throw new BusinessRuleException("Informe a URL base do Directus.");
        }

        String safeBaseUrl = validateSafeDirectusUrl(baseUrl);
        String normalizedBase = safeBaseUrl.replaceAll("/+$", "");

        RestClient.Builder builder = RestClient.builder()
                .baseUrl(normalizedBase)
                .defaultHeader(HttpHeaders.ACCEPT, MediaType.APPLICATION_JSON_VALUE);
        if (apiToken != null && !apiToken.isBlank()) {
            builder.defaultHeader(HttpHeaders.AUTHORIZATION, "Bearer " + apiToken.trim());
        }
        RestClient client = builder.build();

        // 1. Busca todos os usuários do Directus (/users?fields=id,first_name,last_name,email,role.*&limit=-1)
        String rawUsersJson = client.get()
                .uri(uriBuilder -> uriBuilder
                        .path("/users")
                        .queryParam("fields", "id,first_name,last_name,email,role.*")
                        .queryParam("limit", -1)
                        .build())
                .retrieve()
                .body(String.class);

        List<Map<String, Object>> directusUsers = parseDataArray(rawUsersJson);
        if (directusUsers.isEmpty()) {
            throw new BusinessRuleException("Nenhum usuário retornado pelo endpoint /users do Directus.");
        }

        // 2. Busca contagem de avaliações por Operador em Monitoria_SAC e Monitoria_Retencao para atribuir o setor exato
        Map<String, Integer> sacCountByOpId = fetchOperatorCounts(client, COL_SAC);
        Map<String, Integer> retCountByOpId = fetchOperatorCounts(client, COL_RETENCAO);

        // 3. Primeiro passe: provisiona Administradores e Monitores (Gestores) do Directus
        Set<String> validDirectusEmails = new LinkedHashSet<>();
        if (bootstrapAdminEmail != null && !bootstrapAdminEmail.isBlank()) {
            validDirectusEmails.add(bootstrapAdminEmail.trim().toLowerCase());
        }
        Set<String> seenNormalizedNames = new HashSet<>();
        List<String> managersAndAdminsList = new ArrayList<>();
        Map<String, Integer> usersBySector = new LinkedHashMap<>();
        usersBySector.put("Aquisição", 0);
        usersBySector.put("SAC", 0);
        usersBySector.put("Cobrança & Retenção", 0);
        usersBySector.put("Qualidade & Monitoria", 0);
        usersBySector.put("Diretoria & Governança", 0);

        User primaryAdmin = null;
        User managerAquisicao = null;
        User managerSacRetencao = null;

        for (Map<String, Object> du : directusUsers) {
            String roleName = extractRoleName(du.get("role"));
            if (!"Administrator".equalsIgnoreCase(roleName) && !"Monitor".equalsIgnoreCase(roleName)) {
                continue;
            }
            String fullName = buildFullName(du);
            String normName = fullName.toUpperCase();
            seenNormalizedNames.add(normName);

            String email = resolveDeterministicEmail(du, fullName);
            validDirectusEmails.add(email);

            boolean isMonitorOrQa = "Monitor".equalsIgnoreCase(roleName)
                    || email.equalsIgnoreCase("dheila.kamila@headsetbrasil.com");

            Role targetRole = isMonitorOrQa ? Role.ROLE_GESTOR : Role.ROLE_ADMIN;
            String targetDept = isMonitorOrQa ? "Qualidade & Monitoria" : "Diretoria & Governança";
            String displayName = "Admin User".equalsIgnoreCase(fullName) ? "Victor Felix (Admin)" : fullName;

            User saved = upsertDirectusUser(
                    displayName,
                    email,
                    targetRole,
                    targetDept,
                    "SAC,Cobrança & Retenção,Aquisição",
                    null
            );

            usersBySector.put(targetDept, usersBySector.getOrDefault(targetDept, 0) + 1);
            managersAndAdminsList.add(displayName + " <" + email + "> [" + targetRole.name() + "]");

            if ("victor.felix@headsetbrasil.com".equalsIgnoreCase(email) || primaryAdmin == null) {
                primaryAdmin = saved;
            }
            if ("prisciane.rodrigues@headsetbrasil.com".equalsIgnoreCase(email)) {
                managerAquisicao = saved;
            }
            if ("dheila.kamila@headsetbrasil.com".equalsIgnoreCase(email)) {
                managerSacRetencao = saved;
            }
        }

        if (managerAquisicao == null) managerAquisicao = primaryAdmin;
        if (managerSacRetencao == null) managerSacRetencao = primaryAdmin;

        // 4. Segundo passe: provisiona todos os Operadores nos seus respectivos setores (Aquisição, SAC, Cobrança & Retenção)
        int tieBreaker = 0;
        for (Map<String, Object> du : directusUsers) {
            String roleName = extractRoleName(du.get("role"));
            if ("Administrator".equalsIgnoreCase(roleName) || "Monitor".equalsIgnoreCase(roleName)) {
                continue;
            }

            String fullName = buildFullName(du);
            String normName = fullName.toUpperCase();
            if (seenNormalizedNames.contains(normName)) {
                continue;
            }
            seenNormalizedNames.add(normName);

            String email = resolveDeterministicEmail(du, fullName);
            validDirectusEmails.add(email);

            String directusUserId = extractString(du, "id", "");
            String sector;
            String allowedSectors;
            User manager;

            if (roleName != null && roleName.toLowerCase().contains("aquisicao")) {
                sector = "Aquisição";
                allowedSectors = "Aquisição";
                manager = managerAquisicao;
            } else {
                int sacCount = sacCountByOpId.getOrDefault(directusUserId, 0);
                int retCount = retCountByOpId.getOrDefault(directusUserId, 0);
                if (retCount > sacCount) {
                    sector = "Cobrança & Retenção";
                } else if (sacCount > retCount) {
                    sector = "SAC";
                } else {
                    sector = (tieBreaker++ % 2 == 0) ? "SAC" : "Cobrança & Retenção";
                }
                allowedSectors = "SAC,Cobrança & Retenção";
                manager = managerSacRetencao;
            }

            upsertDirectusUser(
                    fullName,
                    email,
                    Role.ROLE_ANALISTA,
                    sector,
                    allowedSectors,
                    manager
            );
            usersBySector.put(sector, usersBySector.getOrDefault(sector, 0) + 1);
        }

        // 5. Remove apenas avaliações e ligações fictícias de seed (@empresa.com / call_980101..980106),
        // preservando 100% das avaliações reais do Directus E das avaliações criadas pela equipe no NEXFORM!
        int purgedEvaluations = 0;
        int purgedCalls = 0;
        Set<String> legacyDemoCallIds = Set.of(
                "call_980101", "call_980102", "call_980103", "call_980104", "call_980105", "call_980106"
        );

        List<Evaluation> allEvals = evaluationRepository.findAllSummaryByOrderByEvaluatedAtDesc();
        List<User> cachedUsers = new ArrayList<>(userRepository.findAll());
        User fallbackRealAnalyst = userRepository.findByEmailIgnoreCase("bruna.neves@headsetbrasil.com")
                .or(() -> userRepository.findByEmailIgnoreCase("estefany.trindade@headsetbrasil.com"))
                .orElse(primaryAdmin);

        for (Evaluation ev : allEvals) {
            CallRecord cr = ev.getCallRecord();
            String extId = cr != null ? cr.getExternalCallId() : "";
            String analystEmail = ev.getAnalyst() != null && ev.getAnalyst().getEmail() != null
                    ? ev.getAnalyst().getEmail().toLowerCase()
                    : "";
            boolean isFictionalDemoEval = isCorruptedNov5CallRecord(cr)
                    || (extId != null && legacyDemoCallIds.contains(extId))
                    || (analystEmail.endsWith("@empresa.com") && (extId == null || !extId.startsWith("directus_")));

            if (isFictionalDemoEval) {
                if (cr != null) {
                    cr.setEvaluation(null);
                    callRecordRepository.save(cr);
                }
                evaluationRepository.delete(ev);
                purgedEvaluations++;
            } else {
                boolean changed = false;
                if (ev.getAnalyst() != null && (analystEmail.endsWith("@empresa.com") || analystEmail.endsWith("@directus.empresa.com"))) {
                    User matched = findBestMatchingDirectusUser(ev.getAnalyst().getName(), validDirectusEmails, fallbackRealAnalyst, cachedUsers);
                    ev.setAnalyst(matched);
                    if (cr != null) {
                        cr.setAnalyst(matched);
                        callRecordRepository.save(cr);
                    }
                    changed = true;
                }
                if (ev.getEvaluator() != null) {
                    String evalEmail = ev.getEvaluator().getEmail().toLowerCase();
                    if (evalEmail.endsWith("@empresa.com") || evalEmail.endsWith("@directus.empresa.com")) {
                        ev.setEvaluator(primaryAdmin);
                        changed = true;
                    }
                }
                if (changed) {
                    evaluationRepository.save(ev);
                }
            }
        }
        evaluationRepository.flush();

        List<CallRecord> allCalls = callRecordRepository.findAllByOrderByCallDateDesc();
        for (CallRecord cr : allCalls) {
            String extId = cr.getExternalCallId();
            String analystEmail = cr.getAnalyst() != null && cr.getAnalyst().getEmail() != null
                    ? cr.getAnalyst().getEmail().toLowerCase()
                    : "";
            boolean isFictionalDemoCall = isCorruptedNov5CallRecord(cr)
                    || (extId != null && legacyDemoCallIds.contains(extId))
                    || (cr.getEvaluation() == null && analystEmail.endsWith("@empresa.com"));

            if (isFictionalDemoCall) {
                callRecordRepository.delete(cr);
                purgedCalls++;
            } else if (cr.getAnalyst() != null && (analystEmail.endsWith("@empresa.com") || analystEmail.endsWith("@directus.empresa.com"))) {
                User matched = findBestMatchingDirectusUser(cr.getAnalyst().getName(), validDirectusEmails, fallbackRealAnalyst, cachedUsers);
                cr.setAnalyst(matched);
                callRecordRepository.save(cr);
            }
        }
        callRecordRepository.flush();

        // 6. Remove apenas formulários fictícios de seed (preservando matrizes oficiais e novos formulários criados pela gestão)
        int purgedForms = 0;
        Set<String> legacyDemoFormNames = Set.of(
                "monitoria padrão - cobrança e retenção",
                "monitoria express - sac e suporte n1",
                "teste"
        );
        List<EvaluationFormTemplate> allForms = formTemplateRepository.findAll();
        for (EvaluationFormTemplate ft : allForms) {
            String lowerName = ft.getName() != null ? ft.getName().trim().toLowerCase() : "";
            if (legacyDemoFormNames.contains(lowerName) || lowerName.startsWith("avaliacao_call_")) {
                formTemplateRepository.delete(ft);
                purgedForms++;
            } else if (ft.getCreatedBy() != null && ft.getCreatedBy().getEmail().toLowerCase().endsWith("@empresa.com")) {
                ft.setCreatedBy(primaryAdmin);
                formTemplateRepository.save(ft);
            }
        }
        formTemplateRepository.flush();

        // 7. Limpa logs de transição ligados a usuários fictícios e apaga apenas contas fictícias (@empresa.com / @directus.empresa.com)
        for (SectorTransitionLog logItem : sectorTransitionLogRepository.findAll()) {
            String anEmail = logItem.getAnalyst() != null ? logItem.getAnalyst().getEmail().toLowerCase() : "";
            String byEmail = logItem.getChangedBy() != null ? logItem.getChangedBy().getEmail().toLowerCase() : "";
            if (anEmail.endsWith("@empresa.com") || byEmail.endsWith("@empresa.com")
                    || anEmail.endsWith("@directus.empresa.com") || byEmail.endsWith("@directus.empresa.com")) {
                sectorTransitionLogRepository.delete(logItem);
            }
        }
        sectorTransitionLogRepository.flush();

        List<User> allExistingUsers = userRepository.findAll();
        for (User u : allExistingUsers) {
            if (u.getManager() != null) {
                String mgrEmail = u.getManager().getEmail().toLowerCase();
                if (mgrEmail.endsWith("@empresa.com") || mgrEmail.endsWith("@directus.empresa.com")) {
                    u.setManager(primaryAdmin);
                    userRepository.save(u);
                }
            }
        }
        userRepository.flush();

        int purgedUsers = 0;
        for (User u : userRepository.findAll()) {
            String uEmail = u.getEmail().toLowerCase();
            if (uEmail.endsWith("@empresa.com") || uEmail.endsWith("@directus.empresa.com")) {
                userRepository.delete(u);
                purgedUsers++;
            }
        }
        userRepository.flush();

        // 8. Remove clientes fictícios de seed que não possuem nenhuma ligação vinculada
        Set<UUID> usedCustomerIds = new HashSet<>();
        for (CallRecord cr : callRecordRepository.findAll()) {
            if (cr.getCustomer() != null) {
                usedCustomerIds.add(cr.getCustomer().getId());
            }
        }
        Set<String> legacyDemoPhones = Set.of("11999999999", "11988112233", "11977445566", "21999887766");
        for (Customer c : customerRepository.findAll()) {
            if (!usedCustomerIds.contains(c.getId()) && legacyDemoPhones.contains(c.getPhone())) {
                customerRepository.delete(c);
            }
        }
        customerRepository.flush();

        // 9. Remove apenas os setores fictícios de seed (Suporte N1, Retenção & Ouvidoria), preservando novos setores criados pelo Admin
        Set<String> legacyDemoSectors = Set.of("suporte n1", "retenção & ouvidoria");
        int purgedSectors = 0;
        for (Sector sec : sectorRepository.findAll()) {
            if (legacyDemoSectors.contains(sec.getName().trim().toLowerCase())) {
                sectorRepository.delete(sec);
                purgedSectors++;
            }
        }
        sectorRepository.flush();

        return new DirectusUserSyncResultDto(
                "DIRECTUS_USERS_API (" + normalizedBase + "/users)",
                directusUsers.size(),
                validDirectusEmails.size(),
                purgedUsers,
                purgedEvaluations,
                purgedCalls,
                purgedForms,
                purgedSectors,
                usersBySector,
                managersAndAdminsList,
                OffsetDateTime.now()
        );
    }

    /**
     * Puxa uma avaliação específica por ID da API do Directus:
     * GET {baseUrl}/items/{collection}/{itemId}?fields=*.*
     */
    @Transactional
    @CacheEvict(
            value = {CacheConfig.CACHE_DASHBOARD, CacheConfig.CACHE_EVALUATIONS, CacheConfig.CACHE_CALLS},
            allEntries = true
    )
    public DirectusSyncResultDto pullSingleItemFromDirectus(
            String collection,
            String itemId,
            String customBaseUrl,
            String customApiToken
    ) {
        String baseUrl = firstNonBlank(customBaseUrl, configuredDirectusBaseUrl);
        String apiToken = firstNonBlank(customApiToken, configuredDirectusToken);

        if (baseUrl == null || baseUrl.isBlank()) {
            throw new BusinessRuleException("Informe a URL base do Directus (baseUrl ou DIRECTUS_BASE_URL).");
        }

        String safeBaseUrl = validateSafeDirectusUrl(baseUrl);
        String normalizedCollection = detectCollection(collection, Map.of());
        List<String> warnings = new ArrayList<>();

        Map<String, Object> item = fetchSingleItemFromDirectus(safeBaseUrl, apiToken, normalizedCollection, itemId, warnings);
        if (item == null || item.isEmpty()) {
            return new DirectusSyncResultDto(
                    "DIRECTUS_SINGLE_ITEM (" + normalizedCollection + "/" + itemId + ")",
                    List.of(normalizedCollection),
                    0,
                    0,
                    0,
                    1,
                    List.of(),
                    List.of(),
                    warnings.isEmpty() ? List.of("Item não encontrado no Directus.") : warnings,
                    OffsetDateTime.now()
            );
        }

        DirectusSyncResultDto batchRes = processItemsBatch(normalizedCollection, safeBaseUrl, List.of(item));
        List<String> allWarnings = new ArrayList<>(warnings);
        allWarnings.addAll(batchRes.warnings());

        return new DirectusSyncResultDto(
                "DIRECTUS_SINGLE_ITEM (" + safeBaseUrl + "/items/" + normalizedCollection + "/" + itemId + "?fields=*.*)",
                List.of(normalizedCollection),
                1,
                batchRes.importedCount(),
                batchRes.skippedDuplicates(),
                batchRes.failedCount(),
                batchRes.provisionedAnalysts(),
                batchRes.importedEvaluationCodes(),
                allWarnings,
                OffsetDateTime.now()
        );
    }

    /**
     * Puxa avaliações diretamente da API REST do Directus (/items/{collection}?fields=*.*)
     */
    @Transactional
    @CacheEvict(
            value = {CacheConfig.CACHE_DASHBOARD, CacheConfig.CACHE_EVALUATIONS, CacheConfig.CACHE_CALLS},
            allEntries = true
    )
    public DirectusSyncResultDto pullFromDirectusApi(DirectusPullRequest request) {
        String baseUrl = firstNonBlank(
                request != null ? request.baseUrl() : null,
                configuredDirectusBaseUrl
        );
        String apiToken = firstNonBlank(
                request != null ? request.apiToken() : null,
                configuredDirectusToken
        );

        if (baseUrl == null || baseUrl.isBlank()) {
            throw new BusinessRuleException(
                    "Informe a URL base do Directus (baseUrl ou variável DIRECTUS_BASE_URL)."
            );
        }

        String safeBaseUrl = validateSafeDirectusUrl(baseUrl);
        int limit = (request != null && request.limit() != null && request.limit() > 0)
                ? request.limit()
                : -1; // -1 = SEM LIMITE (puxa 100% de todos os registros da collection)

        String requestedCollection = (request != null && request.collection() != null && !request.collection().isBlank())
                ? request.collection().trim()
                : "ALL";

        List<String> collectionsToFetch = resolveCollectionsList(requestedCollection);

        int totalReceived = 0;
        int importedCount = 0;
        int skippedDuplicates = 0;
        int failedCount = 0;
        Set<String> provisionedAnalysts = new LinkedHashSet<>();
        List<String> importedCodes = new ArrayList<>();
        List<String> warnings = new ArrayList<>();

        for (String col : collectionsToFetch) {
            try {
                List<Map<String, Object>> items = fetchCollectionItemsFromDirectus(safeBaseUrl, apiToken, col, limit, warnings);
                totalReceived += items.size();

                DirectusSyncResultDto partial = processItemsBatch(col, safeBaseUrl, items);
                importedCount += partial.importedCount();
                skippedDuplicates += partial.skippedDuplicates();
                failedCount += partial.failedCount();
                provisionedAnalysts.addAll(partial.provisionedAnalysts());
                importedCodes.addAll(partial.importedEvaluationCodes());
                warnings.addAll(partial.warnings());
            } catch (Exception e) {
                log.warn("Erro ao consultar collection '{}' no Directus ({}): {}", col, safeBaseUrl, e.getMessage());
                warnings.add("Falha ao buscar collection " + col + ": " + e.getMessage());
            }
        }

        return new DirectusSyncResultDto(
                "DIRECTUS_REST_API_PULL (" + safeBaseUrl + "?fields=*.*)",
                collectionsToFetch,
                totalReceived,
                importedCount,
                skippedDuplicates,
                failedCount,
                new ArrayList<>(provisionedAnalysts),
                importedCodes,
                warnings,
                OffsetDateTime.now()
        );
    }

    /**
     * Importa um lote JSON de avaliações (vindo de exportação do Directus, Webhook Flow ou Postman)
     */
    @Transactional
    @CacheEvict(
            value = {CacheConfig.CACHE_DASHBOARD, CacheConfig.CACHE_EVALUATIONS, CacheConfig.CACHE_CALLS},
            allEntries = true
    )
    public DirectusSyncResultDto importBatch(DirectusBatchImportRequest request) {
        if (request == null || request.items() == null || request.items().isEmpty()) {
            throw new BusinessRuleException("A lista 'items' não pode estar vazia para importação.");
        }

        String baseUrl = firstNonBlank(request.directusBaseUrl(), configuredDirectusBaseUrl);
        return processItemsBatch(request.collection(), baseUrl, request.items());
    }

    /**
     * Recebe o payload do workflow n8n (ex: [ { "data": { "id": 655, ... } } ] ou { "data": { ... } } ou { ... })
     * e cria ou atualiza integralmente a Ligação, o Cliente e os 32 critérios da Avaliação no NEXFORM.
     */
    @Transactional
    @CacheEvict(
            value = {CacheConfig.CACHE_DASHBOARD, CacheConfig.CACHE_EVALUATIONS, CacheConfig.CACHE_CALLS},
            allEntries = true
    )
    public DirectusSyncResultDto upsertFromWorkflowPayload(String idFromPath, String collectionHint, Object rawPayload) {
        List<Map<String, Object>> unwrappedItems = unwrapWorkflowItems(rawPayload);
        if (unwrappedItems.isEmpty()) {
            throw new BusinessRuleException("Payload do workflow vazio ou formato JSON não reconhecido.");
        }

        if (idFromPath != null && !idFromPath.isBlank()) {
            for (Map<String, Object> item : unwrappedItems) {
                item.putIfAbsent("id", idFromPath.trim());
                item.put("_targetIdOverride", idFromPath.trim());
            }
        }

        String effectiveCollection = (collectionHint != null && !collectionHint.isBlank()) ? collectionHint : "AUTO";
        return processItemsBatch(effectiveCollection, configuredDirectusBaseUrl, unwrappedItems);
    }

    @SuppressWarnings("unchecked")
    private List<Map<String, Object>> unwrapWorkflowItems(Object rawPayload) {
        List<Map<String, Object>> result = new ArrayList<>();
        if (rawPayload == null) {
            return result;
        }
        if (rawPayload instanceof List<?> list) {
            for (Object elem : list) {
                result.addAll(unwrapWorkflowItems(elem));
            }
        } else if (rawPayload instanceof Map<?, ?> rawMap) {
            Map<String, Object> map = new LinkedHashMap<>((Map<String, Object>) rawMap);
            Object nestedNode = map.get("data") != null
                    ? map.get("data")
                    : (map.get("output") != null ? map.get("output") : map.get("result"));
            if (nestedNode instanceof Map<?, ?> || nestedNode instanceof List<?>) {
                List<Map<String, Object>> unwrappedChildren = unwrapWorkflowItems(nestedNode);
                for (Map<String, Object> child : unwrappedChildren) {
                    Map<String, Object> merged = new LinkedHashMap<>(child);
                    for (Map.Entry<String, Object> rootEntry : map.entrySet()) {
                        String k = rootEntry.getKey();
                        if (!"data".equals(k) && !"output".equals(k) && !"result".equals(k) && rootEntry.getValue() != null) {
                            merged.putIfAbsent(k, rootEntry.getValue());
                        }
                    }
                    result.add(merged);
                }
            } else {
                result.add(map);
            }
        }
        return result;
    }

    @Transactional
    public DirectusSyncResultDto importLocalSamples(Integer maxPerCollection) {
        int limit = (maxPerCollection != null && maxPerCollection > 0) ? maxPerCollection : -1;
        return pullFromDirectusApi(new DirectusPullRequest(
                configuredDirectusBaseUrl,
                configuredDirectusToken,
                "ALL",
                limit
        ));
    }

    private DirectusSyncResultDto processItemsBatch(
            String explicitCollection,
            String directusBaseUrl,
            List<Map<String, Object>> rawItems
    ) {
        User fallbackEvaluator = resolveDefaultEvaluator();
        Map<String, EvaluationFormTemplate> templatesByCollection = loadTemplatesByCollection();
        List<User> cachedUsers = new ArrayList<>(userRepository.findAll());

        Set<String> processedCollections = new LinkedHashSet<>();
        Set<String> provisionedAnalysts = new LinkedHashSet<>();
        List<String> importedCodes = new ArrayList<>();
        List<String> warnings = new ArrayList<>();

        int importedCount = 0;
        int skippedDuplicates = 0;
        int failedCount = 0;

        for (Map<String, Object> item : rawItems) {
            if (item == null || item.isEmpty()) {
                continue;
            }
            try {
                String collection = detectCollection(explicitCollection, item);
                processedCollections.add(collection);

                String targetOverride = extractString(item, "_targetIdOverride", null);
                String directusId = firstNonBlank(
                        targetOverride,
                        extractString(item, "id", null),
                        extractString(item, "id_formullario", null),
                        extractString(item, "callRecordId", null),
                        extractString(item, "evaluationId", null),
                        extractString(item, "externalCallId", null),
                        UUID.randomUUID().toString().substring(0, 8)
                );
                String externalCallId = buildDeterministicExternalCallId(collection, directusId);

                Optional<CallRecord> existingCallOpt = findExistingCallForWorkflowUpsert(directusId, externalCallId, item);

                Object rawDataVendaObj = item.get("Data_da_venda");
                Object rawNomeObj = item.get("Nome");
                boolean isBrokenUndefinedRecord = (rawDataVendaObj != null && "undefined".equalsIgnoreCase(rawDataVendaObj.toString().trim()))
                        || (rawNomeObj != null && "undefined".equalsIgnoreCase(rawNomeObj.toString().trim()));
                String audioUuid = extractAudioUuid(item);

                if (isBrokenUndefinedRecord || ((audioUuid == null || audioUuid.isBlank()) && existingCallOpt.isEmpty())) {
                    existingCallOpt.ifPresent(existing -> {
                        if (existing.getEvaluation() != null) {
                            Evaluation ev = existing.getEvaluation();
                            existing.setEvaluation(null);
                            callRecordRepository.save(existing);
                            evaluationRepository.delete(ev);
                        }
                        callRecordRepository.delete(existing);
                    });
                    skippedDuplicates++;
                    continue;
                }

                EvaluationFormTemplate template = templatesByCollection.get(collection);
                if (template == null) {
                    warnings.add("Template não encontrado para a collection: " + collection);
                    failedCount++;
                    continue;
                }

                String targetSector = resolveSectorForCollection(collection, template);
                Customer customer = resolveOrProvisionCustomer(collection, item, directusId);
                OffsetDateTime callDate = resolveValidDirectusDate(
                        item.get("date_created"),
                        extractAudioCreatedOn(item),
                        item.get("Data_do_Atendimento"),
                        item.get("Data_da_venda"),
                        item.get("Data_monitoria")
                );
                OffsetDateTime evaluatedAt = resolveValidDirectusDate(
                        item.get("date_updated"),
                        item.get("date_created"),
                        item.get("Data_monitoria"),
                        callDate
                );

                int durationSeconds = extractCallDurationSeconds(item, directusId);
                String returnAudioUuid = extractReturnAudioUuid(item);
                String audioUrl = (audioUuid != null && !audioUuid.isBlank())
                        ? resolvePlayableAudioUrl(audioUuid, externalCallId)
                        : (existingCallOpt.map(CallRecord::getAudioUrl).orElseGet(() -> resolvePlayableAudioUrl(null, externalCallId)));

                Map<String, Object> metadata = new LinkedHashMap<>();
                if (existingCallOpt.isPresent() && existingCallOpt.get().getMetadata() != null) {
                    metadata.putAll(existingCallOpt.get().getMetadata());
                }
                metadata.put("source", "directus");
                metadata.put("directusCollection", collection);
                metadata.put("directusItemId", directusId);
                if (audioUuid != null) {
                    metadata.put("directusAudioFileId", audioUuid);
                    if (directusBaseUrl != null && !directusBaseUrl.isBlank()) {
                        metadata.put("directusAssetUrl", directusBaseUrl.replaceAll("/+$", "") + "/assets/" + audioUuid);
                    }
                }
                if (returnAudioUuid != null) {
                    metadata.put("returnAudioFileId", returnAudioUuid);
                    metadata.putIfAbsent("returnAudioUrl", "/api/v1/audio/directus/" + returnAudioUuid);
                }
                String ticket = extractString(item, "Ticket", null);
                if (ticket != null) {
                    metadata.put("ticket", ticket);
                }
                String transcricao = firstNonBlank(
                        extractString(item, "Transcricao", null),
                        extractString(item, "transcricao", null),
                        extractString(item, "transcription", null),
                        extractString(item, "transcript", null),
                        extractString(item, "texto", null),
                        extractString(item, "text", null)
                );
                if (transcricao != null) {
                    metadata.put("transcricao", transcricao);
                }
                metadata.put("aiEvaluationData", extractSlimAiEvaluationCriteria(item));
                metadata.put("aiWebhookStatus", "COMPLETED");

                User evaluator = resolveOrProvisionEvaluator(item.get("user_created"), targetSector, fallbackEvaluator);
                User analyst = resolveOrProvisionAnalyst(
                        item.get("Operador"),
                        transcricao,
                        targetSector,
                        evaluator,
                        provisionedAnalysts,
                        cachedUsers
                );

                if (existingCallOpt.isPresent()) {
                    CallRecord existingCall = existingCallOpt.get();
                    if (item.get("Operador") != null || transcricao != null) {
                        existingCall.setAnalyst(analyst);
                    }
                    existingCall.setCustomer(customer);
                    existingCall.setCustomerIdentifier(customer.getPhone());
                    existingCall.setCallDate(callDate);
                    if (existingCall.getDurationSeconds() == null || existingCall.getDurationSeconds() == 210 || durationSeconds != 210) {
                        existingCall.setDurationSeconds(durationSeconds);
                    }
                    // Preserva a URL de áudio enviada manualmente (/api/v1/audio/files/...) que já aponta para o disco local e para o bucket Cloudflare R2
                    String currentAudioUrl = existingCall.getAudioUrl();
                    if (currentAudioUrl == null || !currentAudioUrl.contains("/api/v1/audio/files/")) {
                        existingCall.setAudioUrl(audioUrl);
                    }
                    existingCall.setStatus(CallStatus.AVALIADA);
                    existingCall.setMetadata(metadata);

                    Evaluation freshEval = buildEvaluationEntity(
                            collection,
                            item,
                            existingCall,
                            evaluator,
                            existingCall.getAnalyst(),
                            targetSector,
                            template,
                            evaluatedAt
                    );

                    if (existingCall.getEvaluation() != null) {
                        Evaluation existingEval = existingCall.getEvaluation();
                        existingEval.setAnalyst(existingCall.getAnalyst());
                        existingEval.setAnalystSectorSnapshot(targetSector);
                        existingEval.setFormTemplate(template);
                        existingEval.setFormNameSnapshot(template.getName());
                        existingEval.setFormVersionSnapshot(template.getVersion());
                        existingEval.setPassingScoreSnapshot(template.getPassingScorePercentage());
                        existingEval.setGeneralFeedback(freshEval.getGeneralFeedback());
                        existingEval.setObtainedPoints(freshEval.getObtainedPoints());
                        existingEval.setMaxPossiblePoints(freshEval.getMaxPossiblePoints());
                        existingEval.setRawScorePercentage(freshEval.getRawScorePercentage());
                        existingEval.setFinalScorePercentage(freshEval.getFinalScorePercentage());
                        existingEval.setFatalErrorTriggered(freshEval.isFatalErrorTriggered());
                        existingEval.setStatus(freshEval.getStatus());
                        existingEval.setEvaluatedAt(evaluatedAt);
                        existingEval.setCreatedAt(evaluatedAt);
                        existingEval.getItemSnapshots().clear();
                        for (EvaluationItemSnapshot snap : freshEval.getItemSnapshots()) {
                            existingEval.addItemSnapshot(snap);
                        }
                        evaluationRepository.save(existingEval);
                    } else {
                        existingCall.setEvaluation(freshEval);
                        evaluationRepository.save(freshEval);
                    }
                    callRecordRepository.save(existingCall);
                    importedCount++;
                    importedCodes.add(existingCall.getExternalCallId());
                    continue;
                }

                CallRecord callRecord = CallRecord.builder()
                        .externalCallId(externalCallId)
                        .analyst(analyst)
                        .customer(customer)
                        .customerIdentifier(customer.getPhone())
                        .callDate(callDate)
                        .durationSeconds(durationSeconds)
                        .audioUrl(audioUrl)
                        .status(CallStatus.AVALIADA)
                        .channel("directus-sync")
                        .campaign(collection.toLowerCase())
                        .metadata(metadata)
                        .build();
                callRecord = callRecordRepository.save(callRecord);

                Evaluation evaluation = buildEvaluationEntity(
                        collection,
                        item,
                        callRecord,
                        evaluator,
                        analyst,
                        targetSector,
                        template,
                        evaluatedAt
                );

                callRecord.setEvaluation(evaluation);
                evaluationRepository.save(evaluation);
                callRecordRepository.save(callRecord);

                importedCount++;
                importedCodes.add(externalCallId);
            } catch (Exception e) {
                failedCount++;
                log.warn("Falha ao importar item do Directus: {}", e.getMessage());
                warnings.add("Erro ao processar item ID=" + item.get("id") + ": " + e.getMessage());
            }
        }

        return new DirectusSyncResultDto(
                "DIRECTUS_BATCH_IMPORT",
                new ArrayList<>(processedCollections),
                rawItems.size(),
                importedCount,
                skippedDuplicates,
                failedCount,
                new ArrayList<>(provisionedAnalysts),
                importedCodes,
                warnings,
                OffsetDateTime.now()
        );
    }

    private Evaluation buildEvaluationEntity(
            String collection,
            Map<String, Object> item,
            CallRecord callRecord,
            User evaluator,
            User analyst,
            String targetSector,
            EvaluationFormTemplate template,
            OffsetDateTime evaluatedAt
    ) {
        boolean fatalErrorTriggered = isFatalErrorTriggered(item);
        Number directusFinalScoreNum = extractNumber(firstNonNull(item.get("Nota_final"), item.get("Nota_Final")));
        int directusFinalScore = directusFinalScoreNum != null
                ? Math.max(0, Math.min(100, directusFinalScoreNum.intValue()))
                : 80;

        String feedback = buildConsolidatedFeedback(item, collection);

        Evaluation evaluation = Evaluation.builder()
                .callRecord(callRecord)
                .evaluator(evaluator)
                .analyst(analyst)
                .analystSectorSnapshot(targetSector)
                .formTemplate(template)
                .formNameSnapshot(template.getName())
                .formVersionSnapshot(template.getVersion())
                .passingScoreSnapshot(template.getPassingScorePercentage())
                .generalFeedback(feedback)
                .evaluatedAt(evaluatedAt)
                .createdAt(evaluatedAt)
                .build();

        List<EvaluationFormItem> templateItems = template.getItems();
        int obtainedPoints = 0;
        int maxPossiblePoints = 0;

        boolean hasIndividualColumns = hasDirectusCriterionColumns(collection, item, templateItems);

        if (hasIndividualColumns) {
            for (EvaluationFormItem tItem : templateItems) {
                int weight = tItem.isFatalError() ? 0 : (tItem.getPoints() != null ? tItem.getPoints() : 1);
                String columnKey = extractDirectusKeyFromLabel(tItem.getLabel());
                Object rawColVal = item.get(columnKey);
                if (rawColVal == null && "Faz_questionamentos_direcionados".equalsIgnoreCase(columnKey)) {
                    rawColVal = item.get("Questionamentos_direcionados");
                }
                Number colScore = extractNumber(rawColVal);

                boolean checked;
                String itemObs = null;
                int snapshotPoints = weight;

                if (tItem.isFatalError()) {
                    checked = fatalErrorTriggered;
                    if (checked) {
                        itemObs = extractString(item, "Motivo_falta_grave", "Falta grave apontada na monitoria Directus.");
                    }
                } else {
                    if (colScore != null) {
                        int val = colScore.intValue();
                        snapshotPoints = Math.max(weight, val);
                        maxPossiblePoints += snapshotPoints;
                        checked = val > 0;
                        if (checked) {
                            obtainedPoints += val;
                            itemObs = "Pontuação Directus (" + columnKey + "): " + val + " pt(s)";
                        } else {
                            itemObs = "Critério zerado na avaliação do Directus (0/" + snapshotPoints + " pts)";
                        }
                    } else if (directusFinalScoreNum != null) {
                        maxPossiblePoints += weight;
                        checked = false;
                        itemObs = "Campo não pontuado nesta versão da ficha Directus";
                    } else {
                        checked = false;
                        itemObs = "Campo não aplicável nesta versão da ficha Directus";
                    }
                }

                evaluation.addItemSnapshot(EvaluationItemSnapshot.builder()
                        .originalItemId(tItem.getId())
                        .labelSnapshot(tItem.getLabel())
                        .descriptionSnapshot(tItem.getDescription())
                        .categorySnapshot(tItem.getCategory())
                        .fatalErrorSnapshot(tItem.isFatalError())
                        .pointsSnapshot(snapshotPoints)
                        .displayOrder(tItem.getDisplayOrder())
                        .checked(checked)
                        .observation(itemObs)
                        .build());
            }
        } else {
            int remainingTarget = fatalErrorTriggered ? 0 : directusFinalScore;
            boolean fatalMarked = false;

            for (EvaluationFormItem tItem : templateItems) {
                int weight = tItem.isFatalError() ? 0 : (tItem.getPoints() != null ? tItem.getPoints() : 1);
                boolean checked = false;
                String itemObs = null;

                if (tItem.isFatalError()) {
                    if (fatalErrorTriggered && !fatalMarked) {
                        checked = true;
                        fatalMarked = true;
                        itemObs = extractString(item, "Motivo_falta_grave", "Falta grave registrada no Directus.");
                    }
                } else {
                    maxPossiblePoints += weight;
                    if (remainingTarget >= weight) {
                        checked = true;
                        obtainedPoints += weight;
                        remainingTarget -= weight;
                    } else {
                        itemObs = "Dedução identificada nas observações da monitoria Directus.";
                    }
                }

                evaluation.addItemSnapshot(EvaluationItemSnapshot.builder()
                        .originalItemId(tItem.getId())
                        .labelSnapshot(tItem.getLabel())
                        .descriptionSnapshot(tItem.getDescription())
                        .categorySnapshot(tItem.getCategory())
                        .fatalErrorSnapshot(tItem.isFatalError())
                        .pointsSnapshot(weight)
                        .displayOrder(tItem.getDisplayOrder())
                        .checked(checked)
                        .observation(itemObs)
                        .build());
            }
            obtainedPoints = fatalErrorTriggered ? obtainedPoints : directusFinalScore;
        }

        if (maxPossiblePoints <= 0) {
            maxPossiblePoints = 100;
        }

        BigDecimal rawPercentage;
        if (directusFinalScoreNum != null) {
            rawPercentage = BigDecimal.valueOf(directusFinalScore).setScale(2, RoundingMode.HALF_UP);
        } else {
            rawPercentage = BigDecimal.valueOf(obtainedPoints)
                    .multiply(new BigDecimal("100.00"))
                    .divide(BigDecimal.valueOf(maxPossiblePoints), 2, RoundingMode.HALF_UP);
        }

        BigDecimal finalScorePercentage;
        EvaluationStatus status;

        if (fatalErrorTriggered) {
            finalScorePercentage = new BigDecimal("0.00");
            status = EvaluationStatus.ZERADO_ERRO_GRAVE;
        } else {
            finalScorePercentage = rawPercentage;
            if (finalScorePercentage.compareTo(template.getPassingScorePercentage()) >= 0
                    || (feedback != null && feedback.toLowerCase().contains("aprovado."))) {
                status = EvaluationStatus.APROVADO;
            } else {
                status = EvaluationStatus.REPROVADO;
            }
        }

        evaluation.setObtainedPoints(directusFinalScoreNum != null ? directusFinalScore : obtainedPoints);
        evaluation.setMaxPossiblePoints(maxPossiblePoints);
        evaluation.setRawScorePercentage(rawPercentage);
        evaluation.setFinalScorePercentage(finalScorePercentage);
        evaluation.setFatalErrorTriggered(fatalErrorTriggered);
        evaluation.setStatus(status);

        return evaluation;
    }

    private User upsertDirectusUser(
            String name,
            String email,
            Role role,
            String department,
            String allowedSectors,
            User manager
    ) {
        String initialPassword = userService.resolveFirstAccessPassword();
        return userRepository.findByEmailIgnoreCase(email)
                .map(existing -> {
                    existing.setName(name);
                    existing.setRole(role);
                    if (existing.getPasswordChangedAt() == null) {
                        existing.setPasswordHash(passwordEncoder.encode(initialPassword));
                        existing.setMustChangePassword(true);
                    }
                    existing.setDepartment(department);
                    existing.setAllowedSectors(allowedSectors);
                    existing.setManager(manager);
                    existing.setActive(true);
                    return userRepository.save(existing);
                })
                .orElseGet(() -> userRepository.save(User.builder()
                        .name(name)
                        .email(email.toLowerCase())
                        .passwordHash(passwordEncoder.encode(initialPassword))
                        .role(role)
                        .department(department)
                        .allowedSectors(allowedSectors)
                        .manager(manager)
                        .active(true)
                        .mustChangePassword(true)
                        .build()));
    }

    private Map<String, Integer> fetchOperatorCounts(RestClient client, String collection) {
        Map<String, Integer> counts = new HashMap<>();
        try {
            String raw = client.get()
                    .uri(uriBuilder -> uriBuilder
                            .path("/items/{collection}")
                            .queryParam("fields", "id,Operador")
                            .queryParam("limit", -1)
                            .build(collection))
                    .retrieve()
                    .body(String.class);
            List<Map<String, Object>> items = parseDataArray(raw);
            for (Map<String, Object> item : items) {
                Object op = item.get("Operador");
                String opId = null;
                if (op instanceof String s) {
                    opId = s.trim();
                } else if (op instanceof Map<?, ?> m && m.get("id") != null) {
                    opId = m.get("id").toString().trim();
                }
                if (opId != null && !opId.isEmpty()) {
                    counts.put(opId, counts.getOrDefault(opId, 0) + 1);
                }
            }
        } catch (Exception e) {
            log.warn("Não foi possível contar avaliações de Operador em {}: {}", collection, e.getMessage());
        }
        return counts;
    }

    private List<Map<String, Object>> parseDataArray(String rawJson) {
        if (rawJson == null || rawJson.isBlank()) {
            return List.of();
        }
        try {
            JsonNode root = objectMapper.readTree(rawJson);
            JsonNode dataNode = root.has("data") ? root.get("data") : root;
            if (dataNode != null && dataNode.isArray()) {
                return objectMapper.convertValue(dataNode, new TypeReference<List<Map<String, Object>>>() {});
            }
        } catch (Exception e) {
            log.warn("Erro ao interpretar array JSON do Directus: {}", e.getMessage());
        }
        return List.of();
    }

    @SuppressWarnings("unchecked")
    private String extractRoleName(Object roleObj) {
        if (roleObj instanceof Map<?, ?> m) {
            return extractString((Map<String, Object>) m, "name", null);
        }
        return null;
    }

    private String buildFullName(Map<String, Object> du) {
        String first = extractString(du, "first_name", "");
        String last = extractString(du, "last_name", "");
        String combined = (first + " " + last).replaceAll("\\s+", " ").trim();
        return combined.isEmpty() ? "Operador Directus" : formatTitleCase(combined);
    }

    private String resolveDeterministicEmail(Map<String, Object> du, String fullName) {
        String rawEmail = extractString(du, "email", null);
        if (rawEmail != null && !rawEmail.isBlank() && rawEmail.contains("@")) {
            return stripAccents(rawEmail.trim().toLowerCase());
        }
        String[] parts = stripAccents(fullName.toLowerCase()).replaceAll("[^a-z0-9\\s]", "").trim().split("\\s+");
        String slug;
        if (parts.length >= 2) {
            slug = parts[0] + "." + parts[parts.length - 1];
        } else if (parts.length == 1 && !parts[0].isEmpty()) {
            slug = parts[0];
        } else {
            String id = extractString(du, "id", "op");
            slug = "operador." + id.substring(0, Math.min(6, id.length())).toLowerCase();
        }
        return slug + "@headsetbrasil.com";
    }

    private String stripAccents(String s) {
        return s.replaceAll("[áàâãä]", "a")
                .replaceAll("[éèêë]", "e")
                .replaceAll("[íìîï]", "i")
                .replaceAll("[óòôõö]", "o")
                .replaceAll("[úùûü]", "u")
                .replaceAll("[ç]", "c");
    }

    private User findBestMatchingDirectusUser(
            String targetName,
            Set<String> validDirectusEmails,
            User fallback,
            List<User> cachedUsers
    ) {
        if (targetName == null || targetName.isBlank()) {
            return fallback;
        }
        String cleanTarget = stripAccents(targetName.toLowerCase());
        String[] tokens = cleanTarget.split("\\s+");
        String firstToken = tokens.length > 0 ? tokens[0] : cleanTarget;
        String lastToken = tokens.length > 1 ? tokens[tokens.length - 1] : firstToken;

        for (User u : cachedUsers) {
            if (!validDirectusEmails.contains(u.getEmail().toLowerCase())) {
                continue;
            }
            String uName = stripAccents(u.getName().toLowerCase());
            if (uName.equals(cleanTarget) || (uName.startsWith(firstToken) && uName.endsWith(lastToken))) {
                return u;
            }
        }
        return fallback;
    }

    private boolean hasDirectusCriterionColumns(
            String collection,
            Map<String, Object> item,
            List<EvaluationFormItem> templateItems
    ) {
        if (COL_SAC.equalsIgnoreCase(collection) || COL_RETENCAO.equalsIgnoreCase(collection)) {
            return true;
        }
        for (EvaluationFormItem tItem : templateItems) {
            String key = extractDirectusKeyFromLabel(tItem.getLabel());
            if (!tItem.isFatalError() && item.containsKey(key) && item.get(key) != null) {
                return true;
            }
        }
        return false;
    }

    private Map<String, Object> fetchSingleItemFromDirectus(
            String safeBaseUrl,
            String apiToken,
            String collection,
            String itemId,
            List<String> warnings
    ) {
        String normalizedBase = safeBaseUrl.replaceAll("/+$", "");
        RestClient.Builder builder = RestClient.builder()
                .baseUrl(normalizedBase)
                .defaultHeader(HttpHeaders.ACCEPT, MediaType.APPLICATION_JSON_VALUE);

        if (apiToken != null && !apiToken.isBlank()) {
            builder.defaultHeader(HttpHeaders.AUTHORIZATION, "Bearer " + apiToken.trim());
        }
        RestClient client = builder.build();

        String rawJson;
        try {
            rawJson = client.get()
                    .uri(uriBuilder -> uriBuilder
                            .path("/items/{collection}/{id}")
                            .queryParam("fields", "*.*")
                            .build(collection, itemId))
                    .retrieve()
                    .body(String.class);
        } catch (Exception exWithRelations) {
            log.info("Fallback sem *.* em /items/{}/{}: {}", collection, itemId, exWithRelations.getMessage());
            rawJson = client.get()
                    .uri(uriBuilder -> uriBuilder
                            .path("/items/{collection}/{id}")
                            .queryParam("fields", "*")
                            .build(collection, itemId))
                    .retrieve()
                    .body(String.class);
        }

        if (rawJson == null || rawJson.isBlank()) {
            return Map.of();
        }

        try {
            JsonNode root = objectMapper.readTree(rawJson);
            JsonNode dataNode = root.has("data") ? root.get("data") : root;
            if (dataNode != null && dataNode.isObject()) {
                return objectMapper.convertValue(dataNode, new TypeReference<Map<String, Object>>() {});
            }
        } catch (Exception e) {
            warnings.add("Erro ao interpretar JSON do item " + collection + "/" + itemId + ": " + e.getMessage());
        }
        return Map.of();
    }

    private List<Map<String, Object>> fetchCollectionItemsFromDirectus(
            String safeBaseUrl,
            String apiToken,
            String collection,
            int limit,
            List<String> warnings
    ) {
        String normalizedBase = safeBaseUrl.replaceAll("/+$", "");
        RestClient.Builder builder = RestClient.builder()
                .baseUrl(normalizedBase)
                .defaultHeader(HttpHeaders.ACCEPT, MediaType.APPLICATION_JSON_VALUE);

        if (apiToken != null && !apiToken.isBlank()) {
            builder.defaultHeader(HttpHeaders.AUTHORIZATION, "Bearer " + apiToken.trim());
        }
        RestClient client = builder.build();

        List<Map<String, Object>> allItems = new ArrayList<>();
        int pageSize = 100;
        int offset = 0;
        boolean unlimited = limit <= 0;

        while (true) {
            int batchLimit = unlimited ? pageSize : Math.min(pageSize, limit - allItems.size());
            if (batchLimit <= 0) {
                break;
            }
            final int currentOffset = offset;
            final int currentBatchLimit = batchLimit;

            String rawJson;
            try {
                rawJson = client.get()
                        .uri(uriBuilder -> uriBuilder
                                .path("/items/{collection}")
                                .queryParam("fields", "*.*")
                                .queryParam("limit", currentBatchLimit)
                                .queryParam("offset", currentOffset)
                                .queryParam("sort", "-id")
                                .build(collection))
                        .retrieve()
                        .body(String.class);
            } catch (Exception exWithRelations) {
                log.info("Fallback para consulta sem expansão relacional em /items/{} (offset={}): {}",
                        collection, currentOffset, exWithRelations.getMessage());
                rawJson = client.get()
                        .uri(uriBuilder -> uriBuilder
                                .path("/items/{collection}")
                                .queryParam("fields", "*")
                                .queryParam("limit", currentBatchLimit)
                                .queryParam("offset", currentOffset)
                                .queryParam("sort", "-id")
                                .build(collection))
                        .retrieve()
                        .body(String.class);
            }

            List<Map<String, Object>> pageItems = parseDataArray(rawJson);
            if (pageItems.isEmpty()) {
                break;
            }

            allItems.addAll(pageItems);
            offset += pageItems.size();

            if (pageItems.size() < currentBatchLimit || (!unlimited && allItems.size() >= limit)) {
                break;
            }
        }

        log.info("Collection '{}' carregada do Directus: {} registros obtidos.", collection, allItems.size());
        return allItems;
    }

    @SuppressWarnings("unchecked")
    private User resolveOrProvisionEvaluator(Object userCreatedRaw, String sectorName, User fallbackEvaluator) {
        if (!(userCreatedRaw instanceof Map<?, ?> uMap)) {
            return fallbackEvaluator;
        }
        Map<String, Object> map = (Map<String, Object>) uMap;
        String email = extractString(map, "email", null);
        String firstName = extractString(map, "first_name", null);
        String lastName = extractString(map, "last_name", null);
        if (email == null || email.isBlank()) {
            return fallbackEvaluator;
        }
        String fullName = ((firstName != null ? firstName : "") + " " + (lastName != null ? lastName : "")).trim();
        String finalName = "Admin User".equalsIgnoreCase(fullName)
                ? "Victor Felix (Admin)"
                : (fullName.isEmpty() ? email : formatTitleCase(fullName));
        String finalEmail = stripAccents(email.toLowerCase());

        return userRepository.findByEmailIgnoreCase(finalEmail)
                .map(existing -> {
                    if (existing.getAllowedSectors() != null && !existing.getAllowedSectors().contains(sectorName)) {
                        existing.setAllowedSectors(existing.getAllowedSectors() + "," + sectorName);
                        return userRepository.save(existing);
                    }
                    return existing;
                })
                .orElseGet(() -> userRepository.save(User.builder()
                        .name(finalName)
                        .email(finalEmail)
                        .passwordHash(passwordEncoder.encode(userService.resolveFirstAccessPassword()))
                        .role(Role.ROLE_GESTOR)
                        .department("Qualidade & Monitoria")
                        .allowedSectors("SAC,Cobrança & Retenção,Aquisição")
                        .active(true)
                        .mustChangePassword(true)
                        .build()));
    }

    @SuppressWarnings("unchecked")
    private User resolveOrProvisionAnalyst(
            Object operadorRaw,
            String transcricao,
            String sectorName,
            User defaultManager,
            Set<String> provisionedAnalysts,
            List<User> cachedUsers
    ) {
        String displayName = null;
        String email = null;

        if (operadorRaw instanceof Map<?, ?> opMap) {
            String firstName = extractString((Map<String, Object>) opMap, "first_name", null);
            String lastName = extractString((Map<String, Object>) opMap, "last_name", null);
            email = extractString((Map<String, Object>) opMap, "email", null);
            String fullName = ((firstName != null ? firstName : "") + " " + (lastName != null ? lastName : "")).replaceAll("\\s+", " ").trim();
            if (!fullName.isEmpty()) {
                displayName = formatTitleCase(fullName);
            }
        } else if (operadorRaw instanceof String opStr && !opStr.isBlank()) {
            String trimmed = opStr.trim();
            if (trimmed.contains("@")) {
                email = stripAccents(trimmed.toLowerCase());
            } else if (trimmed.length() == 36 && trimmed.contains("-")) {
                try {
                    UUID opUuid = UUID.fromString(trimmed);
                    for (User u : cachedUsers) {
                        if (opUuid.equals(u.getId())) {
                            return u;
                        }
                    }
                } catch (Exception ignored) {
                }
            } else {
                displayName = formatTitleCase(trimmed);
            }
        }

        if ((displayName == null || displayName.isBlank()) && transcricao != null && !transcricao.isBlank()) {
            java.util.regex.Matcher mFull = ANALYST_INTRO_PATTERN.matcher(transcricao);
            while (mFull.find()) {
                String candidate = mFull.group(1).trim();
                if (!candidate.toLowerCase().endsWith("falo") && !candidate.toLowerCase().endsWith("eu")) {
                    displayName = formatTitleCase(candidate);
                }
            }
        }

        if ((displayName == null || displayName.isBlank()) && operadorRaw instanceof String opStr && opStr.trim().length() == 36) {
            String shortCode = opStr.trim().substring(0, 6).toUpperCase();
            displayName = "Operador #" + shortCode + " (" + sectorName + ")";
            email = "operador." + shortCode.toLowerCase() + "@headsetbrasil.com";
        }

        if (email != null && !email.isBlank()) {
            String cleanEmail = stripAccents(email.toLowerCase());
            for (User u : cachedUsers) {
                if (u.getEmail().equalsIgnoreCase(cleanEmail)) {
                    return u;
                }
            }
        }

        if (displayName != null && !displayName.isBlank()) {
            String cleanTarget = stripAccents(displayName.toLowerCase());
            String[] tokens = cleanTarget.split("\\s+");
            String first = tokens[0];
            String last = tokens[tokens.length - 1];
            for (User u : cachedUsers) {
                if (u.getRole() != Role.ROLE_ANALISTA) continue;
                String uName = stripAccents(u.getName().toLowerCase());
                if (uName.equals(cleanTarget)
                        || (tokens.length >= 2 && uName.startsWith(first) && uName.endsWith(last))
                        || (tokens.length == 1 && uName.startsWith(first + " "))) {
                    return u;
                }
            }
        }

        if (displayName == null || displayName.isBlank()) {
            displayName = "Analista Directus (" + sectorName + ")";
        }

        if (email == null || email.isBlank()) {
            String slug = stripAccents(displayName.toLowerCase())
                    .replaceAll("[^a-z0-9]+", ".")
                    .replaceAll("^\\.|\\.$", "");
            email = slug + "@headsetbrasil.com";
        }

        final String finalEmail = stripAccents(email.toLowerCase());
        final String finalName = displayName;

        for (User u : cachedUsers) {
            if (u.getEmail().equalsIgnoreCase(finalEmail)) {
                return u;
            }
        }

        return userRepository.findByEmailIgnoreCase(finalEmail)
                .orElseGet(() -> {
                    User created = userRepository.save(User.builder()
                            .name(finalName)
                            .email(finalEmail)
                            .passwordHash(passwordEncoder.encode(userService.resolveFirstAccessPassword()))
                            .role(Role.ROLE_ANALISTA)
                            .department(sectorName)
                            .allowedSectors(sectorName)
                            .manager(defaultManager)
                            .active(true)
                            .mustChangePassword(true)
                            .build());
                    cachedUsers.add(created);
                    provisionedAnalysts.add(finalName + " <" + finalEmail + "> (" + sectorName + ")");
                    return created;
                });
    }

    private Customer resolveOrProvisionCustomer(String collection, Map<String, Object> item, String directusId) {
        String rawPhone = extractString(item, "Telefone_Portabilidade", null);
        String ticket = extractString(item, "Ticket", null);
        String saleDate = extractString(item, "Data_da_venda", null);
        String nome = extractString(item, "Nome", null);
        String cpf = extractString(item, "CPF", null);
        String proposta = extractString(item, "Proposta", null);
        String nascimento = extractString(item, "Data_de_nascimento", null);
        String nomeMae = extractString(item, "Nome_da_mae", null);
        String email = extractString(item, "Email", null);
        String formaPagamento = extractString(item, "Forma_de_Pagamento", null);
        String tipoFatura = extractString(item, "Tipo_de_Fatura", null);
        String vencimento = extractString(item, "Vencimento", null);
        String portAntecipada = extractString(item, "Portabilidade_Antecipada", null);
        String plano = extractString(item, "Plano_Contratado", null);
        String endereco = extractString(item, "Endereco_Completo", null);

        String cleanPhone;
        if (rawPhone != null && !rawPhone.isBlank()) {
            cleanPhone = CustomerLookupService.normalizePhone(rawPhone);
        } else if (ticket != null && !ticket.isBlank()) {
            String digits = ticket.replaceAll("\\D", "");
            cleanPhone = "119" + String.format("%08d", digits.isEmpty() ? directusId.hashCode() & 0xfffffff : Integer.parseInt(digits) % 100000000);
        } else {
            cleanPhone = "11988" + String.format("%06d", Math.abs(directusId.hashCode()) % 1000000);
        }

        String protocol = firstNonBlank(proposta, ticket, "DIR-" + collection.toUpperCase() + "-" + directusId);

        String defaultName = rawPhone != null ? "Cliente Portabilidade " + cleanPhone : "Cliente Ticket " + protocol;
        String defaultEmail = "cliente." + cleanPhone + "@directus.com.br";
        String defaultPlan = COL_AQUISICAO.equalsIgnoreCase(collection) ? "TIM Controle Smart / Plus" : "Plano Assistencial";

        return customerRepository.findByPhone(cleanPhone)
                .map(existing -> {
                    existing.setName(nome != null ? formatTitleCase(nome) : (isPlaceholderValue(existing.getName()) ? defaultName : existing.getName()));
                    existing.setDocument(cpf != null ? cpf : (isPlaceholderValue(existing.getDocument()) ? "000.000.000-00" : existing.getDocument()));
                    existing.setEmail(email != null ? email : (isPlaceholderValue(existing.getEmail()) ? defaultEmail : existing.getEmail()));
                    existing.setProtocol(protocol != null ? protocol : existing.getProtocol());
                    existing.setProposal(proposta != null ? proposta : (isPlaceholderValue(existing.getProposal()) ? null : existing.getProposal()));
                    existing.setSaleDate(saleDate != null ? saleDate : (isPlaceholderValue(existing.getSaleDate()) ? null : existing.getSaleDate()));
                    existing.setBirthDate(nascimento != null ? nascimento : (isPlaceholderValue(existing.getBirthDate()) ? null : existing.getBirthDate()));
                    existing.setMotherName(nomeMae != null ? formatTitleCase(nomeMae) : (isPlaceholderValue(existing.getMotherName()) ? null : existing.getMotherName()));
                    existing.setContractedPlan(plano != null ? plano : (isPlaceholderValue(existing.getContractedPlan()) ? defaultPlan : existing.getContractedPlan()));
                    existing.setPaymentMethod(formaPagamento != null ? formaPagamento : (isPlaceholderValue(existing.getPaymentMethod()) ? null : existing.getPaymentMethod()));
                    existing.setInvoiceType(tipoFatura != null ? tipoFatura : (isPlaceholderValue(existing.getInvoiceType()) ? null : existing.getInvoiceType()));
                    existing.setFullAddress(endereco != null ? endereco : (isPlaceholderValue(existing.getFullAddress()) ? null : existing.getFullAddress()));
                    existing.setDueDate(vencimento != null ? vencimento : (isPlaceholderValue(existing.getDueDate()) ? null : existing.getDueDate()));
                    existing.setEarlyPortability(portAntecipada != null ? portAntecipada : (isPlaceholderValue(existing.getEarlyPortability()) ? null : existing.getEarlyPortability()));
                    return customerRepository.save(existing);
                })
                .orElseGet(() -> customerRepository.save(Customer.builder()
                        .phone(cleanPhone)
                        .name(nome != null ? formatTitleCase(nome) : defaultName)
                        .document(cpf != null ? cpf : "000.000.000-00")
                        .email(email != null ? email : defaultEmail)
                        .protocol(protocol)
                        .proposal(proposta)
                        .saleDate(saleDate)
                        .birthDate(nascimento)
                        .motherName(nomeMae != null ? formatTitleCase(nomeMae) : null)
                        .contractedPlan(plano != null ? plano : defaultPlan)
                        .paymentMethod(formaPagamento)
                        .invoiceType(tipoFatura)
                        .fullAddress(endereco)
                        .dueDate(vencimento)
                        .earlyPortability(portAntecipada)
                        .build()));
    }

    private Map<String, EvaluationFormTemplate> loadTemplatesByCollection() {
        List<EvaluationFormTemplate> allTemplates = formTemplateRepository.findAll();
        Map<String, EvaluationFormTemplate> map = new HashMap<>();

        for (EvaluationFormTemplate t : allTemplates) {
            EvaluationFormTemplate hydrated = formTemplateRepository.findWithItemsById(t.getId()).orElse(t);
            String name = t.getName().toLowerCase();
            if (name.contains("sac") && !name.contains("express")) {
                map.put(COL_SAC, hydrated);
            } else if (name.contains("retenção") && !name.contains("padrão")) {
                map.put(COL_RETENCAO, hydrated);
            } else if (name.contains("portabilidade") || name.contains("aquisição")) {
                map.put(COL_AQUISICAO, hydrated);
            }
        }
        return map;
    }

    private String detectCollection(String explicitCollection, Map<String, Object> item) {
        if (explicitCollection != null && !explicitCollection.isBlank() && !"AUTO".equalsIgnoreCase(explicitCollection)) {
            String norm = explicitCollection.trim();
            if (norm.equalsIgnoreCase(COL_SAC) || norm.toLowerCase().contains("sac")) {
                return COL_SAC;
            }
            if (norm.equalsIgnoreCase(COL_RETENCAO) || norm.toLowerCase().contains("retencao") || norm.toLowerCase().contains("retenção")) {
                return COL_RETENCAO;
            }
            if (norm.equalsIgnoreCase(COL_AQUISICAO) || norm.toLowerCase().contains("aquisicao") || norm.toLowerCase().contains("portabilidade")) {
                return COL_AQUISICAO;
            }
        }

        if (item.containsKey("Telefone_Portabilidade")
                || item.containsKey("Data_da_venda")
                || item.containsKey("valores_plano")
                || item.containsKey("fidelidade_e_formas_de_pagamento")
                || item.containsKey("Observacoes")) {
            return COL_AQUISICAO;
        }
        if (item.containsKey("Realizou_todos_procedimentos_corretamente") || item.containsKey("Nao_Interrompe_o_Cliente")) {
            return COL_SAC;
        }
        if (item.containsKey("Sondagem__Abordagem") || item.containsKey("Cordialidade_e_Empatia")) {
            return COL_RETENCAO;
        }
        return COL_SAC;
    }

    private List<String> resolveCollectionsList(String requested) {
        if (requested == null || requested.isBlank() || "ALL".equalsIgnoreCase(requested)) {
            return List.of(COL_SAC, COL_RETENCAO, COL_AQUISICAO);
        }
        return List.of(detectCollection(requested, Map.of()));
    }

    private String resolveSectorForCollection(String collection, EvaluationFormTemplate template) {
        if (template.getSector() != null && !template.getSector().isBlank()) {
            return template.getSector();
        }
        if (COL_SAC.equalsIgnoreCase(collection)) {
            return "SAC";
        }
        if (COL_RETENCAO.equalsIgnoreCase(collection)) {
            return "Cobrança & Retenção";
        }
        return "Aquisição";
    }

    private String buildDeterministicExternalCallId(String collection, String directusId) {
        String prefix = switch (collection) {
            case COL_SAC -> "directus_sac_";
            case COL_RETENCAO -> "directus_retencao_";
            case COL_AQUISICAO -> "directus_aquisicao_";
            default -> "directus_";
        };
        return prefix + directusId.trim().replaceAll("[^a-zA-Z0-9_-]", "");
    }

    private String extractDirectusKeyFromLabel(String label) {
        if (label == null) {
            return "";
        }
        int bulletIdx = label.indexOf("•");
        if (bulletIdx > 0) {
            return label.substring(0, bulletIdx).trim();
        }
        return label.trim();
    }

    private boolean isFatalErrorTriggered(Map<String, Object> item) {
        Object fg = firstNonNull(item.get("Falta_Grave"), item.get("falta_grave"));
        if (fg instanceof Boolean b) {
            return b;
        }
        if (fg instanceof String s) {
            String clean = s.trim();
            return !clean.isEmpty()
                    && !"false".equalsIgnoreCase(clean)
                    && !"n/a".equalsIgnoreCase(clean)
                    && !"não".equalsIgnoreCase(clean)
                    && !"nao".equalsIgnoreCase(clean);
        }
        return false;
    }

    private String buildConsolidatedFeedback(Map<String, Object> item, String collection) {
        List<String> parts = new ArrayList<>();
        String ticket = extractString(item, "Ticket", null);
        if (ticket != null) {
            parts.add("[Ticket Directus: " + ticket + "]");
        }
        String proposta = extractString(item, "Proposta", null);
        if (proposta != null) {
            parts.add("[Proposta: " + proposta + "]");
        }
        String obs = extractString(item, "Observacoes", null);
        if (obs != null) {
            parts.add(obs);
        }
        String resumo = extractString(item, "Breve_resumo_do_atendimento", null);
        if (resumo != null) {
            parts.add(resumo);
        }
        String minGraves = extractString(item, "minutagem_faltas_graves", null);
        if (minGraves != null && !"N/A".equalsIgnoreCase(minGraves.trim())) {
            parts.add("Minutagem de Faltas Graves (Minuto e Segundo): " + minGraves.trim());
        }
        String minComuns = extractString(item, "minutagem_falhas_comuns", null);
        if (minComuns != null && !"N/A".equalsIgnoreCase(minComuns.trim())) {
            parts.add("Minutagem de Falhas / Observações (Minuto e Segundo): " + minComuns.trim());
        }
        String fortes = extractString(item, "Pontos_fortes", null);
        if (fortes != null) {
            parts.add("Pontos Fortes: " + fortes);
        }
        String melhorias = extractString(item, "Melhorias", null);
        if (melhorias != null) {
            parts.add("Pontos de Melhoria: " + melhorias);
        }
        String motivoGrave = extractString(item, "Motivo_falta_grave", null);
        if (motivoGrave != null && !"N/A".equalsIgnoreCase(motivoGrave)) {
            if (isFatalErrorTriggered(item)) {
                parts.add("Motivo Falta Grave: " + motivoGrave);
            } else {
                parts.add(motivoGrave);
            }
        }
        if (parts.isEmpty()) {
            return "Avaliação importada automaticamente da collection " + collection + " no Directus.";
        }
        return String.join("\n\n", parts);
    }

    @SuppressWarnings("unchecked")
    private String extractAudioUuid(Map<String, Object> item) {
        List<Object> candidates = Arrays.asList(
                item.get("Audio_Chamada"),
                item.get("audio_chamada"),
                item.get("ligacao"),
                item.get("Audio_Ligacao"),
                item.get("Ligacao"),
                item.get("Ligacao_Retorno"),
                item.get("Audio_Ligacao_Retorno"),
                item.get("audio_chamada_retorno")
        );
        for (Object candidate : candidates) {
            if (candidate instanceof String s && s.length() >= 10 && !isPlaceholderValue(s)) {
                return s.trim();
            }
            if (candidate instanceof Map<?, ?> map) {
                Map<String, Object> m = (Map<String, Object>) map;
                String id = extractString(m, "id", null);
                if (id != null && id.length() >= 10) {
                    return id;
                }
                String source = extractString(m, "source", null);
                if (source != null && source.length() >= 10) {
                    return source;
                }
            }
        }
        return null;
    }

    @SuppressWarnings("unchecked")
    private String extractReturnAudioUuid(Map<String, Object> item) {
        List<Object> candidates = Arrays.asList(
                item.get("Ligacao_Retorno"),
                item.get("Audio_Ligacao_Retorno"),
                item.get("audio_chamada_retorno")
        );
        for (Object candidate : candidates) {
            if (candidate instanceof String s && s.length() >= 10 && !isPlaceholderValue(s)) {
                return s.trim();
            }
            if (candidate instanceof Map<?, ?> map) {
                Map<String, Object> m = (Map<String, Object>) map;
                String id = extractString(m, "id", null);
                if (id != null && id.length() >= 10) {
                    return id;
                }
                String source = extractString(m, "source", null);
                if (source != null && source.length() >= 10) {
                    return source;
                }
            }
        }
        return null;
    }

    @SuppressWarnings("unchecked")
    private Object extractAudioCreatedOn(Map<String, Object> item) {
        List<Object> candidates = Arrays.asList(
                item.get("ligacao"),
                item.get("Audio_Chamada"),
                item.get("audio_chamada"),
                item.get("Ligacao")
        );
        for (Object candidate : candidates) {
            if (candidate instanceof Map<?, ?> map) {
                Map<String, Object> m = (Map<String, Object>) map;
                String createdOn = extractString(m, "created_on", null);
                if (createdOn != null) {
                    return createdOn;
                }
                String uploadedOn = extractString(m, "uploaded_on", null);
                if (uploadedOn != null) {
                    return uploadedOn;
                }
            }
        }
        return null;
    }

    private Optional<CallRecord> findExistingCallForWorkflowUpsert(
            String directusId,
            String externalCallId,
            Map<String, Object> item
    ) {
        if (directusId != null && directusId.length() == 36 && directusId.contains("-")) {
            try {
                UUID uuid = UUID.fromString(directusId);
                Optional<CallRecord> byCallUuid = callRecordRepository.findWithDetailsById(uuid);
                if (byCallUuid.isPresent()) {
                    return byCallUuid;
                }
                Optional<Evaluation> byEvalUuid = evaluationRepository.findWithDetailsById(uuid);
                if (byEvalUuid.isPresent() && byEvalUuid.get().getCallRecord() != null) {
                    return Optional.of(byEvalUuid.get().getCallRecord());
                }
            } catch (Exception ignored) {
            }
        }
        if (directusId != null && !directusId.isBlank()) {
            Optional<CallRecord> byRawExt = callRecordRepository.findByExternalCallId(directusId.trim());
            if (byRawExt.isPresent()) {
                return byRawExt;
            }
        }
        Optional<CallRecord> byDetExt = callRecordRepository.findByExternalCallId(externalCallId);
        if (byDetExt.isPresent()) {
            return byDetExt;
        }
        String rawPhone = extractString(item, "Telefone_Portabilidade", null);
        if (rawPhone != null && !rawPhone.isBlank()) {
            String cleanPhone = CustomerLookupService.normalizePhone(rawPhone);
            List<CallRecord> byPhone = callRecordRepository.findByCustomerIdentifierContainingOrderByCallDateDesc(cleanPhone);
            for (CallRecord candidate : byPhone) {
                if (candidate.getStatus() == CallStatus.PENDENTE) {
                    return Optional.of(candidate);
                }
            }
        }
        return Optional.empty();
    }

    @SuppressWarnings("unchecked")
    private int extractCallDurationSeconds(Map<String, Object> item, String directusId) {
        // 1. Se houver Transcricao/transcricao com marcações de tempo [MM:SS] ou [HH:MM:SS], extrai o último timestamp real da conversa
        String transcricao = firstNonBlank(
                extractString(item, "Transcricao", null),
                extractString(item, "transcricao", null)
        );
        if (transcricao != null && !transcricao.isBlank()) {
            java.util.regex.Matcher mTime = TRANSCRIPT_TIME_PATTERN.matcher(transcricao);
            int maxTimestampSecs = 0;
            while (mTime.find()) {
                try {
                    int p1 = Integer.parseInt(mTime.group(1));
                    int p2 = Integer.parseInt(mTime.group(2));
                    String g3 = mTime.group(3);
                    int secs = (g3 != null)
                            ? (p1 * 3600 + p2 * 60 + Integer.parseInt(g3))
                            : (p1 * 60 + p2);
                    if (secs > maxTimestampSecs && secs <= 7200) {
                        maxTimestampSecs = secs;
                    }
                } catch (NumberFormatException ignored) {
                }
            }
            if (maxTimestampSecs >= 10) {
                return maxTimestampSecs;
            }
        }

        List<Object> candidates = Arrays.asList(
                item.get("ligacao"),
                item.get("Audio_Chamada"),
                item.get("audio_chamada"),
                item.get("Ligacao"),
                item.get("Ligacao_Retorno"),
                item.get("audio_chamada_retorno")
        );
        for (Object candidate : candidates) {
            if (candidate instanceof Map<?, ?> map) {
                Map<String, Object> m = (Map<String, Object>) map;
                Number durationNum = extractNumber(m.get("duration"));
                if (durationNum != null && durationNum.doubleValue() > 0) {
                    double d = durationNum.doubleValue();
                    int secs = d > 7200 ? (int) Math.round(d / 1000.0) : (int) Math.round(d);
                    if (secs >= 5) {
                        return secs;
                    }
                }
                Number filesizeNum = extractNumber(m.get("filesize"));
                if (filesizeNum != null && filesizeNum.longValue() > 1024) {
                    long bytes = filesizeNum.longValue();
                    String type = extractString(m, "type", "");
                    String filename = extractString(m, "filename_download", "");
                    boolean isMp3 = type.toLowerCase().contains("mpeg")
                            || type.toLowerCase().contains("mp3")
                            || filename.toLowerCase().endsWith(".mp3");
                    // MP3 do Directus (SAC/Retenção) = 24kbps (~3000 bytes/s); WAV ADPCM/GSM (Aquisição) = ~3500 bytes/s
                    double bytesPerSecond = isMp3 ? 3000.0 : 3500.0;
                    int estimated = (int) Math.round(bytes / bytesPerSecond);
                    return Math.max(15, Math.min(estimated, 7200));
                }
            }
        }

        if (transcricao != null && transcricao.length() > 80) {
            int estimatedFromTranscript = Math.round(transcricao.length() / 12.0f);
            return Math.max(45, Math.min(estimatedFromTranscript, 3600));
        }

        int hash = directusId != null ? Math.abs(directusId.hashCode()) : 42;
        return 115 + (hash % 410);
    }

    private String resolvePlayableAudioUrl(String audioUuid, String externalCallId) {
        if (audioUuid != null && !audioUuid.isBlank()) {
            return "/api/v1/audio/directus/" + audioUuid;
        }
        return "/api/v1/audio/directus/sem-audio-" + externalCallId;
    }

    private OffsetDateTime resolveValidDirectusDate(Object... candidates) {
        if (candidates != null) {
            for (Object candidate : candidates) {
                OffsetDateTime parsed = tryParseDirectusDate(candidate);
                if (parsed != null) {
                    return parsed;
                }
            }
        }
        return OffsetDateTime.now();
    }

    private OffsetDateTime tryParseDirectusDate(Object raw) {
        if (raw == null) {
            return null;
        }
        if (raw instanceof OffsetDateTime odt) {
            return odt;
        }
        String str = raw.toString().trim();
        if (isPlaceholderValue(str)) {
            return null;
        }
        try {
            return OffsetDateTime.parse(str);
        } catch (Exception ignored) {
        }
        try {
            LocalDateTime ldt = LocalDateTime.parse(str);
            return ldt.atOffset(ZoneOffset.ofHours(-3));
        } catch (Exception ignored) {
        }
        try {
            DateTimeFormatter brFormatter = DateTimeFormatter.ofPattern("dd/MM/yyyy");
            LocalDate ld = LocalDate.parse(str, brFormatter);
            return ld.atTime(12, 0).atOffset(ZoneOffset.ofHours(-3));
        } catch (Exception ignored) {
        }
        try {
            LocalDate isoDate = LocalDate.parse(str);
            return isoDate.atTime(12, 0).atOffset(ZoneOffset.ofHours(-3));
        } catch (Exception ignored) {
        }
        return null;
    }

    private User resolveDefaultEvaluator() {
        return userRepository.findByEmailIgnoreCase("victor.felix@headsetbrasil.com")
                .or(() -> userRepository.findByEmailIgnoreCase("dheila.kamila@headsetbrasil.com"))
                .or(() -> userRepository.findByEmailIgnoreCase("prisciane.rodrigues@headsetbrasil.com"))
                .or(() -> userRepository.findByEmailIgnoreCase("gestor@empresa.com"))
                .or(() -> userRepository.findByEmailIgnoreCase("admin@empresa.com"))
                .orElseGet(() -> userRepository.findAll().stream()
                        .filter(u -> u.getRole() == Role.ROLE_ADMIN || u.getRole() == Role.ROLE_GESTOR)
                        .findFirst()
                        .orElseThrow(() -> new BusinessRuleException("Nenhum usuário Gestor/Admin encontrado.")));
    }

    private String validateSafeDirectusUrl(String rawUrl) {
        try {
            String trimmed = rawUrl.trim();
            URI uri = URI.create(trimmed);
            String scheme = uri.getScheme();
            String host = uri.getHost();
            if (scheme == null || host == null || (!"https".equalsIgnoreCase(scheme) && !"http".equalsIgnoreCase(scheme))) {
                throw new BusinessRuleException("A URL do Directus deve iniciar com https:// ou http://.");
            }
            // Se for exatamente a URL configurada pelo operador no .env (server-controlled), permite mesmo em rede Docker interna (Easypanel)
            if (configuredDirectusBaseUrl != null && !configuredDirectusBaseUrl.isBlank()
                    && trimmed.equalsIgnoreCase(configuredDirectusBaseUrl.trim())) {
                return uri.toString();
            }
            String lowerHost = host.toLowerCase();
            if ("localhost".equals(lowerHost)
                    || "127.0.0.1".equals(lowerHost)
                    || "0.0.0.0".equals(lowerHost)
                    || "169.254.169.254".equals(lowerHost)
                    || lowerHost.endsWith(".internal")
                    || lowerHost.endsWith(".local")) {
                throw new BusinessRuleException("Host interno ou loopback não permitido para conexão externa do Directus.");
            }
            InetAddress addr = InetAddress.getByName(host);
            if (addr.isLoopbackAddress() || addr.isLinkLocalAddress() || addr.isSiteLocalAddress() || addr.isAnyLocalAddress()) {
                throw new BusinessRuleException("Endereço IP privado/interno bloqueado pela política de proteção SSRF.");
            }
            return uri.toString();
        } catch (BusinessRuleException e) {
            throw e;
        } catch (Exception e) {
            throw new BusinessRuleException("URL do Directus inválida ou inacessível: " + e.getMessage());
        }
    }

    private boolean isPlaceholderValue(String val) {
        if (val == null) {
            return true;
        }
        String clean = val.trim();
        return clean.isEmpty()
                || "undefined".equalsIgnoreCase(clean)
                || "null".equalsIgnoreCase(clean)
                || "nan".equalsIgnoreCase(clean)
                || "[object Object]".equalsIgnoreCase(clean);
    }

    private String extractString(Map<String, Object> map, String key, String fallback) {
        if (map == null || !map.containsKey(key) || map.get(key) == null) {
            return fallback;
        }
        String s = map.get(key).toString().trim();
        return isPlaceholderValue(s) ? fallback : s;
    }

    private Number extractNumber(Object val) {
        if (val instanceof Number n) {
            return n;
        }
        if (val instanceof String s && !isPlaceholderValue(s)) {
            try {
                return Double.parseDouble(s.trim());
            } catch (NumberFormatException ignored) {
            }
        }
        return null;
    }

    private Object firstNonNull(Object... values) {
        for (Object v : values) {
            if (v instanceof String s) {
                if (!isPlaceholderValue(s)) {
                    return s.trim();
                }
            } else if (v != null) {
                return v;
            }
        }
        return null;
    }

    private String firstNonBlank(String... values) {
        for (String v : values) {
            if (!isPlaceholderValue(v)) {
                return v.trim();
            }
        }
        return null;
    }

    private String formatTitleCase(String input) {
        String[] words = input.trim().toLowerCase().split("\\s+");
        StringBuilder sb = new StringBuilder();
        for (String w : words) {
            if (!w.isEmpty()) {
                if (!sb.isEmpty()) sb.append(" ");
                sb.append(Character.toUpperCase(w.charAt(0))).append(w.substring(1));
            }
        }
        return sb.toString();
    }
}
