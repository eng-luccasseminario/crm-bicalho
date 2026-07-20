import 'dotenv/config';
import http from 'http';
import { google } from 'googleapis';

const PORT = 3999;
const REDIRECT = `http://localhost:${PORT}/oauth2callback`;

const oauth2 = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  REDIRECT,
);

const SCOPES = [
  'https://www.googleapis.com/auth/drive',
  'https://www.googleapis.com/auth/calendar',
];

const authUrl = oauth2.generateAuthUrl({
  access_type: 'offline',
  prompt: 'consent', // força retornar refresh_token
  scope: SCOPES,
});

console.log('\n================ AUTORIZAÇÃO GOOGLE ================');
console.log('1) Confirme no Google Cloud Console que a URL de redirect abaixo está autorizada:');
console.log('   ', REDIRECT);
console.log('2) Abra esta URL no navegador e autorize (Drive + Agenda):\n');
console.log(authUrl);
console.log('\nAguardando você autorizar...\n');

const server = http.createServer(async (req, res) => {
  if (!req.url || !req.url.startsWith('/oauth2callback')) {
    res.writeHead(404);
    res.end();
    return;
  }
  const code = new URL(req.url, REDIRECT).searchParams.get('code');
  const erro = new URL(req.url, REDIRECT).searchParams.get('error');
  if (erro) {
    console.error('Autorização negada:', erro);
    res.end('Autorização negada: ' + erro);
    return;
  }
  if (!code) {
    res.end('Sem código de autorização.');
    return;
  }
  try {
    const { tokens } = await oauth2.getToken(code);
    console.log('\n================ SUCESSO ================');
    console.log('GOOGLE_REFRESH_TOKEN=' + tokens.refresh_token);
    console.log('=========================================\n');
    res.end('Autorizado com sucesso! Pode fechar esta aba e voltar ao terminal.');
  } catch (e: any) {
    console.error('Erro ao trocar código por token:', e.message);
    res.end('Erro: ' + e.message);
  } finally {
    setTimeout(() => server.close(), 1500);
  }
});

server.listen(PORT, () => console.log(`Servidor local escutando em ${REDIRECT}`));
