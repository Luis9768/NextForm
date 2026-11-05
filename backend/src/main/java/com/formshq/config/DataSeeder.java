package com.formshq.config;

import com.formshq.domain.entity.CallRecord;
import com.formshq.domain.entity.Customer;
import com.formshq.domain.entity.EvaluationFormItem;
import com.formshq.domain.entity.EvaluationFormTemplate;
import com.formshq.domain.entity.Sector;
import com.formshq.domain.entity.User;
import com.formshq.domain.enums.CallStatus;
import com.formshq.domain.enums.Role;
import com.formshq.dto.evaluation.CreateEvaluationRequest;
import com.formshq.dto.evaluation.ItemEvaluationInput;
import com.formshq.repository.CallRecordRepository;
import com.formshq.repository.CustomerRepository;
import com.formshq.repository.EvaluationFormTemplateRepository;
import com.formshq.repository.SectorRepository;
import com.formshq.repository.UserRepository;
import com.formshq.security.UserPrincipal;
import com.formshq.service.DirectusEvaluationSyncService;
import com.formshq.service.EvaluationService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.CommandLineRunner;
import org.springframework.core.env.Environment;
import org.springframework.core.env.Profiles;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

@Slf4j
@Component
@RequiredArgsConstructor
public class DataSeeder implements CommandLineRunner {

    private final UserRepository userRepository;
    private final SectorRepository sectorRepository;
    private final CustomerRepository customerRepository;
    private final EvaluationFormTemplateRepository formTemplateRepository;
    private final CallRecordRepository callRecordRepository;
    private final EvaluationService evaluationService;
    private final DirectusEvaluationSyncService directusEvaluationSyncService;
    private final PasswordEncoder passwordEncoder;
    private final Environment environment;

    @Value("${app.security.bootstrap-admin.name:Super Admin NextForm}")
    private String bootstrapAdminName;

    @Value("${app.security.bootstrap-admin.email:supernext@gmail.com}")
    private String bootstrapAdminEmail;

    @Value("${app.security.bootstrap-admin.password:Nextformgeral@2026}")
    private String bootstrapAdminPassword;

    @Value("${app.integrations.directus.initial-eval-limit:${DIRECTUS_INITIAL_EVAL_LIMIT:-1}}")
    private int directusInitialEvalLimit;

