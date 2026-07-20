#!/usr/bin/env node
/**
 * Conector Total — CRM Bicalho
 * ----------------------------------------------------------------------------
 * Assistente de linha de comando que conecta TODAS as APIs do sistema de forma
 * guiada: pergunta cada credencial, valida na hora, roda o OAuth do Google,
 * escreve o .env e (opcional) sobe as variáveis + deploy no Railway.
 *
 * Uso:   node setup/conectar.mjs
 *        (ou, de dentro de agente-whatsapp/:  npm run conectar)
 *
 * Não tem dependências externas — usa só Node puro (>= 18, precisa de fetch global).
 */
import http from 'node:http';
import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { spawn } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ENV_PATH = join(__dirname, '..', 'agente-whatsapp', '.env');

const c = {
  reset: '\x1b[0m', bold: '\x1b[1m', green: '\x1b[32m', red: '\x1b[31m',
  yellow: '\x1b[33m', cyan: '\x1b[36m', gray: '\x1b[90m',
};
const ok = (m) => console.log(`${c.green}✓${c.reset} ${m}`);
const fail = (m) => console.log(`${c.red}✗${c.reset} ${m}`);
const info = (m) => console.log(`${c.cyan}ℹ${c.reset} ${m}`);
const title = (m) => console.log(`\n${c.bold}${c.cyan}━━ ${m} ━━${c.reset}`);

const rl = createInterface({ input: stdin, output: stdout });
const ask = async (q, def = '') => {
  const suffix = def ? ` ${c.gray}[${def}]${c.reset}` : '';
  const a = (await rl.question(`${q}${suffix}: `)).trim();
  return a || def;
};
const askYN = async (q, def = 's') => {
  const a = (await ask(`${q} (s/n)`, def)).toLowerCase();
  return a.startsWith('s') || a === 'y';
};

// ---- .env I/O ---------------------------------------------------------------
function lerEnv() {
  const env = {};
  if (existsSync(ENV_PATH)) {
    for (const linha of readFileSync(ENV_PATH, 'utf8').split(/\r?\n/)) {
      const m = linha.match(/^([A-Z0-9_]+)=(.*)$/);
      if (m) env[m[1]] = m[2];
    }
  }
  return env;
}
function escreverEnv(env) {
  const ORDEM = [
    'CANAL', 'OPENAI_API_KEY', 'OPENAI_MODEL', 'TWENTY_API_URL', 'TWENTY_API_KEY',
    'GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'GOOGLE_REDIRECT_URI', 'GOOGLE_REFRESH_TOKEN',
    'TELEGRAM_BOT_TOKEN', 'TELEGRAM_ALLOWED_CHAT_IDS',
    'WHATSAPP_TOKEN', 'WHATSAPP_PHONE_NUMBER_ID', 'WHATSAPP_VERIFY_TOKEN', 'WHATSAPP_ALLOWED',
    'EVOLUTION_API_URL', 'EVOLUTION_API_KEY', 'EVOLUTION_INSTANCE', 'PORT',
  ];
  const linhas = ORDEM.filter((k) => env[k] !== undefined && env[k] !== '')
    .map((k) => `${k}=${env[k]}`);
  writeFileSync(ENV_PATH, linhas.join('\n') + '\n', 'utf8');
  ok(`.env gravado em ${ENV_PATH}`);
}

// ---- Validações -------------------------------------------------------------
async function validarOpenAI(key) {
  try {
    const r = await fetch('https://api.openai.com/v1/models', {
      headers: { Authorization: `Bearer ${key}` },
    });
    return r.ok;
  } catch { return false; }
}
async function validarTwenty(url, key) {
  try {
    const r = await fetch(`${url.replace(/\/$/, '')}/graphql`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify({ query: '{ __typename }' }),
    });
    return r.status === 200;
  } catch { return false; }
}
async function validarTelegram(token) {
  try {
    const r = await fetch(`https://api.telegram.org/bot${token}/getMe`);
    const j = await r.json();
    return j.ok ? j.result.username : false;
  } catch { return false; }
}

