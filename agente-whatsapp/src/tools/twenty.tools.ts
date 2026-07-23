import axios from 'axios';

const client = axios.create({
  baseURL: process.env.TWENTY_API_URL,
  headers: {
    Authorization: `Bearer ${process.env.TWENTY_API_KEY}`,
    'Content-Type': 'application/json',
  },
});

async function gql(query: string, variables: Record<string, unknown> = {}) {
  const { data } = await client.post('/graphql', { query, variables });
  if (data.errors) throw new Error(data.errors[0].message);
  return data.data;
}

// Rótulos em português (ou o próprio valor) -> valor do enum de stage
const STAGE_MAP: Record<string, string> = {
  'prospeccao': 'PROSPECCAO', 'prospecção': 'PROSPECCAO',
  'qualificacao': 'QUALIFICACAO', 'qualificação': 'QUALIFICACAO',
  'proposta inicial': 'PROPOSTA_INICIAL', 'proposta': 'PROPOSTA_INICIAL',
  'negociacao': 'NEGOCIACAO', 'negociação': 'NEGOCIACAO',
  'fechado': 'FECHADO', 'ganho': 'FECHADO',
  'perdido': 'PERDIDO',
};

function normalizarFase(fase?: string): string | undefined {
  if (!fase) return undefined;
  const key = fase.trim().toLowerCase();
  return STAGE_MAP[key] || fase.toUpperCase().replace(/\s+/g, '_');
}

// Rótulos -> valor do enum de motivoPerda
const MOTIVO_MAP: Record<string, string> = {
  'preco': 'PRECO', 'preço': 'PRECO',
  'concorrencia': 'CONCORRENCIA', 'concorrência': 'CONCORRENCIA',
  'prazo': 'PRAZO',
  'escopo': 'ESCOPO_NAO_ATENDIDO', 'escopo nao atendido': 'ESCOPO_NAO_ATENDIDO', 'escopo não atendido': 'ESCOPO_NAO_ATENDIDO',
  'desistiu': 'CLIENTE_DESISTIU', 'cliente desistiu': 'CLIENTE_DESISTIU',
  'orcamento': 'SEM_ORCAMENTO', 'orçamento': 'SEM_ORCAMENTO', 'sem orcamento': 'SEM_ORCAMENTO', 'sem orçamento': 'SEM_ORCAMENTO',
  'outro': 'OUTRO',
};

function normalizarMotivo(m?: string): string | undefined {
  if (!m) return undefined;
  return MOTIVO_MAP[m.trim().toLowerCase()] || 'OUTRO';
}

// Rótulos em PT -> valor do enum de status de Tarefa (TODO | EM_PROGRESSO | FINALIZADO)
const TASK_STATUS_MAP: Record<string, string> = {
  'a iniciar': 'TODO', 'à iniciar': 'TODO', 'a fazer': 'TODO', 'pendente': 'TODO', 'aberta': 'TODO', 'todo': 'TODO', 'nova': 'TODO',
  'em progresso': 'EM_PROGRESSO', 'em andamento': 'EM_PROGRESSO', 'fazendo': 'EM_PROGRESSO', 'andamento': 'EM_PROGRESSO',
  'finalizado': 'FINALIZADO', 'finalizada': 'FINALIZADO', 'concluido': 'FINALIZADO', 'concluído': 'FINALIZADO',
  'concluida': 'FINALIZADO', 'concluída': 'FINALIZADO', 'feito': 'FINALIZADO', 'feita': 'FINALIZADO', 'pronto': 'FINALIZADO', 'done': 'FINALIZADO',
};
function normalizarStatusTarefa(s?: string): string | undefined {
  if (!s) return undefined;
  return TASK_STATUS_MAP[s.trim().toLowerCase()] || s.toUpperCase().replace(/\s+/g, '_');
}

// Monta o valor de um campo LINKS (site, LinkedIn) a partir de uma URL "crua".
function linkInput(url: string, label = '') {
  const u = /^https?:\/\//i.test(url) ? url : `https://${url}`;
  return { primaryLinkLabel: label, primaryLinkUrl: u };
}

// Converte data ("YYYY-MM-DD", ISO, etc.) para ISO; undefined se inválida.
function dataISO(d?: string): string | undefined {
  if (!d) return undefined;
  const dt = new Date(d);
  return isNaN(dt.getTime()) ? undefined : dt.toISOString();
}