    @Override
    @Transactional
    public void run(String... args) {
        boolean isTestProfile = environment.acceptsProfiles(Profiles.of("test"));

        ensureBaseSectorsAndAdmin(isTestProfile);
        ensurePortabilidadeFormTemplate();
        ensureSacFormTemplate();
        ensureRetencaoFormTemplate();

        if (!isTestProfile) {
            ensureBootstrapEnvAdmin();
            java.util.concurrent.CompletableFuture.runAsync(() -> {
                try {
                    var userResult = directusEvaluationSyncService.syncUsersAndPurgeFictionalData(null, null);
                    log.info("Sincronização inicial de Usuários Directus concluída: {} usuários reais ativos, {} fictícios removidos.",
                            userResult.syncedUsersCount(), userResult.purgedFictionalUsers());
                } catch (Exception e) {
                    log.warn("Aviso ao sincronizar usuários do Directus no boot (verifique DIRECTUS_BASE_URL e DIRECTUS_API_TOKEN no .env): {}", e.getMessage());
                }

                try {
                    var evalResult = directusEvaluationSyncService.pullFromDirectusApi(
                            new com.formshq.dto.directus.DirectusPullRequest(null, null, "ALL", directusInitialEvalLimit)
                    );
                    log.info("Sincronização inicial de Avaliações Directus concluída: {} avaliações importadas, {} atualizadas/ignoradas.",
                            evalResult.importedCount(), evalResult.skippedDuplicates());
                } catch (Exception e) {
                    log.warn("Aviso ao sincronizar avaliações do Directus no boot (verifique DIRECTUS_BASE_URL e DIRECTUS_API_TOKEN no .env): {}", e.getMessage());
                }

                try {
                    var audioBackup = directusEvaluationSyncService.backupAllDirectusAudios();
                    log.info("Backup físico de áudios do Directus concluído: {}", audioBackup);
                } catch (Exception e) {
                    log.warn("Aviso ao fazer backup físico dos áudios do Directus: {}", e.getMessage());
                }
            });
            return;
        }

        if (userRepository.count() > 1) {
            return;
        }

        log.info("Inicializando carga de dados de demonstração (Forms HQ)...");

        User gestor = userRepository.save(User.builder()
                .name("Carla Mendes (Gestora QA)")
                .email("gestor@empresa.com")
                .passwordHash(passwordEncoder.encode("Gestor@123"))
                .role(Role.ROLE_GESTOR)
                .department("Qualidade & Monitoria")
                .allowedSectors("SAC,Cobrança & Retenção,Suporte N1,Retenção & Ouvidoria")
                .active(true)
                .build());

        User analistaLucas = userRepository.save(User.builder()
                .name("Lucas Ferreira")
                .email("analista@empresa.com")
                .passwordHash(passwordEncoder.encode("Analista@123"))
                .role(Role.ROLE_ANALISTA)
                .department("Cobrança & Retenção")
                .manager(gestor)
                .active(true)
                .build());

        User analistaMariana = userRepository.save(User.builder()
                .name("Mariana Costa")
                .email("mariana.costa@empresa.com")
                .passwordHash(passwordEncoder.encode("Analista@123"))
                .role(Role.ROLE_ANALISTA)
                .department("Suporte N1")
                .manager(gestor)
                .active(true)
                .build());

        User analistaRafael = userRepository.save(User.builder()
                .name("Rafael Souza")
                .email("rafael.souza@empresa.com")
                .passwordHash(passwordEncoder.encode("Analista@123"))
                .role(Role.ROLE_ANALISTA)
                .department("Retenção & Ouvidoria")
                .manager(gestor)
                .active(true)
                .build());

        // Clientes de Exemplo para Busca Rápida (Lookup por Telefone)
        Customer custRoberto = customerRepository.save(Customer.builder()
                .phone("11999999999")
                .name("Roberto Almeida Prado")
                .document("348.912.408-55")
                .email("roberto.prado@empresacliente.com.br")
                .protocol("PROT-2026-884120")
                .build());

        Customer custFernanda = customerRepository.save(Customer.builder()
                .phone("11988112233")
                .name("Fernanda Oliveira Santos")
                .document("419.220.118-30")
                .email("fernanda.santos@email.com.br")
                .protocol("PROT-2026-772310")
                .build());

        Customer custCarlos = customerRepository.save(Customer.builder()
                .phone("11977445566")
                .name("Carlos Eduardo Ribeiro")
                .document("205.874.331-91")
                .email("carlos.ribeiro@outlook.com")
                .protocol("PROT-2026-665902")
                .build());

        Customer custPatricia = customerRepository.save(Customer.builder()
                .phone("21999887766")
                .name("Patrícia Lima Vasconcelos")
                .document("129.654.897-04")
                .email("patricia.lima@gmail.com")
                .protocol("PROT-2026-559104")
                .build());

        // Formulário 1: Monitoria Padrão Cobrança e Retenção
        EvaluationFormTemplate formCobranca = EvaluationFormTemplate.builder()
                .name("Monitoria Padrão - Cobrança e Retenção")
                .description("Formulário oficial de monitoria de qualidade para ligações de negociação, retenção e cobrança ativa/receptiva.")
                .sector("Cobrança & Retenção")
                .passingScorePercentage(new BigDecimal("75.00"))
                .version(1)
                .active(true)
                .createdBy(gestor)
                .build();

        formCobranca.clearAndSetItems(List.of(
                EvaluationFormItem.builder()
                        .label("Realizou saudação institucional e identificou-se com nome e empresa")
                        .description("O analista deve cumprimentar o cliente nos primeiros 10 segundos informando nome e empresa.")
                        .category("Abordagem Inicial")
                        .fatalError(false)
                        .points(1)
                        .displayOrder(1)
                        .build(),
                EvaluationFormItem.builder()
                        .label("Confirmou no mínimo 2 dados positivos de titularidade (CPF/Data de Nascimento)")
                        .description("Validação obrigatória de segurança antes de expor valores ou condições contratuais.")
                        .category("Segurança e LGPD")
                        .fatalError(false)
                        .points(1)
                        .displayOrder(2)
                        .build(),
                EvaluationFormItem.builder()
                        .label("Manteve tom de voz cordial, escuta ativa e empatia durante toda a ligação")
                        .description("Sem interrupções abruptas, demonstrando compreensão da situação do cliente.")
                        .category("Postura e Comunicação")
                        .fatalError(false)
                        .points(1)
                        .displayOrder(3)
                        .build(),
                EvaluationFormItem.builder()
                        .label("Realizou sondagem adequada para identificar o motivo da pendência/solicitação")
                        .description("Fez perguntas abertas ou direcionadas para entender o cenário financeiro do cliente.")
                        .category("Diagnóstico")
                        .fatalError(false)
                        .points(1)
                        .displayOrder(4)
                        .build(),
                EvaluationFormItem.builder()
                        .label("Apresentou proposta de acordo dentro da alçada vigente de forma clara")
                        .description("Explicou valores, descontos, vencimento e encargos com transparência.")
                        .category("Condução e Negociação")
                        .fatalError(false)
                        .points(1)
                        .displayOrder(5)
                        .build(),
                EvaluationFormItem.builder()
                        .label("Argumentou benefícios da regularização e contornou objeções com técnica")
                        .description("Destacou reabilitação de crédito e condições exclusivas da campanha.")
                        .category("Condução e Negociação")
                        .fatalError(false)
                        .points(1)
                        .displayOrder(6)
                        .build(),
                EvaluationFormItem.builder()
                        .label("Realizou resumo formal do acordo/atendimento e informou número de protocolo")
                        .description("Recapitulou valor, data de vencimento, forma de envio do boleto e protocolo.")
                        .category("Encerramento")
                        .fatalError(false)
                        .points(1)
                        .displayOrder(7)
                        .build(),
                EvaluationFormItem.builder()
                        .label("Tabulou corretamente o resultado da chamada no sistema CRM")
                        .description("Registro completo e fidedigno no histórico do cliente.")
                        .category("Procedimento Operacional")
                        .fatalError(false)
                        .points(1)
                        .displayOrder(8)
                        .build(),
                EvaluationFormItem.builder()
                        .label("Agiu com rispidez, ironia, palavrões ou desligou indevidamente a chamada (Derrubada)")
                        .description("Qualquer conduta desrespeitosa ou interrupção intencional da ligação zera a monitoria.")
                        .category("Erro Grave")
                        .fatalError(true)
                        .points(0)
                        .displayOrder(9)
                        .build(),
                EvaluationFormItem.builder()
                        .label("Forneceu dados sensíveis ou financeiros a terceiros sem validação de titularidade (Violação LGPD)")
                        .description("Quebra de sigilo bancário/cadastral ou exposição de dados sem confirmação positiva.")
                        .category("Erro Grave")
                        .fatalError(true)
                        .points(0)
                        .displayOrder(10)
                        .build(),
                EvaluationFormItem.builder()
                        .label("Prometeu descontos inexistentes, coagiu o cliente ou omitiu juros/encargos obrigatórios")
                        .description("Indução ao erro ou prática abusiva vedada pelo Código de Defesa do Consumidor.")
                        .category("Erro Grave")
                        .fatalError(true)
                        .points(0)
                        .displayOrder(11)
                        .build()
        ));
        formCobranca = formTemplateRepository.save(formCobranca);

        // Formulário 2: Monitoria SAC & Suporte
        EvaluationFormTemplate formSac = EvaluationFormTemplate.builder()
                .name("Monitoria Express - SAC e Suporte N1")
                .description("Modelo objetivo para avaliação de chamados receptivos de dúvidas e suporte técnico.")
                .sector("Suporte N1")
                .passingScorePercentage(new BigDecimal("70.00"))
                .version(1)
                .active(true)
                .createdBy(gestor)
                .build();

        formSac.clearAndSetItems(List.of(
                EvaluationFormItem.builder()
                        .label("Saudação padrão e confirmação do protocolo de atendimento")
                        .description("Apresentação inicial clara e informe imediato do protocolo.")
                        .category("Abertura")
                        .fatalError(false)
                        .points(1)
                        .displayOrder(1)
                        .build(),
                EvaluationFormItem.builder()
                        .label("Diagnóstico assertivo no primeiro contato (First Call Resolution)")
                        .description("Seguiu a árvore de diagnóstico técnico sem transferências desnecessárias.")
                        .category("Resolução")
                        .fatalError(false)
                        .points(1)
                        .displayOrder(2)
                        .build(),
                EvaluationFormItem.builder()
                        .label("Clareza nas orientações e confirmação de entendimento com o cliente")
                        .description("Linguagem acessível sem jargões técnicos excessivos.")
                        .category("Comunicação")
                        .fatalError(false)
                        .points(1)
                        .displayOrder(3)
                        .build(),
                EvaluationFormItem.builder()
                        .label("Direcionamento para pesquisa de satisfação (CSAT) ao encerrar")
                        .description("Convidou o cliente a avaliar o atendimento na URA.")
                        .category("Encerramento")
                        .fatalError(false)
                        .points(1)
                        .displayOrder(4)
                        .build(),
                EvaluationFormItem.builder()
                        .label("Recusa de atendimento ou encerramento sem solucionar/encaminhar o ticket")
                        .description("Abandono de atendimento ou transferência cega para fila incorreta.")
                        .category("Erro Grave")
                        .fatalError(true)
                        .points(0)
                        .displayOrder(5)
                        .build()
        ));
        formTemplateRepository.save(formSac);

        // Ligações de Exemplo
        CallRecord call1 = callRecordRepository.save(CallRecord.builder()
                .externalCallId("call_980101")
                .analyst(analistaLucas)
                .customer(custFernanda)
                .customerIdentifier("11988112233")
                .callDate(OffsetDateTime.now().minusDays(3).withHour(10).withMinute(15))
                .durationSeconds(215)
                .audioUrl("http://localhost:8080/api/v1/audio/call_980101.wav?duration=28")
                .status(CallStatus.PENDENTE)
                .channel("telefonia")
                .campaign("cobranca-preventiva")
                .metadata(Map.of("channel", "telefonia", "campaign", "cobranca-preventiva", "queue", "fila_n1_cobranca"))
                .build());

        CallRecord call2 = callRecordRepository.save(CallRecord.builder()
                .externalCallId("call_980102")
                .analyst(analistaLucas)
                .customer(custCarlos)
                .customerIdentifier("11977445566")
                .callDate(OffsetDateTime.now().minusDays(2).withHour(14).withMinute(40))
                .durationSeconds(192)
                .audioUrl("http://localhost:8080/api/v1/audio/call_980102.wav?duration=24")
                .status(CallStatus.PENDENTE)
                .channel("telefonia")
                .campaign("renegociacao-especial")
                .metadata(Map.of("channel", "telefonia", "campaign", "renegociacao-especial", "queue", "fila_retencao"))
                .build());

        CallRecord call3 = callRecordRepository.save(CallRecord.builder()
                .externalCallId("call_980103")
                .analyst(analistaMariana)
                .customer(custPatricia)
                .customerIdentifier("21999887766")
                .callDate(OffsetDateTime.now().minusDays(1).withHour(11).withMinute(5))
                .durationSeconds(164)
                .audioUrl("http://localhost:8080/api/v1/audio/call_980103.wav?duration=22")
                .status(CallStatus.PENDENTE)
                .channel("telefonia")
                .campaign("cobranca")
                .metadata(Map.of("channel", "telefonia", "campaign", "cobranca", "queue", "fila_n1"))
                .build());

        // Ligações Pendentes (prontas para o Gestor avaliar na interface)
        callRecordRepository.save(CallRecord.builder()
                .externalCallId("call_980104")
                .analyst(analistaLucas)
                .customer(custRoberto)
                .customerIdentifier("11999999999")
                .callDate(OffsetDateTime.now().minusHours(5))
                .durationSeconds(185)
                .audioUrl("http://localhost:8080/api/v1/audio/call_980104.wav?duration=30")
                .status(CallStatus.PENDENTE)
                .channel("telefonia")
                .campaign("cobranca")
                .metadata(Map.of("channel", "telefonia", "campaign", "cobranca", "customerSegment", "Prime"))
                .build());

        callRecordRepository.save(CallRecord.builder()
                .externalCallId("call_980105")
                .analyst(analistaMariana)
                .customer(custFernanda)
                .customerIdentifier("11988112233")
                .callDate(OffsetDateTime.now().minusHours(3))
                .durationSeconds(240)
                .audioUrl("http://localhost:8080/api/v1/audio/call_980105.wav?duration=32")
                .status(CallStatus.PENDENTE)
                .channel("telefonia")
                .campaign("retencao-anuidade")
                .metadata(Map.of("channel", "telefonia", "campaign", "retencao-anuidade"))
                .build());

        callRecordRepository.save(CallRecord.builder()
                .externalCallId("call_980106")
                .analyst(analistaRafael)
                .customer(custRoberto)
                .customerIdentifier("11999999999")
                .callDate(OffsetDateTime.now().minusHours(1))
                .durationSeconds(148)
                .audioUrl("http://localhost:8080/api/v1/audio/call_980106.wav?duration=20")
                .status(CallStatus.PENDENTE)
                .channel("voz-digital")
                .campaign("ouvidoria-n2")
                .metadata(Map.of("channel", "voz-digital", "campaign", "ouvidoria-n2"))
                .build());

        UserPrincipal gestorPrincipal = new UserPrincipal(gestor);
        List<EvaluationFormItem> items = formCobranca.getItems();

        // Avaliação 1 (Lucas): APROVADO (7/8 = 87.50%, sem erro grave)
        List<ItemEvaluationInput> answersCall1 = new ArrayList<>();
        for (int i = 0; i < items.size(); i++) {
            EvaluationFormItem item = items.get(i);
            boolean checked = !item.isFatalError() && i != 5;
            String obs = (i == 5) ? "Poderia ter reforçado o desconto de pagamento à vista via PIX." : null;
            answersCall1.add(new ItemEvaluationInput(item.getId(), checked, obs));
        }
        evaluationService.submitEvaluation(new CreateEvaluationRequest(
                call1.getId(),
                formCobranca.getId(),
                answersCall1,
                "Excelente condução, Lucas! Confirmou todos os dados de segurança e fechou o acordo com clareza."
        ), gestorPrincipal);

        // Avaliação 2 (Lucas): ZERADO POR ERRO GRAVE (6/8 marcados = 75%, mas 1 erro grave marcado -> Nota Final = 0.00%)
        List<ItemEvaluationInput> answersCall2 = new ArrayList<>();
        for (int i = 0; i < items.size(); i++) {
            EvaluationFormItem item = items.get(i);
            boolean checked;
            String obs = null;
            if (item.isFatalError()) {
                checked = (i == 9);
                if (checked) {
                    obs = "Informou o valor total da dívida antes de confirmar CPF e data de nascimento do interlocutor.";
                }
            } else {
                checked = (i != 1 && i != 6);
            }
            answersCall2.add(new ItemEvaluationInput(item.getId(), checked, obs));
        }
        evaluationService.submitEvaluation(new CreateEvaluationRequest(
                call2.getId(),
                formCobranca.getId(),
                answersCall2,
                "Atenção máxima ao protocolo de segurança (LGPD): nunca informe valores em aberto antes da confirmação positiva de titularidade. Embora a argumentação tenha sido boa, a violação de segurança gerou erro grave."
        ), gestorPrincipal);

        // Avaliação 3 (Mariana): REPROVADO (4/8 = 50.00%, abaixo de 75%, sem erro grave)
        List<ItemEvaluationInput> answersCall3 = new ArrayList<>();
        for (int i = 0; i < items.size(); i++) {
            EvaluationFormItem item = items.get(i);
            boolean checked = !item.isFatalError() && (i < 4);
            answersCall3.add(new ItemEvaluationInput(item.getId(), checked, null));
        }
        evaluationService.submitEvaluation(new CreateEvaluationRequest(
                call3.getId(),
                formCobranca.getId(),
                answersCall3,
                "Mariana, a abertura e validação foram corretas, porém faltou apresentar as opções de parcelamento, resumir os termos e informar o número de protocolo no encerramento."
        ), gestorPrincipal);

        log.info("Carga inicial concluída com sucesso! 5 usuários, 5 setores, 4 clientes, 2 formulários, 6 ligações e 3 avaliações criadas.");
    }

