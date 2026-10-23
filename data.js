/* ============================================================
   data.js — IDENTIDADE E CONTEÚDO DO EVENTO
   Jornada dos Graus Filosóficos do Rito Brasileiro
   Cuiabá – MT · sábado, 7 de novembro de 2026

   Este arquivo é a cópia EMBUTIDA da programação (reserva).
   Quando as URLs da planilha em SITE_CONFIG estiverem preenchidas,
   o site passa a ler a planilha do Google ao vivo e só usa este
   SCHEDULE se a planilha falhar.

   ATENÇÃO: repositório público — nunca coloque aqui link de convite
   de WhatsApp, telefone pessoal ou senha.
   ============================================================ */

const SITE_CONFIG = {
  siteUrl: 'https://viaveritasvita.github.io/rbcuiaba26/',
  shortUrl: 'https://viaveritasvita.github.io/rbcuiaba26/', // trocar pelo encurtador do QR quando existir

  /* Planilha do Google publicada em CSV (uma URL por aba).
     Enquanto começar com COLE_, o site ignora e usa os dados embutidos. */
  sheetProgramacaoCsvUrl: 'COLE_AQUI_A_URL_CSV_DA_ABA_PROGRAMACAO',
  sheetAvisosCsvUrl: 'COLE_AQUI_A_URL_CSV_DA_ABA_AVISOS',

  /* Feed .ics ao vivo (Apps Script → Implantar → URL /exec).
     Vazio = assinatura do Google Agenda usa o assets/agenda-rbcuiaba26.ics estático. */
  icsFeedUrl: '',

  /* OneSignal (push) — opcional; vazio = botão "Receber avisos" fica oculto */
  oneSignalAppId: '',
};

const EVENT_INFO = {
  bodies: '4ª Delegacia Litúrgica do Rito Brasileiro em Mato Grosso',
  city: 'Cuiabá – MT',
  /* Cuiabá (MT) não tem horário de verão: UTC-4 o ano inteiro */
  tz: 'America/Cuiaba',
  utcOffset: '-04:00',
  officialStart: '2026-11-07',
  openingISO: '2026-11-07T07:00:00-04:00',
  secretariatEmail: '',
  /* Sem telefone de emergência neste evento (botão oculto no programacao.html) */
  emergencyTel: '',
  emergencyDisplay: '',
};

/* ---------- LOCAIS (chave = valor da coluna "local" na planilha) ----------
   Sem coords, o botão do mapa busca por nome + endereço.
   coords = "lat,lng" copiado da URL do Google Maps, se quiser cravar o pino. */
const LOCATIONS = {
  complexo: {
    name: 'Complexo Maçônico da Loja Filhos de Nazaré',
    detail: 'Sessões, investidura, solenidade e refeições',
    address: 'Rua São João Del Rey, nº 36 – Jardim Mariana, Cuiabá – MT, 78040-640',
    coords: '',
  },
};

/* ---------- CORPOS / GRAUS (chave = valor da coluna "rito" na planilha) ----------
   Define a cor do cartão e o selo acima do título (cores da arte oficial).
   "geral" (sem selo) e "log" (logística: refeições) são reservados pelo motor. */
const BODIES = {
  capitulo:  { label: 'Ilustre e Sublime Capítulo · Graus 4 ao 18', color: '#8a3a4a' },
  conselho:  { label: 'Poderoso Grande Conselho · Graus 19 ao 30', color: '#4f6358' },
  colegio:   { label: 'Colendo Alto Colégio · Graus 31 e 32', color: '#4f6273' },
  grau33:    { label: 'Investidura no Grau 33', color: '#a87a32' },
  fundacao:  { label: 'Solenidade Histórica de Fundação', color: '#581828' },
  geral:     { label: '', color: '#7a6a5a' },
  log:       { label: '', color: '#9a8f82' },
};

/* ---------- PROGRAMAÇÃO ----------
   start/end em HH:MM (hora local). end vazio = horário aberto.
   kind: meal | coffee | social | transfer | hotel | pickup (ícone).
   restriction = tarja âmbar; note = observação neutra.
   Nas notas: \n quebra linha, "- " no início vira item de lista, **x** vira negrito.
   Os textos ficam em {pt} porque o motor lê s.t.pt / s.note.pt. */
const REFEICAO_NOTA = '**Ágape:** garanta o seu na página Ágape deste site.';

