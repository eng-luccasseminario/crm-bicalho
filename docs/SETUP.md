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
7. **Suba um serviço WORKER** (⚠️ OBRIGATÓRIO para a Timeline e jobs de fundo). É um 2º serviço,
   **mesma imagem** `twentycrm/twenty:latest`, **mesmas variáveis** do servidor web (Postgres +
   Redis), mudando só o **start command** para `yarn worker:prod`. Sem ele, a aba **Timeline** fica
   **vazia** e jobs (indexação de busca, e-mails, sincronizações) não rodam — o web sozinho não
   processa a fila.

   **Jeito fácil (recomendado) — duplicar o serviço web** (copia todas as variáveis):
   1. No projeto do Twenty no Railway → clique no serviço web (`crm-seminario`) → menu **⋯** →
      **Duplicate service**. Isso cria uma cópia com a mesma imagem e as mesmas variáveis.
   2. No serviço duplicado → **Settings → Deploy → Custom Start Command** → digite `yarn worker:prod`.
   3. **Settings → remova o Domain** e o **Volume** do worker (ele não precisa de URL pública nem
      de storage — quem tem esses é o web). Renomeie para `twenty-worker`.
   4. Deploy. Confira em **Logs** que o worker subiu processando a fila.

   **Jeito manual (do zero):** New Service → Docker Image `twentycrm/twenty:latest` → em
   **Variables** replique as do web (`PG_DATABASE_URL`, `REDIS_URL`, `APP_SECRET`, etc.) → em
   **Settings → Deploy → Custom Start Command** ponha `yarn worker:prod` → Deploy.

   > ⚠️ É `yarn worker:prod` (não `yarn worker`). Nessa imagem o script chama-se `worker:prod`
   > (`node dist/queue-worker/queue-worker`); `yarn worker` dá erro "Couldn't find a script named worker".

   > Não precisa de Domain nem Volume no worker. Ele compartilha o mesmo Postgres e Redis do web.

   > ⚠️ **Conexões:** com web + worker, o pool do Supabase pode estourar (`EMAXCONNSESSION`) —
   > sintoma: não dá check em task, erro ao favoritar view, escritas travando. Set nos **dois**
   > serviços: `PG_POOL_IDLE_TIMEOUT_MS=10000` e `PG_POOL_ALLOW_EXIT_ON_IDLE=true` (o padrão de
   > idle é 10min, o que segura conexões à toa). Se ainda faltar, aumente o Pool Size no Supabase.
8. Acesse a URL pública → crie a conta admin → `Settings > APIs & Webhooks` → gere a
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

## 8b. Ponte CDE: documentos do Drive ↔ CRM (Notas, Timeline e Pasta no Drive)

Quando o agente arquiva um documento no Google Drive (via chat), ele **também registra o
documento dentro do Twenty**, vinculado à **Empresa** e, se houver, à **Proposta ativa**:

- **Notas** — uma nota `📎 <arquivo>` com categoria + link clicável do Drive (aba **Notes**);
- **Campo "Pasta no Drive"** — a Empresa recebe um link (tipo LINKS) que abre a **pasta
  organizada do cliente** no Drive, com todos os documentos por categoria.

> A nota também deveria aparecer na **Timeline**, mas isso depende do **worker do Twenty**
> estar rodando (ver §6, passo 7). Sem worker, a Timeline fica vazia mesmo com os vínculos corretos.

> ⚠️ **Por que não usamos a aba "Files"?** A aba Files do Twenty é para arquivos **enviados
> para o storage interno** dele (lista plana, sem pastas) e **não aceita links externos** — um
> link do Drive em `fullPath` quebra a renderização da aba. Por isso os documentos do Drive
> vão para **Notas** (rastreabilidade) + **campo Pasta no Drive** (navegação por pastas), e a
> aba Files fica livre para uploads nativos do Twenty. As pastas "de verdade" vivem no Drive.

### Pré-requisito (uma vez): criar o campo "Pasta no Drive"
```bash
cd agente-whatsapp
npx ts-node scripts/criar-campo-pasta-drive.ts   # cria o campo LINKS na Empresa (idempotente)
```

