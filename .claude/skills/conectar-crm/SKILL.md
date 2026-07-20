---
name: conectar-crm
description: Conecta e integra todas as APIs do CRM Bicalho de forma guiada (OpenAI, Twenty, Google Drive/Calendar, Telegram, WhatsApp Cloud) e faz o deploy no Railway. Use SEMPRE que o usuário pedir para conectar/integrar as APIs do sistema, configurar o agente do zero, gerar o refresh token do Google, trocar o canal Telegram↔WhatsApp, "ativar o WhatsApp", "conecta tudo", "roda as integrações", "configura o CRM", ou colocar o sistema no ar. Também acione ao clonar o projeto numa máquina nova.
---

# Conectar CRM Bicalho — integração total guiada

Você conduz a conexão de todas as APIs do sistema, validando cada credencial e
respeitando os limites de segurança de produção. Seja um copiloto: explique onde pegar
cada chave, valide o que o usuário fornecer, e só avance quando estiver funcionando.

## Contexto do sistema
- Código do agente: `agente-whatsapp/` · Conector automatizado: `setup/conectar.mjs`
- Docs de referência: `docs/SETUP.md`, `docs/PLATAFORMAS.md`, `docs/ATIVAR-WHATSAPP.md`
- Canal padrão: **Telegram** (long-polling). Alternativo: **WhatsApp Cloud API** (Meta, webhook).
- Hospedagem: **Railway** (projeto do agente separado do Twenty).

## Duas formas de conduzir

**Forma A — delegar ao script (preferida quando o usuário topa terminal):**
Oriente o usuário a rodar `node setup/conectar.mjs`. Ele pergunta cada credencial, valida
na hora, roda o OAuth do Google e opcionalmente sobe pro Railway. Você acompanha e ajuda
com dúvidas (onde pegar cada chave — use a tabela de `docs/PLATAFORMAS.md`).

**Forma B — conduzir você mesmo (conversacional), na ordem:**
1. **Canal**: confirme telegram ou whatsapp.
2. **OpenAI**: peça a `OPENAI_API_KEY` ([platform.openai.com/api-keys](https://platform.openai.com/api-keys)). Valide com GET `https://api.openai.com/v1/models`.
3. **Twenty**: `TWENTY_API_URL` + `TWENTY_API_KEY` (Settings > APIs & Webhooks). Valide com POST `/graphql` body `{ __typename }`.
4. **Google**: `GOOGLE_CLIENT_ID` + `GOOGLE_CLIENT_SECRET`. Gere o refresh token rodando
   `npx ts-node src/google-auth.ts` em `agente-whatsapp/` (servidor local na porta 3999);
   **abra a authUrl inteira via `Start-Process`** para não truncar; capture o token do output.
5. **Canal-específico**:
   - Telegram: `TELEGRAM_BOT_TOKEN` (@BotFather). Valide com `getMe`.
   - WhatsApp: siga `docs/ATIVAR-WHATSAPP.md` (`WHATSAPP_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_VERIFY_TOKEN`, domínio público + webhook na Meta).
6. Grave no `.env` de `agente-whatsapp/`.

## ⚠️ Limites de segurança (importante)
- **Você NÃO consegue** rodar `railway variables --set` (secrets) nem `railway up` (deploy de
  produção) — o classificador bloqueia. **Entregue o comando pronto** para o usuário rodar
  (via `!comando` na sessão ou terminal). Confirme depois pelos logs (`railway logs`) e pelo
  `deployment ID` (tem que mudar).
- **Nunca** escreva segredos em arquivos versionados nem em `MEMORY.md`. Só no `.env` (que é gitignored).
- Ao gerar refresh token, limpe artefatos de teste (pastas/arquivos temporários no Drive).

## Trocar de canal (Telegram → WhatsApp)
Quando o usuário disser "ativa o WhatsApp": siga `docs/ATIVAR-WHATSAPP.md`, colete as
credenciais da Meta, gere domínio no Railway, e entregue os comandos
`railway variables --set "CANAL=whatsapp" ...` + `railway up -d` para o usuário rodar.
Depois oriente cadastrar o webhook `https://DOMINIO/webhook` na Meta com o verify token.

## Validação final (smoke test)
Peça ao usuário testar no canal ativo: consultar agenda, agendar reunião, enviar um PDF
(arquivar no CDE) e criar uma proposta. Tudo respondendo = sistema no ar.

## Ao final
Atualize a memória do projeto (`project_crm_bicalho.md`) com o que foi conectado/alterado.
