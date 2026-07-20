# Plataformas do Sistema — CRM Bicalho

Todas as plataformas/serviços que fazem o CRM funcionar, o papel de cada uma e onde obter as credenciais.

## Tabela geral

| # | Plataforma | Papel no sistema | Onde pegar credencial | Obrigatória? | Custo |
|---|-----------|------------------|----------------------|:---:|-------|
| 1 | **Twenty CRM** | Interface visual + banco do CRM (empresas, pessoas, propostas) | Self-host no Railway; API Key em `Settings > APIs & Webhooks` | ✅ | Grátis (open source) |
| 2 | **Supabase** | Banco PostgreSQL do Twenty + Storage | [supabase.com](https://supabase.com) → projeto → `Settings > Database` | ✅ | Free tier (pausa após ~7 dias inativo) |
| 3 | **OpenAI** | Cérebro do agente: GPT-4o (raciocínio) + Whisper (áudio) | [platform.openai.com/api-keys](https://platform.openai.com/api-keys) | ✅ | Pago por uso |
| 4 | **Railway** | Hospedagem 24/7 do Twenty e do agente | [railway.app](https://railway.app) → CLI `railway login` | ✅ | ~US$5/mês (Hobby) |
| 5 | **Google Cloud** | Drive (CDE de documentos) + Calendar (reuniões/Meet) | [console.cloud.google.com](https://console.cloud.google.com) → Credentials (OAuth Client) | ✅ | Grátis |
| 6 | **Telegram** | Canal de conversa do agente (padrão atual) | [@BotFather](https://t.me/BotFather) no Telegram | ✅ (ou WhatsApp) | Grátis |
| 7 | **WhatsApp Cloud API** | Canal de conversa oficial (alternativo ao Telegram) | [developers.facebook.com](https://developers.facebook.com) → app → WhatsApp | Opcional | Grátis até volume alto |
| 8 | **Evolution API** | WhatsApp não-oficial (Baileys) — **legado/pausado** | Self-host | ❌ (descontinuado) | — |

## Mapa de funcionamento

```
   Você (campo)
       │  texto / áudio / arquivo
       ▼
┌─────────────────┐      ┌──────────────────────────┐
│  CANAL          │      │  Agente IA (ai.service)  │
│  Telegram  ◄────┼─────►│  OpenAI GPT-4o + Whisper │
│  ou WhatsApp    │      └───────────┬──────────────┘
└─────────────────┘                  │ tools
                                     ▼
        ┌──────────────┬─────────────┬──────────────┐
        ▼              ▼             ▼              ▼
   Twenty CRM     Google Drive   Google Cal.   (memória)
   (propostas)    (CDE docs)     (reuniões)
        │
        ▼
   Supabase (Postgres) — hospedado no Railway
```

## Contas por serviço (ao replicar)

Cada serviço precisa de uma **conta/projeto próprio seu**. Recomendação de organização:

| Serviço | Conta a usar |
|---------|--------------|
| Railway | sua conta Railway (pode ser a mesma do Google) |
| Google (Drive/Calendar) | a conta Google que vai **hospedar os documentos e a agenda** |
| Supabase | um projeto Supabase seu (o `ref` fica na URL do seu projeto) |

> Dica: use a **mesma conta Google** para Railway e Google Cloud, simplifica o login. O
> [SETUP.md](./SETUP.md) guia a criação de cada um. **Nunca** coloque credenciais reais nos docs.
