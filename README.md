# CRM Bicalho — CRM de Engenharia com Agente IA

CRM personalizado para gestão de propostas de engenharia da **Bicalho Engenharia**,
operável por **chat (Telegram/WhatsApp)** com um agente de IA, e com **CDE de documentos**
e **agenda** integrados ao Google. Feito para quem trabalha em campo e precisa registrar
propostas, contatos e documentos direto do celular — por texto ou áudio.

```
Você manda no chat:  "fechei proposta de 80 mil com a Construtora Alfa, fase negociação"
O agente:            ✅ cria a proposta no CRM, na fase certa, vinculada à empresa.

Você manda um PDF:   "contrato da Construtora Alfa"
O agente:            ✅ arquiva no Google Drive, na pasta Construtora Alfa / Contrato.

Você fala por áudio: "agenda reunião com eles sexta às 14h"
O agente:            ✅ cria no Google Calendar com link do Meet.
```

## O que faz

- 🧠 **Agente IA** (OpenAI GPT-4o) que entende linguagem natural, texto **e áudio** (Whisper).
- 📇 **Gestão de propostas** no pipeline: Prospecção → Qualificação → Proposta → Negociação → Fechado/Perdido.
- 🗂️ **CDE de documentos** por cliente no Google Drive (envie um arquivo pelo chat e ele arquiva na categoria certa).
- 🔗 **Ponte Drive ↔ CRM**: cada documento arquivado aparece no Twenty em **Notas + Timeline + Arquivos**, vinculado à Empresa e à Proposta ativa (com `npm run sync:crm` para sincronizar o histórico do Drive).
- 📅 **Agenda** integrada ao Google Calendar, com geração de link do Google Meet.
- 💬 **Canal flexível**: Telegram (padrão) ou WhatsApp Business Cloud API (oficial) — troca com uma variável.

## Arquitetura

| Camada | Tecnologia |
|--------|-----------|
| CRM (UI + banco) | [Twenty](https://twenty.com) (open source) + Supabase (Postgres) |
| Agente IA | Node/TypeScript + OpenAI (GPT-4o + Whisper) |
| Canais | Telegram · WhatsApp Cloud API |
| Documentos (CDE) | Google Drive |
| Agenda | Google Calendar |
| Hospedagem | Railway (24/7) |

Diagrama e detalhes: [docs/PLATAFORMAS.md](docs/PLATAFORMAS.md).

## Estrutura do repositório

```
.
├── agente-whatsapp/        # o agente IA (nosso código)
│   ├── src/
│   │   ├── ai.service.ts       # cérebro: tools + orquestração OpenAI
│   │   ├── main.ts             # seletor de canal (CANAL=telegram|whatsapp)
│   │   ├── telegram.ts         # canal Telegram (long-polling)
│   │   ├── whatsapp-cloud.ts   # canal WhatsApp oficial (Meta Cloud API)
│   │   ├── google-auth.ts      # gera o refresh token do Google
│   │   └── tools/              # twenty (CRM+ponte), drive (CDE), calendar
│   ├── scripts/
│   │   └── sincronizar-drive-crm.ts  # sync retroativo Drive → CRM (Notas + Arquivos)
│   └── .env.example
├── setup/
│   └── conectar.mjs        # conector guiado de todas as APIs
├── docs/
│   ├── SETUP.md            # guia de integração completo (do zero ao ar)
│   ├── PLATAFORMAS.md      # tabela de todas as plataformas
│   ├── ATIVAR-WHATSAPP.md  # migrar do Telegram para o WhatsApp oficial
│   └── Guia-CRM-Bicalho.pdf # manual de uso do CRM
└── README.md
```

## Começar (resumo)

```bash
git clone https://github.com/eng-luccasseminario/crm-bicalho.git
cd crm-bicalho/agente-whatsapp && npm install

# conector guiado: pergunta cada API, valida, roda o OAuth do Google, escreve o .env
node ../setup/conectar.mjs

# rodar local
npm run dev            # usa o canal definido em CANAL (padrão: telegram)
```

📖 **Guia passo a passo completo** (criar cada conta, pegar cada chave, deploy): [docs/SETUP.md](docs/SETUP.md).

## Trocar de canal (Telegram ↔ WhatsApp)

O cérebro é o mesmo; muda só a "boca/ouvido". Para migrar para o WhatsApp oficial,
siga [docs/ATIVAR-WHATSAPP.md](docs/ATIVAR-WHATSAPP.md) — na prática:

```bash
railway variables --set "CANAL=whatsapp" --set "WHATSAPP_TOKEN=..." # + phone id + verify token
railway up -d
```

## Segurança

- 🔒 Segredos ficam **só** no `.env` (nunca commitado — ver `.gitignore`).
- Use `agente-whatsapp/.env.example` como referência do que preencher.
- Passos de produção (setar variáveis/deploy no Railway) são executados por você, não automaticamente.

---

Projeto privado — Bicalho Engenharia.
