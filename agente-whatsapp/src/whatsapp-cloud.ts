import 'dotenv/config';
import express from 'express';
import axios from 'axios';
import OpenAI from 'openai';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { processarMensagem, limparHistoria, registrarAnexo } from './ai.service';

/**
 * Canal WhatsApp Business Cloud API (Meta oficial).
 * Reusa o mesmo cérebro (ai.service) do canal Telegram — muda só a "boca/ouvido".
 *
 * Requer (no .env / Railway):
 *   WHATSAPP_TOKEN            → token de acesso permanente do app Meta
 *   WHATSAPP_PHONE_NUMBER_ID  → ID do número (WhatsApp > API Setup)
 *   WHATSAPP_VERIFY_TOKEN     → string que você inventa, usada na verificação do webhook
 *   WHATSAPP_ALLOWED          → (opcional) números autorizados, separados por vírgula. Vazio = todos
 *
 * IMPORTANTE: diferente do Telegram (long-polling), o WhatsApp Cloud exige um
 * webhook PÚBLICO. No Railway, gere um domínio para o serviço e cadastre
 *   https://SEU-DOMINIO/webhook
 * na configuração de Webhooks do app Meta, com o mesmo WHATSAPP_VERIFY_TOKEN.
 */

const TOKEN = process.env.WHATSAPP_TOKEN;
const PHONE_ID = process.env.WHATSAPP_PHONE_NUMBER_ID;
const VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN;
const GRAPH = 'https://graph.facebook.com/v20.0';
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const ALLOWED = (process.env.WHATSAPP_ALLOWED || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

// Evita reprocessar o mesmo webhook (a Meta reenvia em caso de timeout)
const idsProcessados = new Set<string>();

async function enviarMensagem(para: string, texto: string) {
  // WhatsApp limita o corpo do texto a ~4096 caracteres
  for (let i = 0; i < texto.length; i += 4000) {
    await axios.post(
      `${GRAPH}/${PHONE_ID}/messages`,
      {
        messaging_product: 'whatsapp',
        to: para,
        type: 'text',
        text: { body: texto.slice(i, i + 4000) },
      },
      { headers: { Authorization: `Bearer ${TOKEN}` }, timeout: 30000 }
    );
  }
}

// Baixa uma mídia do WhatsApp (áudio/imagem/documento) e devolve o buffer
async function baixarMidia(mediaId: string): Promise<{ buffer: Buffer; mimeType: string }> {
  const meta = await axios.get(`${GRAPH}/${mediaId}`, {
    headers: { Authorization: `Bearer ${TOKEN}` },
    timeout: 20000,
  });
  const url = meta.data.url as string;
  const mimeType = (meta.data.mime_type as string) || 'application/octet-stream';
  const bin = await axios.get(url, {
    headers: { Authorization: `Bearer ${TOKEN}` },
    responseType: 'arraybuffer',
    timeout: 120000,
  });
  return { buffer: Buffer.from(bin.data), mimeType };
}

async function transcreverAudio(buffer: Buffer, mimeType: string): Promise<string> {
  const ext = mimeType.includes('ogg') ? '.ogg' : mimeType.includes('mp4') ? '.mp4' : '.ogg';
  const tmp = path.join(os.tmpdir(), `wa_audio_${Date.now()}${ext}`);
  fs.writeFileSync(tmp, buffer);
  try {
    const tr = await openai.audio.transcriptions.create({
      file: fs.createReadStream(tmp),
      model: 'whisper-1',
      language: 'pt',
    });
    return tr.text;
  } finally {
    fs.unlink(tmp, () => {});
  }
}

async function tratarMensagem(msg: any) {
  const de = msg.from as string; // número do remetente (ex: 5511999999999)
  if (ALLOWED.length && !ALLOWED.includes(de)) {
    console.log(`[WA] ignorado número não autorizado ${de}`);
    return;
  }

  let texto: string | undefined;

  if (msg.type === 'text') {
    texto = msg.text?.body;
  } else if (msg.type === 'audio' && msg.audio?.id) {
    const { buffer, mimeType } = await baixarMidia(msg.audio.id);
    texto = await transcreverAudio(buffer, mimeType);
    console.log(`[WA] 🎤 transcrição: ${texto}`);
    await enviarMensagem(de, `🎤 Entendi: "${texto}"`);
  } else if ((msg.type === 'document' || msg.type === 'image') && (msg.document?.id || msg.image?.id)) {
    const media = msg.document || msg.image;
    const { buffer, mimeType } = await baixarMidia(media.id);
    const nomeArquivo =
      media.filename || `${msg.type}_${Date.now()}.${mimeType.split('/')[1] || 'bin'}`;
    registrarAnexo(de, { conteudo: buffer, nomeArquivo, mimeType });
    const legenda = (media.caption as string | undefined)?.trim();
    texto = `[arquivo anexado: "${nomeArquivo}" (${mimeType})] ${
      legenda ? 'Legenda: ' + legenda : '(sem legenda — pergunte o cliente e a categoria antes de arquivar)'
    }`;
    console.log(`[WA] 📎 anexo recebido: ${nomeArquivo} (${mimeType})`);
  }

  if (!texto) return;

  if (/^\/(reset|limpar|novo)\b/i.test(texto.trim())) {
    limparHistoria(de);
    await enviarMensagem(de, '🧹 Contexto da conversa limpo. Pode começar de novo.');
    return;
  }

  console.log(`[WA] ${de}: ${texto}`);
  const resposta = await processarMensagem(texto, de);
  await enviarMensagem(de, resposta);
}

function main() {
  if (!TOKEN || !PHONE_ID || !VERIFY_TOKEN) {
    console.error(
      'Faltando credenciais do WhatsApp Cloud (WHATSAPP_TOKEN, WHATSAPP_PHONE_NUMBER_ID, WHATSAPP_VERIFY_TOKEN).'
    );
    process.exit(1);
  }

  const app = express();
  app.use(express.json());

  // Verificação do webhook (Meta chama uma vez ao cadastrar)
  app.get('/webhook', (req, res) => {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];
    if (mode === 'subscribe' && token === VERIFY_TOKEN) {
      console.log('[WA] webhook verificado com sucesso');
      return res.status(200).send(challenge);
    }
    return res.sendStatus(403);
  });

  // Recebimento de mensagens
  app.post('/webhook', async (req, res) => {
    res.sendStatus(200); // responde já; processa em background (evita reenvio da Meta)
    try {
      const entradas = req.body?.entry || [];
      for (const entry of entradas) {
        for (const change of entry.changes || []) {
          const mensagens = change.value?.messages || [];
          for (const msg of mensagens) {
            if (idsProcessados.has(msg.id)) continue;
            idsProcessados.add(msg.id);
            if (idsProcessados.size > 500) idsProcessados.clear();
            try {
              await tratarMensagem(msg);
            } catch (err: any) {
              console.error('[WA] erro tratando mensagem:', err.message);
              try {
                await enviarMensagem(msg.from, `⚠️ Erro: ${err.message}`);
              } catch {
                /* ignora falha de envio do erro */
              }
            }
          }
        }
      }
    } catch (err: any) {
      console.error('[WA] erro no webhook:', err.message);
    }
  });

  app.get('/health', (_req, res) => res.json({ status: 'ok', canal: 'whatsapp' }));

  const PORT = process.env.PORT || 3002;
  app.listen(PORT, () => console.log(`Agente WhatsApp Cloud rodando na porta ${PORT} (webhook em /webhook)`));
}

main();