// ---- Google OAuth (sem dependências, via HTTP puro) -------------------------
async function googleOAuth(clientId, clientSecret) {
  const REDIRECT = 'http://localhost:3999/oauth2callback';
  const scope = encodeURIComponent(
    'https://www.googleapis.com/auth/drive https://www.googleapis.com/auth/calendar'
  );
  const authUrl =
    `https://accounts.google.com/o/oauth2/v2/auth?access_type=offline&prompt=consent` +
    `&response_type=code&client_id=${encodeURIComponent(clientId)}` +
    `&redirect_uri=${encodeURIComponent(REDIRECT)}&scope=${scope}`;

  info(`Confirme no Google Cloud Console que este redirect está autorizado: ${REDIRECT}`);
  console.log(`\n${c.bold}Abra este link no navegador e autorize (Drive + Agenda):${c.reset}\n${authUrl}\n`);
  abrirNavegador(authUrl);

  const code = await new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      if (!req.url?.startsWith('/oauth2callback')) { res.writeHead(404); return res.end(); }
      const u = new URL(req.url, REDIRECT);
      const cod = u.searchParams.get('code');
      res.end('Autorizado! Pode fechar esta aba e voltar ao terminal.');
      setTimeout(() => server.close(), 500);
      resolve(cod);
    });
    server.listen(3999, () => info('Aguardando você autorizar no navegador...'));
  });
  if (!code) return null;

  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code, client_id: clientId, client_secret: clientSecret,
      redirect_uri: REDIRECT, grant_type: 'authorization_code',
    }),
  });
  const j = await r.json();
  return j.refresh_token || null;
}

function abrirNavegador(url) {
  const cmd = process.platform === 'win32' ? 'cmd' : process.platform === 'darwin' ? 'open' : 'xdg-open';
  const args = process.platform === 'win32' ? ['/c', 'start', '', url] : [url];
  try { spawn(cmd, args, { detached: true, stdio: 'ignore' }).unref(); } catch { /* abre manual */ }
}

function run(cmd, args, cwd) {
  return new Promise((resolve) => {
    const p = spawn(cmd, args, { cwd, stdio: 'inherit', shell: process.platform === 'win32' });
    p.on('close', (code) => resolve(code));
    p.on('error', () => resolve(1));
  });
}