// Busca uma empresa pelo nome (case-insensitive); cria se não existir. Retorna o id.
async function buscarOuCriarEmpresa(nome: string): Promise<string> {
  const data = await gql(`query { companies(first: 200) { edges { node { id name } } } }`);
  const alvo = nome.trim().toLowerCase();
  const existente = data.companies.edges.find((e: any) => e.node.name?.trim().toLowerCase() === alvo);
  if (existente) return existente.node.id;

  const criada = await gql(
    `mutation CriarEmpresa($input: CompanyCreateInput!) { createCompany(data: $input) { id } }`,
    { input: { name: nome } }
  );
  return criada.createCompany.id;
}

export async function criarContato(params: {
  nome: string;
  empresa?: string;
  telefone?: string;
  email?: string;
  cargo?: string;
  linkedin?: string;
  observacao?: string;
}) {
  const [firstName, ...rest] = params.nome.split(' ');
  const lastName = rest.join(' ') || '';

  let companyId: string | undefined;
  if (params.empresa) {
    try { companyId = await buscarOuCriarEmpresa(params.empresa); } catch { /* ignora se falhar */ }
  }

  const input: Record<string, unknown> = {
    name: { firstName, lastName },
    companyId,
  };
  if (params.telefone) {
    input.phones = {
      primaryPhoneNumber: params.telefone.replace(/\D/g, ''),
      primaryPhoneCallingCode: '+55',
      primaryPhoneCountryCode: 'BR',
    };
  }
  if (params.email) input.emails = { primaryEmail: params.email };
  if (params.cargo) input.jobTitle = params.cargo;
  if (params.linkedin) input.linkedinLink = linkInput(params.linkedin);

  const data = await gql(
    `mutation CriarPessoa($input: PersonCreateInput!) {
      createPerson(data: $input) { id name { firstName lastName } company { name } }
    }`,
    { input }
  );

  // Registra a observação como nota vinculada, se houver
  if (params.observacao) {
    try { await criarNota({ titulo: `Obs: ${params.nome}`, corpo: params.observacao, pessoaId: data.createPerson.id }); } catch { /* opcional */ }
  }
  return data.createPerson;
}

export async function criarNota(params: {
  titulo: string;
  corpo: string;
  pessoaId?: string;
  empresaId?: string;
  oportunidadeId?: string;
}) {
  // Nesta versão do Twenty, noteTargets não aceita create aninhado: cria a nota e
  // depois vincula cada alvo via createNoteTarget (faz aparecer na timeline de cada um).
  const data = await gql(
    `mutation CriarNota($input: NoteCreateInput!) { createNote(data: $input) { id title } }`,
    { input: { title: params.titulo, bodyV2: { markdown: params.corpo } } }
  );
  const noteId = data.createNote.id;

  const alvos: Record<string, string>[] = [
    ...(params.pessoaId ? [{ noteId, targetPersonId: params.pessoaId }] : []),
    ...(params.empresaId ? [{ noteId, targetCompanyId: params.empresaId }] : []),
    ...(params.oportunidadeId ? [{ noteId, targetOpportunityId: params.oportunidadeId }] : []),
  ];
  for (const input of alvos) {
    await gql(
      `mutation CriarNoteTarget($input: NoteTargetCreateInput!) { createNoteTarget(data: $input) { id } }`,
      { input }
    );
  }
  return data.createNote;
}

