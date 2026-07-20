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
}) {
  const data = await gql(
    `mutation CriarNota($input: NoteCreateInput!) {
      createNote(data: $input) { id title }
    }`,
    {
      input: {
        title: params.titulo,
        bodyV2: { markdown: params.corpo },
        noteTargets: {
          createMany: {
            data: [
              ...(params.pessoaId ? [{ personId: params.pessoaId }] : []),
              ...(params.empresaId ? [{ companyId: params.empresaId }] : []),
            ],
          },
        },
      },
    }
  );
  return data.createNote;
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