const SCHEDULE = [
  {
    date: '2026-11-07',
    weekday: 'sat',
    official: true,
    sessions: [
      /* ---------- MANHÃ · ILUSTRE E SUBLIME CAPÍTULO ---------- */
      {
        id: 'm-01', start: '07:00', end: '07:40', loc: 'complexo', body: 'log', kind: 'coffee',
        t: { pt: 'Café da manhã e recepção' },
        note: { pt: REFEICAO_NOTA },
      },
      {
        id: 'm-02', start: '07:40', end: '08:00', loc: 'complexo', body: 'geral',
        t: { pt: 'Orientações e preparação' },
      },
      {
        id: 'm-03', start: '08:00', end: '08:15', loc: 'complexo', body: 'capitulo',
        t: { pt: 'Abertura dos trabalhos' },
      },
      {
        id: 'm-04', start: '08:15', end: '09:25', loc: 'complexo', body: 'capitulo',
        t: { pt: 'Grau 4 · Mestre da Discrição' },
      },
      {
        id: 'm-05', start: '09:25', end: '09:45', loc: 'complexo', body: 'capitulo',
        t: { pt: 'Grau 9 · Mestre da Justiça' },
      },
      {
        id: 'm-06', start: '09:45', end: '10:05', loc: 'complexo', body: 'capitulo',
        t: { pt: 'Grau 14 · Mestre da Perseverança' },
      },
      {
        id: 'm-07', start: '10:05', end: '10:25', loc: 'complexo', body: 'capitulo',
        t: { pt: 'Grau 15 · Cavaleiro da Liberdade' },
      },
      {
        id: 'm-08', start: '10:25', end: '10:45', loc: 'complexo', body: 'geral',
        t: { pt: 'Intervalo e preparação' },
      },
      {
        id: 'm-09', start: '10:45', end: '12:15', loc: 'complexo', body: 'capitulo',
        t: { pt: 'Grau 18 · Cavaleiro Rosa-Cruz' },
      },
      {
        id: 'm-10', start: '12:15', end: '12:30', loc: 'complexo', body: 'capitulo',
        t: { pt: 'Encerramento dos trabalhos' },
      },
      {
        id: 'm-11', start: '12:30', end: '13:30', loc: 'complexo', body: 'log', kind: 'meal',
        t: { pt: 'Almoço' },
        note: { pt: 'Cardápio de culinária cuiabana.\n' + REFEICAO_NOTA },
      },

      /* ---------- TARDE · PODEROSO GRANDE CONSELHO ---------- */
      {
        id: 't-01', start: '13:30', end: '13:40', loc: 'complexo', body: 'conselho',
        t: { pt: 'Abertura dos trabalhos' },
      },
      {
        id: 't-02', start: '13:40', end: '14:35', loc: 'complexo', body: 'conselho',
        t: { pt: 'Grau 19 · Missionário da Agricultura e da Pecuária' },
      },
      {
        id: 't-03', start: '14:35', end: '14:50', loc: 'complexo', body: 'conselho',
        t: { pt: 'Grau 22 · Missionário da Economia' },
      },
      {
        id: 't-04', start: '14:50', end: '15:05', loc: 'complexo', body: 'conselho',
        t: { pt: 'Grau 26 · Missionário da Paz' },
      },
      {
        id: 't-05', start: '15:05', end: '15:20', loc: 'complexo', body: 'conselho',
        t: { pt: 'Grau 29 · Missionário da Religião' },
      },
      {
        id: 't-06', start: '15:20', end: '15:35', loc: 'complexo', body: 'geral',
        t: { pt: 'Intervalo e preparação' },
      },
      {
        id: 't-07', start: '15:35', end: '16:45', loc: 'complexo', body: 'conselho',
        t: { pt: 'Grau 30 · Missionário da Filosofia' },
      },
      {
        id: 't-08', start: '16:45', end: '17:00', loc: 'complexo', body: 'conselho',
        t: { pt: 'Encerramento dos trabalhos' },
      },

      /* ---------- NOITE · COLENDO ALTO COLÉGIO ---------- */
      {
        id: 'n-01', start: '17:00', end: '17:15', loc: 'complexo', body: 'colegio',
        t: { pt: 'Abertura dos trabalhos' },
      },
      {
        id: 'n-02', start: '17:15', end: '17:40', loc: 'complexo', body: 'colegio',
        t: { pt: 'Grau 31 · Guardião do Bem Público' },
      },
      {
        id: 'n-03', start: '17:40', end: '18:05', loc: 'complexo', body: 'colegio',
        t: { pt: 'Grau 32 · Guardião do Civismo' },
      },
      {
        id: 'n-04', start: '18:05', end: '18:30', loc: 'complexo', body: 'colegio',
        t: { pt: 'Preparação para a Investidura' },
      },

      /* ---------- INVESTIDURA NO GRAU 33 ---------- */
      {
        id: 'g-01', start: '18:30', end: '20:00', loc: 'complexo', body: 'grau33',
        t: { pt: 'Grau 33 · Servidor da Ordem, da Pátria e da Humanidade' },
        note: { pt: 'Início da Investidura às 18h30 · encerramento às 20h00.' },
      },

      /* ---------- SOLENIDADE HISTÓRICA DE FUNDAÇÃO ---------- */
      {
        id: 'f-01', start: '20:00', end: '20:35', loc: 'complexo', body: 'fundacao',
        t: { pt: 'Solenidade Histórica de Fundação' },
        note: { pt: 'Instalação dos três Corpos Filosóficos que integrarão a estrutura da 4ª Delegacia Litúrgica de Mato Grosso, responsáveis pelo desenvolvimento e pela administração dos Graus 4º ao 32º:\n- **Ilustre e Sublime Capítulo Virtude e Perfeição nº 155** · Graus 4º ao 18º\n- **Poderoso Grande Conselho Generoso Ponce nº 198** · Graus 19º ao 30º\n- **Colendo Alto Colégio Lenine Póvoas nº 261** · Graus 31º e 32º' },
      },
      {
        id: 'f-02', start: '20:35', end: '22:00', loc: 'complexo', body: 'log', kind: 'meal',
        t: { pt: 'Jantar comemorativo' },
        note: { pt: REFEICAO_NOTA },
      },
      {
        id: 'f-03', start: '22:00', end: null, loc: 'complexo', body: 'geral',
        t: { pt: 'Encerramento previsto' },
      },
    ],
  },
];
