# Orientação — Instalar o CRM Bicalho

Este documento é o **pontapé** para colocar o CRM Bicalho no ar do zero. O guia técnico
completo e auto-suficiente é o **`docs/SETUP.md`** dentro do repositório — aqui está só o
resumo do que fazer e a ordem.

Repositório: **https://github.com/eng-luccasseminario/crm-bicalho** (público — clone livre)

---

## 1. Antes de tudo

**Instale na sua máquina:**

- Node.js 18+ — https://nodejs.org
- Git — https://git-scm.com
- Railway CLI — `npm i -g @railway/cli`

**Crie estas contas** (todas com free tier, exceto a OpenAI que é paga por uso):

| Conta | Para quê | Custo |
|-------|----------|-------|
| Supabase | Banco de dados do CRM | Grátis |
| OpenAI | Cérebro do agente (**precisa adicionar crédito**) | Pago por uso |
| Google Cloud | Drive (documentos) + Calendar (reuniões) | Grátis |
| Railway | Hospedagem 24/7 | ~US$ 5/mês |
| Telegram | Canal de conversa (bot) | Grátis |

---

## 2. Clonar e seguir o guia

O repositório é **público**: você não precisa de login para clonar.

```bash
git clone https://github.com/eng-luccasseminario/crm-bicalho.git
cd crm-bicalho/agente-whatsapp
npm install
```

Depois, abra e siga o **`docs/SETUP.md`** de cima a baixo. Ele tem um **checklist** no topo,
links de onde pegar cada credencial, um **conector automático** (`npm run conectar`) e o
**troubleshooting** dos erros comuns.

---

## 3. Os 5 alertas que evitam 90% dos problemas

Estão todos dentro do `SETUP.md`, mas vale destacar:

1. **Supabase** — ao copiar a *connection string*, **troque `[YOUR-PASSWORD]` pela senha real**
   do banco. Deixe o *Pool Size* em 30.

2. **Google (o mais importante)** — na tela de consentimento OAuth, **PUBLIQUE em "Production"**
   (não deixe em "Testing"). Em Testing o token **expira em 7 dias** e o sistema para de gravar
   no Drive toda semana. Aceite o aviso de "app não verificado".

3. **Twenty no Railway** — depois do serviço *web*, crie o serviço **worker** (2º serviço, start
   command **`yarn worker:prod`**). Sem ele a *Timeline* não funciona e as tarefas não marcam.
   Em **ambos** os serviços adicione `PG_POOL_IDLE_TIMEOUT_MS=10000` e
   `PG_POOL_ALLOW_EXIT_ON_IDLE=true` (senão o banco estoura conexões).

4. **Agente** — ele tem um projeto **próprio** no Railway (separado do Twenty). Crie com
   `railway up --new -d` de dentro da pasta `agente-whatsapp`.

5. **Conectar tudo** — de dentro de `agente-whatsapp`, rode **`npm run conectar`**: ele pergunta
   cada chave, valida na hora e abre o navegador para o OAuth do Google.

---

## 4. Finalização

- Rode `npx ts-node scripts/criar-campo-pasta-drive.ts` (cria o campo "Pasta no Drive" na Empresa).
- Rode `npm run sync:crm` (traz documentos antigos do Drive para o CRM).
- Faça os **testes de fumaça** (§9 do SETUP): mande mensagem para o bot, envie um PDF, cadastre
  uma proposta.

---

## 5. Documentos de apoio no repositório

- **`docs/SETUP.md`** — guia técnico completo (o principal).
- **`docs/PLATAFORMAS.md`** — tabela de todas as plataformas e onde pegar cada credencial.
- **`docs/ATIVAR-WHATSAPP.md`** — migrar do Telegram para o WhatsApp oficial.

---

## Como contribuir com melhorias

Como o repositório é público mas só os mantenedores dão `push`: faça um **fork**, commite na sua
cópia e abra um **pull request**. Nunca inclua credenciais reais (`.env`) em commits.
