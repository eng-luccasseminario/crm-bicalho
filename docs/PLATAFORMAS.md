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

## Qual conta usa o quê

| Serviço | Conta usada no projeto |
|---------|------------------------|
| Railway | luccas.seminario@gmail.com |
| Google (Drive/Calendar) | luccas.seminario@gmail.com |
| Supabase | conta do projeto "CRM" (ref `jztnayibqtpboxzmaaqu`) |

> Ao replicar o sistema para outra empresa, cada serviço acima precisa de uma conta/projeto próprio. O [SETUP.md](./SETUP.md) guia a criação de cada um.