// ---- Fluxo principal --------------------------------------------------------
async function main() {
  console.log(`${c.bold}${c.cyan}
╔════════════════════════════════════════════════╗
║        CONECTOR TOTAL · CRM Bicalho             ║
║   Conecta todas as APIs do sistema, guiado.     ║
╚════════════════════════════════════════════════╝${c.reset}`);
  info('Enter mantém o valor atual entre colchetes. Ctrl+C cancela a qualquer momento.\n');

  const env = lerEnv();
  env.OPENAI_MODEL ||= 'gpt-4o';
  env.GOOGLE_REDIRECT_URI ||= 'http://localhost:3999/oauth2callback';
  env.EVOLUTION_INSTANCE ||= 'seminario';
  env.PORT ||= '3002';

  // 1) Canal
  title('1/6 · Canal de conversa');
  info('telegram = simples, sem domínio | whatsapp = oficial Meta, exige webhook público');
  env.CANAL = (await ask('Canal ativo (telegram/whatsapp)', env.CANAL || 'telegram')).toLowerCase();

  // 2) OpenAI
  title('2/6 · OpenAI (cérebro: GPT-4o + Whisper)');
  info('Crie a chave em https://platform.openai.com/api-keys');
  while (true) {
    env.OPENAI_API_KEY = await ask('OPENAI_API_KEY', env.OPENAI_API_KEY);
    process.stdout.write('  validando... ');
    if (await validarOpenAI(env.OPENAI_API_KEY)) { ok('chave OpenAI válida'); break; }
    fail('chave inválida — tente de novo');
  }
  env.OPENAI_MODEL = await ask('OPENAI_MODEL', env.OPENAI_MODEL);

  // 3) Twenty
  title('3/6 · Twenty CRM');
  info('API Key: dentro do Twenty > Settings > APIs & Webhooks > gerar API Key');
  while (true) {
    env.TWENTY_API_URL = await ask('TWENTY_API_URL', env.TWENTY_API_URL);
    env.TWENTY_API_KEY = await ask('TWENTY_API_KEY', env.TWENTY_API_KEY);
    process.stdout.write('  validando... ');
    if (await validarTwenty(env.TWENTY_API_URL, env.TWENTY_API_KEY)) { ok('Twenty respondendo'); break; }
    fail('não consegui autenticar no Twenty — confira URL e chave');
    if (!(await askYN('Tentar de novo?'))) break;
  }

  // 4) Google
  title('4/6 · Google (Drive = CDE + Calendar = reuniões)');
  info('OAuth Client (Web) em console.cloud.google.com > APIs & Services > Credentials');
  env.GOOGLE_CLIENT_ID = await ask('GOOGLE_CLIENT_ID', env.GOOGLE_CLIENT_ID);
  env.GOOGLE_CLIENT_SECRET = await ask('GOOGLE_CLIENT_SECRET', env.GOOGLE_CLIENT_SECRET);
  if (env.GOOGLE_REFRESH_TOKEN && !(await askYN('Já existe um refresh token. Gerar um novo?', 'n'))) {
    ok('mantendo refresh token atual');
  } else {
    const token = await googleOAuth(env.GOOGLE_CLIENT_ID, env.GOOGLE_CLIENT_SECRET);
    if (token) { env.GOOGLE_REFRESH_TOKEN = token; ok('refresh token do Google gerado'); }
    else fail('não consegui gerar o refresh token (você pode rodar de novo depois)');
  }

  // 5) Canal — credenciais específicas
  if (env.CANAL === 'whatsapp') {
    title('5/6 · WhatsApp Business Cloud API (Meta)');
    info('Config em developers.facebook.com — ver docs/ATIVAR-WHATSAPP.md');
    env.WHATSAPP_TOKEN = await ask('WHATSAPP_TOKEN (token permanente)', env.WHATSAPP_TOKEN);
    env.WHATSAPP_PHONE_NUMBER_ID = await ask('WHATSAPP_PHONE_NUMBER_ID', env.WHATSAPP_PHONE_NUMBER_ID);
    env.WHATSAPP_VERIFY_TOKEN = await ask('WHATSAPP_VERIFY_TOKEN (você inventa)', env.WHATSAPP_VERIFY_TOKEN || 'crm-bicalho-verify');
    env.WHATSAPP_ALLOWED = await ask('WHATSAPP_ALLOWED (números, opcional)', env.WHATSAPP_ALLOWED);
  } else {
    title('5/6 · Telegram');
    info('Crie o bot com o @BotFather e cole o token');
    while (true) {
      env.TELEGRAM_BOT_TOKEN = await ask('TELEGRAM_BOT_TOKEN', env.TELEGRAM_BOT_TOKEN);
      process.stdout.write('  validando... ');
      const u = await validarTelegram(env.TELEGRAM_BOT_TOKEN);
      if (u) { ok(`bot @${u} válido`); break; }
      fail('token inválido');
      if (!(await askYN('Tentar de novo?'))) break;
    }
    env.TELEGRAM_ALLOWED_CHAT_IDS = await ask('TELEGRAM_ALLOWED_CHAT_IDS (opcional)', env.TELEGRAM_ALLOWED_CHAT_IDS);
  }

  escreverEnv(env);

  // 6) Railway (opcional)
  title('6/6 · Deploy no Railway (opcional)');
  info('Requer Railway CLI logado (railway login) e projeto vinculado (railway link).');
  if (await askYN('Subir as variáveis para o Railway e fazer deploy agora?', 'n')) {
    const cwd = join(__dirname, '..', 'agente-whatsapp');
    const sets = [];
    for (const k of Object.keys(env)) if (env[k]) { sets.push('--set', `${k}=${env[k]}`); }
    info('Enviando variáveis...');
    await run('railway', ['variables', ...sets], cwd);
    info('Fazendo deploy...');
    await run('railway', ['up', '-d'], cwd);
    ok('deploy disparado — acompanhe com: railway logs');
  } else {
    info('Pulei o Railway. Quando quiser: cd agente-whatsapp && railway up -d');
  }

  console.log(`\n${c.green}${c.bold}✓ Conexão concluída!${c.reset} Canal ativo: ${c.bold}${env.CANAL}${c.reset}`);
  rl.close();
}

main().catch((e) => { fail(e.message); rl.close(); process.exit(1); });
