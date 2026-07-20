import 'dotenv/config';
import express from 'express';
import { processarMensagem } from './ai.service';

const app = express();
app.use(express.json());

// Webhook recebe mensagens da Evolution API
app.post('/webhook', async (req, res) => {
  try {
    const { data } = req.body;

    // Ignorar mensagens que não são de texto ou que são do próprio bot
    if (!data?.message?.conversation || data?.key?.fromMe) {
      return res.sendStatus(200);
    }

    const mensagem = data.message.conversation as string;
    const numeroRemetente = data.key.remoteJid as string;

    console.log(`[${new Date().toISOString()}] Mensagem de ${numeroRemetente}: ${mensagem}`);

    // Processar com Claude
    const resposta = await processarMensagem(mensagem);

    // Enviar resposta pelo WhatsApp via Evolution API
    await enviarMensagem(numeroRemetente, resposta);

    res.sendStatus(200);
  } catch (err: any) {
    console.error('Erro no webhook:', err.message);
    res.sendStatus(500);
  }
});

async function enviarMensagem(numero: string, texto: string) {
  const { default: axios } = await import('axios');
  await axios.post(
    `${process.env.EVOLUTION_API_URL}/message/sendText/${process.env.EVOLUTION_INSTANCE}`,
    { number: numero, text: texto },
    { headers: { apikey: process.env.EVOLUTION_API_KEY } }
  );
}

// Health check
app.get('/health', (_req, res) => res.json({ status: 'ok', timestamp: new Date().toISOString() }));

const PORT = process.env.PORT || 3002;
app.listen(PORT, () => console.log(`Agente rodando na porta ${PORT}`));
