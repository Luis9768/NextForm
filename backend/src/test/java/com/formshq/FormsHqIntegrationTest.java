package com.formshq;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.formshq.dto.auth.LoginRequest;
import com.formshq.dto.evaluation.CreateEvaluationRequest;
import com.formshq.dto.evaluation.ItemEvaluationInput;
import com.formshq.dto.form.FormItemRequest;
import com.formshq.dto.form.FormTemplateRequest;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;

import java.math.BigDecimal;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class FormsHqIntegrationTest {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper objectMapper;

    private String loginAndGetToken(String email, String password) throws Exception {
        MvcResult result = mockMvc.perform(post("/api/v1/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(new LoginRequest(email, password))))
                .andExpect(status().isOk())
                .andReturn();
        JsonNode json = objectMapper.readTree(result.getResponse().getContentAsString());
        return json.get("accessToken").asText();
    }

    @Test
    @DisplayName("Deve validar o webhook do n8n com X-API-KEY e rejeitar chaves inválidas")
    void shouldValidateN8nWebhookAndIngestCall() throws Exception {
        String payload = """
                {
                  "externalCallId": "call_123456",
                  "analystEmail": "analista@empresa.com",
                  "customerIdentifier": "+5511999999999",
                  "callDate": "2026-03-30T14:30:00Z",
                  "durationSeconds": 185,
                  "audioUrl": "https://storage.empresa.com/audios/call_123456.mp3",
                  "metadata": {
                    "channel": "telefonia",
                    "campaign": "cobranca"
                  }
                }
                """;

        // Sem X-API-KEY -> 401 Unauthorized
        mockMvc.perform(post("/api/v1/integrations/n8n/calls")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(payload))
                .andExpect(status().isUnauthorized());

        // Com X-API-KEY incorreta -> 401 Unauthorized
        mockMvc.perform(post("/api/v1/integrations/n8n/calls")
                        .header("X-API-KEY", "wrong-key")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(payload))
                .andExpect(status().isUnauthorized());

        // Com X-API-KEY válida -> 201 Created
        mockMvc.perform(post("/api/v1/integrations/n8n/calls")
                        .header("X-API-KEY", "test-n8n-secret-key")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(payload))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.externalCallId").value("call_123456"))
                .andExpect(jsonPath("$.analyst.email").value("analista@empresa.com"))
                .andExpect(jsonPath("$.status").value("PENDENTE"))
                .andExpect(jsonPath("$.channel").value("telefonia"))
                .andExpect(jsonPath("$.campaign").value("cobranca"));
    }

    @Test
    @DisplayName("Deve zerar a nota imediatamente quando um item de Erro Grave for marcado e preservar o snapshot")
    void shouldZeroScoreOnFatalErrorAndPreserveSnapshot() throws Exception {
        String gestorToken = loginAndGetToken("gestor@empresa.com", "Gestor@123");

        // 1. Cria um formulário novo com 4 itens padrão (1 pt cada) e 1 item de Erro Grave
        FormTemplateRequest formReq = new FormTemplateRequest(
                "Formulário Teste Snapshot",
                "Teste de cálculo e imutabilidade do histórico",
                new BigDecimal("75.00"),
                true,
                List.of(
                        new FormItemRequest("Critério 1", "Desc 1", "Abertura", false, 1, 1),
                        new FormItemRequest("Critério 2", "Desc 2", "Condução", false, 1, 2),
                        new FormItemRequest("Critério 3", "Desc 3", "Negociação", false, 1, 3),
                        new FormItemRequest("Critério 4", "Desc 4", "Fechamento", false, 1, 4),
                        new FormItemRequest("Erro Grave: Conduta Inadequada", "Zera a nota", "Erro Grave", true, 0, 5)
                )
        );

        MvcResult formResult = mockMvc.perform(post("/api/v1/forms")
                        .header("Authorization", "Bearer " + gestorToken)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(formReq)))
                .andExpect(status().isCreated())
                .andReturn();

        JsonNode createdForm = objectMapper.readTree(formResult.getResponse().getContentAsString());
        UUID formId = UUID.fromString(createdForm.get("id").asText());
        JsonNode formItems = createdForm.get("items");

        // 2. Ingere uma nova ligação via n8n para avaliação
        String callPayload = """
                {
                  "externalCallId": "call_fatal_test_01",
                  "analystEmail": "analista@empresa.com",
                  "customerIdentifier": "+5511988887777",
                  "callDate": "2026-03-30T15:00:00Z",
                  "durationSeconds": 120,
                  "audioUrl": "https://storage.empresa.com/audios/call_fatal_test_01.mp3",
                  "metadata": { "channel": "telefonia", "campaign": "retencao" }
                }
                """;
        MvcResult callResult = mockMvc.perform(post("/api/v1/integrations/n8n/calls")
                        .header("X-API-KEY", "test-n8n-secret-key")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(callPayload))
                .andExpect(status().isCreated())
                .andReturn();
        UUID callId = UUID.fromString(objectMapper.readTree(callResult.getResponse().getContentAsString()).get("id").asText());

        // 3. Avalia marcando TODOS os 4 itens padrão (4/4 = 100%) MAS também marcando o Erro Grave!
        CreateEvaluationRequest evalReq = new CreateEvaluationRequest(
                callId,
                formId,
                List.of(
                        new ItemEvaluationInput(UUID.fromString(formItems.get(0).get("id").asText()), true, null),
                        new ItemEvaluationInput(UUID.fromString(formItems.get(1).get("id").asText()), true, null),
                        new ItemEvaluationInput(UUID.fromString(formItems.get(2).get("id").asText()), true, null),
                        new ItemEvaluationInput(UUID.fromString(formItems.get(3).get("id").asText()), true, null),
                        new ItemEvaluationInput(UUID.fromString(formItems.get(4).get("id").asText()), true, "Violação constatada aos 01m15s")
                ),
                "Avaliação zerada devido ao erro grave."
        );

        MvcResult evalResult = mockMvc.perform(post("/api/v1/evaluations")
                        .header("Authorization", "Bearer " + gestorToken)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(evalReq)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.obtainedPoints").value(4))
                .andExpect(jsonPath("$.maxPossiblePoints").value(4))
                .andExpect(jsonPath("$.rawScorePercentage").value(100.0))
                .andExpect(jsonPath("$.finalScorePercentage").value(0.0))
                .andExpect(jsonPath("$.fatalErrorTriggered").value(true))
                .andExpect(jsonPath("$.status").value("ZERADO_ERRO_GRAVE"))
                .andReturn();

        UUID evaluationId = UUID.fromString(objectMapper.readTree(evalResult.getResponse().getContentAsString()).get("id").asText());

        // 4. Altera o formulário original e verifica que o snapshot da avaliação realizada permanece intacto
        FormTemplateRequest updateFormReq = new FormTemplateRequest(
                "Formulário Renomeado V2",
                "Nova descrição",
                new BigDecimal("90.00"),
                true,
                List.of(new FormItemRequest("Apenas 1 Item Novo", "Desc", "Geral", false, 1, 1))
        );
        mockMvc.perform(put("/api/v1/forms/" + formId)
                        .header("Authorization", "Bearer " + gestorToken)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(updateFormReq)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.version").value(2));

        mockMvc.perform(get("/api/v1/evaluations/" + evaluationId)
                        .header("Authorization", "Bearer " + gestorToken))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.formNameSnapshot").value("Formulário Teste Snapshot"))
                .andExpect(jsonPath("$.formVersionSnapshot").value(1))
                .andExpect(jsonPath("$.items.length()").value(5));
    }

    @Test
    @DisplayName("Deve garantir isolamento RBAC: Analista tem acesso somente-leitura apenas às suas próprias avaliações")
    void shouldEnforceRbacForAnalyst() throws Exception {
        String analistaToken = loginAndGetToken("analista@empresa.com", "Analista@123");
        String gestorToken = loginAndGetToken("gestor@empresa.com", "Gestor@123");

        // Analista não pode criar formulário -> 403 Forbidden
        FormTemplateRequest formReq = new FormTemplateRequest(
                "Tentativa Analista",
                "Desc",
                new BigDecimal("70.00"),
                true,
                List.of(new FormItemRequest("Item 1", "Desc", "Geral", false, 1, 1))
        );
        mockMvc.perform(post("/api/v1/forms")
                        .header("Authorization", "Bearer " + analistaToken)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(formReq)))
                .andExpect(status().isForbidden());

        // Analista listando avaliações só recebe as suas próprias (analista@empresa.com)
        MvcResult listResult = mockMvc.perform(get("/api/v1/evaluations")
                        .header("Authorization", "Bearer " + analistaToken))
                .andExpect(status().isOk())
                .andReturn();
        JsonNode evals = objectMapper.readTree(listResult.getResponse().getContentAsString());
        assertThat(evals.isArray()).isTrue();
        assertThat(evals.size()).isGreaterThan(0);
        for (JsonNode eval : evals) {
            assertThat(eval.get("analyst").get("email").asText()).isEqualTo("analista@empresa.com");
        }

        // Busca uma avaliação de outro analista (mariana.costa@empresa.com) usando token do gestor e tenta acessar com analista@empresa.com -> 403 Forbidden
        MvcResult allEvalsResult = mockMvc.perform(get("/api/v1/evaluations")
                        .header("Authorization", "Bearer " + gestorToken))
                .andExpect(status().isOk())
                .andReturn();
        JsonNode allEvals = objectMapper.readTree(allEvalsResult.getResponse().getContentAsString());
        String otherAnalystEvalId = null;
        for (JsonNode eval : allEvals) {
            if ("mariana.costa@empresa.com".equals(eval.get("analyst").get("email").asText())) {
                otherAnalystEvalId = eval.get("id").asText();
                break;
            }
        }
        assertThat(otherAnalystEvalId).isNotNull();

        mockMvc.perform(get("/api/v1/evaluations/" + otherAnalystEvalId)
                        .header("Authorization", "Bearer " + analistaToken))
                .andExpect(status().isForbidden());
    }

    @Test
    @DisplayName("Deve consultar dados cadastrais do cliente e histórico de gravações por telefone (Lookup)")
    void shouldLookupCustomerAndRecordingsByPhone() throws Exception {
        String gestorToken = loginAndGetToken("gestor@empresa.com", "Gestor@123");

        mockMvc.perform(get("/api/v1/customers/lookup")
                        .param("phone", "(11) 99999-9999")
                        .header("Authorization", "Bearer " + gestorToken))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.customer.name").value("Roberto Almeida Prado"))
                .andExpect(jsonPath("$.customer.document").value("348.912.408-55"))
                .andExpect(jsonPath("$.recordings").isArray())
                .andExpect(jsonPath("$.recordings.length()").value(org.hamcrest.Matchers.greaterThan(0)));
    }

    @Test
    @DisplayName("Deve validar a arquitetura StudioController -> StudioService, bloqueando ROLE_ANALISTA (403) e validando DTOs (@Valid)")
    void shouldEnforceStudioRbacAndDtoValidation() throws Exception {
        String analistaToken = loginAndGetToken("analista@empresa.com", "Analista@123");
        String gestorToken = loginAndGetToken("gestor@empresa.com", "Gestor@123");

        // Analista bloqueado (403 Forbidden) nos módulos de administração
        mockMvc.perform(get("/api/v1/studio/collections")
                        .header("Authorization", "Bearer " + analistaToken))
                .andExpect(status().isForbidden());

        mockMvc.perform(get("/api/v1/studio/flows")
                        .header("Authorization", "Bearer " + analistaToken))
                .andExpect(status().isForbidden());

        // Gestor acessa normalmente via StudioService
        mockMvc.perform(get("/api/v1/studio/collections")
                        .header("Authorization", "Bearer " + gestorToken))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].collection").value("call_records"));

        // Validação de entrada (@Valid) rejeita payload sem nome obrigatório (400 Bad Request)
        mockMvc.perform(post("/api/v1/studio/flows")
                        .header("Authorization", "Bearer " + gestorToken)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\": \"\"}"))
                .andExpect(status().isBadRequest());
    }

    @Test
    @DisplayName("Deve preservar o setor da época (analystSectorSnapshot) nas avaliações antigas mesmo após mudança de setor do analista")
    void shouldPreserveSectorHistoryWhenAnalystChangesSector() throws Exception {
        String gestorToken = loginAndGetToken("gestor@empresa.com", "Gestor@123");

        // 1. Busca o analista Lucas Ferreira (setor original: Cobrança & Retenção)
        MvcResult usersRes = mockMvc.perform(get("/api/v1/users?role=ROLE_ANALISTA")
                        .header("Authorization", "Bearer " + gestorToken))
                .andExpect(status().isOk())
                .andReturn();
        JsonNode analysts = objectMapper.readTree(usersRes.getResponse().getContentAsString());
        String lucasId = null;
        for (JsonNode a : analysts) {
            if ("analista@empresa.com".equals(a.get("email").asText())) {
                lucasId = a.get("id").asText();
                break;
            }
        }
        assertThat(lucasId).isNotNull();

        // 2. Gestora responsável altera o setor de Lucas para "SAC"
        mockMvc.perform(patch("/api/v1/users/" + lucasId + "/sector")
                        .header("Authorization", "Bearer " + gestorToken)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"newSector\": \"SAC\", \"reason\": \"Transferência para atendimento receptivo\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.department").value("SAC"));

        // 3. Verifica que o log de transição de setor foi gravado
        mockMvc.perform(get("/api/v1/users/" + lucasId + "/sector-history")
                        .header("Authorization", "Bearer " + gestorToken))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].previousSector").value("Cobrança & Retenção"))
                .andExpect(jsonPath("$[0].newSector").value("SAC"));

        // 4. Verifica que as avaliações antigas de Lucas continuam exibindo o setor da época ("Cobrança & Retenção")
        mockMvc.perform(get("/api/v1/evaluations?analystId=" + lucasId)
                        .header("Authorization", "Bearer " + gestorToken))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].analystSectorSnapshot").value("Cobrança & Retenção"));

        // Restaura setor original para não impactar outros testes
        mockMvc.perform(patch("/api/v1/users/" + lucasId + "/sector")
                        .header("Authorization", "Bearer " + gestorToken)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"newSector\": \"Cobrança & Retenção\", \"reason\": \"Restauração\"}"))
                .andExpect(status().isOk());
    }

    @Test
    @DisplayName("Deve validar gestão exclusiva de setores pelo Admin, inativação de usuários por escopo e filtros avançados da Central de Avaliações")
    void shouldEnforceAdminSectorManagementUserInactivationAndAdvancedEvaluationFilters() throws Exception {
        String adminToken = loginAndGetToken("admin@empresa.com", "Admin@123");
        String gestorToken = loginAndGetToken("gestor@empresa.com", "Gestor@123");

        // 1. Gestor NÃO pode criar novos setores -> 403 Forbidden
        mockMvc.perform(post("/api/v1/sectors")
                        .header("Authorization", "Bearer " + gestorToken)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\": \"Backoffice Fraude\", \"description\": \"Análise documental\"}"))
                .andExpect(status().isForbidden());

        // 2. Admin cria um novo setor com sucesso -> 201 Created
        mockMvc.perform(post("/api/v1/sectors")
                        .header("Authorization", "Bearer " + adminToken)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\": \"Backoffice Fraude\", \"description\": \"Análise documental\"}"))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.name").value("Backoffice Fraude"));

        // 3. Busca ID do Admin e verifica que Gestor NÃO pode inativar um Admin -> 403 Forbidden
        MvcResult adminsRes = mockMvc.perform(get("/api/v1/users?role=ROLE_ADMIN")
                        .header("Authorization", "Bearer " + adminToken))
                .andExpect(status().isOk())
                .andReturn();
        JsonNode admins = objectMapper.readTree(adminsRes.getResponse().getContentAsString());
        String adminId = admins.get(0).get("id").asText();

        mockMvc.perform(patch("/api/v1/users/" + adminId + "/status")
                        .header("Authorization", "Bearer " + gestorToken)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"active\": false}"))
                .andExpect(status().isForbidden());

        // 4. Central de Avaliações filtra por Nome do Analista e Setor
        mockMvc.perform(get("/api/v1/evaluations")
                        .param("analystName", "Lucas")
                        .param("sector", "Cobrança & Retenção")
                        .header("Authorization", "Bearer " + gestorToken))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].analyst.name").value("Lucas Ferreira"));

        // 5. Dashboard retorna médias por setor e comparativo por critérios
        mockMvc.perform(get("/api/v1/dashboard/summary")
                        .param("sector", "Cobrança & Retenção")
                        .header("Authorization", "Bearer " + gestorToken))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.sectorAverages").isArray())
                .andExpect(jsonPath("$.criteriaComparison").isArray());
    }
}
