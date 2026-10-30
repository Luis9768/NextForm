# NextForm (NEXFORM) — Plataforma de Monitoria de Qualidade (QA), Pessoas & Automação

Plataforma corporativa **Full-Stack** de Monitoria de Qualidade (QA), Auditoria de Ligações (`Audio_Ligacao` e `Audio_Ligacao_Retorno`), Gestão de Pessoas/Setores e Automação de Fluxos integrada via **Webhook POST** com **n8n / Directus**.

---

## 1. Visão Geral da Arquitetura

```
┌──────────────────────────────────┐       POST Webhook       ┌──────────────────────────────────────────────┐
│  Webhook n8n / Directus          │ ◄──────────────────────► │  POST /api/v1/customers/webhook-lookup       │
│  (CUSTOMER_WEBHOOK_URL)          │   Auto-puxa 13 Dados     │  (CustomerLookupService - Sem +55)           │
└──────────────────────────────────┘                          └──────────────────────┬───────────────────────┘
                                                                                     │
┌──────────────────────────────────┐     Bearer JWT (3 Roles) ┌──────────────────────▼───────────────────────┐
│  Frontend Next.js 14 (App Router)│ ◄──────────────────────► │  Backend Spring Boot 3.3.4 (Java 21)         │
│  TypeScript + Tailwind + Shadcn  │   ADMIN / GESTOR /       │  Spring Security + JPA + Flyway (V1–V7)      │
│  Dual-Rail UI + Player HTTP 206  │   ANALISTA               └──────────────────────┬───────────────────────┘
└──────────────────────────────────┘                                                 │
                                                              ┌──────────────────────▼───────────────────────┐
                                                              │  PostgreSQL 16 (ou H2 PostgreSQL Mode)       │
                                                              │  Snapshots Imutáveis de Formulários & Setor  │
                                                              └──────────────────────────────────────────────┘
```

---

## 2. Principais Funcionalidades

- **Fluxo de Avaliação em 3 Etapas (`/analysts/[id]`):**
  1. **1. Cliente (`Telefone_Portabilidade`):** Ao digitar ou colar o telefone no campo, o sistema dispara automaticamente um `POST` para o Webhook configurado (`NEXT_PUBLIC_CUSTOMER_WEBHOOK_URL` / `CUSTOMER_WEBHOOK_URL`) e preenche sozinho os **13 campos de Dados da Venda**:
     - `Data Da Venda`, `Nome`, `Cpf`, `Data De Nascimento`, `Nome Da Mae`, `Plano Contratado`, `Proposta`, `Email`, `Forma De Pagamento`, `Tipo De Fatura`, `Endereco Completo`, `Vencimento` e `Portabilidade Antecipada`.
  2. **2. Áudio (`Audio_Ligacao` & `Audio_Ligacao_Retorno`):** Upload e reprodução com suporte a HTTP `Range` (`206 Partial Content`), controle de velocidade (`1x`, `1.25x`, `1.5x`, `2x`) e vínculo obrigatório à avaliação.
  3. **3. Avaliar (`Monitoria TIM Aquisição - Portabilidade`):** Checklist ponderado (`100 pontos`), conferência dos 13 dados em tela, marcação de `Falta_Grave` (zera a `Nota_Final` para `0`), registro de `Motivo_falta_grave` e `Observacoes` com minutagem (`[MM:SS]`).
- **Construtor de Formulários (`/forms`):** Criação de matrizes de qualidade começando em branco (`0` perguntas pré-preenchidas), com pesos configuráveis por pergunta e flag de Erro Grave / Falta Grave.
- **Controle de Acesso Baseado em 3 Perfis (RBAC):**
  - `ROLE_ADMIN`: Acesso irrestrito, único perfil autorizado a criar/editar/excluir setores (`/sectors`), definir setores permitidos por gestor e ativar/inativar qualquer usuário (`/users`).
  - `ROLE_GESTOR`: Avalia analistas, gerencia formulários, altera o setor dos seus analistas vinculados (preservando o histórico via `analystSectorSnapshot`) e inativa/reativa analistas dos seus setores.
  - `ROLE_ANALISTA`: Acesso estritamente somente-leitura ao próprio dashboard e às suas próprias avaliações.
- **Dashboard Analítico Shadcn (`/dashboard`):** Gráficos animados de evolução temporal, comparativo por setor, aderência por critério e ranking de operadores.
- **Central de Avaliações (`/evaluations`):** Filtros combinados por código/ID da avaliação, nome do analista, setor e intervalo de datas (`startDate`, `endDate`).

---

## 3. Stack Tecnológica

### Backend (`/backend`)
- **Java 21** + **Spring Boot 3.3.4**
- **Spring Data JPA / Hibernate** + **Flyway Migrations (`V1` a `V7`)**
- **Spring Security 6** (JWT Stateless + `N8nApiKeyFilter` via `X-API-KEY`)
- **PostgreSQL 16** (produção/Docker) e **H2 em modo PostgreSQL** (execução local imediata)
- **SpringDoc OpenAPI / Swagger UI** (`/swagger-ui.html`)

### Frontend (`/frontend`)
- **Next.js 14 (App Router)** + **TypeScript**
- **Tailwind CSS** (estética Shadcn Neutral Dark) + **Framer Motion** + **Lucide Icons**
- **TanStack React Query v5** + **Axios**

---

## 4. Configuração de Variáveis de Ambiente

Copie o arquivo `.env.example` para `.env` (ou `frontend/.env.local`) e configure as variáveis do seu ambiente:

```bash
cp .env.example .env
```

> Os arquivos `.env` e `frontend/.env.local` estão configurados no `.gitignore` para nunca expor URLs privadas de Webhooks, chaves de API ou credenciais no repositório.

---

## 5. Como Executar Localmente

### Opção 1: Execução Local Direta (Sem precisar de Docker)

1. **Backend (porta `8080`):**
   ```bash
   cd backend
   mvn spring-boot:run
   ```
2. **Frontend (porta `3000`):**
   ```bash
   cd frontend
   npm install
   npm run dev
   ```
   Acesse `http://localhost:3000` (Swagger UI em `http://localhost:8080/swagger-ui.html`).

### Opção 2: Execução via Docker Compose (PostgreSQL 16 + Backend + Frontend)

```bash
docker compose up --build -d
```
