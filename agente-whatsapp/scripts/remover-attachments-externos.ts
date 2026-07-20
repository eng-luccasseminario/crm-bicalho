import 'dotenv/config';
import axios from 'axios';

/**
 * Remove do Twenty os Attachments cujo fullPath é um LINK EXTERNO (http...).
 * Esses foram criados por engano apontando para o Google Drive e quebram a aba Files
 * (o Twenty espera um caminho interno de storage, não uma URL externa).
 * Não toca em arquivos com caminho interno (uploads nativos do Twenty).
 *
 * Uso:  npx ts-node scripts/remover-attachments-externos.ts
 */
const client = axios.create({
  baseURL: process.env.TWENTY_API_URL,
  headers: { Authorization: `Bearer ${process.env.TWENTY_API_KEY}`, 'Content-Type': 'application/json' },
});
async function gql(query: string, variables: any = {}) {
  const { data } = await client.post('/graphql', { query, variables });
  if (data.errors) throw new Error(JSON.stringify(data.errors));
  return data.data;
}

(async () => {
  const data = await gql(`{ attachments(first: 500) { edges { node { id name fullPath } } } }`);
  const externos = data.attachments.edges
    .map((e: any) => e.node)
    .filter((a: any) => /^https?:\/\//i.test(a.fullPath || ''));

  console.log(`Attachments com link externo encontrados: ${externos.length}`);
  for (const a of externos) {
    await gql(`mutation($id: UUID!){ deleteAttachment(id: $id){ id } }`, { id: a.id });
    console.log(`✓ removido: ${a.name}`);
  }
  console.log('Concluído. A aba Files deve voltar ao normal.');
  process.exit(0);
})().catch((e) => { console.error('Falha:', e.message); process.exit(1); });
