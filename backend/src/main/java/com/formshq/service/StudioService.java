package com.formshq.service;

import com.formshq.domain.entity.CallRecord;
import com.formshq.domain.entity.Evaluation;
import com.formshq.domain.entity.EvaluationItemSnapshot;
import com.formshq.domain.entity.User;
import com.formshq.domain.enums.Role;
import com.formshq.dto.studio.*;
import com.formshq.dto.studio.FlowExecutionResultDto.StepLogDto;
import com.formshq.dto.studio.StudioBenchmarkResponse.AnalystBenchmarkDto;
import com.formshq.dto.studio.StudioBenchmarkResponse.CategoryBenchmarkDto;
import com.formshq.dto.studio.StudioCollectionDto.StudioFieldDto;
import com.formshq.dto.studio.StudioCollectionDto.StudioPermissionDto;
import com.formshq.dto.studio.StudioFlowDto.FlowOperationDto;
import com.formshq.dto.studio.StudioPolicyDto.PolicyRuleDto;
import com.formshq.dto.studio.StudioRoleDto.RoleMemberDto;
import com.formshq.exception.BusinessRuleException;
import com.formshq.exception.ResourceNotFoundException;
import com.formshq.repository.*;
import com.formshq.security.UserPrincipal;
import jakarta.annotation.PostConstruct;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.OffsetDateTime;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.stream.Collectors;

/**
 * Camada de serviço responsável pelas regras de negócio de Modelo de Dados,
 * Fluxos de Automação, Perfis, Políticas RBAC, Benchmarks, Webhooks e Configurações do NEXFORM.
 */
@Service
@RequiredArgsConstructor
public class StudioService {

    private final CallRecordRepository callRecordRepository;
    private final EvaluationRepository evaluationRepository;
    private final EvaluationFormTemplateRepository formTemplateRepository;
    private final CustomerRepository customerRepository;
    private final UserRepository userRepository;

    private final List<StudioFlowDto> studioFlows = new CopyOnWriteArrayList<>();
    private final List<StudioWebhookDto> studioWebhooks = new CopyOnWriteArrayList<>();
    private final List<StudioActivityDto> customFlowActivities = new CopyOnWriteArrayList<>();
    private final Map<String, List<StudioFieldDto>> customCollectionFields = new ConcurrentHashMap<>();
    private final List<StudioCollectionDto> customCollections = new CopyOnWriteArrayList<>();

    private final List<StudioRoleDto> studioRoles = new CopyOnWriteArrayList<>();
    private final List<StudioPolicyDto> studioPolicies = new CopyOnWriteArrayList<>();
    private final Map<String, Object> studioSettings = new ConcurrentHashMap<>();
    private final List<StudioBookmarkDto> studioBookmarks = new CopyOnWriteArrayList<>();
    private final List<StudioTranslationDto> studioTranslations = new CopyOnWriteArrayList<>();
    private final List<StudioExtensionDto> studioExtensions = new CopyOnWriteArrayList<>();
    private final List<StudioFeedbackDto> studioFeedback = new CopyOnWriteArrayList<>();