// Acha a proposta ATIVA mais recente de uma empresa (ignora Fechado/Perdido). undefined se não houver.
async function buscarOportunidadeAtivaDaEmpresa(empresaId: string): Promise<string | undefined> {
  const data = await gql(`
    query {
      opportunities(first: 100) {
        edges { node { id stage updatedAt company { id } } }
      }
    }`);
  const abertas = data.opportunities.edges
    .map((e: any) => e.node)
    .filter((o: any) => o.company?.id === empresaId && !['FECHADO', 'PERDIDO'].includes(o.stage))
    .sort((a: any, b: any) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  return abertas[0]?.id;
}

// Cria uma Nota no CRM (vinculada à empresa) apontando para um documento arquivado no Drive.
// É a "ponte" entre o CDE do Google Drive e a interface do Twenty.
// Ponte Drive -> CRM: cria uma NOTA com o link do documento, vinculada à empresa e (se houver)
// à proposta ativa. A nota aparece na aba Notes e na Timeline de cada registro vinculado.
// NÃO cria Attachment: no Twenty a aba Files espera arquivos no storage interno, não links
// externos — um link do Drive em fullPath quebra a renderização da aba Files.
// Grava o link da pasta do cliente no campo "Pasta no Drive" (LINKS) da empresa.
async function setPastaDriveEmpresa(empresaId: string, link: string) {
  await gql(
    `mutation($id: UUID!, $input: CompanyUpdateInput!) { updateCompany(id: $id, data: $input) { id } }`,
    { id: empresaId, input: { pastaDrive: { primaryLinkLabel: 'Documentos no Drive', primaryLinkUrl: link } } }
  );
}

export async function registrarDocumentoNota(params: {
  clienteNome: string;
  categoria: string;
  nomeArquivo: string;
  link: string;
  pastaDriveLink?: string; // link da pasta do cliente no Drive (para o campo da empresa)
}) {
  const empresaId = await buscarOuCriarEmpresa(params.clienteNome);
  const oportunidadeId = await buscarOportunidadeAtivaDaEmpresa(empresaId);

  const nota = await criarNota({
    titulo: `📎 ${params.nomeArquivo}`,
    corpo:
      `**Documento:** [${params.nomeArquivo}](${params.link})\n` +
      `**Categoria:** ${params.categoria}\n` +
      `**Origem:** WhatsApp → Google Drive (CDE)`,
    empresaId,
    oportunidadeId,
  });

  // Preenche o campo "Pasta no Drive" da empresa (falha silenciosa se o campo não existir)
  if (params.pastaDriveLink) {
    try { await setPastaDriveEmpresa(empresaId, params.pastaDriveLink); } catch (e: any) {
      console.error('[twenty] não consegui gravar Pasta no Drive:', e.message);
    }
  }

  return { notaId: nota.id, empresaId, oportunidadeId, vinculadoAProposta: !!oportunidadeId };
}

// Retorna o conjunto de links do Drive já referenciados em Notas (para deduplicar sincronização).
export async function linksDeDocumentosJaRegistrados(): Promise<Set<string>> {
  const data = await gql(`query { notes(first: 500) { edges { node { bodyV2 { markdown } } } } }`);
  const set = new Set<string>();
  for (const e of data.notes.edges) {
    const md: string = e.node?.bodyV2?.markdown || '';
    for (const m of md.matchAll(/\((https?:\/\/[^)]+)\)/g)) set.add(m[1]);
  }
  return set;
}

export async function criarProposta(params: {
  titulo: string;
  empresa?: string;
  fase?: string;
  doresPrincipais?: string;
  requisitos?: string;
  escopo?: string;
  valorEstimado?: number;
  probabilidade?: number;
  dataReuniao?: string;
  emailContato?: string;
}) {
  const input: Record<string, unknown> = {
    name: params.titulo,
    stage: normalizarFase(params.fase) || 'PROSPECCAO',
  };
  if (params.empresa) {
    try { input.companyId = await buscarOuCriarEmpresa(params.empresa); } catch { /* ignora */ }
  }
  if (params.doresPrincipais) input.doresPrincipais = params.doresPrincipais;
  if (params.requisitos) input.requisitos = params.requisitos;
  if (params.escopo) input.escopo = params.escopo;
  if (typeof params.probabilidade === 'number') input.probabilidade = params.probabilidade;
  if (params.dataReuniao) input.dataReuniao = new Date(params.dataReuniao).toISOString();
  if (typeof params.valorEstimado === 'number') {
    input.amount = { amountMicros: Math.round(params.valorEstimado * 1_000_000), currencyCode: 'BRL' };
  }

  const data = await gql(
    `mutation CriarProposta($input: OpportunityCreateInput!) {
      createOpportunity(data: $input) { id name stage company { name } }
    }`,
    { input }
  );
  return data.createOpportunity;
}

export async function consultarPipeline(params: { fase?: string; paradosHaDias?: number }) {
  const data = await gql(`
    query {
      opportunities(first: 100) {
        edges {
          node {
            id
            name
            stage
            amount { amountMicros currencyCode }
            closeDate
            updatedAt
            pointOfContact { name { firstName lastName } }
            company { name }
          }
        }
      }
    }`);

  let deals = data.opportunities.edges.map((e: any) => e.node);

  const faseAlvo = normalizarFase(params.fase);
  if (faseAlvo) deals = deals.filter((d: any) => d.stage === faseAlvo);

  if (params.paradosHaDias) {
    const limite = new Date();
    limite.setDate(limite.getDate() - params.paradosHaDias);
    deals = deals.filter((d: any) => d.updatedAt && new Date(d.updatedAt) < limite);
  }

  return deals;
}

