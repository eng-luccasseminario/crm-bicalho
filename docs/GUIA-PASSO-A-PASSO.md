# Guia Passo a Passo — CRM Seminário
### Do zero ao 100% funcional

---

## PRÉ-REQUISITOS — Instale antes de tudo

| Ferramenta | Link | Para que serve |
|---|---|---|
| Node.js 18+ | nodejs.org | Rodar o código |
| Git | git-scm.com | Clonar o projeto |
| Yarn | `npm install -g yarn` | Gerenciar pacotes do Twenty |
| VS Code | code.visualstudio.com | Editar arquivos |

Verifique se está tudo instalado:
```bash
node --version   # deve mostrar v18 ou superior
git --version
yarn --version
```

---

## PASSO 1 — Repositório (já feito)

O repositório já foi clonado em `D:\CRM LUCCAS\crm-seminario`.

Estrutura criada:
```
D:\CRM LUCCAS\
  ├── crm-seminario/          ← Twenty CRM (frontend + backend)
  ├── agente-whatsapp/        ← Agente IA para WhatsApp
  ├── PLANO-CRM-SEMINARIO.md
  └── GUIA-PASSO-A-PASSO.md  ← este arquivo
```

---

## PASSO 2 — Criar conta no Supabase

1. Acesse **supabase.com** → "Start your project" → faça login com Google
2. Clique em **"New project"**
3. Preencha:
   - **Name:** `crm-seminario`
   - **Database Password:** crie uma senha forte e **anote ela**
   - **Region:** South America (São Paulo)
4. Aguarde ~2 minutos até o projeto criar
5. Vá em **Settings → Database** e copie a **Connection string** (URI)
   - Formato: `postgresql://postgres:[SENHA]@db.[ID].supabase.co:5432/postgres`
   - Substitua `[YOUR-PASSWORD]` pela senha que você criou
6. Vá em **Settings → API** e copie:
   - `Project URL`
   - `service_role` secret key

**Guarde essas informações — você vai precisar nos próximos passos.**

---

## PASSO 3 — Configurar o arquivo .env do Twenty

Abra o arquivo:
```
D:\CRM LUCCAS\crm-seminario\packages\twenty-server\.env
```

Substitua os campos marcados com `[...]`:

```
PG_DATABASE_URL=postgres://postgres:SUASENHA@db.SEUID.supabase.co:5432/postgres
APP_SECRET=qualquer_string_aleatoria_longa_aqui_123456789
```

> Deixe o resto por enquanto. Você vai preencher Google e Redis nos próximos passos.

---

## PASSO 4 — Criar conta no Railway

1. Acesse **railway.app** → "Login with GitHub"
2. Clique em **"New Project"** → "Empty Project"
3. Renomeie o projeto para `crm-seminario`

### Adicionar Redis ao Railway

4. Dentro do projeto, clique em **"+ New"** → "Database" → **"Add Redis"**
5. Após criar, clique no Redis → aba **"Variables"** → copie o valor de `REDIS_URL`
6. Cole no `.env` do Twenty:
   ```
   REDIS_URL=redis://default:SENHA@HOST.railway.app:6379
   ```

---

## PASSO 5 — Criar projeto no Google Cloud (Drive + Calendar)

1. Acesse **console.cloud.google.com**
2. Clique no seletor de projeto (topo) → **"New Project"**
   - Nome: `crm-seminario`
3. Ative as APIs (menu lateral → "APIs & Services" → "Library"):
   - Pesquise e ative: **Google Calendar API**
   - Pesquise e ative: **Google Drive API**
4. Vá em **"APIs & Services" → "Credentials"** → **"+ Create Credentials"** → OAuth client ID
5. Configure:
   - Application type: **Web application**
   - Name: `CRM Seminário`
   - Authorized redirect URIs: adicione `http://localhost:3000/auth/google/redirect`
6. Clique em **"Create"** → baixe o JSON ou copie:
   - `Client ID`
   - `Client Secret`
7. Cole no `.env` do Twenty:
   ```
   AUTH_GOOGLE_CLIENT_ID=SEU_CLIENT_ID
   AUTH_GOOGLE_CLIENT_SECRET=SEU_CLIENT_SECRET
   ```

### Gerar Refresh Token para o agente WhatsApp