### Sincronizar o que JÁ está no Drive (retroativo)
```bash
npm run sync:crm      # varre CRM-Seminario/<cliente>/<categoria>/* e cria as Notas + preenche a Pasta no Drive
```
É **idempotente** (não duplica): pula os documentos cujo link já está referenciado no CRM.

> Se em algum momento a aba **Files** ficar quebrada por anexos com link externo (versões
> antigas da ponte), rode: `npx ts-node scripts/remover-attachments-externos.ts`.

### Bônus: consultor de dados no chat
O agente também responde perguntas sobre o CRM ("quantas empresas?", "quanto em negociação?",
"me fala da empresa X") e atua como consultor estratégico (entrevista você para desenhar
dashboards, workflows e fluxos de captação — entrega o spec, sem criar automaticamente ainda).
O "chat de IA do CRM" é o **bot do Telegram** — o Twenty não tem chat embutido na tela.

## 8c. Entendendo as abas do cartão (Timeline, Notes, Tasks, Files)

Cada registro (empresa, pessoa, proposta) tem abas com funções distintas:

| Aba | O que é | Você cria conteúdo? |
|-----|---------|:---:|
| **Timeline** | Histórico automático de atividade do cartão (criação, mudança de fase/valor, eventos). Read-only. **Depende do worker do Twenty** (§6, passo 7) — sem ele fica vazia. | ❌ |
| **Notes** | Notas e documentos. As notas do CDE (docs do Drive) caem aqui. | ✅ |
| **Tasks** | Tarefas vinculadas ao registro. Uma tarefa vinculada aparece aqui — **não** na Timeline. | ✅ |
| **Files** | Arquivos enviados **manualmente** para o storage interno do Twenty (lista plana). Não integra com o Drive (ver aviso no §8b). | ✅ |

## 9. Testes de fumaça

No seu canal (Telegram/WhatsApp), mande:
- `"quais minhas próximas reuniões?"` → consulta o Google Calendar
- `"agenda reunião com a Construtora X sexta 14h"` → cria evento + link do Meet
- Envie um **PDF com legenda** `"contrato da Construtora X"` → arquiva no Drive **e** aparece na
  empresa no CRM na aba **Notes** + preenche o campo **Pasta no Drive** (e vincula à proposta ativa)
- `"cadastra proposta de R$ 50 mil para a Construtora X na fase Prospecção"` → cria no Twenty

Tudo respondendo = sistema 100% no ar. 🎉

---

## Troubleshooting rápido

| Sintoma | Causa provável | Solução |
|---------|----------------|---------|
| Bot não responde a arquivos | Deploy antigo no ar | `railway up -d` de novo; confira `railway logs` |
| **Aba Timeline vazia** (mesmo com notas/tarefas vinculadas) | **Worker do Twenty não está rodando** | Suba o serviço worker (start command `yarn worker:prod`) no projeto do Twenty (§6, passo 7) |
| Worker em **Crashed** com "Couldn't find a script named worker" | Start command errado (`yarn worker`) | Troque para **`yarn worker:prod`** |
| Aba Files quebrada (sem arquivos/sem botão) | Attachment com link externo (versão antiga da ponte) | `npx ts-node scripts/remover-attachments-externos.ts` |
| Tarefa não aparece na Timeline | Comportamento normal | Tarefa vive na aba **Tasks**, não na Timeline |
| `redirect_uri_mismatch` | URI faltando no OAuth Client | Adicione `http://localhost:3999/oauth2callback` |
| Google `invalid_grant` | Refresh token revogado/expirado | Rode o conector e gere novo token |
| Twenty "tenant not found" | Supabase pausou (free tier) | Restaure o projeto no dashboard Supabase |
| `EMAXCONNSESSION` (max clients) | Pool do Supabase cheio — comum **após adicionar o worker** (web + worker somam conexões) | Nos **dois** serviços (web e worker) set `PG_POOL_IDLE_TIMEOUT_MS=10000` e `PG_POOL_ALLOW_EXIT_ON_IDLE=true` (libera conexões ociosas em 10s em vez de 10min); se ainda faltar, suba o Pool Size no Supabase |
| Não dá check em task / erro ao favoritar view / escritas travando | Mesmo `EMAXCONNSESSION` acima (pool esgotado) | Aplique o fix da linha anterior |
| Só um poller do Telegram (erro 409) | Rodando local + nuvem juntos | Pare um dos dois |
