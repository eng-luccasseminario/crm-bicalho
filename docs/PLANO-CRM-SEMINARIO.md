# CRM Bicalho Engenharia — Plano Completo de Implementação

> **Objetivo:** CRM personalizado baseado no Twenty (open source), com banco Supabase, gestão de propostas por fases (incluindo Perdido), CDE de documentos por cliente e agente IA via WhatsApp.

---

## Visão Geral da Solução

```
┌─────────────────────────────────────────────────────────┐
│                   FRONTEND (Twenty)                      │
│   Pipeline · Contatos · Empresas · CDE de Documentos    │
└─────────────────────┬───────────────────────────────────┘
                      │ GraphQL API
┌─────────────────────▼───────────────────────────────────┐
│                   BACKEND (NestJS)                       │
│         API customizada + lógica de negócio             │
└──────────┬──────────────────┬───────────┬───────────────┘
           │                  │           │
┌──────────▼──────────┐  ┌───▼────────┐  ┌▼──────────────┐
│  SUPABASE (Postgres) │  │   GOOGLE   │  │    GOOGLE     │
│  Dados do CRM       │  │   DRIVE    │  │   CALENDAR    │
└─────────────────────┘  │  (docs CDE)│  │  (reuniões)   │
                         └────────────┘  └───────────────┘
           │
┌──────────▼──────────────────────────────────────────────┐
│              AGENTE IA (WhatsApp)                        │
│   Evolution API · Claude API · Webhook Backend           │
└─────────────────────────────────────────────────────────┘
```

---

## Fases do Pipeline de Propostas

```
Prospecção → Qualificação → Proposta Inicial → Negociação → Fechado ✓
                                                           → Perdido ✗
```

| Fase | Cor | Descrição |
|---|---|---|
| Prospecção | Azul claro | Primeiro contato, lead identificado |
| Qualificação | Amarelo | Reunião realizada, dores mapeadas |
| Proposta Inicial | Laranja | Escopo e orçamento em elaboração |
| Negociação | Roxo | Proposta enviada, ajustes em andamento |
| Fechado | Verde | Contrato assinado |
| Perdido | Vermelho | Negócio não concluído (com motivo) |

---

## Estrutura CDE por Cliente

Cada cliente terá uma pasta estruturada no **Supabase Storage**:

```
/clientes/
  └── {id-cliente}/
        ├── 00_reunioes/
        │     └── transcricao_YYYY-MM-DD.pdf
        ├── 01_proposta_inicial/
        │     └── proposta_v1.pdf
        ├── 02_dores_requisitos/
        │     └── briefing.md
        ├── 03_escopo/
        │     └── escopo_aprovado.pdf
        ├── 04_cronograma/
        │     └── cronograma.pdf
        ├── 05_orcamento/
        │     └── orcamento_vFinal.xlsx
        ├── 06_contrato/
        │     └── contrato_assinado.pdf
        └── 07_arquivado/
              └── (documentos de negócios perdidos)
```

---

## FASE 1 — Configuração do Repositório e Supabase

### 1.1 Pré-requisitos

- [ ] Node.js 18+ instalado
- [ ] Docker Desktop instalado
- [ ] Git instalado
- [ ] Conta no Supabase criada (supabase.com)
- [ ] Conta no GitHub

### 1.2 Clonar o Twenty

```bash
# Clonar repositório oficial
git clone https://github.com/twentyhq/twenty.git crm-bicalho
cd crm-bicalho

# Instalar dependências
yarn install
```

### 1.3 Criar projeto no Supabase