export async function atualizarFaseDeal(params: {
  dealId: string;
  novaFase: string;
  motivoPerda?: string;
}) {
  const input: Record<string, unknown> = { stage: normalizarFase(params.novaFase) };
  if (normalizarFase(params.novaFase) === 'PERDIDO' && params.motivoPerda) {
    input.motivoPerda = normalizarMotivo(params.motivoPerda);
  }

  const data = await gql(
    `mutation AtualizarDeal($id: UUID!, $input: OpportunityUpdateInput!) {
      updateOpportunity(id: $id, data: $input) { id stage }
    }`,
    { id: params.dealId, input }
  );
  return data.updateOpportunity;
}

// ============================================================================
//  Ferramentas de CONSULTA (consultor generalista do CRM) — somente leitura
// ============================================================================

const FASE_LABEL: Record<string, string> = {
  PROSPECCAO: 'Prospecção', QUALIFICACAO: 'Qualificação', PROPOSTA_INICIAL: 'Proposta Inicial',
  NEGOCIACAO: 'Negociação', FECHADO: 'Fechado', PERDIDO: 'Perdido',
};
const reais = (micros?: number) => (micros || 0) / 1_000_000;

// Panorama geral: contagens + valor por fase (para perguntas tipo "quanto tenho em negociação?")
export async function estatisticasCrm() {
  const data = await gql(`query {
    companies(first: 1000) { edges { node { id } } }
    people(first: 1000) { edges { node { id } } }
    opportunities(first: 1000) { edges { node { stage amount { amountMicros } } } }
  }`);
  const props = data.opportunities.edges.map((e: any) => e.node);
  const porFase: Record<string, { quantidade: number; valorReais: number }> = {};
  for (const o of props) {
    const label = FASE_LABEL[o.stage] || o.stage || 'Sem fase';
    porFase[label] ??= { quantidade: 0, valorReais: 0 };
    porFase[label].quantidade++;
    porFase[label].valorReais += reais(o.amount?.amountMicros);
  }
  const valorTotalAberto = props
    .filter((o: any) => !['FECHADO', 'PERDIDO'].includes(o.stage))
    .reduce((s: number, o: any) => s + reais(o.amount?.amountMicros), 0);
  return {
    empresas: data.companies.edges.length,
    pessoas: data.people.edges.length,
    propostas: props.length,
    porFase,
    valorTotalEmAberto: valorTotalAberto,
  };
}

// Detalhe de uma empresa: contatos + propostas (para "me fala tudo da Matec")
export async function buscarEmpresa(nome: string) {
  const data = await gql(`query {
    companies(first: 500) { edges { node { id name domainName { primaryLinkUrl } } } }
    people(first: 1000) { edges { node { name { firstName lastName } emails { primaryEmail } phones { primaryPhoneNumber } company { id } } } }
    opportunities(first: 1000) { edges { node { id name stage amount { amountMicros } updatedAt company { id } } } }
  }`);
  const alvo = nome.trim().toLowerCase();
  const emp = data.companies.edges.map((e: any) => e.node).find((c: any) => c.name?.toLowerCase().includes(alvo));
  if (!emp) return { encontrada: false, dica: 'Empresa não encontrada. Use listar_empresas para ver os nomes.' };

  const contatos = data.people.edges.map((e: any) => e.node).filter((p: any) => p.company?.id === emp.id)
    .map((p: any) => ({
      nome: `${p.name?.firstName || ''} ${p.name?.lastName || ''}`.trim(),
      email: p.emails?.primaryEmail || null,
      telefone: p.phones?.primaryPhoneNumber || null,
    }));
  const propostas = data.opportunities.edges.map((e: any) => e.node).filter((o: any) => o.company?.id === emp.id)
    .map((o: any) => ({ nome: o.name, fase: FASE_LABEL[o.stage] || o.stage, valorReais: reais(o.amount?.amountMicros), atualizadoEm: o.updatedAt }));

  return { encontrada: true, empresa: emp.name, site: emp.domainName?.primaryLinkUrl || null, contatos, propostas };
}

