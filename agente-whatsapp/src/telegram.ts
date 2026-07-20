import 'dotenv/config';
import axios from 'axios';
import OpenAI from 'openai';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { processarMensagem, limparHistoria, registrarAnexo } from './ai.service';

const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const API = `https://api.telegram.org/bot${TOKEN}`;
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Baixa um arquivo de áudio do Telegram e transcreve com Whisper (OpenAI)
async function transcreverAudio(fileId: string): Promise<string> {
  const info = await axios.get(`${API}/getFile`, { params: { file_id: fileId }, timeout: 20000 });
  const filePath = info.data.result.file_path as string;
  const url = `https://api.telegram.org/file/bot${TOKEN}/${filePath}`;
  const resp = await axios.get(url, { responseType: 'arraybuffer', timeout: 60000 });

  const ext = path.extname(filePath) || '.ogg';
  const tmp = path.join(os.tmpdir(), `tg_audio_${Date.now()}${ext}`);
  fs.writeFileSync(tmp, Buffer.from(resp.data));
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

// Baixa um arquivo qualquer do Telegram (documento/foto) e devolve o buffer + metadados
async function baixarArquivo(fileId: string): Promise<{ buffer: Buffer; filePath: string }> {
  const info = await axios.get(`${API}/getFile`, { params: { file_id: fileId }, timeout: 20000 });
  const filePath = info.data.result.file_path as string;
  const url = `https://api.telegram.org/file/bot${TOKEN}/${filePath}`;
  const resp = await axios.get(url, { responseType: 'arraybuffer', timeout: 120000 });
  return { buffer: Buffer.from(resp.data), filePath };
}

// Restringe o bot a chats autorizados (IDs separados por vírgula). Vazio = libera todos.
const ALLOWED = (process.env.TELEGRAM_ALLOWED_CHAT_IDS || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

async function sendMessage(chatId: number | string, text: string) {
  // Telegram limita mensagens a 4096 caracteres
  for (let i = 0; i < text.length; i += 4000) {
    await axios.post(`${API}/sendMessage`, {
      chat_id: chatId,
      text: text.slice(i, i + 4000),
    });
  }
}

// Evita que um erro de rede transitório derrube o processo inteiro
process.on('unhandledRejection', (err: any) => {
  console.error('unhandledRejection:', err?.message ?? err);
});

async function getMeComRetry(): Promise<any> {
  for (let tentativa = 1; ; tentativa++) {
    try {
      const r = await axios.get(`${API}/getMe`, { timeout: 20000 });
      return r.data.result;
    } catch (err: any) {
      console.error(`getMe falhou (tentativa ${tentativa}): ${err.message} — retry em 3s`);
      await new Promise((r) => setTimeout(r, 3000));
    }
  }
}

async function main() {
  if (!TOKEN) {
    console.error('Faltando TELEGRAM_BOT_TOKEN no .env');
    process.exit(1);
  }

  const me = await getMeComRetry();
  console.log(`Agente Telegram iniciado como @${me.username} (${me.first_name})`);
  if (ALLOWED.length) console.log(`Chats autorizados: ${ALLOWED.join(', ')}`);

  let offset = 0;
  while (true) {
    try {
      const { data } = await axios.get(`${API}/getUpdates`, {
        params: { offset, timeout: 30 },
        timeout: 35000,
      });

      for (const update of data.result) {
        offset = update.update_id + 1;
        const msg = update.message;
        if (!msg) continue;

        const chatId = msg.chat.id;
        if (ALLOWED.length && !ALLOWED.includes(String(chatId))) {
          console.log(`[TG] ignorado chat não autorizado ${chatId}`);
          await sendMessage(chatId, `Chat não autorizado. Seu chat ID é: ${chatId}`);
          continue;
        }

        // Texto direto ou transcrição de áudio/voz
        let texto = msg.text as string | undefined;
        const audio = msg.voice || msg.audio;
        if (!texto && audio) {
          try {
            await axios.post(`${API}/sendChatAction`, { chat_id: chatId, action: 'typing' });
            texto = await transcreverAudio(audio.file_id);
            console.log(`[TG] 🎤 transcrição: ${texto}`);
            await sendMessage(chatId, `🎤 Entendi: "${texto}"`);
          } catch (err: any) {
            console.error('Erro transcrevendo áudio:', err.message);
            await sendMessage(chatId, `⚠️ Não consegui transcrever o áudio: ${err.message}`);
            continue;
          }
        }
        // Documento ou foto enviada → registra como anexo pendente do CDE
        const doc = msg.document;
        const foto = Array.isArray(msg.photo) && msg.photo.length ? msg.photo[msg.photo.length - 1] : undefined;
        if (doc || foto) {
          try {
            await axios.post(`${API}/sendChatAction`, { chat_id: chatId, action: 'typing' });
            const fileId = doc ? doc.file_id : foto!.file_id;
            const { buffer, filePath } = await baixarArquivo(fileId);
            const nomeArquivo = doc?.file_name || `foto_${Date.now()}${path.extname(filePath) || '.jpg'}`;
            const mimeType = doc?.mime_type || 'image/jpeg';
            registrarAnexo(String(chatId), { conteudo: buffer, nomeArquivo, mimeType });
            const legenda = (msg.caption as string | undefined)?.trim();
            texto = `[arquivo anexado: "${nomeArquivo}" (${mimeType})] ${legenda ? 'Legenda: ' + legenda : '(sem legenda — pergunte o cliente e a categoria antes de arquivar)'}`;
            console.log(`[TG] 📎 anexo recebido: ${nomeArquivo} (${mimeType})`);
          } catch (err: any) {
            console.error('Erro baixando arquivo:', err.message);
            await sendMessage(chatId, `⚠️ Não consegui baixar o arquivo: ${err.message}`);
            continue;
          }
        }

        if (!texto) continue;

        // Comando para limpar o contexto da conversa
        if (/^\/(reset|limpar|novo)\b/i.test(texto.trim())) {
          limparHistoria(String(chatId));
          await sendMessage(chatId, '🧹 Contexto da conversa limpo. Pode começar de novo.');
          continue;
        }

        console.log(`[TG] ${msg.from?.first_name ?? '?'} (${chatId}): ${texto}`);
        try {
          await axios.post(`${API}/sendChatAction`, { chat_id: chatId, action: 'typing' });
          const resposta = await processarMensagem(texto, String(chatId));
          await sendMessage(chatId, resposta);
        } catch (err: any) {
          console.error('Erro processando mensagem:', err.message);
          await sendMessage(chatId, `⚠️ Erro: ${err.message}`);
        }
      }
    } catch (err: any) {
      console.error('getUpdates erro:', err.message);
      await new Promise((r) => setTimeout(r, 3000));
    }
  }
}

main();