    private void ensureBaseSectorsAndAdmin(boolean isTestProfile) {
        if (isTestProfile && !userRepository.existsByEmailIgnoreCase("admin@empresa.com")) {
            userRepository.save(User.builder()
                    .name("Ricardo Almeida (Diretor Admin)")
                    .email("admin@empresa.com")
                    .passwordHash(passwordEncoder.encode("Admin@123"))
                    .role(Role.ROLE_ADMIN)
                    .department("Diretoria & Governança")
                    .allowedSectors("SAC,Cobrança & Retenção,Suporte N1,Retenção & Ouvidoria,Aquisição")
                    .active(true)
                    .build());
        } else if (!isTestProfile) {
            ensureBootstrapEnvAdmin();
        }

        List<String[]> defaultSectors = isTestProfile
                ? List.of(
                        new String[]{"SAC", "SAC", "Atendimento receptivo ao cliente, dúvidas gerais e solicitações de primeira linha."},
                        new String[]{"Cobrança & Retenção", "COBRANCA_RETENCAO", "Negociação ativa e receptiva de débitos, acordos financeiros e retenção de contratos."},
                        new String[]{"Suporte N1", "SUPORTE_N1", "Triagem técnica de primeiro nível, diagnóstico de incidentes e abertura de chamados."},
                        new String[]{"Retenção & Ouvidoria", "RETENCAO_OUVIDORIA", "Tratativa de casos críticos, reversão de cancelamento (churn) e ouvidoria executiva."},
                        new String[]{"Aquisição", "AQUISICAO", "Prospecção ativa, qualificação de leads e fechamento de novos contratos comerciais."}
                )
                : List.of(
                        new String[]{"SAC", "SAC", "Atendimento receptivo ao cliente, dúvidas gerais e solicitações de primeira linha."},
                        new String[]{"Cobrança & Retenção", "COBRANCA_RETENCAO", "Negociação ativa e receptiva de débitos, acordos financeiros e retenção de contratos."},
                        new String[]{"Aquisição", "AQUISICAO", "Prospecção ativa, portabilidade TIM e fechamento de novos contratos comerciais."}
                );

        for (String[] sec : defaultSectors) {
            if (!sectorRepository.existsByNameIgnoreCase(sec[0])) {
                sectorRepository.save(Sector.builder()
                        .name(sec[0])
                        .code(sec[1])
                        .description(sec[2])
                        .active(true)
                        .build());
            }
        }
    }