1. Acessar [supabase.com](https://supabase.com) → New Project
2. Nome: `crm-bicalho`
3. Região: South America (São Paulo)
4. Anotar:
   - `Project URL`
   - `anon public key`
   - `service_role key`
   - `Database URL` (connection string)

### 1.4 Configurar variáveis de ambiente

```bash
# Copiar exemplo
cp packages/twenty-server/.env.example packages/twenty-server/.env
```

Editar `packages/twenty-server/.env`:

```env
# Banco de dados (Supabase)
PG_DATABASE_URL=postgresql://postgres:[SUA-SENHA]@db.[SEU-ID].supabase.co:5432/postgres

# Autenticação
APP_SECRET=seu_secret_super_seguro_aqui

# Supabase Storage
SUPABASE_URL=https://[SEU-ID].supabase.co
SUPABASE_KEY=[SUA-SERVICE-ROLE-KEY]
SUPABASE_STORAGE_BUCKET=documentos-cde

# Frontend
FRONT_BASE_URL=http://localhost:3001
```

### 1.5 Inicializar banco no Supabase

```bash
# Rodar migrations do Twenty no Supabase
cd packages/twenty-server
yarn database:migrate
yarn database:seed
```

---

## FASE 2 — Customizações no Twenty

### 2.1 Pipeline de Propostas com fase Perdido

Arquivo: `packages/twenty-server/src/engine/workspace-manager/standard-objects/pipeline-stage.standard-object.ts`

Adicionar os stages customizados:

```typescript
export const PIPELINE_STAGES_BICALHO = [
  { name: 'Prospecção',       color: 'blue',   position: 0 },
  { name: 'Qualificação',     color: 'yellow', position: 1 },
  { name: 'Proposta Inicial', color: 'orange', position: 2 },
  { name: 'Negociação',       color: 'purple', position: 3 },
  { name: 'Fechado',          color: 'green',  position: 4, closeStage: true  },
  { name: 'Perdido',          color: 'red',    position: 5, closeStage: true, lostStage: true },
];
```

### 2.2 Objeto Customizado: Proposta

Criar via interface do Twenty (Settings → Objects → Add Custom Object):

**Object:** `Proposta`

| Campo | Tipo | Descrição |
|---|---|---|
| titulo | Text | Nome da proposta |
| fase | Select | Fase atual da proposta |
| dores_principais | Long Text | Dores mapeadas na reunião |
| requisitos | Long Text | Requisitos levantados |
| escopo | Long Text | Descrição do escopo |
| valor_estimado | Currency | Orçamento estimado |
| valor_aprovado | Currency | Orçamento aprovado |
| data_reuniao | Date | Data da última reunião |
| data_envio_proposta | Date | Data de envio da proposta |
| data_fechamento | Date | Data de fechamento |
| motivo_perda | Select | Motivo caso perdido |
| probabilidade | Number | % de chance de fechar |
| responsavel | Relation → Pessoa | Contato responsável |
| empresa | Relation → Empresa | Empresa cliente |
| deal | Relation → Deal | Deal vinculado |

**Motivos de Perda (Select):**
- Preço
- Concorrência
- Prazo
- Escopo não atendido
- Cliente desistiu
- Sem orçamento
- Outro

### 2.3 Objeto Customizado: Documento CDE

**Object:** `Documento`

| Campo | Tipo | Descrição |
|---|---|---|
| nome | Text | Nome do documento |
| categoria | Select | Categoria (Reunião, Proposta, Escopo, etc.) |
| versao | Text | Versão do arquivo (v1, v2, Final) |
| url_supabase | Text | URL do arquivo no Storage |
| data_upload | Date | Data de envio |
| descricao | Long Text | Observações sobre o documento |
| proposta | Relation → Proposta | Proposta vinculada |
| cliente | Relation → Empresa | Cliente vinculado |

**Categorias:**
- Transcrição de Reunião
- Proposta Inicial
- Dores e Requisitos
- Escopo
- Cronograma
- Orçamento
- Contrato
- Apresentação
- Outro

### 2.4 Integração Supabase Storage

Criar serviço em `packages/twenty-server/src/modules/storage/`:

```typescript
// supabase-storage.service.ts
import { createClient } from '@supabase/supabase-js';

@Injectable()
export class SupabaseStorageService {
  private client = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_KEY
  );

  async uploadDocument(
    clienteId: string,
    categoria: string,
    file: Buffer,
    filename: string
  ): Promise<string> {
    const path = `${clienteId}/${this.getCategoryFolder(categoria)}/${filename}`;
    
    const { data, error } = await this.client.storage
      .from('documentos-cde')
      .upload(path, file, { upsert: false });

    if (error) throw error;
    return this.client.storage.from('documentos-cde').getPublicUrl(path).data.publicUrl;
  }

  async listClientDocuments(clienteId: string) {
    const { data } = await this.client.storage
      .from('documentos-cde')
      .list(clienteId, { recursive: true });
    return data;
  }

  private getCategoryFolder(categoria: string): string {
    const map = {
      'Transcrição de Reunião': '00_reunioes',
      'Proposta Inicial': '01_proposta_inicial',
      'Dores e Requisitos': '02_dores_requisitos',
      'Escopo': '03_escopo',
      'Cronograma': '04_cronograma',
      'Orçamento': '05_orcamento',
      'Contrato': '06_contrato',
    };
    return map[categoria] || '07_outros';
  }
}
```

---

## FASE 3 — Integração Google Drive (CDE na Nuvem)

### 3.1 Estratégia de documentos

O **Supabase Storage** guarda metadados e arquivos menores. O **Google Drive** é o repositório principal dos documentos CDE — mais familiar, com preview, comentários e compartilhamento fácil com clientes.

```
Upload pelo usuário (interface ou WhatsApp)
          ↓
  Google Drive API
  /CRM-Bicalho/
    └── Clientes/
          └── {Nome-Cliente}/
                ├── 00_Reunioes/
                ├── 01_Proposta_Inicial/
                ├── 02_Dores_Requisitos/
                ├── 03_Escopo/
                ├── 04_Cronograma/
                ├── 05_Orcamento/
                ├── 06_Contrato/
                └── 07_Arquivado/
          ↓
  URL do arquivo salva no Twenty (campo url_drive)
  Metadados salvos no Supabase
```

### 3.2 Configuração Google Drive API

**No Google Cloud Console:**

1. Acessar [console.cloud.google.com](https://console.cloud.google.com)
2. Criar projeto: `crm-bicalho`
3. Ativar APIs:
   - Google Drive API
   - Google Calendar API
   - Google People API (opcional, para contatos)
4. Criar credenciais → OAuth 2.0 Client ID
5. Baixar `credentials.json`
6. Anotar:
   - `CLIENT_ID`
   - `CLIENT_SECRET`
   - `REDIRECT_URI`

### 3.3 Serviço Google Drive no Backend

```typescript
// google-drive.service.ts
import { google } from 'googleapis';

@Injectable()
export class GoogleDriveService {
  private drive: drive_v3.Drive;
  private ROOT_FOLDER_NAME = 'CRM-Bicalho';

  async uploadDocument(
    clienteNome: string,
    categoria: string,
    file: Buffer,
    filename: string,
    mimeType: string
  ): Promise<string> {
    const clienteFolderId = await this.getOrCreateFolder(
      clienteNome,
      await this.getRootFolderId()
    );
    const categoriaFolderId = await this.getOrCreateFolder(
      this.getCategoryFolder(categoria),
      clienteFolderId
    );

    const response = await this.drive.files.create({
      requestBody: {
        name: filename,
        parents: [categoriaFolderId],
      },
      media: { mimeType, body: Readable.from(file) },
      fields: 'id, webViewLink',
    });

    return response.data.webViewLink;
  }

  async listClientDocuments(clienteNome: string) {
    const folderId = await this.getOrCreateFolder(
      clienteNome,
      await this.getRootFolderId()
    );
    const res = await this.drive.files.list({
      q: `'${folderId}' in parents and trashed=false`,
      fields: 'files(id, name, mimeType, webViewLink, createdTime)',
    });
    return res.data.files;
  }

  private getCategoryFolder(categoria: string): string {
    const map = {
      'Transcrição de Reunião': '00_Reunioes',
      'Proposta Inicial':       '01_Proposta_Inicial',
      'Dores e Requisitos':     '02_Dores_Requisitos',
      'Escopo':                 '03_Escopo',
      'Cronograma':             '04_Cronograma',
      'Orçamento':              '05_Orcamento',
      'Contrato':               '06_Contrato',
    };
    return map[categoria] || '07_Outros';
  }
}
```

### 3.4 Variáveis de ambiente para Drive

```env
GOOGLE_CLIENT_ID=seu_client_id
GOOGLE_CLIENT_SECRET=seu_client_secret
GOOGLE_REDIRECT_URI=https://api.crm.bicalhoengenharia.com/auth/google/callback
GOOGLE_REFRESH_TOKEN=token_gerado_no_primeiro_login
```

---

## FASE 4 — Integração Google Calendar

### 4.1 O que sincronizar

| Evento no CRM | Ação no Calendar |
|---|---|
| Reunião de qualificação agendada | Cria evento com link Meet |
| Follow-up programado | Cria lembrete no Calendar |
| Data limite de proposta | Cria evento de deadline |
| Deal fechado | Cria evento de kick-off |
| Reunião registrada via WhatsApp | Cria/atualiza evento |

### 4.2 Serviço Google Calendar no Backend

```typescript
// google-calendar.service.ts
import { google } from 'googleapis';

@Injectable()
export class GoogleCalendarService {

  async criarReuniao(params: {
    titulo: string;
    descricao: string;
    inicio: Date;
    fim: Date;
    convidados: string[];
    clienteNome: string;
  }): Promise<{ eventId: string; meetLink: string; htmlLink: string }> {
    const event = await this.calendar.events.insert({
      calendarId: 'primary',
      conferenceDataVersion: 1,
      requestBody: {
        summary: `[${params.clienteNome}] ${params.titulo}`,
        description: params.descricao,
        start: { dateTime: params.inicio.toISOString(), timeZone: 'America/Sao_Paulo' },
        end:   { dateTime: params.fim.toISOString(),   timeZone: 'America/Sao_Paulo' },
        attendees: params.convidados.map(email => ({ email })),
        conferenceData: {
          createRequest: { requestId: `meet-${Date.now()}` }
        },
      },
    });

    return {
      eventId:  event.data.id,
      meetLink: event.data.hangoutLink,
      htmlLink: event.data.htmlLink,
    };
  }

  async listarReunioesDaSemana(): Promise<any[]> {
    const agora = new Date();
    const fimSemana = new Date(agora.getTime() + 7 * 24 * 60 * 60 * 1000);

    const res = await this.calendar.events.list({
      calendarId: 'primary',
      timeMin: agora.toISOString(),
      timeMax: fimSemana.toISOString(),
      singleEvents: true,
      orderBy: 'startTime',
    });

    return res.data.items;
  }
}
```

### 4.3 Tool do agente para Calendar

```typescript
{
  name: "agendar_reuniao",
  description: "Agenda uma reunião no Google Calendar e cria link Meet",
  input_schema: {
    properties: {
      titulo: { type: "string" },
      cliente_nome: { type: "string" },
      data: { type: "string", description: "YYYY-MM-DD" },
      horario: { type: "string", description: "HH:MM" },
      duracao_minutos: { type: "number" },
      email_cliente: { type: "string" },
      pauta: { type: "string" }
    }
  }
},
{
  name: "consultar_agenda",
  description: "Lista reuniões agendadas nos próximos dias",
  input_schema: {
    properties: {
      dias: { type: "number", description: "Quantos dias à frente consultar (padrão 7)" }
    }
  }
}
```

### 4.4 Exemplos de uso via WhatsApp

```
Você → "Agenda reunião com Construtora ABC sexta às 14h, pauta: apresentação de escopo"
Agente → Cria evento no Calendar, gera link Meet, registra no CRM, confirma por WhatsApp

Você → "Quais reuniões tenho essa semana?"
Agente → Consulta Calendar, responde com lista formatada

Você → "Reunião com Silva foi feita hoje, eles querem reduzir o escopo"
Agente → Registra nota no CRM, atualiza proposta, pergunta se quer reagendar
```

---

## FASE 5 — Agente IA no WhatsApp

### 3.1 Estrutura do Agente

```
/agente-whatsapp/
  ├── src/
  │     ├── index.ts          # Entry point / webhook
  │     ├── claude.service.ts # Integração Claude API
  │     ├── twenty.service.ts # Integração Twenty GraphQL
  │     ├── tools/
  │     │     ├── criar-contato.ts
  │     │     ├── criar-proposta.ts
  │     │     ├── atualizar-fase.ts
  │     │     ├── registrar-nota.ts
  │     │     ├── consultar-deals.ts
  │     │     └── listar-documentos.ts
  │     └── evolution.service.ts # Integração WhatsApp
  ├── .env
  └── package.json
```

### 3.2 Tools do Agente Claude

```typescript
const TOOLS = [
  {
    name: "criar_contato",
    description: "Cria um novo contato/lead no CRM",
    input_schema: {
      properties: {
        nome: { type: "string" },
        empresa: { type: "string" },
        telefone: { type: "string" },
        email: { type: "string" },
        observacao: { type: "string" }
      }
    }
  },
  {
    name: "criar_proposta",
    description: "Cria uma nova proposta vinculada a um cliente",
    input_schema: {
      properties: {
        cliente_id: { type: "string" },
        titulo: { type: "string" },
        dores_principais: { type: "string" },
        requisitos: { type: "string" },
        valor_estimado: { type: "number" }
      }
    }
  },
  {
    name: "atualizar_fase_proposta",
    description: "Atualiza a fase de uma proposta (Qualificação, Negociação, Fechado, Perdido)",
    input_schema: {
      properties: {
        proposta_id: { type: "string" },
        nova_fase: { type: "string" },
        motivo_perda: { type: "string", description: "Obrigatório se fase for Perdido" }
      }
    }
  },
  {
    name: "registrar_nota",
    description: "Registra uma nota/observação em um contato ou proposta",
    input_schema: {
      properties: {
        entidade_tipo: { type: "string", enum: ["contato", "proposta"] },
        entidade_id: { type: "string" },
        nota: { type: "string" }
      }
    }
  },
  {
    name: "consultar_pipeline",
    description: "Consulta o status atual das propostas por fase",
    input_schema: {
      properties: {
        fase: { type: "string", description: "Filtrar por fase (opcional)" },
        parados_ha_dias: { type: "number", description: "Filtrar deals parados há X dias" }
      }
    }
  },
  {
    name: "listar_documentos_cliente",
    description: "Lista todos os documentos CDE de um cliente",
    input_schema: {
      properties: {
        cliente_id: { type: "string" },
        categoria: { type: "string", description: "Filtrar por categoria (opcional)" }
      }
    }
  }
];
```

### 3.3 Exemplos de interação

```
Você → "Reunião com Construtora ABC, dores: prazo e gestão de subcontratados"
Agente → Cria/atualiza proposta, registra dores, responde confirmando

Você → "Quais propostas estão em negociação?"
Agente → Consulta Twenty, responde com lista formatada

Você → "Proposta da ABC foi perdida, motivo: preço"
Agente → Atualiza fase para Perdido, registra motivo

Você → "Quais documentos tenho da Construtora Silva?"
Agente → Lista CDE do cliente com links
```

---

## FASE 6 — Deploy e Infraestrutura (100% Gratuito)

### Arquitetura de deploy

```
Frontend (React)     → Vercel        (gratuito, ilimitado)
Backend (NestJS)     → Railway       (gratuito, $5 crédito/mês)
Agente WhatsApp      → Railway       (mesmo projeto)
Banco de dados       → Supabase      (gratuito até 500MB)
Storage documentos   → Google Drive  (gratuito, 15GB)
Calendário           → Google Cal.   (gratuito)
```

### 6.1 Vercel — Frontend Twenty

```bash
# Instalar Vercel CLI
npm install -g vercel

# Na pasta do frontend
cd packages/twenty-front
vercel deploy --prod
```

Configurar em `vercel.json`:
```json
{
  "buildCommand": "yarn build",
  "outputDirectory": "dist",
  "env": {
    "VITE_SERVER_BASE_URL": "https://crm-backend.up.railway.app"
  }
}
```

- URL gerada: `crm-seminario.vercel.app`
- Domínio customizado: conectar gratuitamente no painel da Vercel

### 6.2 Railway — Backend + Agente WhatsApp

```bash
# Instalar Railway CLI
npm install -g @railway/cli

# Login
railway login

# Criar projeto
railway init

# Deploy do backend
cd packages/twenty-server
railway up

# Deploy do agente (mesmo projeto, novo serviço)
cd ../../agente-whatsapp
railway up
```

**Limites do plano gratuito Railway:**
- $5 de crédito/mês (suficiente para uso leve/MVP)
- 512MB RAM por serviço
- Serviço hiberna após inatividade (acorda em ~10s na primeira requisição)

> Para uso diário como CRM pessoal, o plano gratuito é suficiente.

### 6.3 Variáveis de ambiente

Configurar no painel do Railway (Settings → Variables) e Vercel (Project → Settings → Environment Variables):

**Railway (Backend):**
```env
PG_DATABASE_URL=postgresql://postgres:[SENHA]@db.[ID].supabase.co:5432/postgres
SUPABASE_URL=https://[ID].supabase.co
SUPABASE_KEY=[SERVICE_ROLE_KEY]
APP_SECRET=[STRING_ALEATORIA_32_CHARS]
FRONT_BASE_URL=https://crm-seminario.vercel.app
GOOGLE_CLIENT_ID=[CLIENT_ID]
GOOGLE_CLIENT_SECRET=[CLIENT_SECRET]
GOOGLE_REDIRECT_URI=https://crm-backend.up.railway.app/auth/google/callback
GOOGLE_REFRESH_TOKEN=[REFRESH_TOKEN]
```

**Railway (Agente WhatsApp):**
```env
CLAUDE_API_KEY=[SUA_CHAVE_ANTHROPIC]
EVOLUTION_API_URL=https://[SUA_EVOLUTION].up.railway.app
EVOLUTION_API_KEY=[CHAVE_EVOLUTION]
TWENTY_API_URL=https://crm-backend.up.railway.app
TWENTY_API_KEY=[API_KEY_DO_TWENTY]
```

**Vercel (Frontend):**
```env
VITE_SERVER_BASE_URL=https://crm-backend.up.railway.app
```

### 6.4 Evolution API (WhatsApp) no Railway

```bash
# Dentro do projeto Railway, criar novo serviço
# Usar imagem Docker oficial
railway add --image atendai/evolution-api:latest
```

Variáveis da Evolution:
```env
AUTHENTICATION_API_KEY=[CHAVE_QUE_VOCE_DEFINE]
DATABASE_ENABLED=false
WEBHOOK_GLOBAL_URL=https://agente-whatsapp.up.railway.app/webhook
```

### 6.5 Domínio customizado (opcional, gratuito)

- **Vercel**: Painel → Domains → adicionar `crm.seminario.com.br`
- **Railway**: Painel → Settings → Domains → adicionar subdomínio
- Apontar DNS no registrador (onde comprou o domínio)

---

## CHECKLIST FINAL — 100% Funcional

### Supabase
- [ ] Projeto criado na região São Paulo
- [ ] Migrations do Twenty rodadas com sucesso
- [ ] Bucket `documentos-cde` criado no Storage
- [ ] Políticas de acesso do Storage configuradas
- [ ] Connection string testada

### Twenty CRM
- [ ] Repositório clonado e adaptado
- [ ] `.env` configurado com Supabase
- [ ] Build sem erros (`yarn build`)
- [ ] Pipeline com 6 fases criado (incluindo Perdido)
- [ ] Objeto `Proposta` criado com todos os campos
- [ ] Objeto `Documento` criado com todos os campos
- [ ] Usuário admin criado
- [ ] Login funcionando

### Supabase Storage (CDE)
- [ ] Upload de documentos funcionando via interface
- [ ] Estrutura de pastas por cliente criada
- [ ] URLs públicas/privadas configuradas corretamente
- [ ] Teste de upload e listagem OK

### Google Drive
- [ ] Projeto criado no Google Cloud Console
- [ ] Google Drive API ativada
- [ ] OAuth 2.0 configurado e credenciais baixadas
- [ ] Refresh token gerado (autenticação inicial)
- [ ] Pasta raiz `CRM-Seminario` criada no Drive
- [ ] Upload de documento testado via API
- [ ] Listagem de documentos por cliente testada
- [ ] Link do Drive salvo no campo correto do Twenty

### Google Calendar
- [ ] Google Calendar API ativada no mesmo projeto GCP
- [ ] Permissões OAuth incluem `calendar.events`
- [ ] Criação de evento com link Meet testada
- [ ] Consulta de eventos da semana testada
- [ ] Integração com agente WhatsApp funcionando
- [ ] Timezone configurada para America/Sao_Paulo

### Agente WhatsApp
- [ ] Evolution API instalada e rodando
- [ ] WhatsApp conectado (QR Code escaneado)
- [ ] Webhook do agente configurado na Evolution API
- [ ] Claude API key configurada e testada
- [ ] Tools integradas ao Twenty GraphQL
- [ ] Tool de Drive funcionando (listar documentos)
- [ ] Tool de Calendar funcionando (agendar/consultar)
- [ ] Teste de cada tool (criar, atualizar, consultar)
- [ ] Mensagens de resposta em português BR

### Deploy (Vercel + Railway + Supabase)
- [ ] Conta criada no Vercel (vercel.com)
- [ ] Conta criada no Railway (railway.app)
- [ ] Frontend deployado no Vercel com build sem erros
- [ ] URL do Vercel acessível (ex: crm-seminario.vercel.app)
- [ ] Backend deployado no Railway respondendo na API
- [ ] Agente WhatsApp deployado no Railway
- [ ] Evolution API deployado no Railway
- [ ] HTTPS automático funcionando (Vercel e Railway já incluem)
- [ ] Variáveis de ambiente configuradas em todos os serviços
- [ ] Agente recebendo mensagens do WhatsApp
- [ ] Backup automático do Supabase habilitado

### Testes de ponta a ponta
- [ ] Criar contato pelo WhatsApp → aparece no Twenty
- [ ] Atualizar fase pelo WhatsApp → muda no Kanban
- [ ] Upload de documento no Drive → aparece no CDE do cliente no Twenty
- [ ] Consultar pipeline pelo WhatsApp → resposta correta
- [ ] Marcar como Perdido com motivo → registrado corretamente
- [ ] Agendar reunião pelo WhatsApp → aparece no Google Calendar
- [ ] Consultar agenda pelo WhatsApp → lista reuniões corretamente
- [ ] "Quais documentos do cliente X?" → agente lista com links do Drive

---

## Próximos Passos (Pós MVP)

- [ ] Notificações automáticas (deals parados há X dias)
- [ ] Relatório semanal via WhatsApp (toda segunda-feira)
- [ ] Transcrição automática de áudio do WhatsApp → nota no CRM
- [ ] Geração de proposta PDF pelo agente
- [ ] Dashboard de métricas (taxa de conversão por fase, motivos de perda)

---

*Plano criado em: julho/2026*  
*Stack: Twenty CRM · Supabase · Claude API · Evolution API · Google Drive · Google Calendar · Vercel · Railway*  
*Deploy: 100% gratuito (Vercel free · Railway $5 crédito/mês · Supabase free)*
