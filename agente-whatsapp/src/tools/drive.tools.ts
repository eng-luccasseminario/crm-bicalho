import { google } from 'googleapis';
import { Readable } from 'stream';

const ROOT_FOLDER = 'CRM-Seminario';

const CATEGORIAS: Record<string, string> = {
  'Transcrição de Reunião': '00_Reunioes',
  'Proposta Inicial':       '01_Proposta_Inicial',
  'Dores e Requisitos':     '02_Dores_Requisitos',
  'Escopo':                 '03_Escopo',
  'Cronograma':             '04_Cronograma',
  'Orçamento':              '05_Orcamento',
  'Contrato':               '06_Contrato',
  'Arquivado':              '07_Arquivado',
};

function getDrive() {
  const auth = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  );
  auth.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN });
  return google.drive({ version: 'v3', auth });
}

async function getOrCreateFolder(drive: any, nome: string, parentId?: string): Promise<string> {
  const q = `name='${nome}' and mimeType='application/vnd.google-apps.folder' and trashed=false${parentId ? ` and '${parentId}' in parents` : ''}`;
  const res = await drive.files.list({ q, fields: 'files(id)' });
  if (res.data.files?.length) return res.data.files[0].id;

  const created = await drive.files.create({
    requestBody: {
      name: nome,
      mimeType: 'application/vnd.google-apps.folder',
      parents: parentId ? [parentId] : [],
    },
    fields: 'id',
  });
  return created.data.id;
}

export async function uploadDocumento(params: {
  clienteNome: string;
  categoria: string;
  conteudo: Buffer;
  nomeArquivo: string;
  mimeType: string;
}): Promise<string> {
  const drive = getDrive();
  const rootId = await getOrCreateFolder(drive, ROOT_FOLDER);
  const clienteId = await getOrCreateFolder(drive, params.clienteNome, rootId);
  const pastaCategoria = CATEGORIAS[params.categoria] || '07_Outros';
  const categoriaId = await getOrCreateFolder(drive, pastaCategoria, clienteId);

  const res = await drive.files.create({
    requestBody: { name: params.nomeArquivo, parents: [categoriaId] },
    media: { mimeType: params.mimeType, body: Readable.from(params.conteudo) },
    fields: 'id,webViewLink',
  });
  return res.data.webViewLink || '';
}

export async function listarDocumentosCliente(params: {
  clienteNome: string;
  categoria?: string;
}): Promise<{ nome: string; link: string; criado: string }[]> {
  const drive = getDrive();
  const rootId = await getOrCreateFolder(drive, ROOT_FOLDER);
  const clienteId = await getOrCreateFolder(drive, params.clienteNome, rootId);

  let parentId = clienteId;
  if (params.categoria && CATEGORIAS[params.categoria]) {
    parentId = await getOrCreateFolder(drive, CATEGORIAS[params.categoria], clienteId);
  }

  const res = await drive.files.list({
    q: `'${parentId}' in parents and trashed=false`,
    fields: 'files(id,name,webViewLink,createdTime)',
    orderBy: 'createdTime desc',
  });

  return (res.data.files || []).map((f: any) => ({
    nome: f.name,
    link: f.webViewLink,
    criado: f.createdTime,
  }));
}
