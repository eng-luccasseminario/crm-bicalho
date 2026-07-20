# Guia de Integração Completa — CRM Bicalho

Passo a passo para colocar o sistema inteiro no ar do zero: clonar, criar contas,
pegar cada API e conectar tudo. Ao final você terá o CRM + o agente IA rodando 24/7.

> **Atalho:** depois de clonar e criar as contas, rode `node setup/conectar.mjs`
> (ou `/conectar-crm` no Claude Code) e o assistente conduz a conexão validando cada
> credencial automaticamente. Este documento existe para você saber **onde pegar** cada uma.

---

## 0. Pré-requisitos

| Ferramenta | Como instalar | Verificar |
|-----------|---------------|-----------|
| Node.js 18+ | [nodejs.org](https://nodejs.org) | `node -v` |
| Git | [git-scm.com](https://git-scm.com) | `git -v` |
| Railway CLI | `npm i -g @railway/cli` | `railway -v` |

---

## 1. Clonar o repositório

```bash
git clone https://github.com/eng-luccasseminario/crm-bicalho.git
cd crm-bicalho/agente-whatsapp
npm install
```

> O clone do Twenty **não** vem neste repo — o Twenty roda a partir da imagem oficial
> `twentycrm/twenty:latest` no Railway (passo 6). Este repo contém o **agente IA** e a documentação.

---

## 2. Supabase (banco do CRM)

1. Crie conta em [supabase.com](https://supabase.com) → **New project** (guarde a senha do Postgres).
2. Em `Settings > Database > Connection string` copie a URL (modo *Session*).
3. Em `Settings > Database > Connection Pooling`, suba o **Pool Size para 30** (evita o erro `EMAXCONNSESSION` do Twenty sob carga).
4. Correções que o Twenty exige neste banco (rode no **SQL Editor**):
   ```sql
   ALTER EXTENSION "uuid-ossp" SET SCHEMA public;
   ```

> ⚠️ No free tier o projeto **pausa após ~7 dias** sem uso (dá "tenant not found"). Restaure pelo dashboard, ou use o plano Pro.

---

## 3. OpenAI (cérebro do agente)

1. [platform.openai.com/api-keys](https://platform.openai.com/api-keys) → **Create new secret key**.
2. Guarde a chave (`sk-...`). Ela vira `OPENAI_API_KEY`.
3. Adicione crédito em `Billing`. O modelo padrão é `gpt-4o`.

---

## 4. Google Cloud (Drive = CDE + Calendar = reuniões)

1. [console.cloud.google.com](https://console.cloud.google.com) → crie um projeto.
2. **APIs & Services > Library** → ative **Google Drive API** e **Google Calendar API**.
3. **APIs & Services > OAuth consent screen** → tipo *External* → preencha o mínimo →
   em **Test users** adicione o e-mail que vai autorizar (ex: `luccas.seminario@gmail.com`).
4. **APIs & Services > Credentials > Create Credentials > OAuth client ID** → tipo **Web application**.
   - Em **Authorized redirect URIs** adicione: `http://localhost:3999/oauth2callback`
   - Guarde o **Client ID** e o **Client secret**.
5. O **refresh token** é gerado automaticamente pelo conector (`node setup/conectar.mjs`),
   ou manualmente:
   ```bash
   cd agente-whatsapp
   npx ts-node src/google-auth.ts   # abre o navegador, autorize, copie o token impresso
   ```

> Se der `redirect_uri_mismatch`, confira que o URI do passo 4 está exatamente igual.
> Se der "app não verificado", clique em **Avançado > Acessar (não seguro)** — é seu app.

---

## 5. Canal de conversa

Escolha **um** (dá pra trocar depois — ver [ATIVAR-WHATSAPP.md](./ATIVAR-WHATSAPP.md)):

### 5a. Telegram (padrão, mais simples)
1. No Telegram, fale com [@BotFather](https://t.me/BotFather) → `/newbot` → escolha nome e usuário.
2. Copie o token (`123456:ABC...`) → vira `TELEGRAM_BOT_TOKEN`.
3. `CANAL=telegram` no `.env`.

### 5b. WhatsApp Business Cloud API (oficial)
Passo a passo dedicado em [ATIVAR-WHATSAPP.md](./ATIVAR-WHATSAPP.md). Resumo: app na Meta →
número de teste/produção → `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_VERIFY_TOKEN` →
`CANAL=whatsapp`.

---

## 6. Twenty CRM no Railway

1. `railway login` e crie um projeto: `railway init`.
2. Suba o serviço com a imagem oficial `twentycrm/twenty:latest` (via dashboard do Railway,
   "New Service > Docker Image").
3. Adicione um **Redis** ao projeto.
4. Variáveis essenciais do Twenty: `PG_DATABASE_URL` (Supabase, passo 2), `REDIS_URL`
   (referência `${{Redis.REDIS_URL}}`), `APP_SECRET` (aleatório), `SERVER_URL`/`FRONTEND_URL`
   (a própria URL pública do Railway).
5. Anexe um **volume** em `/app/storage` e ajuste permissões:
   ```bash
   railway ssh
   chown -R 1000:1000 /app/storage
   ```
6. Inicialize o banco (só na primeira vez):
   ```bash
   railway ssh
   yarn database:init:prod
   ```
7. Acesse a URL pública → crie a conta admin → `Settings > APIs & Webhooks` → gere a
   **API Key** (vira `TWENTY_API_KEY`).

> Detalhes e troubleshooting completos em `docs/PLANO-CRM-SEMINARIO.md`.

---

## 7. Conectar tudo (o pulo do gato)

Com as credenciais em mãos, rode o conector guiado:

```bash
node setup/conectar.mjs
```

Ele: pergunta cada valor, **valida na hora** (OpenAI, Twenty, Telegram), roda o **OAuth do Google**
(abre o navegador), escreve o `.env` e — se você quiser — **sobe as variáveis + deploy no Railway**.

Alternativa conversacional (dentro do Claude Code): digite `/conectar-crm`.

---

## 8. Deploy do agente no Railway

Se não deixou o conector fazer:

```bash
cd agente-whatsapp
railway link          # selecione o projeto do agente
railway variables --set "CANAL=telegram" --set "OPENAI_API_KEY=..." # (o conector já faz isso)
railway up -d
railway logs          # deve mostrar "Agente ... iniciado"
```

---

## 9. Testes de fumaça

No seu canal (Telegram/WhatsApp), mande:
- `"quais minhas próximas reuniões?"` → consulta o Google Calendar
- `"agenda reunião com a Construtora X sexta 14h"` → cria evento + link do Meet
- Envie um **PDF com legenda** `"contrato da Construtora X"` → arquiva no Drive (CDE)
- `"cadastra proposta de R$ 50 mil para a Construtora X na fase Prospecção"` → cria no Twenty

Tudo respondendo = sistema 100% no ar. 🎉

---

## Troubleshooting rápido

| Sintoma | Causa provável | Solução |
|---------|----------------|---------|
| Bot não responde a arquivos | Deploy antigo no ar | `railway up -d` de novo; confira `railway logs` |
| `redirect_uri_mismatch` | URI faltando no OAuth Client | Adicione `http://localhost:3999/oauth2callback` |
| Google `invalid_grant` | Refresh token revogado/expirado | Rode o conector e gere novo token |
| Twenty "tenant not found" | Supabase pausou (free tier) | Restaure o projeto no dashboard Supabase |
| `EMAXCONNSESSION` | Pool do Supabase cheio | Suba o Pool Size para 30 |
| Só um poller do Telegram (erro 409) | Rodando local + nuvem juntos | Pare um dos dois |