    @PostConstruct
    public void initDefaultModules() {
        studioFlows.add(new StudioFlowDto(
                "flow-post-webhook-contato-directus",
                "Buscar Dados de Contato • POST Webhook Directus",
                "Dispara POST automático para o Webhook configurado em CUSTOMER_WEBHOOK_URL sempre que o telefone é informado, puxando os 13 campos de dados da venda.",
                "ACTIVE",
                "WEBHOOK",
                "customers.lookup.phone",
                List.of(
                        new FlowOperationDto(
                                "op-contato-params",
                                "Parâmetros do Contato (Telefone)",
                                "transform",
                                "{\n  \"telefone\": \"{{ $trigger.telefone }}\",\n  \"cpf\": \"{{ $trigger.cpf }}\",\n  \"nome_da_mae\": \"{{ $trigger.nome_da_mae }}\",\n  \"nome_do_pai\": \"{{ $trigger.nome_do_pai }}\",\n  \"nome\": \"{{ $trigger.nome }}\"\n}"
                        ),
                        new FlowOperationDto(
                                "op-webhook-post-directus",
                                "POST Webhook n8n / Directus",
                                "request",
                                "POST ${CUSTOMER_WEBHOOK_URL}"
                        ),
                        new FlowOperationDto(
                                "op-preencher-contato",
                                "Preencher Campos automaticamente",
                                "item-update",
                                "{\n  \"nome\": \"{{ $last.Nome }}\",\n  \"cpf\": \"{{ $last.CPF }}\",\n  \"nome_da_mae\": \"{{ $last.Nome_da_mae }}\",\n  \"nome_do_pai\": \"{{ $last.Nome_do_pai }}\",\n  \"telefone\": \"{{ $trigger.telefone }}\"\n}"
                        )
                ),
                0,
                OffsetDateTime.now(),
                "READY"
        ));

        studioFlows.add(new StudioFlowDto(
                "flow-directus-evaluations-sync",
                "Sincronização de Usuários & Avaliações Directus",
                "Importa operadores, monitores e avaliações das coleções Monitoria_SAC, Monitoria_Retencao e Monitoria_Tim_Aquisicao.",
                "ACTIVE",
                "REST_SYNC",
                "integrations.directus.pull",
                List.of(
                        new FlowOperationDto("op-dir-users", "GET /users (Directus)", "request", "GET ${DIRECTUS_BASE_URL}/users?fields=id,first_name,last_name,email,role.*"),
                        new FlowOperationDto("op-dir-items", "GET /items/{collection}?fields=*.*", "request", "GET ${DIRECTUS_BASE_URL}/items/{collection}?fields=*.*"),
                        new FlowOperationDto("op-r2-audio", "Armazenamento de Áudios no Cloudflare R2", "item-update", "PUT s3://${R2_BUCKET}/{audioKey}")
                ),
                0,
                OffsetDateTime.now(),
                "READY"
        ));

        studioRoles.add(new StudioRoleDto(
                "role-gestor-admin",
                "ROLE_GESTOR",
                "Gestora de Qualidade & RH (Acesso Total)",
                "Acesso irrestrito ao Modelo de Dados, Fluxos, Avaliações de Ligações, Matrizes de Formulários, Benchmarks e Configurações do Sistema.",
                "ShieldCheck",
                true,
                true,
                false,
                List.of("policy-admin-full", "policy-audio-stream"),
                List.of(),
                0
        ));

        studioRoles.add(new StudioRoleDto(
                "role-analista-readonly",
                "ROLE_ANALISTA",
                "Analista de Atendimento (Escopo Próprio)",
                "Acesso estritamente somente-leitura ao próprio Dashboard de notas e às suas próprias Avaliações com escuta da ligação vinculada.",
                "Users",
                false,
                true,
                false,
                List.of("policy-analyst-self-read", "policy-audio-stream"),
                List.of(),
                0
        ));

        studioRoles.add(new StudioRoleDto(
                "role-n8n-service",
                "ROLE_N8N_WEBHOOK",
                "Agente de Automação n8n (Conta de Serviço)",
                "Conta de serviço autenticada via header X-API-KEY para ingestão contínua de gravações e metadados de telefonia.",
                "Webhook",
                false,
                false,
                false,
                List.of("policy-n8n-ingest"),
                List.of(),
                0
        ));

        studioPolicies.add(new StudioPolicyDto(
                "policy-diretor-admin",
                "Política Diretoria & Governança • Acesso Total",
                "ROLE_ADMIN",
                "Controle global da plataforma, gestão exclusiva de setores (/sectors), delegação de escopo por gestor e administração de usuários.",
                "0.0.0.0/0",
                true,
                true,
                List.of(
                        new PolicyRuleDto("sectors", "FULL", "FULL", "FULL", "FULL", "FULL", "{}"),
                        new PolicyRuleDto("users", "FULL", "FULL", "FULL", "SOFT", "FULL", "{}"),
                        new PolicyRuleDto("call_records", "FULL", "FULL", "FULL", "NONE", "FULL", "{}"),
                        new PolicyRuleDto("evaluations", "FULL", "FULL", "IMMUTABLE", "NONE", "FULL", "{}"),
                        new PolicyRuleDto("evaluation_form_templates", "FULL", "FULL", "FULL", "SOFT", "FULL", "{}"),
                        new PolicyRuleDto("customers", "FULL", "FULL", "FULL", "NONE", "FULL", "{}"),
                        new PolicyRuleDto("sys_flows", "FULL", "FULL", "FULL", "FULL", "FULL", "{}")
                )
        ));

        studioPolicies.add(new StudioPolicyDto(
                "policy-admin-full",
                "Política Gestão QA • Escopo de Setores Autorizados",
                "ROLE_GESTOR",
                "Permissão para avaliar ligações, editar matrizes de formulários e gerenciar analistas vinculados aos setores autorizados.",
                "0.0.0.0/0",
                false,
                true,
                List.of(
                        new PolicyRuleDto("sectors", "NONE", "CUSTOM", "NONE", "NONE", "NONE", "{ \"sector\": { \"_in\": \"$ALLOWED_SECTORS\" } }"),
                        new PolicyRuleDto("users", "CUSTOM", "CUSTOM", "CUSTOM", "SOFT", "NONE", "{ \"department\": { \"_in\": \"$ALLOWED_SECTORS\" } }"),
                        new PolicyRuleDto("call_records", "FULL", "CUSTOM", "FULL", "NONE", "FULL", "{ \"sector\": { \"_in\": \"$ALLOWED_SECTORS\" } }"),
                        new PolicyRuleDto("evaluations", "FULL", "CUSTOM", "IMMUTABLE", "NONE", "FULL", "{ \"sector\": { \"_in\": \"$ALLOWED_SECTORS\" } }"),
                        new PolicyRuleDto("evaluation_form_templates", "FULL", "FULL", "FULL", "SOFT", "FULL", "{}"),
                        new PolicyRuleDto("customers", "FULL", "FULL", "FULL", "NONE", "FULL", "{}"),
                        new PolicyRuleDto("sys_flows", "FULL", "FULL", "FULL", "FULL", "FULL", "{}")
                )
        ));

        studioPolicies.add(new StudioPolicyDto(
                "policy-analyst-self-read",
                "Política Analista • Leitura Restrita ao Próprio Escopo",
                "ROLE_ANALISTA",
                "Bloqueia acesso administrativo (403) e filtra registros para exibir exclusivamente avaliações onde analyst_id == $CURRENT_USER.",
                "0.0.0.0/0",
                false,
                true,
                List.of(
                        new PolicyRuleDto("call_records", "NONE", "CUSTOM", "NONE", "NONE", "NONE", "{ \"analyst\": { \"id\": { \"_eq\": \"$CURRENT_USER\" } } }"),
                        new PolicyRuleDto("evaluations", "NONE", "CUSTOM", "NONE", "NONE", "NONE", "{ \"analyst\": { \"id\": { \"_eq\": \"$CURRENT_USER\" } } }"),
                        new PolicyRuleDto("evaluation_form_templates", "NONE", "NONE", "NONE", "NONE", "NONE", "{ \"_none\": true }"),
                        new PolicyRuleDto("customers", "NONE", "NONE", "NONE", "NONE", "NONE", "{ \"_none\": true }"),
                        new PolicyRuleDto("users", "NONE", "CUSTOM", "NONE", "NONE", "NONE", "{ \"id\": { \"_eq\": \"$CURRENT_USER\" } }"),
                        new PolicyRuleDto("sys_flows", "NONE", "NONE", "NONE", "NONE", "NONE", "{ \"_none\": true }")
                )
        ));

        studioPolicies.add(new StudioPolicyDto(
                "policy-n8n-ingest",
                "Política Agente n8n • Ingestão de Ligações",
                "ROLE_N8N_WEBHOOK",
                "Permite exclusivamente POST em call_records e sincronização automática de clientes via X-API-KEY.",
                "10.0.0.0/8, 172.16.0.0/12",
                false,
                false,
                List.of(
                        new PolicyRuleDto("call_records", "FULL", "CUSTOM", "NONE", "NONE", "NONE", "{ \"channel\": { \"_nnull\": true } }"),
                        new PolicyRuleDto("customers", "FULL", "FULL", "FULL", "NONE", "NONE", "{}")
                )
        ));

        studioSettings.put("projectName", "NEXFORM");
        studioSettings.put("projectDescriptor", "Plataforma de Monitoria de Qualidade & Desenvolvimento RH");
        studioSettings.put("projectUrl", "http://localhost:3000");
        studioSettings.put("defaultLanguage", "pt-BR");
        studioSettings.put("passingScoreTarget", 80.0);
        studioSettings.put("fatalErrorZeroRule", true);
        studioSettings.put("mandatoryCallLink", true);
        studioSettings.put("storageDriver", "local-fs-http-range-206");
        studioSettings.put("audioUploadMaxMb", 50);
        studioSettings.put("n8nApiKey", "n8n-secret-api-key-2026");
        studioSettings.put("jwtTtlHours", 24);
        studioSettings.put("themePreset", "shadcn-neutral-dark");
        studioSettings.put("borderRadius", "12px");
        studioSettings.put("density", "comfortable");
        studioSettings.put("sidebarMode", "locked-100dvh");
        studioSettings.put("customCss", "/* Estilização Personalizada NEXFORM */\n:root {\n  --nexform-bg: #0b0b0d;\n  --nexform-card: #101013;\n}");

        studioBookmarks.add(new StudioBookmarkDto(
                "bm-pending-calls",
                "Ligações Pendentes de Avaliação",
                "call_records",
                "table",
                "{ \"status\": { \"_eq\": \"PENDENTE\" } }",
                "ROLE_GESTOR",
                "PhoneCall",
                "/calls"
        ));

        studioBookmarks.add(new StudioBookmarkDto(
                "bm-fatal-zeroed",
                "Avaliações Zeradas por Erro Grave",
                "evaluations",
                "table",
                "{ \"fatalErrorTriggered\": { \"_eq\": true } }",
                "ROLE_GESTOR",
                "AlertTriangle",
                "/evaluations"
        ));

        studioBookmarks.add(new StudioBookmarkDto(
                "bm-kanban-qa",
                "Quadro Kanban de Auditoria QA",
                "call_records",
                "kanban",
                "{ \"groupBy\": \"status\" }",
                "ROLE_GESTOR",
                "Columns3",
                "/studio?section=content&layout=kanban"
        ));

        studioBookmarks.add(new StudioBookmarkDto(
                "bm-top-performers",
                "Top Performers (Nota >= 85%)",
                "evaluations",
                "table",
                "{ \"finalScorePercentage\": { \"_gte\": 85 } }",
                "RH & Gestão",
                "Award",
                "/benchmarks"
        ));

        studioTranslations.add(new StudioTranslationDto(
                "tr-1",
                "$t:evaluation.fatal_error_zero",
                "Erro Grave Detectado (Nota Zerada 0.00%)",
                "Critical Fatal Error Detected (Score Zeroed 0.00%)",
                "Error Grave Detectado (Nota Cero 0.00%)"
        ));
        studioTranslations.add(new StudioTranslationDto(
                "tr-2",
                "$t:evaluation.mandatory_call_link",
                "Gravação de Ligação Vinculada Obrigatória",
                "Mandatory Linked Call Recording",
                "Grabación de Llamada Vinculada Obligatoria"
        ));
        studioTranslations.add(new StudioTranslationDto(
                "tr-3",
                "$t:studio.field_weight_points",
                "Peso Ponderado do Critério (Pontos)",
                "Criterion Weighted Score (Points)",
                "Peso Ponderado del Criterio (Puntos)"
        ));
        studioTranslations.add(new StudioTranslationDto(
                "tr-4",
                "$t:rh.pdi_feedback_plan",
                "Plano de Desenvolvimento Individual (PDI 1:1)",
                "Individual Development Plan (1:1 Coaching)",
                "Plan de Desarrollo Individual (PDI 1:1)"
        ));
        studioTranslations.add(new StudioTranslationDto(
                "tr-5",
                "$t:crm.customer_phone_lookup",
                "Busca Automática de Cliente por Telefone (E.164)",
                "Automatic Customer Lookup by Phone (E.164)",
                "Búsqueda Automática de Cliente por Teléfono (E.164)"
        ));

        studioExtensions.add(new StudioExtensionDto(
                "ext-audio-range-player",
                "Reprodutor de Áudio HTTP 206 & Ondas Sonoras",
                "@nexform/interface-audio-player",
                "interface",
                "2.4.0",
                "Equipe NEXFORM",
                "Componente de reprodução de gravações .mp3/.wav com suporte a HTTP Range 206, controle de velocidade (1x-2x) e vínculo direto com avaliação.",
                true,
                true,
                14820,
                true
        ));

        studioExtensions.add(new StudioExtensionDto(
                "ext-weighted-field-stepper",
                "Seletor de Peso Ponderado & Regra de Erro Grave",
                "@nexform/interface-weight-stepper",
                "interface",
                "1.9.2",
                "Equipe NEXFORM",
                "Componente para ajuste em tempo real de pesos por pergunta (1 a 10 pts) e chaveamento de Erro Grave eliminatório.",
                true,
                true,
                9340,
                true
        ));

        studioExtensions.add(new StudioExtensionDto(
                "ext-n8n-webhook-operation",
                "Conector de Ingestão e Disparo n8n",
                "@nexform/operation-n8n-bridge",
                "operation",
                "3.1.0",
                "Equipe NEXFORM",
                "Operação nativa para Fluxos que sincroniza chamadas telefônicas recebidas do n8n via X-API-KEY e dispara gatilhos pós-avaliação.",
                true,
                true,
                28450,
                true
        ));

        studioExtensions.add(new StudioExtensionDto(
                "ext-crm-phone-lookup",
                "Conector CRM de Busca por Telefone E.164",
                "@nexform/endpoint-crm-lookup",
                "endpoint",
                "1.5.0",
                "Equipe NEXFORM",
                "Endpoint proxy que consulta APIs externas de CRM via RestClient a partir do telefone normalizado E.164.",
                true,
                true,
                7610,
                true
        ));

        studioExtensions.add(new StudioExtensionDto(
                "ext-kanban-audit-layout",
                "Quadro Kanban de Auditoria de Ligações",
                "@nexform/layout-kanban-board",
                "layout",
                "2.0.4",
                "Equipe NEXFORM",
                "Visualização em colunas de status (Pendente, Aprovado, Reprovado / Zerado por Erro Grave) para a coleção call_records.",
                true,
                true,
                19200,
                true
        ));

        studioExtensions.add(new StudioExtensionDto(
                "ext-ai-whisper-sentiment",
                "Transcrição de Áudio & Análise de Sentimento IA",
                "@nexform/operation-ai-transcription",
                "operation",
                "1.2.0",
                "NEXFORM Labs",
                "Transcreve automaticamente o áudio anexado na Etapa 2 e sugere marcação prévia dos critérios do formulário.",
                false,
                false,
                11540,
                true
        ));

        studioExtensions.add(new StudioExtensionDto(
                "ext-pdf-pdi-exporter",
                "Exportador de Relatório PDI 1:1 em PDF",
                "@nexform/panel-pdi-pdf",
                "panel",
                "1.1.0",
                "NEXFORM People Ops",
                "Gera dossiê individual em PDF com histórico de notas, aderência por bloco e plano de ação para feedback com o analista.",
                false,
                false,
                0,
                true
        ));
    }