// Lista os nomes das empresas cadastradas
export async function listarEmpresas() {
  const data = await gql(`query { companies(first: 1000) { edges { node { name } } } }`);
  return { total: data.companies.edges.length, empresas: data.companies.edges.map((e: any) => e.node.name) };
}

// Busca pessoas por nome
export async function buscarPessoa(nome: string) {
  const data = await gql(`query {
    people(first: 1000) { edges { node { name { firstName lastName } emails { primaryEmail } phones { primaryPhoneNumber } company { name } } } }
  }`);
  const alvo = nome.trim().toLowerCase();
  return data.people.edges.map((e: any) => e.node)
    .filter((p: any) => `${p.name?.firstName || ''} ${p.name?.lastName || ''}`.toLowerCase().includes(alvo))
    .map((p: any) => ({
      nome: `${p.name?.firstName || ''} ${p.name?.lastName || ''}`.trim(),
      empresa: p.company?.name || null,
      email: p.emails?.primaryEmail || null,
      telefone: p.phones?.primaryPhoneNumber || null,
    }));
}

// ============================================================================
//  RESOLUÇÃO nome -> id  (base para vincular, editar e excluir sem expor UUID)
//  Cada resolver devolve uma lista de candidatos {id, label}. As tools tratam:
//    0 candidatos -> erro amigável | 1 -> usa | >1 -> devolve ambiguidade p/ o
//    agente perguntar qual é. Assim o usuário nunca precisa saber o UUID.
// ============================================================================
export type Candidato = { id: string; label: string };

async function resolverEmpresas(nome: string): Promise<Candidato[]> {
  const data = await gql(`query { companies(first: 500) { edges { node { id name } } } }`);
  const alvo = nome.trim().toLowerCase();
  const nodes = data.companies.edges.map((e: any) => e.node);
  const exatos = nodes.filter((c: any) => c.name?.trim().toLowerCase() === alvo);
  const base = exatos.length ? exatos : nodes.filter((c: any) => c.name?.toLowerCase().includes(alvo));
  return base.map((c: any) => ({ id: c.id, label: c.name }));
}

async function resolverPessoas(nome: string): Promise<Candidato[]> {
  const data = await gql(`query { people(first: 1000) { edges { node { id name { firstName lastName } company { name } } } } }`);
  const alvo = nome.trim().toLowerCase();
  const nodes = data.people.edges.map((e: any) => e.node)
    .map((p: any) => ({ id: p.id, nomeCompleto: `${p.name?.firstName || ''} ${p.name?.lastName || ''}`.trim(), empresa: p.company?.name }));
  const exatos = nodes.filter((p: any) => p.nomeCompleto.toLowerCase() === alvo);
  const base = exatos.length ? exatos : nodes.filter((p: any) => p.nomeCompleto.toLowerCase().includes(alvo));
  return base.map((p: any) => ({ id: p.id, label: p.empresa ? `${p.nomeCompleto} (${p.empresa})` : p.nomeCompleto }));
}

async function resolverPropostas(nome: string): Promise<Candidato[]> {
  const data = await gql(`query { opportunities(first: 1000) { edges { node { id name stage company { name } } } } }`);
  const alvo = nome.trim().toLowerCase();
  const nodes = data.opportunities.edges.map((e: any) => e.node);
  const exatos = nodes.filter((o: any) => o.name?.trim().toLowerCase() === alvo);
  const base = exatos.length ? exatos : nodes.filter((o: any) => o.name?.toLowerCase().includes(alvo) || o.company?.name?.toLowerCase().includes(alvo));
  return base.map((o: any) => ({ id: o.id, label: `${o.name} [${FASE_LABEL[o.stage] || o.stage}]${o.company?.name ? ' – ' + o.company.name : ''}` }));
}

async function resolverTarefas(titulo: string): Promise<Candidato[]> {
  const data = await gql(`query { tasks(first: 500) { edges { node { id title status } } } }`);
  const alvo = titulo.trim().toLowerCase();
  const nodes = data.tasks.edges.map((e: any) => e.node);
  const exatos = nodes.filter((t: any) => t.title?.trim().toLowerCase() === alvo);
  const base = exatos.length ? exatos : nodes.filter((t: any) => t.title?.toLowerCase().includes(alvo));
  return base.map((t: any) => ({ id: t.id, label: `${t.title} [${t.status}]` }));
}

const RESOLVERS: Record<string, (n: string) => Promise<Candidato[]>> = {
  empresa: resolverEmpresas, pessoa: resolverPessoas, proposta: resolverPropostas, tarefa: resolverTarefas,
};

