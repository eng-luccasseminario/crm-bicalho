import { google } from 'googleapis';

function getCalendar() {
  const auth = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  );
  auth.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN });
  return google.calendar({ version: 'v3', auth });
}

export async function agendarReuniao(params: {
  titulo: string;
  clienteNome: string;
  data: string;
  horario: string;
  duracaoMinutos: number;
  emailCliente?: string;
  pauta?: string;
}) {
  const calendar = getCalendar();
  const inicio = new Date(`${params.data}T${params.horario}:00`);
  const fim = new Date(inicio.getTime() + params.duracaoMinutos * 60000);

  const event = await calendar.events.insert({
    calendarId: 'primary',
    conferenceDataVersion: 1,
    requestBody: {
      summary: `[${params.clienteNome}] ${params.titulo}`,
      description: params.pauta || '',
      start: { dateTime: inicio.toISOString(), timeZone: 'America/Sao_Paulo' },
      end: { dateTime: fim.toISOString(), timeZone: 'America/Sao_Paulo' },
      attendees: params.emailCliente ? [{ email: params.emailCliente }] : [],
      conferenceData: {
        createRequest: { requestId: `meet-${Date.now()}` },
      },
    },
  });

  return {
    id: event.data.id,
    meetLink: event.data.hangoutLink,
    link: event.data.htmlLink,
    inicio: inicio.toISOString(),
  };
}

export async function consultarAgenda(params: { dias?: number }) {
  const calendar = getCalendar();
  const agora = new Date();
  const fim = new Date(agora.getTime() + (params.dias || 7) * 24 * 60 * 60 * 1000);

  const res = await calendar.events.list({
    calendarId: 'primary',
    timeMin: agora.toISOString(),
    timeMax: fim.toISOString(),
    singleEvents: true,
    orderBy: 'startTime',
    maxResults: 20,
  });

  return (res.data.items || []).map((e) => ({
    titulo: e.summary,
    inicio: e.start?.dateTime,
    meetLink: e.hangoutLink,
    link: e.htmlLink,
  }));
}