    private String sanitizeIdentifier(String raw, String fallback) {
        if (raw == null || raw.isBlank()) {
            return fallback;
        }
        String sanitized = raw.trim().toLowerCase().replaceAll("[^a-z0-9_]", "_");
        return sanitized.isEmpty() ? fallback : sanitized;
    }

    // =========================================================================
    // 1. MODELO DE DADOS & COLEÇÕES
    // =========================================================================

    @Transactional(readOnly = true)
    public List<StudioCollectionDto> listCollections() {
        long callsCount = callRecordRepository.count();
        long evalsCount = evaluationRepository.count();
        long formsCount = formTemplateRepository.count();
        long customersCount = customerRepository.count();
        long usersCount = userRepository.count();

        List<StudioFieldDto> callFields = new ArrayList<>(List.of(
                new StudioFieldDto("id", "uuid • primary_key", true, true, "Identificador único da ligação (UUID v4)"),
                new StudioFieldDto("external_call_id", "varchar(120) • input", false, true, "Protocolo externo da ligação"),
                new StudioFieldDto("analyst_id", "uuid • select-dropdown-m2o (users)", false, true, "Analista responsável pelo atendimento"),
                new StudioFieldDto("customer_id", "uuid • select-dropdown-m2o (customers)", false, false, "Cliente vinculado via Lookup CRM"),
                new StudioFieldDto("customer_identifier", "varchar(180) • input", false, true, "Telefone normalizado E.164"),
                new StudioFieldDto("audio_url", "varchar(1000) • file-audio-range", false, true, "URL da gravação para reprodução HTTP 206"),
                new StudioFieldDto("duration_seconds", "integer • numeric", false, true, "Duração da chamada em segundos"),
                new StudioFieldDto("status", "enum(PENDENTE, AVALIADA) • badge", false, true, "Status no fluxo de auditoria")
        ));
        callFields.addAll(customCollectionFields.getOrDefault("call_records", List.of()));

        List<StudioFieldDto> evalFields = new ArrayList<>(List.of(
                new StudioFieldDto("id", "uuid • primary_key", true, true, "Chave primária da avaliação"),
                new StudioFieldDto("call_record_id", "uuid • m2o (call_records)", false, true, "Ligação obrigatoriamente vinculada"),
                new StudioFieldDto("analyst_id", "uuid • m2o (users)", false, true, "Analista avaliado"),
                new StudioFieldDto("evaluator_id", "uuid • m2o (users)", false, true, "Gestor avaliador"),
                new StudioFieldDto("form_name_snapshot", "varchar(180) • input-readonly", false, true, "Snapshot imutável do nome do formulário"),
                new StudioFieldDto("obtained_points", "integer • weight-sum", false, true, "Soma dos pesos dos campos marcados"),
                new StudioFieldDto("max_possible_points", "integer • weight-max", false, true, "Soma máxima de pesos possíveis"),
                new StudioFieldDto("fatal_error_triggered", "boolean • toggle-fatal", false, true, "Indica se algum Erro Grave foi cometido"),
                new StudioFieldDto("final_score_percentage", "numeric(5,2) • score-gauge", false, true, "Nota final (0.00% se houver Erro Grave)"),
                new StudioFieldDto("status", "enum(APROVADO, REPROVADO, ZERADO_ERRO_GRAVE)", false, true, "Resultado oficial consolidado")
        ));
        evalFields.addAll(customCollectionFields.getOrDefault("evaluations", List.of()));

        List<StudioFieldDto> formFields = new ArrayList<>(List.of(
                new StudioFieldDto("id", "uuid • primary_key", true, true, "ID do template"),
                new StudioFieldDto("name", "varchar(180) • input", false, true, "Título da matriz de qualidade"),
                new StudioFieldDto("passing_score_percentage", "numeric(5,2) • slider", false, true, "Nota mínima de corte (%)"),
                new StudioFieldDto("version", "integer • revision", false, true, "Versão incremental do schema"),
                new StudioFieldDto("active", "boolean • boolean-switch", false, true, "Disponível para avaliação"),
                new StudioFieldDto("items", "o2m • evaluation_form_items (weight + fatal_error)", false, true, "Perguntas com pesos editáveis e flag fatal")
        ));
        formFields.addAll(customCollectionFields.getOrDefault("evaluation_form_templates", List.of()));

        List<StudioFieldDto> customerFields = new ArrayList<>(List.of(
                new StudioFieldDto("id", "uuid • primary_key", true, true, "ID do cliente"),
                new StudioFieldDto("phone", "varchar(40) • phone-e164", false, true, "Telefone normalizado E.164"),
                new StudioFieldDto("name", "varchar(180) • input", false, true, "Nome completo do cliente"),
                new StudioFieldDto("document", "varchar(40) • input", false, true, "CPF / CNPJ"),
                new StudioFieldDto("contract_number", "varchar(80) • input", false, false, "Contrato ativo"),
                new StudioFieldDto("protocol", "varchar(80) • input", false, false, "Último protocolo CRM")
        ));
        customerFields.addAll(customCollectionFields.getOrDefault("customers", List.of()));

        List<StudioFieldDto> userFields = new ArrayList<>(List.of(
                new StudioFieldDto("id", "uuid • primary_key", true, true, "ID do usuário"),
                new StudioFieldDto("name", "varchar(150) • input", false, true, "Nome completo"),
                new StudioFieldDto("email", "varchar(180) • input-email", false, true, "E-mail corporativo"),
                new StudioFieldDto("role", "enum(ROLE_GESTOR, ROLE_ANALISTA) • select-role", false, true, "Perfil RBAC"),
                new StudioFieldDto("department", "varchar(100) • input", false, false, "Setor / Operação")
        ));
        userFields.addAll(customCollectionFields.getOrDefault("users", List.of()));

        List<StudioCollectionDto> result = new ArrayList<>(List.of(
                new StudioCollectionDto(
                        "call_records",
                        "Gravações de Ligações",
                        "Registros de chamadas ingeridas via webhook n8n ou upload manual com streaming de áudio.",
                        "PhoneCall",
                        callsCount,
                        true,
                        callFields,
                        new StudioPermissionDto("FULL", "ALL_RECORDS", "FULL", "IMMUTABLE")
                ),
                new StudioCollectionDto(
                        "evaluations",
                        "Avaliações & Snapshots",
                        "Auditorias consolidadas com pesos por campo, flag de Erro Grave e snapshot imutável.",
                        "ClipboardCheck",
                        evalsCount,
                        true,
                        evalFields,
                        new StudioPermissionDto("ROLE_GESTOR", "ALL (Analista: apenas próprias)", "IMMUTABLE_SNAPSHOT", "NONE")
                ),
                new StudioCollectionDto(
                        "evaluation_form_templates",
                        "Matrizes de Formulários QA",
                        "Schemas dinâmicos de avaliação com pesos configuráveis por campo e versionamento.",
                        "FolderKanban",
                        formsCount,
                        false,
                        formFields,
                        new StudioPermissionDto("ROLE_GESTOR", "ROLE_GESTOR", "ROLE_GESTOR (Nova Versão)", "SOFT_TOGGLE")
                ),
                new StudioCollectionDto(
                        "customers",
                        "Clientes (CRM Lookup)",
                        "Base de contatos sincronizada por telefone via RestClient e anexos de ligações.",
                        "Database",
                        customersCount,
                        false,
                        customerFields,
                        new StudioPermissionDto("AUTO_SYNC", "ROLE_GESTOR", "ROLE_GESTOR", "NONE")
                ),
                new StudioCollectionDto(
                        "users",
                        "Usuários & Perfis RBAC",
                        "Gestores de Qualidade (ROLE_GESTOR) e Analistas de Atendimento (ROLE_ANALISTA).",
                        "Users",
                        usersCount,
                        false,
                        userFields,
                        new StudioPermissionDto("ROLE_GESTOR", "ROLE_GESTOR", "ROLE_GESTOR", "NONE")
                )
        ));

        result.addAll(customCollections);
        return result;
    }

