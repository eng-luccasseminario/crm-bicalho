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
