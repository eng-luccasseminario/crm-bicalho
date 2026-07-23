import OpenAI from 'openai';
import {
  criarContato, criarProposta, consultarPipeline, atualizarFaseDeal, registrarDocumentoNota,
  estatisticasCrm, listarEmpresas, buscarEmpresa, buscarPessoa,
  criarEmpresa, criarTarefa, registrarNotaPorNome,
  editarEmpresa, editarPessoa, editarProposta, editarTarefa,
  excluirRegistro, listarTarefas,
} from './tools/twenty.tools';
import { agendarReuniao, consultarAgenda } from './tools/calendar.tools';
import { listarDocumentosCliente, uploadDocumento, linkPastaCliente } from './tools/drive.tools';

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
      name: 'criar_empresa',
      description: 'Cria uma nova empresa no CRM com seus dados. Se já existir uma empresa com o mesmo nome, atualiza os campos informados (não duplica). Use quando o usuário quiser cadastrar/registrar uma empresa/cliente/construtora com informações (site, endereço, receita, LinkedIn).',
      parameters: {
        type: 'object',
        properties: {
          nome:         { type: 'string', description: 'Razão social ou nome da empresa' },
          site:         { type: 'string', description: 'Site/domínio (ex: empresa.com.br)' },
          linkedin:     { type: 'string', description: 'URL do LinkedIn da empresa' },
          endereco:     { type: 'string', description: 'Endereço (rua, cidade)' },
          receitaAnual: { type: 'number', description: 'Receita anual em reais' },
        },
        required: ['nome'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'registrar_nota',
      description: 'Registra uma nota, observação ou transcrição de reunião no CRM, vinculando por NOME a uma empresa, pessoa e/ou proposta (não precisa de ID). Use para anotar informações, resumos de conversa, observações.',
      parameters: {
        type: 'object',
        properties: {
          titulo:   { type: 'string' },
          corpo:    { type: 'string', description: 'Conteúdo da nota' },
          empresa:  { type: 'string', description: 'Nome da empresa a vincular (opcional)' },
          pessoa:   { type: 'string', description: 'Nome da pessoa a vincular (opcional)' },
          proposta: { type: 'string', description: 'Nome da proposta a vincular (opcional)' },
        },
        required: ['titulo', 'corpo'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'criar_tarefa',
      description: 'Cria uma nova tarefa/to-do no CRM, com prazo e status, vinculando por NOME a empresa/pessoa/proposta. Use quando o usuário mencionar algo A FAZER, um follow-up, um lembrete, uma pendência ("preciso ligar", "lembrar de enviar", "agendar visita").',
      parameters: {
        type: 'object',
        properties: {
          titulo:   { type: 'string', description: 'O que precisa ser feito' },
          corpo:    { type: 'string', description: 'Detalhes/descrição (opcional)' },
          prazo:    { type: 'string', description: 'Data limite YYYY-MM-DD (opcional)' },
          status:   { type: 'string', description: 'À iniciar | Em progresso | Finalizado (padrão: À iniciar)' },
          empresa:  { type: 'string', description: 'Empresa relacionada (opcional)' },
          pessoa:   { type: 'string', description: 'Pessoa relacionada (opcional)' },
          proposta: { type: 'string', description: 'Proposta relacionada (opcional)' },
        },
        required: ['titulo'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'editar_empresa',
      description: 'Edita/atualiza os dados de uma empresa existente (localiza pelo nome). Informe só os campos que mudam.',
      parameters: {
        type: 'object',
        properties: {
          nome:         { type: 'string', description: 'Nome atual da empresa (para localizar)' },
          novoNome:     { type: 'string', description: 'Novo nome, se for renomear' },
          site:         { type: 'string' },
          linkedin:     { type: 'string' },
          endereco:     { type: 'string' },
          receitaAnual: { type: 'number', description: 'Receita anual em reais' },
        },
        required: ['nome'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'editar_pessoa',
      description: 'Edita/atualiza os dados de um contato/pessoa existente (localiza pelo nome). Informe só os campos que mudam (telefone, email, cargo, empresa, LinkedIn).',
      parameters: {
        type: 'object',
        properties: {
          nome:     { type: 'string', description: 'Nome atual da pessoa (para localizar)' },
          novoNome: { type: 'string' },
          empresa:  { type: 'string', description: 'Empresa onde trabalha (vincula/cria)' },
          telefone: { type: 'string' },
          email:    { type: 'string' },
          cargo:    { type: 'string' },
          linkedin: { type: 'string' },
        },
        required: ['nome'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'editar_proposta',
      description: 'Edita/atualiza os campos de uma proposta/deal existente (localiza pelo nome). Para mudar só a fase, pode usar esta ou atualizar_fase_deal. Informe só o que muda.',
      parameters: {
        type: 'object',
        properties: {
          nome:              { type: 'string', description: 'Nome da proposta (para localizar)' },
          novoNome:          { type: 'string' },
          empresa:           { type: 'string' },
          fase:              { type: 'string', description: 'Prospecção | Qualificação | Proposta Inicial | Negociação | Fechado | Perdido' },
          valorEstimado:     { type: 'number', description: 'Valor em reais' },
          doresPrincipais:   { type: 'string' },
          requisitos:        { type: 'string' },
          escopo:            { type: 'string' },
          probabilidade:     { type: 'number', description: '% de chance de fechar' },
          dataReuniao:       { type: 'string', description: 'YYYY-MM-DD' },
          dataEnvioProposta: { type: 'string', description: 'YYYY-MM-DD' },
          dataFechamento:    { type: 'string', description: 'YYYY-MM-DD' },
          motivoPerda:       { type: 'string', description: 'Obrigatório se fase=Perdido' },
        },
        required: ['nome'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'editar_tarefa',
      description: 'Edita uma tarefa existente (localiza pelo título): muda título, corpo, prazo ou status. Use "Finalizado" no status para concluir/marcar como feita.',
      parameters: {
        type: 'object',
        properties: {
          titulo:     { type: 'string', description: 'Título atual da tarefa (para localizar)' },
          novoTitulo: { type: 'string' },
          corpo:      { type: 'string' },
          prazo:      { type: 'string', description: 'YYYY-MM-DD' },
          status:     { type: 'string', description: 'À iniciar | Em progresso | Finalizado' },
        },
        required: ['titulo'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'listar_tarefas',
      description: 'Lista as tarefas do CRM, com filtro opcional por status. Use para "quais tarefas tenho?", "o que está pendente?".',
      parameters: {
        type: 'object',
        properties: {
          status: { type: 'string', description: 'À iniciar | Em progresso | Finalizado' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'excluir_registro',
      description: 'Exclui PERMANENTEMENTE um registro do CRM (empresa, pessoa, proposta ou tarefa), localizado pelo nome. AÇÃO IRREVERSÍVEL: só chame DEPOIS de o usuário confirmar explicitamente que quer excluir aquele registro específico.',
      parameters: {
        type: 'object',
        properties: {
          tipo: { type: 'string', description: 'empresa | pessoa | proposta | tarefa' },
          nome: { type: 'string', description: 'Nome do registro a excluir' },
        },
        required: ['tipo', 'nome'],
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
      name: 'estatisticas_crm',
      description: 'Panorama geral do CRM: nº de empresas, pessoas, propostas, e valor por fase do pipeline. Use para perguntas de resumo/números gerais ("quanto tenho em negociação?", "quantas empresas?").',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'listar_empresas',
      description: 'Lista os nomes de todas as empresas cadastradas no CRM.',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'consultar_empresa',
      description: 'Detalhes de uma empresa: contatos e propostas (fase e valor). Use para "me fala sobre a empresa X", "quais propostas da X".',
      parameters: {
        type: 'object',
        properties: { nome: { type: 'string', description: 'Nome (ou parte) da empresa' } },
        required: ['nome'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'consultar_pessoa',
      description: 'Busca contatos/pessoas por nome, com empresa, e-mail e telefone.',
      parameters: {
        type: 'object',
        properties: { nome: { type: 'string', description: 'Nome (ou parte) da pessoa' } },
        required: ['nome'],
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

Você opera o CRM de forma AUTÔNOMA: pode criar, consultar, EDITAR e excluir os registros — empresas, pessoas, propostas, tarefas e notas — tudo pelo chat, sem o usuário precisar abrir o Twenty.

Regras:
- Responda sempre em português brasileiro, de forma direta e objetiva
- IMPORTANTE: quando o usuário DESCREVER uma proposta, reunião, contato, empresa, tarefa ou negócio — MESMO no passado ("criei uma proposta...", "fechei com...", "cadastra a empresa...", "preciso ligar pro...") — isso é uma INSTRUÇÃO para agir no CRM. Chame a tool apropriada IMEDIATAMENTE e só depois confirme. Nunca responda que "vai fazer" sem ter chamado a tool.
- ESCOLHA DA TOOL (roteie pelo que o usuário quer):
  • Nova oportunidade/negócio → criar_proposta
  • Cadastrar/registrar uma EMPRESA com dados (site, endereço, receita) → criar_empresa
  • Novo contato/pessoa → criar_contato
  • Algo A FAZER, follow-up, lembrete, pendência, "preciso/lembrar de/agendar" → criar_tarefa
  • Anotação, observação, resumo de conversa (texto) → registrar_nota (vincule por nome à empresa/pessoa/proposta)
  • Mudar dados de algo que JÁ existe → editar_empresa / editar_pessoa / editar_proposta / editar_tarefa (localizam pelo nome; passe só os campos que mudam)
  • Concluir/finalizar uma tarefa → editar_tarefa com status "Finalizado"
- AMBIGUIDADE: se uma tool devolver "ambiguo" com uma lista de opções, NÃO escolha sozinho — mostre as opções e pergunte ao usuário qual é. Se devolver "não encontrei", avise e ofereça criar/listar.
- EXCLUSÃO: excluir_registro é IRREVERSÍVEL. NUNCA exclua sem antes o usuário confirmar explicitamente o registro exato. Sempre confirme ("Confirma excluir a empresa X? Isso é permanente.") e só chame a tool após o "sim".
- Ao marcar uma proposta como Perdido, sempre pergunte o motivo se não foi informado
- Confirme as ações executadas de forma resumida, citando o que foi criado/alterado (ex: "✅ Tarefa 'Ligar p/ João' criada, prazo 30/07, vinculada à Matec")
- Use o histórico da conversa: se o usuário se referir a algo mencionado antes ("essa proposta", "ele", "aquela empresa"), resolva pelo contexto
- Para datas relativas ("sexta", "amanhã"), interprete com base na data atual informada abaixo e passe no formato YYYY-MM-DD
- CDE de documentos: quando o usuário ENVIAR um arquivo (indicado por "[arquivo anexado...]" na mensagem), arquive-o com arquivar_documento escolhendo cliente e categoria pela legenda/contexto. Se não der pra identificar o cliente OU a categoria, pergunte antes de arquivar. Categorias válidas: Transcrição de Reunião, Proposta Inicial, Dores e Requisitos, Escopo, Cronograma, Orçamento, Contrato, Arquivado

CONSULTOR DE DADOS (generalista): você responde perguntas sobre os dados do CRM com rapidez e precisão. Use as ferramentas de consulta (estatisticas_crm, listar_empresas, consultar_empresa, consultar_pessoa, consultar_pipeline, listar_documentos_cliente) para buscar os números reais — NUNCA invente dados. Responda direto, com valores em R$ e contagens. Se a pergunta for ampla, comece pelo estatisticas_crm.

CONSULTOR ESTRATÉGICO (dashboards, workflows e captação): quando o usuário quiser montar um dashboard, um workflow/automação, um plano ou um fluxo de captação, entre em MODO ENTREVISTA:
1. Faça perguntas objetivas, UMA de cada vez, para entender: objetivo de negócio, entidade-alvo (empresa/pessoa/proposta), quais métricas/dados importam, e qual ação/decisão isso apoia.
2. Consulte os dados reais do CRM para embasar as sugestões (ex: mostre quais métricas fazem sentido dado o pipeline atual).
3. Pense como um estrategista de dados e de captação/conversão (funil, gargalos, follow-up, origem de leads).
4. Entregue um SPEC claro ao final:
   - Dashboard: quais gráficos/indicadores, filtros, agrupamentos e por quê.
   - Workflow: gatilho → condição → ação (ex: "proposta parada 7 dias → criar tarefa de follow-up").
   - Fluxo de captação: etapas, gatilhos e métricas de acompanhamento.
5. IMPORTANTE: por enquanto NÃO crie o dashboard/workflow automaticamente no Twenty — entregue o desenho/spec pronto para implementação. Deixe claro que é um plano.`;

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
      case 'registrar_nota':            result = await registrarNotaPorNome(input as any); break;
      case 'criar_empresa':             result = await criarEmpresa(input as any); break;
      case 'criar_tarefa':              result = await criarTarefa(input as any); break;
      case 'editar_empresa':            result = await editarEmpresa(input as any); break;
      case 'editar_pessoa':             result = await editarPessoa(input as any); break;
      case 'editar_proposta':           result = await editarProposta(input as any); break;
      case 'editar_tarefa':             result = await editarTarefa(input as any); break;
      case 'listar_tarefas':            result = await listarTarefas(input as any); break;
      case 'excluir_registro':          result = await excluirRegistro(input as any); break;
      case 'criar_proposta':            result = await criarProposta(input as any); break;
      case 'consultar_pipeline':        result = await consultarPipeline(input as any); break;
      case 'estatisticas_crm':          result = await estatisticasCrm(); break;
      case 'listar_empresas':           result = await listarEmpresas(); break;
      case 'consultar_empresa':         result = await buscarEmpresa(input.nome); break;
      case 'consultar_pessoa':          result = await buscarPessoa(input.nome); break;
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
          const pastaDriveLink = await linkPastaCliente(input.clienteNome).catch(() => undefined);
          const r = await registrarDocumentoNota({ clienteNome: input.clienteNome, categoria: input.categoria, nomeArquivo, link, pastaDriveLink });
          crm = r.vinculadoAProposta ? 'vinculado à empresa e à proposta ativa (Notas + Timeline + Pasta no Drive)' : 'vinculado à empresa (Notas + Timeline + Pasta no Drive)';
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