    private void ensureBootstrapEnvAdmin() {
        String cleanEmail = (bootstrapAdminEmail != null && !bootstrapAdminEmail.isBlank())
                ? bootstrapAdminEmail.trim().toLowerCase()
                : "supernext@gmail.com";
        String cleanPassword = (bootstrapAdminPassword != null && !bootstrapAdminPassword.isBlank())
                ? bootstrapAdminPassword.trim()
                : "Nextformgeral@2026";
        String cleanName = (bootstrapAdminName != null && !bootstrapAdminName.isBlank())
                ? bootstrapAdminName.trim()
                : "Super Admin NextForm";

        userRepository.findByEmailIgnoreCase(cleanEmail)
                .map(existing -> {
                    existing.setName(cleanName);
                    existing.setRole(Role.ROLE_ADMIN);
                    existing.setDepartment("Diretoria & Governança");
                    existing.setAllowedSectors("SAC,Cobrança & Retenção,Aquisição");
                    existing.setPasswordHash(passwordEncoder.encode(cleanPassword));
                    existing.setActive(true);
                    existing.setMustChangePassword(false);
                    existing.setPasswordChangedAt(OffsetDateTime.now());
                    return userRepository.save(existing);
                })
                .orElseGet(() -> userRepository.save(User.builder()
                        .name(cleanName)
                        .email(cleanEmail)
                        .passwordHash(passwordEncoder.encode(cleanPassword))
                        .role(Role.ROLE_ADMIN)
                        .department("Diretoria & Governança")
                        .allowedSectors("SAC,Cobrança & Retenção,Aquisição")
                        .active(true)
                        .mustChangePassword(false)
                        .passwordChangedAt(OffsetDateTime.now())
                        .build()));
    }

