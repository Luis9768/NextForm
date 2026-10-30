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
import com.formshq.service.EvaluationService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.CommandLineRunner;
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
    private final PasswordEncoder passwordEncoder;

    @Override
    @Transactional
    public void run(String... args) {
        ensureBaseSectorsAndAdmin();
        ensurePortabilidadeFormTemplate();

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

    private void ensureBaseSectorsAndAdmin() {
        if (!userRepository.existsByEmailIgnoreCase("admin@empresa.com")) {
            userRepository.save(User.builder()
                    .name("Ricardo Almeida (Diretor Admin)")
                    .email("admin@empresa.com")
                    .passwordHash(passwordEncoder.encode("Admin@123"))
                    .role(Role.ROLE_ADMIN)
                    .department("Diretoria & Governança")
                    .allowedSectors("SAC,Cobrança & Retenção,Suporte N1,Retenção & Ouvidoria,Aquisição")
                    .active(true)
                    .build());
        }

        List<String[]> defaultSectors = List.of(
                new String[]{"SAC", "SAC", "Atendimento receptivo ao cliente, dúvidas gerais e solicitações de primeira linha."},
                new String[]{"Cobrança & Retenção", "COBRANCA_RETENCAO", "Negociação ativa e receptiva de débitos, acordos financeiros e retenção de contratos."},
                new String[]{"Suporte N1", "SUPORTE_N1", "Triagem técnica de primeiro nível, diagnóstico de incidentes e abertura de chamados."},
                new String[]{"Retenção & Ouvidoria", "RETENCAO_OUVIDORIA", "Tratativa de casos críticos, reversão de cancelamento (churn) e ouvidoria executiva."},
                new String[]{"Aquisição", "AQUISICAO", "Prospecção ativa, qualificação de leads e fechamento de novos contratos comerciais."}
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

        userRepository.findByEmailIgnoreCase("gestor@empresa.com").ifPresent(gestor -> {
            if (gestor.getAllowedSectors() == null || !gestor.getAllowedSectors().contains("Aquisição")) {
                String current = gestor.getAllowedSectors() != null ? gestor.getAllowedSectors() : "";
                gestor.setAllowedSectors(current.isBlank() ? "Aquisição" : current + ",Aquisição");
                userRepository.save(gestor);
            }
        });
    }

    private void ensurePortabilidadeFormTemplate() {
        String formName = "Monitoria TIM Aquisição - Portabilidade";
        boolean exists = formTemplateRepository.findAll().stream()
                .anyMatch(f -> f.getName().equalsIgnoreCase(formName));
        if (exists) {
            return;
        }

        User creator = userRepository.findByEmailIgnoreCase("gestor@empresa.com")
                .or(() -> userRepository.findByEmailIgnoreCase("admin@empresa.com"))
                .orElse(null);

        EvaluationFormTemplate formPortabilidade = EvaluationFormTemplate.builder()
                .name(formName)
                .description("Formulário oficial de Monitoria TIM Aquisição (Portabilidade) com validação dos 13 dados da venda, oferta eSIM (*#06#), franquia 550 min, SMS 7678, auditoria e controle de Falta Grave.")
                .sector("Aquisição")
                .passingScorePercentage(new BigDecimal("80.00"))
                .version(1)
                .active(true)
                .createdBy(creator)
                .build();

        formPortabilidade.clearAndSetItems(List.of(
                EvaluationFormItem.builder()
                        .label("Apresentação inicial com nome do operador e identificação da TIM com cordialidade")
                        .description("O operador deve informar o próprio nome na apresentação inicial e manter postura cordial.")
                        .category("1. Abertura & Abordagem")
                        .fatalError(false)
                        .points(5)
                        .displayOrder(1)
                        .build(),
                EvaluationFormItem.builder()
                        .label("Oferta obrigatória de escolha entre Chip Físico e Chip Virtual (eSIM) + Teste *#06# e Wi-Fi")
                        .description("Perguntar obrigatoriamente a preferência entre chip físico ou eSIM, orientando teste *#06# e necessidade de Wi-Fi quando eSIM.")
                        .category("2. Oferta de Chip / eSIM")
                        .fatalError(false)
                        .points(5)
                        .displayOrder(2)
                        .build(),
                EvaluationFormItem.builder()
                        .label("Consulta ao Mapa de Cobertura e verificação de viabilidade de entrega pelos Correios")
                        .description("Consultar o mapa de cobertura no CEP do cliente e confirmar viabilidade de entrega.")
                        .category("3. Cobertura & Entrega")
                        .fatalError(false)
                        .points(5)
                        .displayOrder(3)
                        .build(),
                EvaluationFormItem.builder()
                        .label("Verbalização correta do Plano Contratado, Valor Mensal e Franquia de Internet (GB)")
                        .description("Informar exatamente o plano contratado (ex: TIM Controle A Plus R$ 32,99 / Controle Smart) sem prometer franquia de GB divergente.")
                        .category("4. Oferta & Benefícios do Plano")
                        .fatalError(false)
                        .points(10)
                        .displayOrder(4)
                        .build(),
                EvaluationFormItem.builder()
                        .label("Verbalização correta da Franquia de Minutos (550 minutos)")
                        .description("Informar a franquia correta de 550 minutos do plano (não afirmar ligações ilimitadas ou minutagem incorreta como 50/150/500 min).")
                        .category("4. Oferta & Benefícios do Plano")
                        .fatalError(false)
                        .points(5)
                        .displayOrder(5)
                        .build(),
                EvaluationFormItem.builder()
                        .label("Explicação correta de WhatsApp (exceto chamadas de voz e vídeo), Messenger, SMS Ilimitado e Roaming Nacional")
                        .description("Informar que o WhatsApp ilimitado não inclui chamadas de voz e vídeo, além de mencionar Messenger, SMS ilimitado e Roaming Nacional.")
                        .category("4. Oferta & Benefícios do Plano")
                        .fatalError(false)
                        .points(5)
                        .displayOrder(6)
                        .build(),
                EvaluationFormItem.builder()
                        .label("Informação correta dos Serviços Inclusos / SVA (EXA Segurança Light / TIM Banca)")
                        .description("Mencionar corretamente os serviços inclusos no plano sem prometer SVAs divergentes.")
                        .category("4. Oferta & Benefícios do Plano")
                        .fatalError(false)
                        .points(4)
                        .displayOrder(7)
                        .build(),
                EvaluationFormItem.builder()
                        .label("Informação da Forma de Pagamento (Boleto/Débito), Vencimento, Fidelidade de 12 meses e Fatura Digital/Online")
                        .description("Explicar forma de pagamento, dia de vencimento, fidelidade contratual de 12 meses e parametrizar fatura digital/online.")
                        .category("5. Condições Financeiras & Fatura")
                        .fatalError(false)
                        .points(8)
                        .displayOrder(8)
                        .build(),
                EvaluationFormItem.builder()
                        .label("Confirmação completa dos Dados Cadastrais (Nome Completo, CPF, Data de Nascimento, Nome da Mãe e Titularidade)")
                        .description("Validar todos os dados pessoais do titular da linha portada sem divergências.")
                        .category("6. Confirmação Cadastral & Endereço")
                        .fatalError(false)
                        .points(15)
                        .displayOrder(9)
                        .build(),
                EvaluationFormItem.builder()
                        .label("Confirmação de Endereço Completo com CEP, Número, Complemento, Bairro, Cidade/UF e Ponto de Referência")
                        .description("Confirmar endereço completo e ponto de referência para entrega e auditoria.")
                        .category("6. Confirmação Cadastral & Endereço")
                        .fatalError(false)
                        .points(10)
                        .displayOrder(10)
                        .build(),
                EvaluationFormItem.builder()
                        .label("Procedimento de Portabilidade e Portabilidade Antecipada (Instrução de SMS para 7678 com palavra TIM e prazo de 3 a 5 dias úteis)")
                        .description("Explicar o fluxo de confirmação de portabilidade (SMS 7678 com palavra TIM quando Portabilidade Antecipada = Sim) e prazo de 3 a 5 dias úteis.")
                        .category("7. Portabilidade & SMS 7678")
                        .fatalError(false)
                        .points(15)
                        .displayOrder(11)
                        .build(),
                EvaluationFormItem.builder()
                        .label("Auditoria Completa da Venda com Aceite Explícito do Cliente")
                        .description("Realizar a leitura completa da auditoria (titularidade, plano, valor, fidelidade e endereço) obtendo o aceite claro do cliente.")
                        .category("8. Auditoria & Aceite")
                        .fatalError(false)
                        .points(5)
                        .displayOrder(12)
                        .build(),
                EvaluationFormItem.builder()
                        .label("Linguagem e Comunicação (Ausência de gerundismo, diminutivos como 'minutinho'/'momentinho' e muletas > 4x)")
                        .description("Evitar gerundismo ('vai estar pagando'), diminutivos e repetição excessiva de muletas ('tá bom', 'né', 'ok', 'certo' > 4 vezes).")
                        .category("9. Linguagem & Postura")
                        .fatalError(false)
                        .points(5)
                        .displayOrder(13)
                        .build(),
                EvaluationFormItem.builder()
                        .label("Finalização Formal, Canais de Suporte, Aviso de Auditoria e Transferência para Pesquisa de Satisfação (sem indução)")
                        .description("Encerrar formalmente a ligação informando canais de suporte e direcionando para a pesquisa de satisfação sem induzir nota.")
                        .category("10. Encerramento & Pesquisa")
                        .fatalError(false)
                        .points(3)
                        .displayOrder(14)
                        .build(),
                EvaluationFormItem.builder()
                        .label("Falta Grave: Tabulação divergente entre os dados da gravação e a ficha de venda (CPF, Telefone, Endereço, Titularidade ou Vencimento divergentes)")
                        .description("Divergência grave entre os dados confirmados na ligação e o cadastro registrado na proposta de venda.")
                        .category("Falta Grave")
                        .fatalError(true)
                        .points(0)
                        .displayOrder(15)
                        .build(),
                EvaluationFormItem.builder()
                        .label("Falta Grave: Venda sem aceite explícito do titular, fraude cadastral ou falha crítica eliminatória no processo de portabilidade")
                        .description("Ausência de confirmação/aceite do titular ou condução fraudulenta que invalida a venda de portabilidade.")
                        .category("Falta Grave")
                        .fatalError(true)
                        .points(0)
                        .displayOrder(16)
                        .build()
        ));

        formTemplateRepository.save(formPortabilidade);
        log.info("Formulário '{}' (100 pts) cadastrado com sucesso!", formName);
    }
}
