# Ativar o canal WhatsApp oficial (Meta Cloud API)

O sistema nasce no **Telegram** (simples, sem domínio). O código do canal **WhatsApp
Business Cloud API** (oficial da Meta) já está pronto e **dormente** — este guia mostra
como ativá-lo quando você quiser migrar.

> Quer que o agente faça? No Claude Code, diga **"ativa o WhatsApp"** — a skill
> `/conectar-crm` conduz este passo a passo e faz a troca.

---

## Diferença importante

| | Telegram | WhatsApp Cloud API |
|--|----------|--------------------|
| Conexão | Long-polling (não precisa de domínio) | **Webhook público** (precisa de URL) |
| Custo | Grátis | Grátis até volume alto |
| Legalidade | OK | **Oficial da Meta** (estável, sem risco de ban) |

> A antiga Evolution API (Baileys) foi **abandonada** — o WhatsApp bloqueia conexão de
> novos dispositivos não-oficiais. Use a Cloud API oficial.

---

## Passo a passo

### 1. Criar o app na Meta
1. [developers.facebook.com](https://developers.facebook.com) → **My Apps > Create App** → tipo **Business**.
2. No app, adicione o produto **WhatsApp**.

### 2. Pegar as credenciais
Em **WhatsApp > API Setup**:
- **Temporary access token** (para testar) ou gere um **permanente** (via System User em Business Settings) → `WHATSAPP_TOKEN`
- **Phone number ID** → `WHATSAPP_PHONE_NUMBER_ID`
- Inclua seu número na lista de destinatários de teste (ou verifique um número de produção).

### 3. Definir o verify token
Invente uma string qualquer (ex: `crm-bicalho-verify-2026`) → `WHATSAPP_VERIFY_TOKEN`.
Ela é usada só na verificação do webhook.

### 4. Gerar um domínio público no Railway
O canal WhatsApp precisa de um webhook acessível. No serviço `agente-whatsapp`:
- Railway → serviço → **Settings > Networking > Generate Domain**.
- Anote a URL (ex: `https://agente-whatsapp.up.railway.app`).

### 5. Trocar o canal e subir as variáveis
```bash
cd agente-whatsapp
railway variables \
  --set "CANAL=whatsapp" \
  --set "WHATSAPP_TOKEN=..." \
  --set "WHATSAPP_PHONE_NUMBER_ID=..." \
  --set "WHATSAPP_VERIFY_TOKEN=crm-bicalho-verify-2026"
railway up -d
```
(ou rode `node setup/conectar.mjs` escolhendo o canal `whatsapp`.)

### 6. Cadastrar o webhook na Meta
Em **WhatsApp > Configuration > Webhook**:
- **Callback URL**: `https://SEU-DOMINIO-RAILWAY/webhook`
- **Verify token**: o mesmo `WHATSAPP_VERIFY_TOKEN`
- Clique em **Verify and save** (o agente responde à verificação automaticamente).
- Em **Webhook fields**, assine o campo **messages**.

### 7. Testar
Mande uma mensagem do seu WhatsApp para o número do app. O agente deve responder —
com suporte a **texto, áudio (transcrito) e arquivos (arquivados no CDE)**, igual ao Telegram.

---

## Voltar para o Telegram
```bash
railway variables --set "CANAL=telegram"
railway up -d
```
Nada mais muda — o cérebro do agente (propostas, Drive, Calendar) é o mesmo nos dois canais.