// Resolve 1 alvo por nome. Devolve { id } ou um objeto de "erro/ambiguidade"
// pronto para virar resposta ao agente (que então pergunta ou avisa).
async function resolverUm(tipo: keyof typeof RESOLVERS, nome: string): Promise<{ id: string } | { erro?: string; ambiguo?: boolean; opcoes?: string[] }> {
  const cands = await RESOLVERS[tipo](nome);
  if (cands.length === 0) return { erro: `Não encontrei ${tipo} com nome "${nome}". Confira a grafia ou liste os registros primeiro.` };
  if (cands.length > 1) return { ambiguo: true, opcoes: cands.map((c) => c.label), erro: `Há ${cands.length} ${tipo}s parecidas com "${nome}". Pergunte ao usuário qual delas antes de agir.` };
  return { id: cands[0].id };
}

// ============================================================================
//  CRIAÇÃO — Empresa e Tarefa (com vínculos por nome)
// ============================================================================

// Cria uma empresa com dados completos. Se já existir (mesmo nome), ATUALIZA os
// campos informados em vez de duplicar.
export async function criarEmpresa(params: {
  nome: string; site?: string; linkedin?: string; endereco?: string; receitaAnual?: number;
}) {
  const camposExtra = (input: Record<string, unknown>) => {
    if (params.site) input.domainName = linkInput(params.site);
    if (params.linkedin) input.linkedinLink = linkInput(params.linkedin);
    if (params.endereco) input.address = { addressStreet1: params.endereco };
    if (typeof params.receitaAnual === 'number') input.annualRevenue = { amountMicros: Math.round(params.receitaAnual * 1_000_000), currencyCode: 'BRL' };
  };

  const existentes = await resolverEmpresas(params.nome);
  const exata = existentes.find((c) => c.label.trim().toLowerCase() === params.nome.trim().toLowerCase());
  if (exata) {
    const input: Record<string, unknown> = {};
    camposExtra(input);
    if (Object.keys(input).length) {
      await gql(`mutation($id: UUID!, $input: CompanyUpdateInput!) { updateCompany(id: $id, data: $input) { id } }`, { id: exata.id, input });
    }
    return { jaExistia: true, id: exata.id, empresa: params.nome, atualizada: Object.keys(input).length > 0 };
  }

  const input: Record<string, unknown> = { name: params.nome };
  camposExtra(input);
  const data = await gql(`mutation($input: CompanyCreateInput!) { createCompany(data: $input) { id name } }`, { input });
  return { criada: true, id: data.createCompany.id, empresa: data.createCompany.name };
}

// Cria uma tarefa e (opcionalmente) vincula a empresa/pessoa/proposta por nome.
export async function criarTarefa(params: {
  titulo: string; corpo?: string; prazo?: string; status?: string;
  empresa?: string; pessoa?: string; proposta?: string;
}) {
  const input: Record<string, unknown> = { title: params.titulo, status: normalizarStatusTarefa(params.status) || 'TODO' };
  if (params.corpo) input.bodyV2 = { markdown: params.corpo };
  const prazo = dataISO(params.prazo);
  if (prazo) input.dueAt = prazo;

  const data = await gql(`mutation($input: TaskCreateInput!) { createTask(data: $input) { id title status dueAt } }`, { input });
  const taskId = data.createTask.id;

  // Resolve e vincula alvos (falha de vínculo não invalida a tarefa criada)
  const vinculos: string[] = [];
  const naoResolvidos: string[] = [];
  for (const [tipo, nome, campo] of [
    ['empresa', params.empresa, 'targetCompanyId'],
    ['pessoa', params.pessoa, 'targetPersonId'],
    ['proposta', params.proposta, 'targetOpportunityId'],
  ] as const) {
    if (!nome) continue;
    const r = await resolverUm(tipo, nome);
    if ('id' in r) {
      await gql(`mutation($input: TaskTargetCreateInput!) { createTaskTarget(data: $input) { id } }`, { input: { taskId, [campo]: r.id } });
      vinculos.push(`${tipo}: ${nome}`);
    } else {
      naoResolvidos.push(`${tipo} "${nome}" (${r.ambiguo ? 'ambíguo' : 'não encontrado'})`);
    }
  }
  return { criada: true, id: taskId, titulo: data.createTask.title, status: data.createTask.status, prazo: data.createTask.dueAt || null, vinculos, naoResolvidos };
}

