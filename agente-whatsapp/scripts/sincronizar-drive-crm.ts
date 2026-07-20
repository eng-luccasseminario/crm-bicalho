import 'dotenv/config';
import { google } from 'googleapis';
import { registrarDocumentoNota, linksDeDocumentosJaRegistrados } from '../src/tools/twenty.tools';

/**
 * Sincronização RETROATIVA: varre o CDE no Google Drive (CRM-Seminario/<cliente>/<categoria>/*)
 * e cria, para cada documento já existente, uma Nota vinculada à empresa (e à proposta ativa)
 * no Twenty — fazendo o que já está no Drive aparecer em Notas + timeline do CRM.
 *
 * Idempotente: pula documentos cujo link já está referenciado em alguma Nota.
 *
 * Uso:  npx ts-node scripts/sincronizar-drive-crm.ts
 */

const ROOT_FOLDER = 'CRM-Seminario';

function getDrive() {
  const auth = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  );
  auth.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN });
  return google.drive({ version: 'v3', auth });
}

async function listarFilhos(drive: any, parentId: string, apenasPastas: boolean) {
  const mime = apenasPastas
    ? `and mimeType='application/vnd.google-apps.folder'`
    : `and mimeType!='application/vnd.google-apps.folder'`;
  const res = await drive.files.list({
    q: `'${parentId}' in parents and trashed=false ${mime}`,
    fields: 'files(id,name,webViewLink,mimeType)',
    pageSize: 500,
  });
  return res.data.files || [];
}

// "01_Proposta_Inicial" -> "Proposta Inicial"
const labelCategoria = (nomePasta: string) =>
  nomePasta.replace(/^\d+[_-]?/, '').replace(/_/g, ' ').trim() || nomePasta;

async function main() {
  const drive = getDrive();

  const raiz = await drive.files.list({
    q: `name='${ROOT_FOLDER}' and mimeType='application/vnd.google-apps.folder' and trashed=false`,
    fields: 'files(id)',
  });
  const rootId = raiz.data.files?.[0]?.id;
  if (!rootId) {
    console.log(`Pasta raiz "${ROOT_FOLDER}" não encontrada no Drive. Nada a sincronizar.`);
    return;
  }

  console.log('Carregando links já registrados no CRM (dedup)...');
  const jaRegistrados = await linksDeDocumentosJaRegistrados();
  console.log(`  ${jaRegistrados.size} link(s) já referenciado(s).`);

  let criadas = 0, pulados = 0, erros = 0;
  const clientes = await listarFilhos(drive, rootId, true);
  console.log(`Clientes no Drive: ${clientes.length}\n`);

  for (const cliente of clientes) {
    const categorias = await listarFilhos(drive, cliente.id, true);
    for (const cat of categorias) {
      const arquivos = await listarFilhos(drive, cat.id, false);
      for (const arq of arquivos) {
        const link = arq.webViewLink;
        if (!link) continue;
        if (jaRegistrados.has(link)) { pulados++; continue; }
        try {
          await registrarDocumentoNota({
            clienteNome: cliente.name,
            categoria: labelCategoria(cat.name),
            nomeArquivo: arq.name,
            link,
            mimeType: arq.mimeType,
          });
          jaRegistrados.add(link);
          criadas++;
          console.log(`✓ ${cliente.name} / ${labelCategoria(cat.name)} / ${arq.name}`);
        } catch (e: any) {
          erros++;
          console.log(`✗ ${cliente.name} / ${arq.name} → ${e.message}`);
        }
      }
    }
  }

  console.log(`\nResumo: ${criadas} nota(s) criada(s), ${pulados} já existente(s), ${erros} erro(s).`);
  process.exit(0);
}

main().catch((e) => { console.error('Falha:', e.message); process.exit(1); });