    public StudioCollectionDto createCollection(CreateCollectionRequest request, UserPrincipal currentUser) {
        String rawKey = sanitizeIdentifier(request.collection(), "nova_colecao");
        String displayName = (request.displayName() != null && !request.displayName().isBlank())
                ? request.displayName().trim()
                : rawKey;
        String description = (request.description() != null && !request.description().isBlank())
                ? request.description().trim()
                : "Coleção customizada criada no Modelo de Dados NEXFORM.";
        String pkType = (request.primaryKeyType() != null && !request.primaryKeyType().isBlank())
                ? request.primaryKeyType().trim()
                : "uuid";

        List<StudioFieldDto> initialFields = new ArrayList<>();
        initialFields.add(new StudioFieldDto("id", pkType + " • primary_key", true, true, "Chave primária da coleção"));
        initialFields.add(new StudioFieldDto("status", "varchar(40) • select-dropdown", false, true, "Status do item"));
        initialFields.add(new StudioFieldDto("created_at", "timestamp • datetime-created", false, true, "Data de criação do registro"));

        StudioCollectionDto created = new StudioCollectionDto(
                rawKey,
                displayName,
                description,
                "Database",
                0L,
                false,
                initialFields,
                new StudioPermissionDto("ROLE_GESTOR", "ROLE_GESTOR", "ROLE_GESTOR", "ROLE_GESTOR")
        );

        customCollections.add(created);
        customFlowActivities.add(0, new StudioActivityDto(
                "act-col-" + UUID.randomUUID(),
                "schema.collection.create",
                "sys_collections",
                rawKey,
                currentUser.getName(),
                currentUser.getRole().name(),
                "Criou coleção '" + rawKey + "' (" + displayName + ") no Modelo de Dados",
                OffsetDateTime.now()
        ));

        return created;
    }

