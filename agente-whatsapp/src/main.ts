import 'dotenv/config';

/**
 * Ponto de entrada único. Escolhe o canal pela variável de ambiente CANAL.
 * Cada módulo de canal se auto-inicia ao ser importado.
 *
 *   CANAL=telegram   → bot do Telegram (long-polling)          [padrão]
 *   CANAL=whatsapp   → WhatsApp Business Cloud API (Meta)       [webhook público]
 *   CANAL=evolution  → Evolution API / Baileys (legado, pausado)
 *
 * Trocar de canal em produção = setar CANAL no Railway + redeploy.
 */
const canal = (process.env.CANAL || 'telegram').toLowerCase();

console.log(`Iniciando agente no canal: ${canal}`);

switch (canal) {
  case 'whatsapp':
    import('./whatsapp-cloud');
    break;
  case 'evolution':
    import('./index');
    break;
  case 'telegram':
  default:
    import('./telegram');
    break;
}