    private void ensurePortabilidadeFormTemplate() {
        String formName = "Monitoria TIM Aquisição - Portabilidade";
        EvaluationFormTemplate existingForm = formTemplateRepository.findAll().stream()
                .filter(f -> f.getName().equalsIgnoreCase(formName))
                .findFirst()
                .orElse(null);

        if (existingForm != null) {
            EvaluationFormTemplate hydrated = formTemplateRepository.findWithItemsById(existingForm.getId()).orElse(existingForm);
            if (hydrated.getItems() != null && hydrated.getItems().size() >= 30) {
                return;
            }
        }

        User creator = userRepository.findByEmailIgnoreCase("gestor@empresa.com")
                .or(() -> userRepository.findByEmailIgnoreCase("admin@empresa.com"))
                .orElse(null);

        EvaluationFormTemplate formPortabilidade = existingForm != null
                ? existingForm
                : EvaluationFormTemplate.builder()
                        .name(formName)
                        .description("Formulário oficial de Monitoria TIM Aquisição (Portabilidade - 100 pontos) espelhado com os 31 critérios oficiais do Directus + controle de Falta Grave.")
                        .sector("Aquisição")
                        .passingScorePercentage(new BigDecimal("80.00"))
                        .version(1)
                        .active(true)
                        .createdBy(creator)
                        .build();

        formPortabilidade.clearAndSetItems(List.of(
                EvaluationFormItem.builder()
                        .label("valores_plano • Verbalização correta dos valores do plano (R$ 32,99 / valor mensal)")
                        .description("Informar exatamente o valor mensal do plano contratado.")
                        .category("1. Oferta & Plano")
                        .fatalError(false)
                        .points(4)
                        .displayOrder(1)
                        .build(),
                EvaluationFormItem.builder()
                        .label("fidelidade_e_formas_de_pagamento • Fidelidade contratual (12 meses) e Formas de Pagamento")
                        .description("Informar a fidelidade de 12 meses, vencimento e forma de pagamento.")
                        .category("1. Oferta & Plano")
                        .fatalError(false)
                        .points(7)
                        .displayOrder(2)
                        .build(),
                EvaluationFormItem.builder()
                        .label("portabilidade • Procedimento completo de Portabilidade e prazos (3 a 5 dias úteis)")
                        .description("Conduzir corretamente o procedimento de portabilidade e informar o prazo de conclusão.")
                        .category("2. Portabilidade & Chip")
                        .fatalError(false)
                        .points(15)
                        .displayOrder(3)
                        .build(),
                EvaluationFormItem.builder()
                        .label("envio_do_chip • Informação sobre envio gratuito do chip e número provisório")
                        .description("Explicar o envio do chip físico/eSIM e o funcionamento do número provisório.")
                        .category("2. Portabilidade & Chip")
                        .fatalError(false)
                        .points(5)
                        .displayOrder(4)
                        .build(),
                EvaluationFormItem.builder()
                        .label("mapa_de_cobertura • Consulta e informação do Mapa de Cobertura da TIM")
                        .description("Consultar e mencionar o mapa de cobertura da TIM na região do cliente.")
                        .category("2. Portabilidade & Chip")
                        .fatalError(false)
                        .points(2)
                        .displayOrder(5)
                        .build(),
                EvaluationFormItem.builder()
                        .label("Apresentacao_e_finalizacao • Apresentação inicial com nome e finalização formal em nome da TIM")
                        .description("Apresentar-se com nome e operadora TIM no início e realizar encerramento formal.")
                        .category("3. Abertura & Encerramento")
                        .fatalError(false)
                        .points(2)
                        .displayOrder(6)
                        .build(),
                EvaluationFormItem.builder()
                        .label("Ligacoes_ilimitadas • Franquia correta de minutos (550 minutos / regras de ligação)")
                        .description("Verbalizar a franquia correta de 550 minutos do plano sem prometer minutagem divergente.")
                        .category("1. Oferta & Plano")
                        .fatalError(false)
                        .points(3)
                        .displayOrder(7)
                        .build(),
                EvaluationFormItem.builder()
                        .label("Quantidade_de_gigas • Verbalização exata da franquia de internet (GB do plano + bônus)")
                        .description("Informar corretamente a quantidade de GB do plano contratado.")
                        .category("1. Oferta & Plano")
                        .fatalError(false)
                        .points(3)
                        .displayOrder(8)
                        .build(),
                EvaluationFormItem.builder()
                        .label("fatura_online • Oferta e parametrização de Fatura Online / Digital")
                        .description("Oferecer e parametrizar adequadamente o recebimento de fatura digital/online.")
                        .category("1. Oferta & Plano")
                        .fatalError(false)
                        .points(3)
                        .displayOrder(9)
                        .build(),
                EvaluationFormItem.builder()
                        .label("Whatsapp_ilimitado • Explicação correta do WhatsApp ilimitado (exceto chamadas de voz e vídeo)")
                        .description("Esclarecer que o WhatsApp ilimitado não inclui chamadas de voz e vídeo.")
                        .category("4. Benefícios & Apps Inclusos")
                        .fatalError(false)
                        .points(5)
                        .displayOrder(10)
                        .build(),
                EvaluationFormItem.builder()
                        .label("SMS_e_roaming • Informação de SMS ilimitado e Roaming Nacional")
                        .description("Mencionar SMS ilimitado e cobertura de Roaming Nacional.")
                        .category("4. Benefícios & Apps Inclusos")
                        .fatalError(false)
                        .points(1)
                        .displayOrder(11)
                        .build(),
                EvaluationFormItem.builder()
                        .label("Tim_by_Deezer_Audiobooks_by_Ubook • Benefício Audiobooks by Ubook / Apps de Conteúdo")
                        .description("Mencionar corretamente os aplicativos de conteúdo inclusos no plano.")
                        .category("4. Benefícios & Apps Inclusos")
                        .fatalError(false)
                        .points(1)
                        .displayOrder(12)
                        .build(),
                EvaluationFormItem.builder()
                        .label("Tim_Banca • Benefício TIM Banca Virtual / Jornais")
                        .description("Informar corretamente o serviço TIM Banca / Banca Jornais.")
                        .category("4. Benefícios & Apps Inclusos")
                        .fatalError(false)
                        .points(1)
                        .displayOrder(13)
                        .build(),
                EvaluationFormItem.builder()
                        .label("Telegram_Messenger • Benefício Telegram / Messenger incluso")
                        .description("Mencionar o benefício do Messenger/Telegram incluso na oferta.")
                        .category("4. Benefícios & Apps Inclusos")
                        .fatalError(false)
                        .points(1)
                        .displayOrder(14)
                        .build(),
                EvaluationFormItem.builder()
                        .label("Facebook_Instagram_e_Twitter • Redes Sociais (Facebook, Instagram e X/Twitter)")
                        .description("Informar corretamente as regras de uso de redes sociais do plano.")
                        .category("4. Benefícios & Apps Inclusos")
                        .fatalError(false)
                        .points(1)
                        .displayOrder(15)
                        .build(),
                EvaluationFormItem.builder()
                        .label("Comprovacao • Comprovação de titularidade da linha a ser portada")
                        .description("Confirmar que o número portado está registrado no CPF do titular.")
                        .category("5. Confirmação Cadastral & Auditoria")
                        .fatalError(false)
                        .points(2)
                        .displayOrder(16)
                        .build(),
                EvaluationFormItem.builder()
                        .label("Verifica_correios • Verificação de viabilidade de entrega pelos Correios no endereço")
                        .description("Confirmar com o cliente se os Correios entregam normalmente na residência.")
                        .category("5. Confirmação Cadastral & Auditoria")
                        .fatalError(false)
                        .points(5)
                        .displayOrder(17)
                        .build(),
                EvaluationFormItem.builder()
                        .label("Auditoria • Leitura completa da Auditoria com aceite explícito do cliente")
                        .description("Realizar a leitura completa dos termos da venda e obter o aceite claro do titular.")
                        .category("5. Confirmação Cadastral & Auditoria")
                        .fatalError(false)
                        .points(5)
                        .displayOrder(18)
                        .build(),
                EvaluationFormItem.builder()
                        .label("Pesquisa • Direcionamento para Pesquisa de Satisfação ao final (sem indução)")
                        .description("Informar sobre o envio da pesquisa de satisfação sem induzir nota.")
                        .category("3. Abertura & Encerramento")
                        .fatalError(false)
                        .points(2)
                        .displayOrder(19)
                        .build(),
                EvaluationFormItem.builder()
                        .label("TIM_seguranca • Benefício EXA Segurança Light / TIM Segurança")
                        .description("Mencionar o benefício EXA Segurança Light incluso no plano.")
                        .category("4. Benefícios & Apps Inclusos")
                        .fatalError(false)
                        .points(1)
                        .displayOrder(20)
                        .build(),
                EvaluationFormItem.builder()
                        .label("Volume_de_Voz • Volume de voz adequado e audível durante toda a chamada")
                        .description("Manter tom e volume de voz claros durante todo o contato.")
                        .category("6. Postura, Linguagem & Comunicação")
                        .fatalError(false)
                        .points(1)
                        .displayOrder(21)
                        .build(),
                EvaluationFormItem.builder()
                        .label("Cordial_com_Cliente • Postura cordial, educada e prestativa com o cliente")
                        .description("Atender com simpatia, paciência e cortesia.")
                        .category("6. Postura, Linguagem & Comunicação")
                        .fatalError(false)
                        .points(2)
                        .displayOrder(22)
                        .build(),
                EvaluationFormItem.builder()
                        .label("Nao_interromper • Escuta ativa sem interromper o cliente")
                        .description("Aguardar o cliente concluir sua fala sem interrupções.")
                        .category("6. Postura, Linguagem & Comunicação")
                        .fatalError(false)
                        .points(2)
                        .displayOrder(23)
                        .build(),
                EvaluationFormItem.builder()
                        .label("Confirmacao_Positiva • Confirmação positiva dos dados pessoais (Nome, CPF, Nascimento e Mãe)")
                        .description("Confirmar todos os dados cadastrais do titular sem divergências.")
                        .category("5. Confirmação Cadastral & Auditoria")
                        .fatalError(false)
                        .points(2)
                        .displayOrder(24)
                        .build(),
                EvaluationFormItem.builder()
                        .label("Endereco_completo • Confirmação de Endereço Completo com CEP, Número e Ponto de Referência")
                        .description("Validar logradouro, número, bairro, cidade/UF, CEP e ponto de referência.")
                        .category("5. Confirmação Cadastral & Auditoria")
                        .fatalError(false)
                        .points(3)
                        .displayOrder(25)
                        .build(),
                EvaluationFormItem.builder()
                        .label("Transmite_Seguranca • Transmite segurança, clareza e domínio do produto")
                        .description("Responder dúvidas com firmeza e clareza técnica.")
                        .category("6. Postura, Linguagem & Comunicação")
                        .fatalError(false)
                        .points(2)
                        .displayOrder(26)
                        .build(),
                EvaluationFormItem.builder()
                        .label("Solicita_um_momento • Solicita momento de espera com cortesia e retoma adequadamente")
                        .description("Pedir licença de forma cordial antes de colocar em espera.")
                        .category("6. Postura, Linguagem & Comunicação")
                        .fatalError(false)
                        .points(1)
                        .displayOrder(27)
                        .build(),
                EvaluationFormItem.builder()
                        .label("Nao_Gagueja • Fluência verbal (sem hesitações ou gagueira excessiva)")
                        .description("Comunicação fluida e segura ao longo da explicação.")
                        .category("6. Postura, Linguagem & Comunicação")
                        .fatalError(false)
                        .points(2)
                        .displayOrder(28)
                        .build(),
                EvaluationFormItem.builder()
                        .label("Liguagem • Linguagem formal sem gerundismo, diminutivos ou muletas de fala")
                        .description("Ausência de gerundismo ('vai estar fazendo'), diminutivos ('minutinho') e repetições excessivas ('tá bom', 'né').")
                        .category("6. Postura, Linguagem & Comunicação")
                        .fatalError(false)
                        .points(5)
                        .displayOrder(29)
                        .build(),
                EvaluationFormItem.builder()
                        .label("Faz_questionamentos_direcionados • Sondagem e questionamentos direcionados ao perfil do cliente")
                        .description("Realizar perguntas direcionadas sobre operadora atual, gasto mensal e preferência de chip/eSIM.")
                        .category("1. Oferta & Plano")
                        .fatalError(false)
                        .points(3)
                        .displayOrder(30)
                        .build(),
                EvaluationFormItem.builder()
                        .label("Se_for_portabilidade • Orientação de SMS de confirmação da Portabilidade (7678 / 24h)")
                        .description("Explicar claramente a resposta ao SMS de confirmação da portabilidade com o chip atual.")
                        .category("2. Portabilidade & Chip")
                        .fatalError(false)
                        .points(8)
                        .displayOrder(31)
                        .build(),
                EvaluationFormItem.builder()
                        .label("Falta_Grave • Falta Grave Eliminatória (Tabulação divergente, fraude ou ausência de aceite)")
                        .description("Divergência grave entre os dados da gravação e a ficha de venda ou ausência de aceite do titular.")
                        .category("Falta Grave")
                        .fatalError(true)
                        .points(0)
                        .displayOrder(32)
                        .build()
        ));

        formTemplateRepository.save(formPortabilidade);
        log.info("Formulário '{}' (100 pts • 32 itens Directus) cadastrado/atualizado com sucesso!", formName);
    }