// Registra uma nota de TEXTO vinculando por NOME (resolve os UUIDs internamente).
// Substitui na prática a antiga necessidade de passar pessoaId/empresaId à mão.
export async function registrarNotaPorNome(params: {
  titulo: string; corpo: string; empresa?: string; pessoa?: string; proposta?: string;
}) {
  const alvos: { pessoaId?: string; empresaId?: string; oportunidadeId?: string } = {};
  const naoResolvidos: string[] = [];
  for (const [tipo, nome, chave] of [
    ['empresa', params.empresa, 'empresaId'],
    ['pessoa', params.pessoa, 'pessoaId'],
    ['proposta', params.proposta, 'oportunidadeId'],
  ] as const) {
    if (!nome) continue;
    const r = await resolverUm(tipo, nome);
    if ('id' in r) (alvos as any)[chave] = r.id;
    else naoResolvidos.push(`${tipo} "${nome}" (${r.ambiguo ? 'ambíguo' : 'não encontrado'})`);
  }
  const nota = await criarNota({ titulo: params.titulo, corpo: params.corpo, ...alvos });
  return { criada: true, notaId: nota.id, titulo: nota.title, vinculada: Object.keys(alvos).length > 0, naoResolvidos };
}

// ============================================================================
//  EDIÇÃO — Empresa, Pessoa, Proposta, Tarefa (localiza por nome)
// ============================================================================

export async function editarEmpresa(params: {
  nome: string; novoNome?: string; site?: string; linkedin?: string; endereco?: string; receitaAnual?: number;
}) {
  const r = await resolverUm('empresa', params.nome);
  if (!('id' in r)) return r;
  const input: Record<string, unknown> = {};
  if (params.novoNome) input.name = params.novoNome;
  if (params.site) input.domainName = linkInput(params.site);
  if (params.linkedin) input.linkedinLink = linkInput(params.linkedin);
  if (params.endereco) input.address = { addressStreet1: params.endereco };
  if (typeof params.receitaAnual === 'number') input.annualRevenue = { amountMicros: Math.round(params.receitaAnual * 1_000_000), currencyCode: 'BRL' };
  if (!Object.keys(input).length) return { erro: 'Nada para atualizar: informe ao menos um campo (novoNome, site, linkedin, endereco, receitaAnual).' };
  await gql(`mutation($id: UUID!, $input: CompanyUpdateInput!) { updateCompany(id: $id, data: $input) { id name } }`, { id: r.id, input });
  return { atualizada: true, empresa: params.novoNome || params.nome, campos: Object.keys(input) };
}

export async function editarPessoa(params: {
  nome: string; novoNome?: string; empresa?: string; telefone?: string; email?: string; cargo?: string; linkedin?: string;
}) {
  const r = await resolverUm('pessoa', params.nome);
  if (!('id' in r)) return r;
  const input: Record<string, unknown> = {};
  if (params.novoNome) {
    const [firstName, ...rest] = params.novoNome.split(' ');
    input.name = { firstName, lastName: rest.join(' ') || '' };
  }
  if (params.email) input.emails = { primaryEmail: params.email };
  if (params.cargo) input.jobTitle = params.cargo;
  if (params.linkedin) input.linkedinLink = linkInput(params.linkedin);
  if (params.telefone) input.phones = { primaryPhoneNumber: params.telefone.replace(/\D/g, ''), primaryPhoneCallingCode: '+55', primaryPhoneCountryCode: 'BR' };
  if (params.empresa) {
    try { input.companyId = await buscarOuCriarEmpresa(params.empresa); } catch { /* ignora */ }
  }
  if (!Object.keys(input).length) return { erro: 'Nada para atualizar: informe ao menos um campo (novoNome, empresa, telefone, email, cargo, linkedin).' };
  await gql(`mutation($id: UUID!, $input: PersonUpdateInput!) { updatePerson(id: $id, data: $input) { id } }`, { id: r.id, input });
  return { atualizada: true, pessoa: params.novoNome || params.nome, campos: Object.keys(input) };
}