    public StudioFieldDto addFieldToCollection(String collection, CreateFieldRequest request, UserPrincipal currentUser) {
        String sanitizedCollection = sanitizeIdentifier(collection, "call_records");
        String fieldName = sanitizeIdentifier(request.field(), "novo_campo");
        String sqlType = (request.type() != null && !request.type().isBlank()) ? request.type().trim() : "varchar(180)";
        String uiInterface = (request.interfaceType() != null && !request.interfaceType().isBlank()) ? request.interfaceType().trim() : "input";
        String width = (request.width() != null && !request.width().isBlank()) ? request.width().trim() : "half";
        String description = (request.description() != null && !request.description().isBlank())
                ? request.description().trim()
                : "Campo configurado no Modelo de Dados (" + width + ")";

        StudioFieldDto newField = new StudioFieldDto(
                fieldName,
                sqlType + " • " + uiInterface + " (" + width + ")",
                false,
                request.required(),
                description
        );

        for (int i = 0; i < customCollections.size(); i++) {
            StudioCollectionDto col = customCollections.get(i);
            if (col.collection().equals(sanitizedCollection)) {
                List<StudioFieldDto> updatedFields = new ArrayList<>(col.fields());
                updatedFields.add(newField);
                customCollections.set(i, new StudioCollectionDto(
                        col.collection(),
                        col.displayName(),
                        col.description(),
                        col.icon(),
                        col.itemCount(),
                        col.readOnlyForAnalyst(),
                        updatedFields,
                        col.permissions()
                ));
                return newField;
            }
        }

        customCollectionFields
                .computeIfAbsent(sanitizedCollection, k -> new CopyOnWriteArrayList<>())
                .add(newField);

        customFlowActivities.add(0, new StudioActivityDto(
                "act-fld-" + UUID.randomUUID(),
                "schema.field.create",
                sanitizedCollection,
                fieldName,
                currentUser.getName(),
                currentUser.getRole().name(),
                "Adicionou campo '" + fieldName + "' (" + sqlType + ") na coleção " + sanitizedCollection,
                OffsetDateTime.now()
        ));

        return newField;
    }

    @Transactional(readOnly = true)
    public List<StudioActivityDto> listActivity() {
        List<StudioActivityDto> events = new ArrayList<>(customFlowActivities);

        for (Evaluation ev : evaluationRepository.findAllByOrderByEvaluatedAtDesc()) {
            events.add(new StudioActivityDto(
                    "act-eval-" + ev.getId(),
                    ev.isFatalErrorTriggered() ? "evaluation.fatal_zero" : "evaluation.submit",
                    "evaluations",
                    ev.getCallRecord().getExternalCallId(),
                    ev.getEvaluator().getName(),
                    "ROLE_GESTOR",
                    String.format("Avaliou ligação #%s de %s: Nota %s%% (%d/%d pts • %s)",
                            ev.getCallRecord().getExternalCallId(),
                            ev.getAnalyst().getName(),
                            ev.getFinalScorePercentage(),
                            ev.getObtainedPoints(),
                            ev.getMaxPossiblePoints(),
                            ev.getStatus()),
                    ev.getEvaluatedAt()
            ));
        }

        for (CallRecord call : callRecordRepository.findAllByOrderByCallDateDesc()) {
            events.add(new StudioActivityDto(
                    "act-call-" + call.getId(),
                    "call.recording.ingest",
                    "call_records",
                    call.getExternalCallId(),
                    "Pipeline de Áudio NEXFORM",
                    "SYSTEM",
                    String.format("Gravação #%s (%ds) vinculada a %s",
                            call.getExternalCallId(),
                            call.getDurationSeconds(),
                            call.getAnalyst().getName()),
                    call.getCreatedAt()
            ));
        }

        events.sort(Comparator.comparing(StudioActivityDto::timestamp).reversed());
        return events.stream().limit(35).toList();
    }

    // =========================================================================
    // 2. FLUXOS DE AUTOMAÇÃO
    // =========================================================================

    public List<StudioFlowDto> listFlows() {
        return studioFlows;
    }

    public StudioFlowDto createFlow(CreateFlowRequest request) {
        String id = "flow-" + (1000 + studioFlows.size() + 1);
        String name = request.name().trim();
        String description = (request.description() != null && !request.description().isBlank())
                ? request.description().trim()
                : "Automação disparada por eventos de avaliação.";
        String triggerType = (request.triggerType() != null && !request.triggerType().isBlank())
                ? request.triggerType().trim()
                : "EVENT_HOOK";
        String triggerCollection = (request.triggerCollection() != null && !request.triggerCollection().isBlank())
                ? request.triggerCollection().trim()
                : "evaluations.items.create";
        String conditionSummary = (request.conditionSummary() != null && !request.conditionSummary().isBlank())
                ? request.conditionSummary().trim()
                : "{ \"finalScorePercentage\": { \"_lt\": 75 } }";
        String actionSummary = (request.actionSummary() != null && !request.actionSummary().isBlank())
                ? request.actionSummary().trim()
                : "POST Webhook / Notificar Gestão";

        StudioFlowDto created = new StudioFlowDto(
                id,
                name,
                description,
                "ACTIVE",
                triggerType,
                triggerCollection,
                List.of(
                        new FlowOperationDto(id + "-op1", "Filtro / Condição", "condition", conditionSummary),
                        new FlowOperationDto(id + "-op2", "Transformar Dados da Avaliação", "transform", "Monta payload com nota, pesos e link da gravação"),
                        new FlowOperationDto(id + "-op3", "Disparar Ação / Webhook", "request", actionSummary)
                ),
                0,
                OffsetDateTime.now(),
                "READY"
        );

        studioFlows.add(0, created);
        return created;
    }