    private void ensureSacFormTemplate() {
        String formName = "Monitoria SAC";
        boolean exists = formTemplateRepository.findAll().stream()
                .anyMatch(f -> f.getName().equalsIgnoreCase(formName));
        if (exists) {
            return;
        }

        User creator = userRepository.findByEmailIgnoreCase("gestor@empresa.com")
                .or(() -> userRepository.findByEmailIgnoreCase("admin@empresa.com"))
                .orElse(null);

        EvaluationFormTemplate formSac = EvaluationFormTemplate.builder()
                .name(formName)
                .description("Formulário oficial de Monitoria SAC (100 pontos) com avaliação de Confirmação de Dados, Procedimentos, Orientação ao Cliente, Protocolo, Oferta de Desconto, Sondagem, Prazos, Descrição e Tabulação, Apresentação, Segurança, Linguagem e Escuta Ativa.")
                .sector("SAC")
                .passingScorePercentage(new BigDecimal("80.00"))
                .version(1)
                .active(true)
                .createdBy(creator)
                .build();

        formSac.clearAndSetItems(List.of(
                EvaluationFormItem.builder()
                        .label("Confirmacao_de_Dados • Confirmação de CPF, E-mail e Telefone Secundário")
                        .description("Solicitar a confirmação do CPF, do e-mail e questionar se o cliente deseja incluir outro telefone no cadastro.")
                        .category("1. Confirmação & Procedimentos")
                        .fatalError(false)
                        .points(10)
                        .displayOrder(1)
                        .build(),
                EvaluationFormItem.builder()
                        .label("Realizou_todos_procedimentos_corretamente • Execução Correta dos Procedimentos")
                        .description("Analisar comprovantes/boletos adequadamente, verificar chamados já em tratativa antes de abrir novo ticket e direcionar corretamente.")
                        .category("1. Confirmação & Procedimentos")
                        .fatalError(false)
                        .points(15)
                        .displayOrder(2)
                        .build(),
                EvaluationFormItem.builder()
                        .label("Orientou_o_cliente • Orientação Clara e Canais Digitais / Site")
                        .description("Orientar corretamente sobre acompanhamento pelo site/canais digitais da administradora, coparticipação, carência, carteirinha e benefícios.")
                        .category("2. Orientação & Protocolo")
                        .fatalError(false)
                        .points(10)
                        .displayOrder(3)
                        .build(),
                EvaluationFormItem.builder()
                        .label("Informou_n_de_protocolo_no_inicio_da_ligacao • Informe do Protocolo no Início da Ligação")
                        .description("Informar o número de protocolo logo no início do atendimento.")
                        .category("2. Orientação & Protocolo")
                        .fatalError(false)
                        .points(10)
                        .displayOrder(4)
                        .build(),
                EvaluationFormItem.builder()
                        .label("Oferta_de_Desconto • Oferta de Desconto e Alternativas de Pagamento")
                        .description("Explorar ofertas de desconto ou alternativas financeiras (como pagamento via cartão/boleto) agregando valor ao atendimento.")
                        .category("3. Sondagem, Oferta & Prazos")
                        .fatalError(false)
                        .points(10)
                        .displayOrder(5)
                        .build(),
                EvaluationFormItem.builder()
                        .label("Sondagem_e_Abordagem • Sondagem Completa e Abordagem Assertiva")
                        .description("Compreender o cenário do cliente por meio de sondagem completa para conduzir argumentação personalizada.")
                        .category("3. Sondagem, Oferta & Prazos")
                        .fatalError(false)
                        .points(10)
                        .displayOrder(6)
                        .build(),
                EvaluationFormItem.builder()
                        .label("Prazos • Informação Correta de Prazos (Baixa Bancária 72h úteis / Tratativas)")
                        .description("Informar prazos corretos de baixa bancária (até 72 horas úteis), vigência e conclusão de análises internas.")
                        .category("3. Sondagem, Oferta & Prazos")
                        .fatalError(false)
                        .points(8)
                        .displayOrder(7)
                        .build(),
                EvaluationFormItem.builder()
                        .label("Descricao_e_Tabulacao • Registro Completo e Classificação Correta do Ticket")
                        .description("Registrar todas as informações no ticket, classificar corretamente o motivo e vincular o ticket da URA sem abrir chamados duplicados.")
                        .category("4. Tabulação & Qualidade da Comunicação")
                        .fatalError(false)
                        .points(10)
                        .displayOrder(8)
                        .build(),
                EvaluationFormItem.builder()
                        .label("Apresentacao • Abertura e Finalização em Nome da Administradora")
                        .description("Iniciar e finalizar o atendimento formalmente em nome da administradora.")
                        .category("4. Tabulação & Qualidade da Comunicação")
                        .fatalError(false)
                        .points(2)
                        .displayOrder(9)
                        .build(),
                EvaluationFormItem.builder()
                        .label("Transmite_Seguranca • Segurança, Objetividade e Ausência de Esperas Excessivas")
                        .description("Transmitir segurança e objetividade nas informações, sem excesso de ausências durante o atendimento.")
                        .category("4. Tabulação & Qualidade da Comunicação")
                        .fatalError(false)
                        .points(8)
                        .displayOrder(10)
                        .build(),
                EvaluationFormItem.builder()
                        .label("Linguagem • Comunicação Profissional Sem Vícios de Linguagem")
                        .description("Ausência de vícios de linguagem ('né', 'tá', 'aí') e manutenção de comunicação profissional.")
                        .category("4. Tabulação & Qualidade da Comunicação")
                        .fatalError(false)
                        .points(2)
                        .displayOrder(11)
                        .build(),
                EvaluationFormItem.builder()
                        .label("Nao_Interrompe_o_Cliente • Escuta Ativa Sem Interromper o Cliente")
                        .description("Ouvir o cliente com atenção sem interromper sua fala durante o atendimento.")
                        .category("4. Tabulação & Qualidade da Comunicação")
                        .fatalError(false)
                        .points(5)
                        .displayOrder(12)
                        .build(),
                EvaluationFormItem.builder()
                        .label("falta_grave • Falta Grave Eliminatória (Zera a Monitoria SAC)")
                        .description("Falha crítica de condução, omissão grave sobre impacto de cancelamento em dependentes ou postura inadequada.")
                        .category("Falta Grave")
                        .fatalError(true)
                        .points(0)
                        .displayOrder(13)
                        .build()
        ));

        formTemplateRepository.save(formSac);
        log.info("Formulário '{}' (100 pts) cadastrado com sucesso!", formName);
    }