export async function editarProposta(params: {
  nome: string; novoNome?: string; empresa?: string; fase?: string; valorEstimado?: number;
  doresPrincipais?: string; requisitos?: string; escopo?: string; probabilidade?: number;
  dataReuniao?: string; dataEnvioProposta?: string; dataFechamento?: string; motivoPerda?: string;
}) {
  const r = await resolverUm('proposta', params.nome);
  if (!('id' in r)) return r;
  const input: Record<string, unknown> = {};
  if (params.novoNome) input.name = params.novoNome;
  if (params.fase) input.stage = normalizarFase(params.fase);
  if (params.motivoPerda) input.motivoPerda = normalizarMotivo(params.motivoPerda);
  if (params.doresPrincipais) input.doresPrincipais = params.doresPrincipais;
  if (params.requisitos) input.requisitos = params.requisitos;
  if (params.escopo) input.escopo = params.escopo;
  if (typeof params.probabilidade === 'number') input.probabilidade = params.probabilidade;
  if (typeof params.valorEstimado === 'number') input.amount = { amountMicros: Math.round(params.valorEstimado * 1_000_000), currencyCode: 'BRL' };
  const dReu = dataISO(params.dataReuniao); if (dReu) input.dataReuniao = dReu;
  const dEnv = dataISO(params.dataEnvioProposta); if (dEnv) input.dataEnvioProposta = dEnv;
  const dFec = dataISO(params.dataFechamento); if (dFec) input.closeDate = dFec;
  if (params.empresa) { try { input.companyId = await buscarOuCriarEmpresa(params.empresa); } catch { /* ignora */ } }
  if (!Object.keys(input).length) return { erro: 'Nada para atualizar: informe ao menos um campo.' };
  await gql(`mutation($id: UUID!, $input: OpportunityUpdateInput!) { updateOpportunity(id: $id, data: $input) { id name stage } }`, { id: r.id, input });
  return { atualizada: true, proposta: params.novoNome || params.nome, campos: Object.keys(input) };
}

export async function editarTarefa(params: {
  titulo: string; novoTitulo?: string; corpo?: string; prazo?: string; status?: string;
}) {
  const r = await resolverUm('tarefa', params.titulo);
  if (!('id' in r)) return r;
  const input: Record<string, unknown> = {};
  if (params.novoTitulo) input.title = params.novoTitulo;
  if (params.corpo) input.bodyV2 = { markdown: params.corpo };
  if (params.status) input.status = normalizarStatusTarefa(params.status);
  const prazo = dataISO(params.prazo); if (prazo) input.dueAt = prazo;
  if (!Object.keys(input).length) return { erro: 'Nada para atualizar: informe novoTitulo, corpo, prazo ou status.' };
  await gql(`mutation($id: UUID!, $input: TaskUpdateInput!) { updateTask(id: $id, data: $input) { id title status } }`, { id: r.id, input });
  return { atualizada: true, tarefa: params.novoTitulo || params.titulo, campos: Object.keys(input) };
}

// ============================================================================
//  EXCLUSÃO — genérica por tipo + nome (o agente confirma ANTES de chamar)
// ============================================================================
const DELETE_MUTATION: Record<string, string> = {
  empresa: 'deleteCompany', pessoa: 'deletePerson', proposta: 'deleteOpportunity', tarefa: 'deleteTask',
};

export async function excluirRegistro(params: { tipo: string; nome: string }) {
  const tipo = params.tipo.trim().toLowerCase();
  if (!DELETE_MUTATION[tipo]) return { erro: `Tipo inválido "${params.tipo}". Use: empresa, pessoa, proposta ou tarefa.` };
  const r = await resolverUm(tipo as keyof typeof RESOLVERS, params.nome);
  if (!('id' in r)) return r;
  await gql(`mutation($id: UUID!) { ${DELETE_MUTATION[tipo]}(id: $id) { id } }`, { id: r.id });
  return { excluido: true, tipo, nome: params.nome };
}

// Lista tarefas (com filtro opcional por status), para consulta/consultor.
export async function listarTarefas(params: { status?: string } = {}) {
  const data = await gql(`query { tasks(first: 200) { edges { node { id title status dueAt } } } }`);
  const alvo = normalizarStatusTarefa(params.status);
  let tarefas = data.tasks.edges.map((e: any) => e.node);
  if (alvo) tarefas = tarefas.filter((t: any) => t.status === alvo);
  const LBL: Record<string, string> = { TODO: 'À iniciar', EM_PROGRESSO: 'Em progresso', FINALIZADO: 'Finalizado' };
  return tarefas.map((t: any) => ({ titulo: t.title, status: LBL[t.status] || t.status, prazo: t.dueAt || null }));
}