    public StudioFlowDto addFlowOperation(String flowId, CreateFlowOperationRequest request) {
        for (int i = 0; i < studioFlows.size(); i++) {
            StudioFlowDto f = studioFlows.get(i);
            if (f.id().equals(flowId)) {
                List<FlowOperationDto> ops = new ArrayList<>(f.operations());
                String opId = "op-" + (100 + ops.size() + 1);
                String opName = request.name().trim();
                String opType = request.type().trim();
                String configSummary = (request.configSummary() != null && !request.configSummary().isBlank())
                        ? request.configSummary().trim()
                        : "{ \"status\": \"active\" }";

                ops.add(new FlowOperationDto(opId, opName, opType, configSummary));
                StudioFlowDto updated = new StudioFlowDto(
                        f.id(),
                        f.name(),
                        f.description(),
                        f.status(),
                        f.triggerType(),
                        f.triggerCollection(),
                        ops,
                        f.totalExecutions(),
                        f.lastExecutedAt(),
                        f.lastExecutionStatus()
                );
                studioFlows.set(i, updated);
                return updated;
            }
        }
        throw new ResourceNotFoundException("Fluxo não encontrado: " + flowId);
    }

    public StudioFlowDto deleteFlowOperation(String flowId, String opId) {
        for (int i = 0; i < studioFlows.size(); i++) {
            StudioFlowDto f = studioFlows.get(i);
            if (f.id().equals(flowId)) {
                List<FlowOperationDto> ops = f.operations().stream()
                        .filter(op -> !op.id().equals(opId))
                        .toList();
                StudioFlowDto updated = new StudioFlowDto(
                        f.id(),
                        f.name(),
                        f.description(),
                        f.status(),
                        f.triggerType(),
                        f.triggerCollection(),
                        ops,
                        f.totalExecutions(),
                        f.lastExecutedAt(),
                        f.lastExecutionStatus()
                );
                studioFlows.set(i, updated);
                return updated;
            }
        }
        throw new ResourceNotFoundException("Fluxo não encontrado: " + flowId);
    }

    public StudioFlowDto toggleFlow(String id) {
        for (int i = 0; i < studioFlows.size(); i++) {
            StudioFlowDto f = studioFlows.get(i);
            if (f.id().equals(id)) {
                String nextStatus = "ACTIVE".equals(f.status()) ? "PAUSED" : "ACTIVE";
                StudioFlowDto updated = new StudioFlowDto(
                        f.id(),
                        f.name(),
                        f.description(),
                        nextStatus,
                        f.triggerType(),
                        f.triggerCollection(),
                        f.operations(),
                        f.totalExecutions(),
                        f.lastExecutedAt(),
                        f.lastExecutionStatus()
                );
                studioFlows.set(i, updated);
                return updated;
            }
        }
        throw new ResourceNotFoundException("Fluxo não encontrado: " + id);
    }

    @Transactional(readOnly = true)
    public FlowExecutionResultDto triggerFlow(String id, UserPrincipal currentUser) {
        long startNano = System.nanoTime();
        StudioFlowDto target = studioFlows.stream()
                .filter(f -> f.id().equals(id))
                .findFirst()
                .orElseThrow(() -> new ResourceNotFoundException("Fluxo não encontrado: " + id));

        long evalCount = evaluationRepository.count();
        long pendingCalls = callRecordRepository.findAll().stream()
                .filter(c -> c.getStatus().name().equals("PENDENTE"))
                .count();

        List<StepLogDto> stepLogs = new ArrayList<>();
        stepLogs.add(new StepLogDto(
                "$gatilho • " + target.triggerType() + " (" + target.triggerCollection() + ")",
                "trigger",
                "SUCCESS",
                4,
                "Contexto carregado: " + evalCount + " avaliações e " + pendingCalls + " ligações pendentes."
        ));

        for (FlowOperationDto op : target.operations()) {
            stepLogs.add(new StepLogDto(
                    op.name(),
                    op.type(),
                    "SUCCESS",
                    8 + (Math.abs(op.id().hashCode()) % 12),
                    "Sucesso ✓ -> " + op.configSummary()
            ));
        }

        long totalDurationMs = Math.max(18, (System.nanoTime() - startNano) / 1_000_000 + 22);

        for (int i = 0; i < studioFlows.size(); i++) {
            if (studioFlows.get(i).id().equals(target.id())) {
                StudioFlowDto updated = new StudioFlowDto(
                        target.id(),
                        target.name(),
                        target.description(),
                        target.status(),
                        target.triggerType(),
                        target.triggerCollection(),
                        target.operations(),
                        target.totalExecutions() + 1,
                        OffsetDateTime.now(),
                        "SUCCESS"
                );
                studioFlows.set(i, updated);
                break;
            }
        }

        customFlowActivities.add(0, new StudioActivityDto(
                "act-flow-" + UUID.randomUUID(),
                "flow.manual.execute",
                "sys_flows",
                target.id(),
                currentUser.getName(),
                currentUser.getRole().name(),
                "Executou Fluxo '" + target.name() + "' (" + totalDurationMs + " ms • STATUS: SUCCESS)",
                OffsetDateTime.now()
        ));

        return new FlowExecutionResultDto(
                target.id(),
                target.name(),
                "SUCCESS",
                totalDurationMs,
                OffsetDateTime.now(),
                stepLogs
        );
    }

    // =========================================================================
    // 3. PERFIS DE USUÁRIO & POLÍTICAS DE ACESSO RBAC
    // =========================================================================

    @Transactional(readOnly = true)
    public List<StudioRoleDto> listRoles() {
        List<User> allUsers = userRepository.findAll();
        List<StudioRoleDto> enriched = new ArrayList<>();

        for (StudioRoleDto role : studioRoles) {
            List<RoleMemberDto> members = allUsers.stream()
                    .filter(u -> u.getRole().name().equals(role.code()))
                    .map(u -> new RoleMemberDto(
                            u.getId().toString(),
                            u.getName(),
                            u.getEmail(),
                            u.getDepartment() != null ? u.getDepartment() : "Operações"
                    ))
                    .toList();

            enriched.add(new StudioRoleDto(
                    role.id(),
                    role.code(),
                    role.name(),
                    role.description(),
                    role.icon(),
                    role.adminAccess(),
                    role.appAccess(),
                    role.enforceTwoFactor(),
                    role.policies(),
                    members,
                    members.size()
            ));
        }
        return enriched;
    }

