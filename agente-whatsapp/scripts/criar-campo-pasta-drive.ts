import 'dotenv/config';
import axios from 'axios';

/**
 * Cria (idempotente) o campo "Pasta no Drive" (tipo LINKS) no objeto Empresa do Twenty,
 * via Metadata API. Esse campo guarda o link da pasta organizada do cliente no Google Drive,
 * abrindo a visão de pastas direto do cartão da empresa.
 *
 * Uso:  npx ts-node scripts/criar-campo-pasta-drive.ts
 */
const COMPANY_OBJECT_ID = 'f7ed1395-61f7-45a8-b79f-4f7eaa15b98f';
const FIELD_NAME = 'pastaDrive';

const meta = axios.create({
  baseURL: process.env.TWENTY_API_URL + '/metadata',
  headers: { Authorization: `Bearer ${process.env.TWENTY_API_KEY}`, 'Content-Type': 'application/json' },
});
async function gql(query: string, variables: any = {}) {
  const { data } = await meta.post('', { query, variables });
  if (data.errors) throw new Error(JSON.stringify(data.errors));
  return data.data;
}

(async () => {
  // já existe? (filtra em JS para evitar filtros não suportados)
  const existentes = await gql(`{ fields(paging:{first:500}){ edges{ node{ name object{ nameSingular } } } } }`);
  const jaTem = (existentes.fields?.edges || []).some(
    (e: any) => e.node.name === FIELD_NAME && e.node.object?.nameSingular === 'company'
  );
  if (jaTem) { console.log('Campo "pastaDrive" já existe na Empresa. Nada a fazer.'); process.exit(0); }

  const r = await gql(
    `mutation($input: CreateOneFieldMetadataInput!){ createOneField(input:$input){ id name label } }`,
    {
      input: {
        field: {
          name: FIELD_NAME,
          label: 'Pasta no Drive',
          type: 'LINKS',
          objectMetadataId: COMPANY_OBJECT_ID,
          icon: 'IconFolder',
          description: 'Link da pasta de documentos do cliente no Google Drive (CDE)',
          isNullable: true,
        },
      },
    }
  );
  console.log('✓ Campo criado:', JSON.stringify(r.createOneField));
  process.exit(0);
})().catch((e) => { console.error('Falha:', e.message); process.exit(1); });