    private void ensureRetencaoFormTemplate() {
        String formName = "Monitoria Retenção";
        boolean exists = formTemplateRepository.findAll().stream()
                .anyMatch(f -> f.getName().equalsIgnoreCase(formName));
        if (exists) {
            return;
        }

        User creator = userRepository.findByEmailIgnoreCase("gestor@empresa.com")
                .or(() -> userRepository.findByEmailIgnoreCase("admin@empresa.com"))
                .orElse(null);

        EvaluationFormTemplate formRetencao = EvaluationFormTemplate.builder()
                .name(formName)
                .description("Formulário oficial de Monitoria de Retenção (100 pontos) com avaliação de Confirmação de Dados, Produto, Protocolo, Oferta de Desconto, Sondagem/Abordagem, Prazos, Registro Correto, Abertura/Encerramento, Segurança/Clareza, Linguagem e Cordialidade/Empatia.")
                .sector("Cobrança & Retenção")
                .passingScorePercentage(new BigDecimal("80.00"))
                .version(1)
                .active(true)
                .createdBy(creator)
                .build();

        formRetencao.clearAndSetItems(List.of(
                EvaluationFormItem.builder()
                        .label("Confirmacao_de_Dados • Confirmação de CPF, E-mail e Telefone com o Titular")
                        .description("Confirmar CPF, e-mail (soletrando quando necessário) e telefone diretamente com o titular do plano.")
                        .category("1. Segurança, Protocolo & Produto")
                        .fatalError(false)
                        .points(10)
                        .displayOrder(1)
                        .build(),
                EvaluationFormItem.builder()
                        .label("Produto • Domínio do Produto (Coparticipação Futura, Cobrança Proporcional e Clube de Vantagens)")
                        .description("Explicar regras de coparticipação após cancelamento, cobrança proporcional, cobertura de urgência/emergência, Clube de Vantagens e benefício farmácia.")
                        .category("1. Segurança, Protocolo & Produto")
                        .fatalError(false)
                        .points(10)
                        .displayOrder(2)
                        .build(),
                EvaluationFormItem.builder()
                        .label("Protocolo • Informe do Número de Protocolo")
                        .description("Informar corretamente o número de protocolo do atendimento.")
                        .category("1. Segurança, Protocolo & Produto")
                        .fatalError(false)
                        .points(10)
                        .displayOrder(3)
                        .build(),
                EvaluationFormItem.builder()
                        .label("Oferta_de_Desconto • Oferta de Desconto Anual / Migração / Alteração de Plano + Print")
                        .description("Realizar oferta de desconto destacando o benefício anual, avaliar migração ou alteração de plano (mantendo carências) e anexar print da tela.")
                        .category("2. Retenção, Sondagem & Negociação")
                        .fatalError(false)
                        .points(10)
                        .displayOrder(4)
                        .build(),
                EvaluationFormItem.builder()
                        .label("Sondagem__Abordagem • Sondagem Profunda e Argumentação de Retenção")
                        .description("Investigar o real motivo do cancelamento, sondar propostas da concorrência (modalidade/valor) e argumentar sobre a importância de manter o plano ativo.")
                        .category("2. Retenção, Sondagem & Negociação")
                        .fatalError(false)
                        .points(15)
                        .displayOrder(5)
                        .build(),
                EvaluationFormItem.builder()
                        .label("Prazos • Informe de Prazos (Carta de Cancelamento 24h, Boleto e Prazos ANS)")
                        .description("Informar prazo de envio da carta de cancelamento por e-mail (até 24h), disponibilização de boletos e prazos regulamentares da ANS.")
                        .category("3. Prazos & Registro")
                        .fatalError(false)
                        .points(10)
                        .displayOrder(6)
                        .build(),
                EvaluationFormItem.builder()
                        .label("Registro_Correto • Tabulação Organizada, Vínculo de Tickets e Prints Abaixo")
                        .description("Registrar o real motivo do contato de forma organizada, relacionar tickets anteriores sem duplicidade e inserir prints abaixo da tabulação.")
                        .category("3. Prazos & Registro")
                        .fatalError(false)
                        .points(10)
                        .displayOrder(7)
                        .build(),
                EvaluationFormItem.builder()
                        .label("Abertura__Encerramento • Abertura Ágil Sem Ausência Inicial e Encerramento Formal")
                        .description("Iniciar prontamente o atendimento sem excesso de ausência e encerrar de forma cordial e completa.")
                        .category("4. Postura, Clareza & Comunicação")
                        .fatalError(false)
                        .points(5)
                        .displayOrder(8)
                        .build(),
                EvaluationFormItem.builder()
                        .label("Seguranca___Clareza_e_Objetividade • Segurança, Clareza, Objetividade e Agilidade")
                        .description("Transmitir informações corretas e seguras (sem divergência de carteirinha/vigência) e manter agilidade sem ausências prolongadas.")
                        .category("4. Postura, Clareza & Comunicação")
                        .fatalError(false)
                        .points(10)
                        .displayOrder(9)
                        .build(),
                EvaluationFormItem.builder()
                        .label("Linguagem • Ausência de Vícios de Linguagem ('tá', 'aí', 'certo', 'né', 'no caso')")
                        .description("Comunicação clara e profissional sem repetição de muletas ou vícios de linguagem.")
                        .category("4. Postura, Clareza & Comunicação")
                        .fatalError(false)
                        .points(5)
                        .displayOrder(10)
                        .build(),
                EvaluationFormItem.builder()
                        .label("Cordialidade_e_Empatia • Empatia, Paciência e Acolhimento Sem Demonstrar Pressa")
                        .description("Demonstrar empatia, paciência e atenção às necessidades da família/cliente sem pressa para finalizar.")
                        .category("4. Postura, Clareza & Comunicação")
                        .fatalError(false)
                        .points(5)
                        .displayOrder(11)
                        .build(),
                EvaluationFormItem.builder()
                        .label("falta_grave • Falta Grave Eliminatória (Zera a Monitoria de Retenção)")
                        .description("Exclusão/alteração indevida de dados do titular sem autorização, fraude de retenção ou conduta grave.")
                        .category("Falta Grave")
                        .fatalError(true)
                        .points(0)
                        .displayOrder(12)
                        .build()
        ));

        formTemplateRepository.save(formRetencao);
        log.info("Formulário '{}' (100 pts) cadastrado com sucesso!", formName);
    }
}