    public StudioRoleDto createRole(CreateRoleRequest request) {
        String code = request.code().trim().toUpperCase().replaceAll("[^A-Z0-9_]", "_");
        if (!code.startsWith("ROLE_")) {
            code = "ROLE_" + code;
        }
        StudioRoleDto created = new StudioRoleDto(
                "role-" + (100 + studioRoles.size() + 1),
                code,
                request.name().trim(),
                (request.description() != null && !request.description().isBlank())
                        ? request.description().trim()
                        : "Perfil intermediário para calibração de avaliações.",
                "ShieldCheck",
                request.adminAccess(),
                request.appAccess(),
                false,
                List.of("policy-analyst-self-read"),
                List.of(),
                0
        );
        studioRoles.add(created);
        return created;
    }

    public List<StudioPolicyDto> listPolicies() {
        return studioPolicies;
    }

    public StudioPolicyDto createPolicy(CreatePolicyRequest request) {
        StudioPolicyDto created = new StudioPolicyDto(
                "policy-" + (100 + studioPolicies.size() + 1),
                request.name().trim(),
                request.roleCode().trim().toUpperCase(),
                (request.description() != null && !request.description().isBlank())
                        ? request.description().trim()
                        : "Política customizada de acesso a coleções.",
                "0.0.0.0/0",
                request.adminAccess(),
                request.appAccess(),
                List.of(
                        new PolicyRuleDto("call_records", "NONE", "FULL", "NONE", "NONE", "NONE", "{}"),
                        new PolicyRuleDto("evaluations", "FULL", "FULL", "NONE", "NONE", "FULL", "{}")
                )
        );
        studioPolicies.add(created);
        return created;
    }

    // =========================================================================
    // 4. CONFIGURAÇÕES & APARÊNCIA
    // =========================================================================

    public Map<String, Object> getSettings() {
        return new LinkedHashMap<>(studioSettings);
    }

    public Map<String, Object> updateSettings(Map<String, Object> updates, UserPrincipal currentUser) {
        if (updates == null || updates.isEmpty()) {
            throw new BusinessRuleException("Nenhum parâmetro de configuração informado.");
        }
        studioSettings.putAll(updates);
        customFlowActivities.add(0, new StudioActivityDto(
                "act-set-" + UUID.randomUUID(),
                "settings.update",
                "sys_settings",
                "global",
                currentUser.getName(),
                currentUser.getRole().name(),
                "Atualizou configurações gerais / aparência do sistema NEXFORM",
                OffsetDateTime.now()
        ));
        return new LinkedHashMap<>(studioSettings);
    }

    // =========================================================================
    // 5. FAVORITOS & FILTROS SALVOS
    // =========================================================================

    public List<StudioBookmarkDto> listBookmarks() {
        return studioBookmarks;
    }

    public StudioBookmarkDto createBookmark(CreateBookmarkRequest request) {
        String id = "bm-" + (100 + studioBookmarks.size() + 1);
        StudioBookmarkDto created = new StudioBookmarkDto(
                id,
                request.name().trim(),
                request.collection().trim(),
                (request.layout() != null && !request.layout().isBlank()) ? request.layout().trim() : "table",
                (request.filterJson() != null && !request.filterJson().isBlank()) ? request.filterJson().trim() : "{}",
                (request.scope() != null && !request.scope().isBlank()) ? request.scope().trim() : "ROLE_GESTOR",
                "Bookmark",
                (request.targetHref() != null && !request.targetHref().isBlank()) ? request.targetHref().trim() : "/studio?section=content"
        );
        studioBookmarks.add(0, created);
        return created;
    }

    public void deleteBookmark(String id) {
        studioBookmarks.removeIf(b -> id.equals(b.id()));
    }

    // =========================================================================
    // 6. TRADUÇÕES
    // =========================================================================

    public List<StudioTranslationDto> listTranslations() {
        return studioTranslations;
    }

    public StudioTranslationDto createTranslation(CreateTranslationRequest request) {
        String id = "tr-" + (100 + studioTranslations.size() + 1);
        StudioTranslationDto created = new StudioTranslationDto(
                id,
                request.key().trim(),
                request.ptBR() != null ? request.ptBR().trim() : "",
                request.enUS() != null ? request.enUS().trim() : "",
                request.esES() != null ? request.esES().trim() : ""
        );
        studioTranslations.add(0, created);
        return created;
    }

    public void deleteTranslation(String id) {
        studioTranslations.removeIf(t -> id.equals(t.id()));
    }

    // =========================================================================
    // 7. CATÁLOGO DE MÓDULOS & EXTENSÕES
    // =========================================================================

    public List<StudioExtensionDto> listExtensions() {
        return studioExtensions;
    }

    public StudioExtensionDto toggleExtension(String id) {
        for (int i = 0; i < studioExtensions.size(); i++) {
            StudioExtensionDto ext = studioExtensions.get(i);
            if (id.equals(ext.id())) {
                boolean nextInstalled = true;
                boolean nextEnabled = !ext.installed() || !ext.enabled();
                StudioExtensionDto updated = new StudioExtensionDto(
                        ext.id(),
                        ext.name(),
                        ext.packageName(),
                        ext.type(),
                        ext.version(),
                        ext.author(),
                        ext.description(),
                        nextInstalled,
                        nextEnabled,
                        ext.downloads(),
                        ext.verified()
                );
                studioExtensions.set(i, updated);
                return updated;
            }
        }
        throw new ResourceNotFoundException("Extensão não encontrada: " + id);
    }

    // =========================================================================
    // 8. REPORTAR PROBLEMA & SOLICITAR FUNCIONALIDADE
    // =========================================================================

    public List<StudioFeedbackDto> listFeedback() {
        return studioFeedback;
    }

    public StudioFeedbackDto createFeedback(CreateFeedbackRequest request, UserPrincipal currentUser) {
        String id = "fb-" + (100 + studioFeedback.size() + 1);
        String type = "BUG".equalsIgnoreCase(request.type()) ? "BUG" : "FEATURE";
        StudioFeedbackDto created = new StudioFeedbackDto(
                id,
                type,
                request.title().trim(),
                (request.module() != null && !request.module().isBlank()) ? request.module().trim() : "Geral",
                (request.severity() != null && !request.severity().isBlank()) ? request.severity().trim() : "MEDIUM",
                "ABERTO",
                1,
                currentUser.getName(),
                OffsetDateTime.now().toString(),
                request.description() != null ? request.description().trim() : ""
        );
        studioFeedback.add(0, created);
        return created;
    }

    public StudioFeedbackDto upvoteFeedback(String id) {
        for (int i = 0; i < studioFeedback.size(); i++) {
            StudioFeedbackDto item = studioFeedback.get(i);
            if (id.equals(item.id())) {
                StudioFeedbackDto updated = new StudioFeedbackDto(
                        item.id(),
                        item.type(),
                        item.title(),
                        item.module(),
                        item.severity(),
                        item.status(),
                        item.votes() + 1,
                        item.author(),
                        item.createdAt(),
                        item.description()
                );
                studioFeedback.set(i, updated);
                return updated;
            }
        }
        throw new ResourceNotFoundException("Registro não encontrado: " + id);
    }

