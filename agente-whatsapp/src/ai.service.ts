import OpenAI from 'openai';
import { criarContato, criarNota, criarProposta, consultarPipeline, atualizarFaseDeal, registrarDocumentoNota } from './tools/twenty.tools';
import { agendarReuniao, consultarAgenda } from './tools/calendar.tools';
import { listarDocumentosCliente, uploadDocumento } from './tools/drive.tools';

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const MODEL = process.env.OPENAI_MODEL || 'gpt-4o';

// Anexo aguardando arquivamento no CDE, por chat. Preenchido pelo canal (Telegram)
// quando o usuário envia um arquivo/foto; consumido pela tool arquivar_documento.
export type Anexo = { conteudo: Buffer; nomeArquivo: string; mimeType: string };
const anexosPendentes = new Map<string, Anexo>();
export function registrarAnexo(chatId: string, anexo: Anexo): void {
  anexosPendentes.set(chatId, anexo);
}

const TOOLS: OpenAI.Chat.Completions.ChatCompletionTool[] = [
  {
    type: 'function',
    function: {
      name: 'criar_contato',
      description: 'Cria um novo contato ou lead no CRM',
      parameters: {
        type: 'object',
        properties: {
          nome:       { type: 'string', description: 'Nome completo' },
          empresa:    { type: 'string' },
          telefone:   { type: 'string' },
          email:      { type: 'string' },
          observacao: { type: 'string' },
        },
        required: ['nome'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'registrar_nota',
      description: 'Registra uma nota, observação ou transcrição de reunião no CRM',
      parameters: {
        type: 'object',
        properties: {
          titulo:    { type: 'string' },
          corpo:     { type: 'string', description: 'Conteúdo da nota' },
          pessoaId:  { type: 'string' },
          empresaId: { type: 'string' },
        },
        required: ['titulo', 'corpo'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'criar_proposta',
      description: 'Cria uma nova proposta/oportunidade no pipeline do CRM',
      parameters: {
        type: 'object',
        properties: {
          titulo:          { type: 'string', description: 'Nome da proposta' },
          empresa:         { type: 'string', description: 'Empresa cliente (cria/vincula automaticamente)' },
          fase:            { type: 'string', description: 'Prospecção | Qualificação | Proposta Inicial | Negociação | Fechado | Perdido (padrão: Prospecção)' },
          doresPrincipais: { type: 'string', description: 'Dores mapeadas' },
          requisitos:      { type: 'string' },
          escopo:          { type: 'string' },
          valorEstimado:   { type: 'number', description: 'Valor estimado em reais' },
          probabilidade:   { type: 'number', description: '% de chance de fechar' },
          dataReuniao:     { type: 'string', description: 'YYYY-MM-DD' },
        },
        required: ['titulo'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'consultar_pipeline',
      description: 'Consulta deals/propostas no CRM, com filtro opcional por fase ou por deals parados',
      parameters: {
        type: 'object',
        properties: {
          fase:          { type: 'string', description: 'Prospecção | Qualificação | Proposta Inicial | Negociação | Fechado | Perdido' },
          paradosHaDias: { type: 'number', description: 'Filtrar deals sem atualização há X dias' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'atualizar_fase_deal',
      description: 'Atualiza a fase de um deal no pipeline',
      parameters: {
        type: 'object',
        properties: {
          dealId:      { type: 'string' },
          novaFase:    { type: 'string', description: 'Prospecção | Qualificação | Proposta Inicial | Negociação | Fechado | Perdido' },
          motivoPerda: { type: 'string', description: 'Obrigatório quando fase = Perdido' },
        },
        required: ['dealId', 'novaFase'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'agendar_reuniao',
      description: 'Agenda uma reunião no Google Calendar e gera link do Google Meet',
      parameters: {
        type: 'object',
        properties: {
          titulo:          { type: 'string' },
          clienteNome:     { type: 'string' },
          data:            { type: 'string', description: 'YYYY-MM-DD' },
          horario:         { type: 'string', description: 'HH:MM' },
          duracaoMinutos:  { type: 'number' },
          emailCliente:    { type: 'string' },
          pauta:           { type: 'string' },
        },
        required: ['titulo', 'clienteNome', 'data', 'horario'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'consultar_agenda',
      description: 'Lista as próximas reuniões do Google Calendar',
      parameters: {
        type: 'object',
        properties: {
          dias: { type: 'number', description: 'Quantos dias à frente (padrão 7)' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'listar_documentos_cliente',
      description: 'Lista os documentos CDE de um cliente no Google Drive',
      parameters: {
        type: 'object',
        properties: {
          clienteNome: { type: 'string' },
          categoria:   { type: 'string', description: 'Transcrição de Reunião | Proposta Inicial | Dores e Requisitos | Escopo | Cronograma | Orçamento | Contrato' },
        },
        required: ['clienteNome'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'arquivar_documento',
      description: 'Arquiva no CDE (Google Drive) o arquivo que o usuário acabou de enviar, na pasta do cliente e categoria. Só funciona quando há um arquivo anexado pendente.',
      parameters: {
        type: 'object',
        properties: {
          clienteNome: { type: 'string', description: 'Cliente dono do documento' },
          categoria:   { type: 'string', description: 'Transcrição de Reunião | Proposta Inicial | Dores e Requisitos | Escopo | Cronograma | Orçamento | Contrato | Arquivado' },
          nomeArquivo: { type: 'string', description: 'Opcional: renomear o arquivo. Se omitido, mantém o nome original.' },
        },
        required: ['clienteNome', 'categoria'],
      },
    },
  },
];

const SYSTEM_PROMPT = `Você é o assistente do CRM Seminário, integrado ao WhatsApp do Lucas (Bicalho Engenharia).
Você gerencia propostas de engenharia, contatos de clientes e documentos.

Fases do pipeline: Prospecção → Qualificação → Proposta Inicial → Negociação → Fechado / Perdido

Regras:
- Responda sempre em português brasileiro, de forma direta e objetiva
- IMPORTANTE: quando o usuário DESCREVER uma proposta, reunião, contato ou negócio — MESMO no passado ("criei uma proposta...", "fechei com...", "reunião foi...") — isso é uma INSTRUÇÃO para registrar no CRM. Chame a tool apropriada IMEDIATAMENTE (criar_proposta para novas oportunidades) e só depois confirme. Nunca responda que "vai criar" sem ter chamado a tool.
- Ao mencionar uma nova oportunidade de negócio, use criar_proposta (não apenas uma nota)
- Ao marcar como Perdido, sempre pergunte o motivo se não foi informado
- Confirme as ações executadas de forma resumida, citando o que foi criado/alterado (ex: "✅ Proposta 'X' criada na fase Prospecção")
- Use o histórico da conversa: se o usuário se referir a algo mencionado antes ("essa proposta", "ele"), resolva pelo contexto
- Para datas relativas ("sexta", "amanhã"), interprete com base na data atual informada abaixo
- CDE de documentos: quando o usuário ENVIAR um arquivo (indicado por "[arquivo anexado...]" na mensagem), arquive-o com arquivar_documento escolhendo cliente e categoria pela legenda/contexto. Se não der pra identificar o cliente OU a categoria, pergunte antes de arquivar. Categorias válidas: Transcrição de Reunião, Proposta Inicial, Dores e Requisitos, Escopo, Cronograma, Orçamento, Contrato, Arquivado`;

function systemComData(): string {
  const hoje = new Date().toLocaleDateString('pt-BR', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', timeZone: 'America/Sao_Paulo',
  });
  return `${SYSTEM_PROMPT}\n\nData atual: ${hoje}`;
}

async function executeTool(name: string, input: Record<string, any>, chatId: string): Promise<string> {
  try {
    let result: any;
    switch (name) {
      case 'criar_contato':             result = await criarContato(input as any); break;
      case 'registrar_nota':            result = await criarNota(input as any); break;
      case 'criar_proposta':            result = await criarProposta(input as any); break;
      case 'consultar_pipeline':        result = await consultarPipeline(input as any); break;
      case 'atualizar_fase_deal':       result = await atualizarFaseDeal(input as any); break;
      case 'agendar_reuniao':           result = await agendarReuniao(input as any); break;
      case 'consultar_agenda':          result = await consultarAgenda(input as any); break;
      case 'listar_documentos_cliente': result = await listarDocumentosCliente(input as any); break;
      case 'arquivar_documento': {
        const anexo = anexosPendentes.get(chatId);
        if (!anexo) {
          result = { erro: 'Nenhum arquivo pendente. Peça ao usuário para reenviar o arquivo (PDF/foto/documento) e informar o cliente.' };
          break;
        }
        const nomeArquivo = input.nomeArquivo || anexo.nomeArquivo;
        const link = await uploadDocumento({
          clienteNome: input.clienteNome,
          categoria:   input.categoria,
          conteudo:    anexo.conteudo,
          nomeArquivo,
          mimeType:    anexo.mimeType,
        });
        anexosPendentes.delete(chatId); // consumido: evita rearquivar no mesmo chat
        // Ponte com o CRM: cria Nota vinculada à empresa (e à proposta ativa) → aparece em Notas + timeline
        let crm: string;
        try {
          const r = await registrarDocumentoNota({ clienteNome: input.clienteNome, categoria: input.categoria, nomeArquivo, link, mimeType: anexo.mimeType });
          crm = r.vinculadoAProposta ? 'vinculado à empresa e à proposta ativa (Notas + Arquivos)' : 'vinculado à empresa (Notas + Arquivos)';
        } catch (e: any) {
          crm = `arquivado no Drive, mas falhou ao vincular no CRM: ${e.message}`;
        }
        result = { arquivado: true, link, pasta: `${input.clienteNome} / ${input.categoria}`, crm };
        break;
      }
      default: return 'Tool não reconhecida';
    }
    return JSON.stringify(result, null, 2);
  } catch (err: any) {
    return `Erro: ${err.message}`;
  }
}

// Memória de conversa por chat (em memória; reinicia se o serviço reiniciar)
type Msg = OpenAI.Chat.Completions.ChatCompletionMessageParam;
const historias = new Map<string, Msg[]>();
const MAX_MSGS = 24; // janela deslizante p/ controlar custo de tokens

export function limparHistoria(chatId: string): void {
  historias.delete(chatId);
}

// Remove mensagens antigas mantendo o histórico válido (não pode começar com 'tool' nem assistant com tool_calls órfão)
function trimHistoria(historia: Msg[]): void {
  while (historia.length > MAX_MSGS) {
    historia.shift();
    while (
      historia.length &&
      (historia[0].role === 'tool' ||
        (historia[0].role === 'assistant' && (historia[0] as any).tool_calls))
    ) {
      historia.shift();
    }
  }
}

export async function processarMensagem(mensagem: string, chatId = 'default'): Promise<string> {
  const historia = historias.get(chatId) ?? [];
  historia.push({ role: 'user', content: mensagem });

  while (true) {
    const messages: Msg[] = [{ role: 'system', content: systemComData() }, ...historia];

    const response = await client.chat.completions.create({
      model: MODEL,
      max_tokens: 1024,
      tools: TOOLS,
      messages,
    });

    const choice = response.choices[0].message;
    historia.push(choice);

    if (!choice.tool_calls || choice.tool_calls.length === 0) {
      trimHistoria(historia);
      historias.set(chatId, historia);
      return choice.content || 'OK.';
    }

    for (const call of choice.tool_calls) {
      let args: Record<string, any> = {};
      try {
        args = JSON.parse(call.function.arguments || '{}');
      } catch {
        /* argumentos inválidos → objeto vazio, tool trata */
      }
      console.log(`[tool] ${call.function.name}(${call.function.arguments})`);
      const output = await executeTool(call.function.name, args, chatId);
      console.log(`[tool] ${call.function.name} -> ${output.slice(0, 300)}`);
      historia.push({ role: 'tool', tool_call_id: call.id, content: output });
    }
  }
}