8. Abra o terminal no VS Code (Ctrl + `) e rode:
   ```bash
   cd "D:\CRM LUCCAS\agente-whatsapp"
   npm install
   node -e "
   const {google} = require('googleapis');
   const oauth2Client = new google.auth.OAuth2(
     'SEU_CLIENT_ID',
     'SEU_CLIENT_SECRET',
     'http://localhost:3002/auth/callback'
   );
   const url = oauth2Client.generateAuthUrl({
     access_type: 'offline',
     scope: [
       'https://www.googleapis.com/auth/calendar',
       'https://www.googleapis.com/auth/drive'
     ]
   });
   console.log('Abra este link no navegador:', url);
   "
   ```
9. Abra o link gerado no navegador, faça login com sua conta Google e autorize
10. Você será redirecionado para um URL com `?code=...` — copie o código
11. Troque o código pelo refresh token:
    ```bash
    node -e "
    const {google} = require('googleapis');
    const oauth2Client = new google.auth.OAuth2('SEU_CLIENT_ID','SEU_CLIENT_SECRET','http://localhost:3002/auth/callback');
    oauth2Client.getToken('CODIGO_QUE_VOCE_COPIOU').then(({tokens}) => console.log('REFRESH TOKEN:', tokens.refresh_token));
    "
    ```
12. Copie o refresh token e cole no `.env` do agente:
    ```
    GOOGLE_REFRESH_TOKEN=SEU_REFRESH_TOKEN
    ```

---

## PASSO 6 — Instalar dependências do Twenty

Abra o terminal no VS Code, navegue até a pasta do projeto e rode:

```bash
cd "D:\CRM LUCCAS\crm-seminario"
yarn install
```

> Isso pode demorar 5–10 minutos na primeira vez.

---

## PASSO 7 — Rodar as migrations no Supabase

```bash
cd "D:\CRM LUCCAS\crm-seminario"
yarn nx run twenty-server:database:migrate
```

Isso cria todas as tabelas do CRM no seu banco Supabase.

Se pedir para criar workspace inicial:
```bash
yarn nx run twenty-server:database:seed
```

---

## PASSO 8 — Testar localmente

```bash
cd "D:\CRM LUCCAS\crm-seminario"
yarn start
```

Acesse no navegador:
- **Frontend:** http://localhost:3001
- **Backend:** http://localhost:3000

Se abriu o Twenty, a configuração local está funcionando. ✓

---

## PASSO 9 — Personalizar o pipeline de propostas

Com o Twenty rodando, acesse http://localhost:3001:

1. Faça login (crie sua conta na primeira vez)
2. Vá em **Settings** (ícone de engrenagem)
3. **"Pipeline" → "Stages"** — edite as etapas para:
   - Prospecção
   - Qualificação
   - Proposta Inicial
   - Negociação
   - Fechado ✓
   - Perdido ✗
4. Para "Perdido", marque como **"Lost stage"** se disponível

### Criar objeto Proposta

5. Vá em **Settings → Objects → "+ Add custom object"**
6. Nome: `Proposta`
7. Adicione os campos conforme o plano (dores, requisitos, escopo, valor, etc.)
8. Repita para objeto `Documento`

---

## PASSO 10 — Deploy do Frontend no Vercel

1. Acesse **vercel.com** → "Login with GitHub"
2. Clique em **"Add New Project"** → "Import Git Repository"
3. Se o repositório não aparecer, clique em "Adjust GitHub App Permissions" e selecione `crm-seminario`
4. Configure o projeto:
   - **Framework:** Vite
   - **Root Directory:** `packages/twenty-front`
   - **Build Command:** `yarn build`
   - **Output Directory:** `dist`
5. Vá em **"Environment Variables"** e adicione:
   ```
   VITE_SERVER_BASE_URL = https://crm-backend.up.railway.app
   ```
   > (Você vai obter essa URL no próximo passo — pode voltar e ajustar depois)
6. Clique em **"Deploy"**
7. Anote a URL gerada: `crm-seminario-xxx.vercel.app`

---

## PASSO 11 — Deploy do Backend no Railway

1. No projeto Railway, clique em **"+ New"** → "GitHub Repo"
2. Selecione o repositório `crm-seminario`
3. Configure o serviço:
   - **Name:** `crm-backend`
   - **Root Directory:** `packages/twenty-server`
   - **Build Command:** `yarn build`
   - **Start Command:** `node dist/main.js`
4. Vá em **"Variables"** e adicione **todas** as variáveis do `.env`:
   ```
   PG_DATABASE_URL=...
   REDIS_URL=...
   APP_SECRET=...
   FRONTEND_URL=https://crm-seminario.vercel.app
   AUTH_GOOGLE_ENABLED=true
   AUTH_GOOGLE_CLIENT_ID=...
   AUTH_GOOGLE_CLIENT_SECRET=...
   AUTH_GOOGLE_CALLBACK_URL=https://crm-backend.up.railway.app/auth/google/redirect
   AUTH_GOOGLE_APIS_CALLBACK_URL=https://crm-backend.up.railway.app/auth/google-apis/get-access-token
   CALENDAR_PROVIDER_GOOGLE_ENABLED=true
   MESSAGING_PROVIDER_GMAIL_ENABLED=true
   AUTH_PASSWORD_ENABLED=true
   IS_WORKSPACE_CREATION_LIMITED_TO_SERVER_ADMINS=true
   STORAGE_TYPE=local
   ```
5. O Railway vai gerar uma URL tipo `crm-backend.up.railway.app`
6. **Volte ao Vercel** e atualize a variável `VITE_SERVER_BASE_URL` com essa URL
7. Adicione também no Google Cloud Console a URI de redirecionamento de produção:
   - `https://crm-backend.up.railway.app/auth/google/redirect`

---

## PASSO 12 — Deploy da Evolution API (WhatsApp)

1. No Railway, dentro do mesmo projeto, clique em **"+ New"** → "Docker Image"
2. Imagem: `atendai/evolution-api:latest`
3. Nome: `evolution-api`
4. Vá em **"Variables"** e adicione:
   ```
   AUTHENTICATION_API_KEY=CRIE_UMA_CHAVE_AQUI_EX_seminario123456
   DATABASE_ENABLED=false
   WEBHOOK_GLOBAL_URL=https://agente-whatsapp.up.railway.app/webhook
   WEBHOOK_GLOBAL_ENABLED=true
   ```
5. Anote a URL gerada: `evolution-api.up.railway.app`

### Conectar WhatsApp

6. Acesse: `https://evolution-api.up.railway.app/manager`
7. Crie uma instância chamada `seminario`
8. Clique em "Connect" → aparece QR Code
9. Abra o WhatsApp no celular → Dispositivos conectados → Conectar dispositivo
10. Escaneie o QR Code

---

## PASSO 13 — Deploy do Agente WhatsApp

1. No Railway, clique em **"+ New"** → "GitHub Repo"
2. Selecione o repositório (ou crie um novo repo só com a pasta `agente-whatsapp`)
3. Configure:
   - **Name:** `agente-whatsapp`
   - **Build Command:** `npm install && npm run build`
   - **Start Command:** `npm start`
4. Adicione as variáveis:
   ```
   CLAUDE_API_KEY=sk-ant-SEU_TOKEN_AQUI
   EVOLUTION_API_URL=https://evolution-api.up.railway.app
   EVOLUTION_API_KEY=CRIE_UMA_CHAVE_AQUI_EX_seminario123456
   EVOLUTION_INSTANCE=seminario
   TWENTY_API_URL=https://crm-backend.up.railway.app
   TWENTY_API_KEY=TOKEN_DO_TWENTY
   GOOGLE_CLIENT_ID=...
   GOOGLE_CLIENT_SECRET=...
   GOOGLE_REDIRECT_URI=https://agente-whatsapp.up.railway.app/auth/google/callback
   GOOGLE_REFRESH_TOKEN=...
   PORT=3002
   ```

### Obter API Key do Twenty

5. No Twenty (frontend), vá em **Settings → API → Generate token**
6. Copie e cole como `TWENTY_API_KEY`

---

## PASSO 14 — Verificação final

Acesse cada URL e confirme que está funcionando:

| Serviço | URL | Status esperado |
|---|---|---|
| Frontend CRM | crm-seminario.vercel.app | Tela de login do Twenty |
| Backend API | crm-backend.up.railway.app/healthz | `{"status":"ok"}` |
| Evolution API | evolution-api.up.railway.app/manager | Painel da Evolution |
| Agente | agente-whatsapp.up.railway.app/health | `{"status":"ok"}` |

---

## PASSO 15 — Testes ponta a ponta

Mande estas mensagens no WhatsApp e verifique se aparecem no CRM:

```
✅ "Conversei com João da Construtora Silva, interessado em projeto de gestão de obra"
   → Deve criar contato no CRM

✅ "Agenda reunião com Construtora Silva sexta às 14h, pauta: apresentação da proposta"
   → Deve criar evento no Google Calendar com link Meet

✅ "Quais propostas estão em negociação?"
   → Deve listar os deals do pipeline

✅ "A proposta da Construtora ABC foi perdida, motivo: preço"
   → Deve mover deal para fase Perdido com motivo registrado

✅ "Quais documentos tenho do cliente Silva?"
   → Deve listar arquivos do Google Drive
```

---

## CUSTOS MENSAIS ESTIMADOS

| Serviço | Plano | Custo |
|---|---|---|
| Vercel | Hobby (gratuito) | R$ 0 |
| Railway | Trial ($5 crédito/mês) | R$ 0–25 |
| Supabase | Free (500MB) | R$ 0 |
| Google Cloud | Free tier | R$ 0 |
| Claude API | Por uso (~1000 msgs/mês) | ~R$ 15 |
| **Total estimado** | | **~R$ 15–40/mês** |

---

## SUPORTE E DÚVIDAS

- Twenty CRM docs: **twenty.com/developers**
- Evolution API docs: **doc.evolution-api.com**
- Supabase docs: **supabase.com/docs**
- Railway docs: **docs.railway.app**
- Claude API docs: **docs.anthropic.com**

---

*Guia gerado em julho/2026 para CRM Seminário — Bicalho Engenharia*