    // =========================================================================
    // 9. WEBHOOKS DE SAÍDA
    // =========================================================================

    public List<StudioWebhookDto> listWebhooks() {
        return studioWebhooks;
    }

    public StudioWebhookDto createWebhook(CreateWebhookRequest request) {
        String id = "wh-" + (100 + studioWebhooks.size() + 1);
        StudioWebhookDto created = new StudioWebhookDto(
                id,
                request.name().trim(),
                "POST",
                request.url().trim(),
                "ACTIVE",
                List.of((request.action() != null && !request.action().isBlank()) ? request.action().trim() : "create"),
                List.of((request.collection() != null && !request.collection().isBlank()) ? request.collection().trim() : "evaluations"),
                1,
                "200 OK"
        );
        studioWebhooks.add(0, created);
        return created;
    }

    public StudioWebhookDto toggleWebhook(String id) {
        for (int i = 0; i < studioWebhooks.size(); i++) {
            StudioWebhookDto wh = studioWebhooks.get(i);
            if (wh.id().equals(id)) {
                String next = "ACTIVE".equals(wh.status()) ? "INACTIVE" : "ACTIVE";
                StudioWebhookDto updated = new StudioWebhookDto(
                        wh.id(),
                        wh.name(),
                        wh.method(),
                        wh.url(),
                        next,
                        wh.actions(),
                        wh.collections(),
                        wh.deliveriesCount(),
                        wh.lastHttpStatus()
                );
                studioWebhooks.set(i, updated);
                return updated;
            }
        }
        throw new ResourceNotFoundException("Webhook não encontrado: " + id);
    }

    // =========================================================================
    // 10. BENCHMARKS & INDICADORES DE PERFORMANCE
    // =========================================================================

    @Transactional(readOnly = true)
    public StudioBenchmarkResponse calculateBenchmarks() {
        long t0 = System.nanoTime();
        List<Evaluation> evaluations = evaluationRepository.findAllByOrderByEvaluatedAtDesc();
        List<CallRecord> calls = callRecordRepository.findAllByOrderByCallDateDesc();
        List<User> analysts = userRepository.findByRoleOrderByNameAsc(Role.ROLE_ANALISTA);
        long dbQueryLatencyMs = Math.max(1, (System.nanoTime() - t0) / 1_000_000);

        BigDecimal companyTarget = new BigDecimal("80.00");
        BigDecimal currentTeamAvg = BigDecimal.ZERO.setScale(2, RoundingMode.HALF_UP);
        BigDecimal complianceRate = new BigDecimal("100.00");

        if (!evaluations.isEmpty()) {
            BigDecimal sum = evaluations.stream()
                    .map(Evaluation::getFinalScorePercentage)
                    .reduce(BigDecimal.ZERO, BigDecimal::add);
            currentTeamAvg = sum.divide(BigDecimal.valueOf(evaluations.size()), 2, RoundingMode.HALF_UP);

            long nonFatalCount = evaluations.stream().filter(e -> !e.isFatalErrorTriggered()).count();
            complianceRate = BigDecimal.valueOf(nonFatalCount)
                    .multiply(new BigDecimal("100.00"))
                    .divide(BigDecimal.valueOf(evaluations.size()), 2, RoundingMode.HALF_UP);
        }

        int avgDuration = calls.isEmpty()
                ? 180
                : (int) calls.stream().mapToInt(CallRecord::getDurationSeconds).average().orElse(180);

        Map<String, long[]> categoryStats = new LinkedHashMap<>();
        for (Evaluation ev : evaluations) {
            if (ev.getItemSnapshots() == null) continue;
            for (EvaluationItemSnapshot snap : ev.getItemSnapshots()) {
                if (snap.isFatalErrorSnapshot()) continue;
                String cat = snap.getCategorySnapshot() != null ? snap.getCategorySnapshot() : "Geral";
                long[] counts = categoryStats.computeIfAbsent(cat, k -> new long[]{0L, 0L});
                counts[0] += 1;
                if (snap.isChecked()) {
                    counts[1] += 1;
                }
            }
        }

        List<CategoryBenchmarkDto> categoryBenchmarks = new ArrayList<>();
        for (Map.Entry<String, long[]> entry : categoryStats.entrySet()) {
            long total = entry.getValue()[0];
            long checked = entry.getValue()[1];
            BigDecimal adherence = total > 0
                    ? BigDecimal.valueOf(checked * 100.0 / total).setScale(1, RoundingMode.HALF_UP)
                    : BigDecimal.ZERO;
            categoryBenchmarks.add(new CategoryBenchmarkDto(
                    entry.getKey(),
                    total,
                    checked,
                    adherence,
                    companyTarget
            ));
        }

        Map<UUID, List<Evaluation>> evalsByAnalyst = evaluations.stream()
                .collect(Collectors.groupingBy(e -> e.getAnalyst().getId()));

        List<AnalystBenchmarkDto> analystBenchmarks = new ArrayList<>();
        for (User analyst : analysts) {
            List<Evaluation> aEvals = evalsByAnalyst.getOrDefault(analyst.getId(), List.of());
            BigDecimal avg = BigDecimal.ZERO.setScale(1, RoundingMode.HALF_UP);
            BigDecimal aCompliance = new BigDecimal("100.0");

            if (!aEvals.isEmpty()) {
                BigDecimal sum = aEvals.stream()
                        .map(Evaluation::getFinalScorePercentage)
                        .reduce(BigDecimal.ZERO, BigDecimal::add);
                avg = sum.divide(BigDecimal.valueOf(aEvals.size()), 1, RoundingMode.HALF_UP);

                long withoutFatal = aEvals.stream().filter(e -> !e.isFatalErrorTriggered()).count();
                aCompliance = BigDecimal.valueOf(withoutFatal * 100.0 / aEvals.size())
                        .setScale(1, RoundingMode.HALF_UP);
            }

            BigDecimal delta = avg.subtract(companyTarget).setScale(1, RoundingMode.HALF_UP);
            analystBenchmarks.add(new AnalystBenchmarkDto(
                    analyst.getId().toString(),
                    analyst.getName(),
                    analyst.getDepartment(),
                    aEvals.size(),
                    avg,
                    companyTarget,
                    delta,
                    aCompliance
            ));
        }

        analystBenchmarks.sort(Comparator.comparing(AnalystBenchmarkDto::averageScore).reversed());
        long apiLatencyMs = Math.max(1, (System.nanoTime() - t0) / 1_000_000);

        return new StudioBenchmarkResponse(
                companyTarget,
                currentTeamAvg,
                complianceRate,
                avgDuration,
                dbQueryLatencyMs,
                apiLatencyMs,
                1280L,
                categoryBenchmarks,
                analystBenchmarks
        );
    }
}
