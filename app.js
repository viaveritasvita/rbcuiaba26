/* ============================================================
   app.js — MOTOR DA APLICAÇÃO
   Idiomas · Agora/A seguir · Abas · Roteiro · .ics · Avisos
   OneSignal · PWA · Compartilhar
   ============================================================ */
(function () {
  'use strict';

  /* ---------- chaves de armazenamento local ---------- */
  const LS = {
    lang: 'rbcuiaba26.lang',
    favs: 'rbcuiaba26.favs',
    notices: 'rbcuiaba26.noticesSeen',
  };

  const $ = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));

  /* ============================================================
     TEMPO — todas as sessões viram timestamps absolutos (UTC-3)
     ============================================================ */
  const OFFSET = EVENT_INFO.utcOffset; // '-03:00'
  const ts = (date, hm) => Date.parse(`${date}T${hm}:00${OFFSET}`);

  /* ---------- FONTE DOS DADOS EM USO ----------
     SCHED nasce com o SCHEDULE embutido (data.js) e é SUBSTITUÍDA pela
     planilha do Google (CSV publicado) quando as URLs em SITE_CONFIG
     estiverem preenchidas e o download/parse funcionarem (ver seção
     "PLANILHA DO GOOGLE" adiante). Qualquer falha → dados embutidos:
     o site nunca quebra por causa da planilha. */
  let SCHED = SCHEDULE;
  let SHEET_NOTICES = null; // avisos vindos da planilha (null = usar avisos.json)

  /* Lista plana de sessões com timestamps precomputados — recalculada
     se a planilha substituir a grade embutida */
  let FLAT = [];
  let LAST_END = 0;
  let EVENT_WINDOW_START = 0;
  function rebuildDerived() {
    FLAT = [];
    SCHED.forEach((day) => {
      day.sessions.forEach((s) => {
        const startTs = ts(day.date, s.start);
        // Sessões de horário aberto contam 30 min para o estado "em curso"
        const endTs = s.end ? ts(day.date, s.end) : startTs + 30 * 60000;
        FLAT.push(Object.assign({ date: day.date, weekday: day.weekday, startTs, endTs }, s));
      });
    });
    FLAT.sort((a, b) => a.startTs - b.startTs);
    LAST_END = FLAT[FLAT.length - 1].endTs;
    EVENT_WINDOW_START = ts(SCHED[0].date, '00:00'); // véspera abre a janela
  }
  rebuildDerived();

  const OPENING_TS = Date.parse(EVENT_INFO.openingISO);

  /* ---------- MODO DEMONSTRAÇÃO (?demo=1 ou #demo) ----------
     Pré-visualização, fora do período do evento, do cartão
     "Agora / A seguir" e da tarja de aviso, com dados REAIS da
     grade: o relógio do cartão finge estar na quinta 27/08 às
     10h20 (Apresentação em curso; a seguir, a cerimônia OSM) e
     avança em tempo real, então as contagens correm de verdade.
     Sem o parâmetro, nada muda para o público. */
  const DEMO = /[?&]demo=1(&|$)/.test(location.search) || location.hash === '#demo';
  const DEMO_NOW_BASE = ts('2026-08-27', '10:20');
  const DEMO_LOADED = Date.now();
  const demoNow = () => DEMO_NOW_BASE + (Date.now() - DEMO_LOADED);

  /* Data de "hoje" no fuso de São Paulo (YYYY-MM-DD) */
  function todaySP() {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: EVENT_INFO.tz, year: 'numeric', month: '2-digit', day: '2-digit',
    }).format(new Date());
  }

  /* ============================================================
     ESTADO
     ============================================================ */
  let lang = detectLang();
  let activeDay = defaultDay();
  let favs = loadFavs();
  let deferredInstall = null;
  let pushState = 'idle'; // 'idle' | 'on' | 'blocked' — estado refletido no botão "Receber avisos"

  function detectLang() {
    // Evento monolíngue: com um único idioma no i18n.js, ele vale para todos
    const available = Object.keys(I18N);
    if (available.length === 1) return available[0];
    const saved = localStorage.getItem(LS.lang);
    if (saved && I18N[saved]) return saved;
    const nav = (navigator.language || 'pt').slice(0, 2).toLowerCase();
    if (I18N[nav]) return nav;          // pt / fr / en diretos
    if (nav === 'es') return 'pt';      // vizinhos hispanófonos leem melhor o PT
    return 'en';                        // padrão internacional
  }

  function defaultDay() {
    const today = todaySP();
    const idx = SCHED.findIndex((d) => d.date === today);
    if (idx >= 0) return idx;
    // Antes do evento: abre no primeiro dia oficial; depois: no último dia
    if (Date.now() > LAST_END) return SCHED.length - 1;
    const firstOfficial = SCHED.findIndex((d) => d.official);
    return firstOfficial >= 0 ? firstOfficial : 0;
  }

  function loadFavs() {
    try { return new Set(JSON.parse(localStorage.getItem(LS.favs) || '[]')); }
    catch (e) { return new Set(); }
  }
  function saveFavs() { localStorage.setItem(LS.favs, JSON.stringify([...favs])); }

  const t = (key) => (I18N[lang] && I18N[lang][key]) || I18N.pt[key] || key;

  /* ============================================================
     UTILITÁRIOS DE RENDERIZAÇÃO
     ============================================================ */
  const esc = (str) => String(str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  /* e-mails viram mailto: */
  function linkify(text) {
    return esc(text).replace(
      /([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/g,
      '<a class="mail-link" href="mailto:$1">$1</a>'
    );
  }

  /* Notas e restrições com estrutura leve: quebras de linha viram
     parágrafos, linhas iniciadas por "- " viram itens de lista e
     **texto** vira negrito. Sem markup → parágrafo simples. */
  function richText(text) {
    const inline = (str) => linkify(str).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    const lines = String(text).split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    let html = '', items = [];
    const flush = () => { if (items.length) { html += `<ul class="note-list">${items.map((i) => `<li>${inline(i)}</li>`).join('')}</ul>`; items = []; } };
    lines.forEach((l) => {
      if (/^[-•]\s+/.test(l)) items.push(l.replace(/^[-•]\s+/, ''));
      else { flush(); html += `<p>${inline(l)}</p>`; }
    });
    flush();
    return html;
  }

  function mapUrl(locKey) {
    const loc = LOCATIONS[locKey];
    if (!loc) return null;
    // Coordenadas exatas cravam o pino (abre o app do Maps no celular, Maps web no desktop).
    // Sem coords, cai na busca por nome + endereço.
    const q = loc.coords || (loc.name + ', ' + loc.address);
    return 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(q);
  }

  /* ---------- Google Agenda (link pré-preenchido) ----------
     Datas em horário LOCAL (YYYYMMDDTHHMMSS, sem Z) combinadas com
     &ctz=America/Sao_Paulo. Sem horário de fim: +1h, espelhando o
     DTEND que o .ics já usa (buildICS). */
  const OFFSET_MS = (() => {
    const m = /^([+-])(\d{2}):(\d{2})$/.exec(OFFSET);
    return (m[1] === '-' ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3])) * 60000;
  })();
  function gcalDate(msTs) {
    const d = new Date(msTs + OFFSET_MS); // desloca p/ fuso do evento e lê como UTC
    const p = (n) => String(n).padStart(2, '0');
    return `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}T${p(d.getUTCHours())}${p(d.getUTCMinutes())}00`;
  }
  function gcalUrl(s) {
    const endTs = s.end ? s.endTs : s.startTs + 60 * 60000; // mesma regra do .ics
    const loc = s.loc ? `${LOCATIONS[s.loc].name}, ${LOCATIONS[s.loc].address}` : '';
    const details = `${EVENT_INFO.bodies} · ${EVENT_INFO.city}` +
      (s.loc ? ` · ${LOCATIONS[s.loc].name}` : '') + `\n${SITE_CONFIG.shortUrl}`;
    return 'https://www.google.com/calendar/render?action=TEMPLATE'
      + '&text=' + encodeURIComponent(s.t[lang] || s.t.pt)
      + '&dates=' + gcalDate(s.startTs) + '/' + gcalDate(endTs)
      + '&ctz=' + encodeURIComponent(EVENT_INFO.tz)
      + (loc ? '&location=' + encodeURIComponent(loc) : '')
      + '&details=' + encodeURIComponent(details);
  }

  const ICONS = {
    pin: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 1.5A4.6 4.6 0 0 0 3.4 6.1c0 3.3 4.1 8 4.6 8.4.5-.4 4.6-5.1 4.6-8.4A4.6 4.6 0 0 0 8 1.5zm0 6.4a1.9 1.9 0 1 1 0-3.8 1.9 1.9 0 0 1 0 3.8z"/></svg>',
    cal: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4.5 1.2v1.5h7V1.2h1.4v1.5h1.3c.5 0 .8.4.8.8v10.2c0 .5-.3.8-.8.8H1.8a.8.8 0 0 1-.8-.8V3.5c0-.4.3-.8.8-.8h1.3V1.2h1.4zM2.4 6v7.1h11.2V6H2.4z"/></svg>',
    star: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 1.6l1.9 3.9 4.3.6-3.1 3 .7 4.3L8 11.4l-3.8 2 .7-4.3-3.1-3 4.3-.6L8 1.6z"/></svg>',
    lock: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 1.6a3.4 3.4 0 0 0-3.4 3.4v1.6H3.5c-.5 0-.8.4-.8.8v6c0 .5.3.9.8.9h9c.5 0 .8-.4.8-.9v-6c0-.4-.3-.8-.8-.8h-1.1V5A3.4 3.4 0 0 0 8 1.6zm-2 5V5a2 2 0 1 1 4 0v1.6H6z"/></svg>',
    bell: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 1.3c.5 0 .9.4.9.9v.5a4.5 4.5 0 0 1 3.6 4.4v2.6l1.2 2a.7.7 0 0 1-.6 1H2.9a.7.7 0 0 1-.6-1l1.2-2V7.1a4.5 4.5 0 0 1 3.6-4.4v-.5c0-.5.4-.9.9-.9zm-1.6 12h3.2a1.6 1.6 0 0 1-3.2 0z"/></svg>',
    phone: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3.7 1.8c.4-.4 1-.4 1.4 0l1.7 1.7c.4.4.4 1 0 1.4l-.9.9c.5 1.1 2.2 2.8 3.3 3.3l.9-.9c.4-.4 1-.4 1.4 0l1.7 1.7c.4.4.4 1 0 1.4l-1 1c-.6.6-1.6.8-2.5.4-3-1.2-6.2-4.4-7.4-7.4-.4-.9-.2-1.9.4-2.5l1-1z"/></svg>',
    share: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M11.5 5.4a2.2 2.2 0 1 0-2.1-2.9L5.6 4.6a2.2 2.2 0 1 0 0 3.3l3.8 2.1a2.2 2.2 0 1 0 .6-1.2L6.3 6.8a2.3 2.3 0 0 0 0-1l3.7-2a2.2 2.2 0 0 0 1.5 1.6z"/></svg>',
    download: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 1.5c.4 0 .8.3.8.8v6l2-2 1 1L8 11.1 4.2 7.3l1-1 2 2v-6c0-.5.4-.8.8-.8zM2.5 12.5h11V14h-11v-1.5z"/></svg>',
    whatsapp: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 1.4A6.6 6.6 0 0 0 2.3 11l-.9 3.4 3.5-.9A6.6 6.6 0 1 0 8 1.4zm3.5 9.2c-.2.5-1 .9-1.4.9-.4.1-.8.1-1.3-.1a10 10 0 0 1-2.1-1A8.2 8.2 0 0 1 4.4 8c-.3-.6-.5-1.2-.4-1.8.1-.5.4-.9.7-1.1.2-.2.5-.2.7-.1l.5 1.1c.1.2.1.4 0 .6l-.4.5c-.1.2-.1.3 0 .5.2.4.7 1 1.2 1.4.5.4 1 .7 1.5.9.2.1.3 0 .4-.1l.5-.6c.2-.2.4-.2.6-.1l1.2.6c.2.1.3.3.2.6z"/></svg>',
    install: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 1.2c.4 0 .8.3.8.8v6.5l2.3-2.3 1 1L8 11.3 3.9 7.2l1-1 2.3 2.3V2c0-.5.4-.8.8-.8zM2 12h12v1.5H2V12z"/></svg>',
  };

  /* Símbolos monoline (nunca emoji) para itens de logística/sociais —
     desenhados em traço, herdam a cor via currentColor. */
  const KIND_ICONS = {
    meal: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 3v5a2.5 2.5 0 0 0 5 0V3"/><path d="M7.5 3v18"/><path d="M17.2 3c-1.9 1.6-2.9 3.9-2.9 6.2 0 1.9 1.2 3.2 2.9 3.2V21"/></svg>',
    hotel: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6v12"/><path d="M3 14h18v4"/><path d="M11 10h6a4 4 0 0 1 4 4"/><circle cx="6.8" cy="11" r="1.6"/></svg>',
    coffee: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 9.5h11V15a4 4 0 0 1-4 4H9a4 4 0 0 1-4-4V9.5z"/><path d="M16 10.5h1.6a2.4 2.4 0 0 1 0 4.8H16"/><path d="M8.2 6.4c0-1 .9-1.3.9-2.4M11.8 6.4c0-1 .9-1.3.9-2.4"/></svg>',
    transfer: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 8a1 1 0 0 1 1-1h11.6l3.2 1.2 2.9 3.1a1 1 0 0 1 .3.7v3.5a.5.5 0 0 1-.5.5h-1.6"/><path d="M2 8v7.5a.5.5 0 0 0 .5.5h2"/><path d="M8.8 16h6.4"/><circle cx="6.7" cy="16.4" r="1.9"/><circle cx="17.3" cy="16.4" r="1.9"/><path d="M14 7.2V11h6.6"/></svg>',
    pickup: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="8.5" cy="7.2" r="2.7"/><path d="M3.4 19.2c0-3.4 2.2-5.6 5.1-5.6s5.1 2.2 5.1 5.6"/><circle cx="16.6" cy="8.4" r="2.1"/><path d="M15.4 14.1c2.9.3 4.8 2.4 4.8 5.1"/></svg>',
    social: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 3h8l-1.2 6.8a3 3 0 0 1-2.8 2.5A3 3 0 0 1 9.2 9.8L8 3z"/><path d="M12 12.5V20"/><path d="M8.8 20h6.4"/></svg>',
  };

  /* ============================================================
     RENDERIZAÇÃO PRINCIPAL
     ============================================================ */
  function renderAll() {
    document.documentElement.lang = lang === 'pt' ? 'pt-BR' : lang;
    document.title = t('docTitle');
    renderStaticTexts();
    renderLangSwitch();
    renderLegend();
    renderTabs();
    renderSchedule();
    renderLocations();
    updateNowCard();
    if (installModalMode) renderInstallModal(); // modal aberto acompanha o idioma
    if (DEMO) renderDemoNotice();
  }

  function renderStaticTexts() {
    /* Título com a ÚLTIMA palavra em dourado (Oficial / Officiel /
       Programme): string própria do i18n.js — innerHTML seguro aqui. */
    $('#programTitle').innerHTML = t('programTitle')
      .replace(/(\S+)\s*$/, '<span class="title-accent">$1</span>');
    $('#datesPlaque').textContent = t('datesPlaque');
    // O lema saiu do cabeçalho (layout compacto) e vive apenas no rodapé
    $('#footerMotto1').textContent = t('motto1');
    $('#footerMotto2').textContent = t('motto2');
    $('#footerNote').textContent = t('footerNote');
    $('#brandTagline').textContent = t('brandTagline');
    $('#locationsTitle').textContent = t('locationsTitle');
    $('#locationsSub').textContent = t('locationsSub');
    $('#contactTitle').textContent = t('contactTitle');
    $('#emgLabel').textContent = t('emergencyLabel');
    $('#emgLabelFoot').textContent = t('emergencyLabel');
    $('#regEmailLabel').textContent = t('registrationEmailLabel');
    $('#emergencyFab').setAttribute('aria-label', t('emergencyAria') + ' ' + EVENT_INFO.emergencyDisplay);
    $('#fabLabel').textContent = t('emergencyLabel');

    // Barra de ações (o rótulo do push acompanha o estado atual)
    $('#btnPush .btn-label').textContent =
      t(pushState === 'on' ? 'pushGranted' : pushState === 'blocked' ? 'pushDenied' : 'pushBtn');
    $('#btnInstall .btn-label').textContent = t('installBtn');
    // Agenda completa: Google Agenda (assinatura) · Baixar (.ics)
    $('#gcalAll .btn-label').textContent = t('gcalBtn');
    $('#gcalAll').setAttribute('aria-label', t('gcalBtn') + ' — ' + t('addAllToCalendarLong'));
    $('#btnIcsAll .btn-label').textContent = t('addAllToCalendar');
    $('#btnIcsAll').setAttribute('aria-label', t('addAllToCalendarLong'));
  }

  function renderLangSwitch() {
    $$('#langSwitch button').forEach((btn) => {
      const active = btn.dataset.lang === lang;
      btn.classList.toggle('is-active', active);
      btn.setAttribute('aria-pressed', String(active));
    });
  }

  /* ---------- legenda de cores por rito (recolhível) ---------- */
  function renderLegend() {
    const el = $('#bodyLegend');
    if (!el) return;
    const keys = Object.keys(BODIES).filter((k) => k !== 'log' && k !== 'geral');
    el.innerHTML = `
      <summary>${esc(t('legendTitle'))}</summary>
      <div class="legend-items">
        ${keys.map((k) => `<span class="legend-chip" style="--body-color:${BODIES[k].color}">${esc(BODIES[k].label)}</span>`).join('')}
        <span class="legend-chip is-log"><span class="legend-icon">${KIND_ICONS.transfer}</span>${esc(t('legendLogistics'))}</span>
      </div>`;
  }

  /* ---------- abas por dia ---------- */
  function renderTabs() {
    const nav = $('#dayTabs');
    nav.setAttribute('aria-label', t('tabsLabel'));
    nav.innerHTML = SCHED.map((day, i) => {
      const dayNum = day.date.slice(8);
      const wd = t('weekdaysShort')[day.weekday] || I18N.pt.weekdaysShort[day.weekday];
      return `<button class="day-tab${i === activeDay ? ' is-active' : ''}${day.official ? '' : ' is-vesper'}"
        role="tab" aria-selected="${i === activeDay}" data-day="${i}">
        <span class="day-tab-wd">${wd}</span>
        <span class="day-tab-num">${Number(dayNum)}</span>
        ${day.official ? '' : `<span class="day-tab-mini">${esc(t('tabVesperMini'))}</span>`}
      </button>`;
    }).join('');
    $$('.day-tab', nav).forEach((btn) => {
      btn.addEventListener('click', () => {
        activeDay = Number(btn.dataset.day);
        renderTabs();
        renderSchedule();
      });
    });
  }

  /* "Meu roteiro" foi removido: a grade mostra sempre o dia selecionado. */

  /* ---------- grade do dia ---------- */
  function weekdayTitle(day) {
    const wd = t('weekdays')[day.weekday] || I18N.pt.weekdays[day.weekday];
    const dayNum = Number(day.date.slice(8));
    return lang === 'en'
      ? `${wd} · ${t('dayOfMonthLabel')} ${dayNum}`
      : `${wd} · ${dayNum} ${t('dayOfMonthLabel')}`;
  }

  function renderSchedule() {
    const root = $('#schedule');
    const now = Date.now();
    const day = SCHED[activeDay] || SCHED[SCHED.length - 1];
    root.innerHTML = daySectionHTML(day, FLAT.filter((s) => s.date === day.date), now);
  }

  function daySectionHTML(day, sessions, now) {
    return `<section class="day-section" aria-label="${esc(weekdayTitle(day))}">
      <header class="day-header">
        <h2 class="day-title">${esc(weekdayTitle(day))}</h2>
        ${day.official ? '' : `<span class="vesper-tag">${esc(t('vesperTag'))}</span>`}
      </header>
      <ol class="timeline">${sessions.map((s) => sessionHTML(s, now)).join('')}</ol>
    </section>`;
  }

  function sessionHTML(s, now) {
    const live = now >= s.startTs && now < s.endTs;
    const past = now >= s.endTs;
    const body = BODIES[s.body] || BODIES.geral;
    const loc = s.loc ? LOCATIONS[s.loc] : null;
    const timeStr = s.end ? `${s.start}<span class="time-sep">–</span>${s.end}` : `${s.start}`;
    const isLog = s.body === 'log';
    const kindIcon = s.kind && KIND_ICONS[s.kind] ? KIND_ICONS[s.kind] : '';

    return `<li class="session${live ? ' is-live' : ''}${past ? ' is-past' : ''}${isLog ? ' is-log' : ''}" data-id="${s.id}" style="--body-color:${body.color}">
      <div class="session-time">
        <span class="time">${timeStr}</span>
        ${live ? `<span class="live-dot" title="${esc(t('inProgress'))}"></span>` : ''}
      </div>
      <div class="session-card">
        <div class="session-head">
          ${kindIcon ? `<span class="kind-icon" aria-hidden="true">${kindIcon}</span>` : ''}
          <div class="session-headings">
            ${body.label ? `<span class="body-chip">${esc(body.label)}</span>` : ''}
            <h3 class="session-title">${esc(s.t[lang] || s.t.pt)}</h3>
          </div>
        </div>
        <div class="session-meta">
          ${loc
            ? `<a class="loc-chip" href="${mapUrl(s.loc)}" target="_blank" rel="noopener">${ICONS.pin}<span>${esc(loc.name)}</span></a>`
            : `<span class="loc-chip is-tbd">${ICONS.pin}<span>${esc(t('toBeDefined'))}</span></span>`}
        </div>
        ${s.restriction ? `<div class="restriction">${ICONS.lock}<div class="restriction-body"><strong>${esc(t('restrictedLabel'))}.</strong> ${richText(s.restriction[lang] || s.restriction.pt)}</div></div>` : ''}
        ${s.note ? `<div class="session-note">${richText(s.note[lang] || s.note.pt)}</div>` : ''}
      </div>
    </li>`;
  }

  /* Os cartões não têm mais controles próprios (favoritar / calendário):
     a agenda completa fica nos botões acima da grade. */
  function bindSessionEvents() {}

  /* ---------- locais ---------- */
  function renderLocations() {
    $('#locationsList').innerHTML = Object.keys(LOCATIONS).map((key) => {
      const loc = LOCATIONS[key];
      return `<article class="venue">
        <div class="venue-mark" aria-hidden="true">${ICONS.pin}</div>
        <div class="venue-body">
          <h3 class="venue-name">${esc(loc.name)}</h3>
          ${loc.detail ? `<p class="venue-detail">${esc(loc.detail)}</p>` : ''}
          <p class="venue-address">${esc(loc.address)}</p>
          <a class="venue-map" href="${mapUrl(key)}" target="_blank" rel="noopener">${ICONS.pin}<span>${esc(t('openMap'))}</span></a>
        </div>
      </article>`;
    }).join('');
  }

  /* ============================================================
     CARTÃO "AGORA / A SEGUIR"
     ============================================================ */
  /* Devolve HTML: algarismos (.cd-num, serifa tabular) + unidades
     (.cd-unit, versalete bronze). Cada grupo que MUDOU desde a última
     renderização ganha .cd-anim (micro-animação de entrada no CSS);
     grupos inalterados ficam parados. `key` separa os contextos
     (abertura / termina em / começa em). Usado apenas via innerHTML. */
  const CD_PREV = Object.create(null);
  function fmtCountdown(ms, key) {
    const total = Math.max(0, Math.floor(ms / 1000));
    const d = Math.floor(total / 86400);
    const h = Math.floor((total % 86400) / 3600);
    const m = Math.floor((total % 3600) / 60);
    const sec = total % 60;
    const p = (n) => String(n).padStart(2, '0');
    const part = (val, unit, slot) => {
      const id = (key || 'cd') + ':' + slot;
      const anim = CD_PREV[id] !== undefined && CD_PREV[id] !== val ? ' cd-anim' : '';
      CD_PREV[id] = val;
      return `<span class="cd-num${anim}">${val}</span>` + (unit ? `<span class="cd-unit">${unit}</span>` : '');
    };
    if (d > 0) return `${part(d, t('days'), 'd')} ${part(p(h), t('hours'), 'h')} ${part(p(m), t('minutes'), 'm')}`;
    return `${part(p(h), '', 'h')}<span class="cd-colon">:</span>${part(p(m), '', 'm')}<span class="cd-colon">:</span>${part(p(sec), '', 's')}`;
  }

  function sessionLine(s) {
    const loc = s.loc ? LOCATIONS[s.loc].name : t('toBeDefined');
    return `${s.start}${s.end ? '–' + s.end : ''} · ${loc}`;
  }

  function updateNowCard() {
    const card = $('#nowCard');
    /* Modo demo: relógio deslocado para dentro do evento (só neste cartão) */
    const now = DEMO ? demoNow() : Date.now();

    /* Depois do evento */
    if (now > LAST_END) {
      card.className = 'now-card is-closed';
      card.innerHTML = `
        <div class="now-status">${esc(t('closedTitle'))}</div>
        <p class="now-closed-msg">${esc(t('closedMsg'))}</p>
        <div class="now-rule" aria-hidden="true"></div>
        <p class="now-closed-motto">${esc(t('motto1'))}</p>`;
      return;
    }

    /* Antes da janela do evento: contagem para a abertura oficial
       (faixa compacta em uma/duas linhas) */
    if (now < EVENT_WINDOW_START) {
      card.className = 'now-card is-countdown';
      card.innerHTML = `
        <div class="countdown-strip">
          <span class="now-status">${esc(t('openingCountdown'))}</span>
          <span class="now-countdown" role="timer">${fmtCountdown(OPENING_TS - now, 'open')}</span>
          <span class="now-meta">${esc(t('openingDate'))}</span>
        </div>`;
      return;
    }

    /* Durante a janela: sessão em curso e/ou próxima */
    const current = FLAT.find((s) => now >= s.startTs && now < s.endTs);
    const next = FLAT.find((s) => s.startTs > now);

    let html = '';
    if (current) {
      html += `
        <div class="now-status is-live"><span class="live-dot"></span>${esc(t('now'))}</div>
        <h2 class="now-title">${esc(current.t[lang] || current.t.pt)}</h2>
        <p class="now-meta">${esc(sessionLine(current))}</p>
        ${current.end ? `<p class="now-sub">${esc(t('endsIn'))} <strong>${fmtCountdown(current.endTs - now, 'end')}</strong></p>` : ''}`;
    }
    if (next) {
      html += `
        <div class="now-next${current ? ' has-rule' : ''}">
          <div class="now-status is-next">${esc(t('next'))}</div>
          <h3 class="now-next-title">${esc(next.t[lang] || next.t.pt)}</h3>
          <p class="now-meta">${esc(sessionLine(next))} · ${esc(t('startsIn'))} <strong>${fmtCountdown(next.startTs - now, 'next')}</strong></p>
        </div>`;
    }
    if (!html && next === undefined && !current) {
      // Janela do evento mas sem próxima sessão (fim do último dia antes de LAST_END)
      html = `<div class="now-status">${esc(t('closedTitle'))}</div>`;
    }
    card.className = 'now-card' + (current ? ' is-live-card' : '');
    card.innerHTML = html;
  }

  /* ============================================================
     EXPORTAÇÃO .ICS (client-side, fuso -03:00 via UTC)
     ============================================================ */
  function icsDate(msTs) {
    const d = new Date(msTs);
    const p = (n) => String(n).padStart(2, '0');
    return `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}T${p(d.getUTCHours())}${p(d.getUTCMinutes())}00Z`;
  }
  const icsEsc = (s) => String(s).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');

  function buildICS(sessions) {
    const lines = [
      'BEGIN:VCALENDAR', 'VERSION:2.0', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
      'PRODID:-//Rito Brasileiro//Programa Oficial//PT',
    ];
    sessions.forEach((s) => {
      const loc = s.loc ? `${LOCATIONS[s.loc].name}, ${LOCATIONS[s.loc].address}` : '';
      const desc = [
        s.restriction ? (s.restriction[lang] || s.restriction.pt) : '',
        s.note ? (s.note[lang] || s.note.pt) : '',
        SITE_CONFIG.shortUrl,
      ].filter(Boolean).join('\n');
      lines.push(
        'BEGIN:VEVENT',
        `UID:${s.id}@rbcuiaba26`,
        `DTSTAMP:${icsDate(Date.now())}`,
        `DTSTART:${icsDate(s.startTs)}`,
        `DTEND:${icsDate(s.end ? s.endTs : s.startTs + 60 * 60000)}`,
        `SUMMARY:${icsEsc(s.t[lang] || s.t.pt)}`,
        loc ? `LOCATION:${icsEsc(loc)}` : '',
        `DESCRIPTION:${icsEsc(desc)}`,
        `URL:${SITE_CONFIG.siteUrl}`,
        'END:VEVENT'
      );
    });
    lines.push('END:VCALENDAR');
    return lines.filter(Boolean).join('\r\n');
  }

  function downloadICS(sessions, filename) {
    const blob = new Blob([buildICS(sessions)], { type: 'text/calendar;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
    toast(t('icsReady'));
  }

  /* ============================================================
     PLANILHA DO GOOGLE (CSV publicado) — fonte VIVA dos dados
     ------------------------------------------------------------
     O organizador edita a programação e os avisos numa planilha
     do Google Sheets ("Publicar na web" → CSV). No arranque, o
     site baixa os dois CSVs e converte para o formato interno
     (SCHEDULE / avisos). FALLBACK garantido: URL placeholder,
     fetch falho ou CSV vazio/malformado → dados embutidos
     (data.js + avisos.json), exatamente como antes.
     ============================================================ */

  /* Parser CSV inline (RFC-4180): campos entre aspas, aspas internas
     duplicadas "", vírgulas e quebras de linha dentro de aspas.
     Sem CDN/biblioteca — precisa funcionar offline. */
  function parseCSV(text) {
    if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1); // BOM
    const rows = [];
    let row = [], field = '', inQuotes = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (inQuotes) {
        if (c === '"') {
          if (text[i + 1] === '"') { field += '"'; i++; } // "" → aspa literal
          else inQuotes = false;
        } else field += c;
      } else if (c === '"') {
        inQuotes = true;
      } else if (c === ',') {
        row.push(field); field = '';
      } else if (c === '\r' || c === '\n') {
        if (c === '\r' && text[i + 1] === '\n') i++; // CRLF
        row.push(field); field = '';
        rows.push(row); row = [];
      } else {
        field += c;
      }
    }
    if (field !== '' || row.length) { row.push(field); rows.push(row); }
    return rows;
  }

  /* Tabela com acesso por nome de coluna (cabeçalho tolerante a
     maiúsculas/espaços); ignora linhas totalmente vazias */
  function csvTable(text) {
    const rows = parseCSV(String(text || ''));
    if (rows.length < 2) return null;
    const idx = {};
    rows[0].forEach((h, i) => { idx[String(h).trim().toLowerCase()] = i; });
    const get = (r, col) => {
      const i = idx[col];
      return i === undefined || r[i] === undefined ? '' : String(r[i]).trim();
    };
    const body = rows.slice(1).filter((r) => r.some((f) => String(f).trim() !== ''));
    return { idx, get, body };
  }

  /* "9:00" / "09:00:00" → "09:00"; inválido → null */
  const normTime = (v) => {
    const m = /^(\d{1,2}):(\d{2})/.exec(String(v).trim());
    return m ? (m[1].length === 1 ? '0' + m[1] : m[1]) + ':' + m[2] : null;
  };

  /* Aba "Programação" → MESMO formato interno de SCHEDULE.
     Agrupa por data (dias em ordem crescente; sessões na ordem das
     linhas), deriva weekday da data e official/véspera de
     EVENT_INFO.officialStart. Devolve null se nada aproveitável. */
  function csvToSchedule(text) {
    const tbl = csvTable(text);
    if (!tbl) return null;
    const required = ['id', 'data', 'inicio', 'titulo_pt'];
    if (required.some((c) => !(c in tbl.idx))) return null;

    const KINDS = ['meal', 'hotel', 'transfer', 'coffee', 'pickup', 'social'];
    const byDate = {};
    tbl.body.forEach((r) => {
      const g = (col) => tbl.get(r, col);
      const id = g('id');
      const date = g('data');
      const start = normTime(g('inicio'));
      const tPt = g('titulo_pt');
      // Linha inválida (sem id/data/início/título): ignorada, sem quebrar o resto
      if (!id || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !start || !tPt) return;

      const s = {
        id: id,
        start: start,
        end: normTime(g('fim')), // vazio/ inválido → null (horário aberto)
        loc: LOCATIONS[g('local')] ? g('local') : null,
        body: BODIES[g('rito')] ? g('rito') : 'geral',
        t: { pt: tPt, fr: g('titulo_fr') || tPt, en: g('titulo_en') || tPt },
      };
      const kind = g('tipo').toLowerCase();
      if (KINDS.indexOf(kind) >= 0) s.kind = kind;
      const rPt = g('restricao_pt'), rFr = g('restricao_fr'), rEn = g('restricao_en');
      if (rPt || rFr || rEn) s.restriction = { pt: rPt || rFr || rEn, fr: rFr, en: rEn };
      const nPt = g('nota_pt'), nFr = g('nota_fr'), nEn = g('nota_en');
      if (nPt || nFr || nEn) s.note = { pt: nPt || nFr || nEn, fr: nFr, en: nEn };

      (byDate[date] = byDate[date] || []).push(s);
    });

    const dates = Object.keys(byDate).sort(); // dias em ordem crescente
    if (!dates.length) return null;
    const WD = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
    return dates.map((date) => ({
      date: date,
      weekday: WD[new Date(date + 'T12:00:00Z').getUTCDay()],
      official: date >= EVENT_INFO.officialStart, // anterior ao início oficial = véspera
      sessions: byDate[date],
    }));
  }

  /* Aba "Avisos" → formato que checkNotices espera
     (id, ativo, publicadoEm, texto{pt,fr,en}, link) */
  function csvToNotices(text) {
    const tbl = csvTable(text);
    if (!tbl) return null;
    if (!('id' in tbl.idx) || !('texto_pt' in tbl.idx)) return null;
    return tbl.body.map((r) => {
      const g = (col) => tbl.get(r, col);
      return {
        id: g('id'),
        ativo: /^(true|verdadeiro|sim|1|x)$/i.test(g('ativo')),
        publicadoEm: g('publicadoem'),
        texto: { pt: g('texto_pt'), fr: g('texto_fr'), en: g('texto_en') },
        link: g('link'),
      };
    }).filter((a) => a.id && a.texto.pt);
  }

  /* URL configurada de verdade (não é o placeholder COLE_...) */
  const sheetUrlOk = (u) =>
    typeof u === 'string' && /^https:\/\//i.test(u) && u.indexOf('COLE_') === -1;

  /* fetch com tempo-limite: a planilha nunca pode segurar o site */
  function fetchCSV(url) {
    const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timer = ctrl ? setTimeout(() => ctrl.abort(), 8000) : null;
    return fetch(url, ctrl ? { signal: ctrl.signal } : undefined).then(
      (res) => {
        if (timer) clearTimeout(timer);
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.text();
      },
      (err) => { if (timer) clearTimeout(timer); throw err; }
    );
  }

  /* Baixa e aplica os 2 CSVs (se configurados). NUNCA rejeita:
     cada falha cai silenciosamente no dado embutido correspondente.
     Offline: o service worker devolve a última cópia em cache. */
  function loadSheetData() {
    const jobs = [];
    if (sheetUrlOk(SITE_CONFIG.sheetProgramacaoCsvUrl)) {
      jobs.push(
        fetchCSV(SITE_CONFIG.sheetProgramacaoCsvUrl).then((txt) => {
          const sched = csvToSchedule(txt);
          if (sched) { SCHED = sched; rebuildDerived(); }
        }).catch(() => { /* fallback: SCHEDULE embutido (data.js) */ })
      );
    }
    if (sheetUrlOk(SITE_CONFIG.sheetAvisosCsvUrl)) {
      jobs.push(
        fetchCSV(SITE_CONFIG.sheetAvisosCsvUrl).then((txt) => {
          const list = csvToNotices(txt);
          if (list && list.length) SHEET_NOTICES = list;
        }).catch(() => { /* fallback: avisos.json */ })
      );
    }
    return Promise.all(jobs);
  }

  /* ============================================================
     AVISOS IN-PAGE (planilha quando disponível; senão avisos.json)
     ============================================================ */
  function seenNotices() {
    try { return new Set(JSON.parse(localStorage.getItem(LS.notices) || '[]')); }
    catch (e) { return new Set(); }
  }

  async function checkNotices() {
    try {
      let list = SHEET_NOTICES; // planilha (carregada no arranque)
      if (!list) {
        const res = await fetch('avisos.json?v=' + Date.now(), { cache: 'no-store' });
        if (!res.ok) return;
        list = (await res.json()).avisos || [];
      }
      const seen = seenNotices();
      const fresh = list
        .filter((a) => a.ativo && !seen.has(a.id))
        .sort((a, b) => (b.publicadoEm || '').localeCompare(a.publicadoEm || ''));
      if (!fresh.length) return;
      const aviso = fresh[0];
      const bar = $('#noticeBar');
      const text = (aviso.texto && (aviso.texto[lang] || aviso.texto.pt)) || '';
      bar.innerHTML = `
        <div class="notice-inner">
          <span class="notice-label">${ICONS.bell}${esc(t('noticesTitle'))}</span>
          <p class="notice-text">${linkify(text)}${aviso.link ? ` <a href="${esc(aviso.link)}" target="_blank" rel="noopener">&rarr;</a>` : ''}</p>
          <button class="notice-close" aria-label="${esc(t('dismissNotice'))}">&times;</button>
        </div>`;
      bar.hidden = false;
      $('.notice-close', bar).addEventListener('click', () => {
        bar.hidden = true;
        seen.add(aviso.id);
        localStorage.setItem(LS.notices, JSON.stringify([...seen]));
      });
    } catch (e) { /* offline ou arquivo ausente: silencioso */ }
  }

  /* Tarja de aviso de EXEMPLO do modo demo (não usa avisos.json nem
     localStorage; re-renderiza via renderAll ao trocar de idioma) */
  let demoNoticeDismissed = false;
  function renderDemoNotice() {
    const bar = $('#noticeBar');
    if (demoNoticeDismissed) { bar.hidden = true; return; }
    bar.innerHTML = `
      <div class="notice-inner">
        <span class="notice-label">${ICONS.bell}${esc(t('noticesTitle'))}</span>
        <p class="notice-text">${linkify(t('demoNoticeText'))}</p>
        <button class="notice-close" aria-label="${esc(t('dismissNotice'))}">&times;</button>
      </div>`;
    bar.hidden = false;
    $('.notice-close', bar).addEventListener('click', () => {
      bar.hidden = true;
      demoNoticeDismissed = true;
    });
  }

  /* ============================================================
     PLATAFORMA — detecção robusta para o fluxo de instalação
     ------------------------------------------------------------
     iOS: userAgent clássico OU iPadOS "disfarçado" de Mac
     (Macintosh + tela de toque). Safari no iOS: exclui os demais
     navegadores (CriOS/FxiOS/EdgiOS/...), que no iPhone não podem
     instalar PWA — só o Safari instala.
     ============================================================ */
  const UA = navigator.userAgent;
  const IS_IOS = /iPad|iPhone|iPod/.test(UA) ||
    (/Macintosh/.test(UA) && navigator.maxTouchPoints > 1);
  const IS_ANDROID = /Android/i.test(UA);
  const IS_STANDALONE =
    (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) ||
    (typeof navigator.standalone !== 'undefined' && navigator.standalone === true);
  const IS_IOS_SAFARI = IS_IOS && /Safari\//.test(UA) &&
    !/CriOS|FxiOS|EdgiOS|OPiOS|OPT\/|YaBrowser|DuckDuckGo|GSA\/|Instagram|FBAN|FBAV|Line\//.test(UA);

  /* Captura IMEDIATA do prompt nativo (Android/Chrome/Edge): o evento
     pode disparar antes do arranque completo (initPWA) — guardar já. */
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredInstall = e;
    const btn = document.getElementById('btnInstall');
    if (btn && !IS_STANDALONE) btn.hidden = false;
  });

  /* ============================================================
     MODAL DE INSTALAÇÃO — passo a passo ilustrado (iOS/Android)
     Acessível: fechável por ×, Esc e overlay; foco preso no diálogo;
     foco devolvido ao botão que abriu. Traduzido via i18n.js.
     ============================================================ */
  const INSTALL_ICONS = {
    /* ícone Compartilhar do iOS: quadrado com seta para cima */
    share: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3v12"/><path d="M8.5 6.5 12 3l3.5 3.5"/><path d="M7.5 10H6a1.8 1.8 0 0 0-1.8 1.8v7.4A1.8 1.8 0 0 0 6 21h12a1.8 1.8 0 0 0 1.8-1.8v-7.4A1.8 1.8 0 0 0 18 10h-1.5"/></svg>',
    /* "Adicionar à Tela de Início": quadrado arredondado com + */
    add: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="4" y="4" width="16" height="16" rx="4"/><path d="M12 8.5v7M8.5 12h7"/></svg>',
    /* confirmação */
    check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m5 12.5 4.5 4.5L19 7.5"/></svg>',
    /* bússola do Safari */
    safari: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="8.5"/><path d="m14.9 9.1-1.8 4-4 1.8 1.8-4z"/></svg>',
    /* menu ⋮ dos navegadores Android */
    menu: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="12" cy="5" r="1.7"/><circle cx="12" cy="12" r="1.7"/><circle cx="12" cy="19" r="1.7"/></svg>',
  };

  /* **negrito** nas cadeias do i18n → <strong> (com escape prévio) */
  const fmtRich = (s) => esc(s).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');

  let installModalMode = null;   // 'ios' | 'ios-other' | 'android' | null (fechado)
  let installModalFromPush = false;
  let installModalTrigger = null;

  function renderInstallModal() {
    const modal = $('#installModal');
    if (!installModalMode) return;

    const shortDisplay = String(SITE_CONFIG.shortUrl || SITE_CONFIG.siteUrl).replace(/^https?:\/\//, '');
    let intro = '', steps = '', note = '';

    if (installModalMode === 'ios') {
      intro = fmtRich(t('installIntroIOS'));
      steps =
        `<li><span class="install-step-icon">${INSTALL_ICONS.share}</span><p>${fmtRich(t('iosStep1'))}</p></li>` +
        `<li><span class="install-step-icon">${INSTALL_ICONS.add}</span><p>${fmtRich(t('iosStep2'))}</p></li>` +
        `<li><span class="install-step-icon">${INSTALL_ICONS.check}</span><p>${fmtRich(t('iosStep3'))}</p></li>`;
      note = fmtRich(t(installModalFromPush ? 'pushAfterInstall' : 'iosPushNote'));
    } else if (installModalMode === 'ios-other') {
      intro = fmtRich(t('iosOtherIntro'));
      steps =
        `<li><span class="install-step-icon">${INSTALL_ICONS.safari}</span><p>${fmtRich(t('iosOtherStep1').replace('{url}', shortDisplay))}</p></li>` +
        `<li><span class="install-step-icon">${INSTALL_ICONS.add}</span><p>${fmtRich(t('iosOtherStep2'))}</p></li>`;
      note = fmtRich(t(installModalFromPush ? 'pushAfterInstall' : 'iosPushNote'));
    } else { /* 'android' — sem beforeinstallprompt disponível */
      intro = fmtRich(t('androidIntro'));
      steps =
        `<li><span class="install-step-icon">${INSTALL_ICONS.menu}</span><p>${fmtRich(t('androidStep1'))}</p></li>` +
        `<li><span class="install-step-icon">${INSTALL_ICONS.add}</span><p>${fmtRich(t('androidStep2'))}</p></li>`;
    }

    modal.innerHTML = `
      <div class="install-overlay" data-close-install></div>
      <div class="install-dialog" role="dialog" aria-modal="true" aria-labelledby="installModalTitle">
        <button type="button" class="install-close" data-close-install aria-label="${esc(t('closeModal'))}">&times;</button>
        <h2 class="install-title" id="installModalTitle">${esc(t('installModalTitle'))}</h2>
        <hr class="install-rule" aria-hidden="true">
        <p class="install-intro">${intro}</p>
        <ol class="install-steps">${steps}</ol>
        ${note ? `<p class="install-note">${ICONS.bell}<span>${note}</span></p>` : ''}
      </div>`;
    $$('[data-close-install]', modal).forEach((el) =>
      el.addEventListener('click', closeInstallModal));
  }

  function installModalKeydown(e) {
    if (e.key === 'Escape') { closeInstallModal(); return; }
    if (e.key === 'Tab') {
      /* foco circula dentro do diálogo */
      const focusables = $$('.install-dialog button, .install-dialog a', $('#installModal'));
      if (!focusables.length) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  }

  function openInstallModal(mode, fromPush) {
    installModalMode = mode;
    installModalFromPush = !!fromPush;
    installModalTrigger = document.activeElement;
    renderInstallModal();
    $('#installModal').hidden = false;
    document.body.classList.add('modal-open');
    const closeBtn = $('#installModal .install-close');
    if (closeBtn) closeBtn.focus();
    document.addEventListener('keydown', installModalKeydown);
  }

  function closeInstallModal() {
    const modal = $('#installModal');
    if (!modal || modal.hidden) return;
    modal.hidden = true;
    modal.innerHTML = '';
    installModalMode = null;
    installModalFromPush = false;
    document.body.classList.remove('modal-open');
    document.removeEventListener('keydown', installModalKeydown);
    if (installModalTrigger && installModalTrigger.focus) installModalTrigger.focus();
    installModalTrigger = null;
  }

  /* ============================================================
     ONESIGNAL (push) — só ativa com App ID configurado
     ------------------------------------------------------------
     UM ÚNICO service worker: o OneSignal é apontado para o MESMO
     sw.js do PWA (que já importa OneSignalSDK.sw.js), no escopo
     /rbcuiaba26/ — nenhum segundo worker é registrado e o offline
     permanece intacto. Se o SDK não carregar (sem rede), o botão
     simplesmente não aparece e o site segue 100% funcional.
     ============================================================ */
  function initPush() {
    const btn = $('#btnPush');
    const appId = SITE_CONFIG.oneSignalAppId;
    const configured = typeof appId === 'string' && appId.length > 0 && appId.indexOf('COLE_') === -1;
    if (!configured) {
      btn.hidden = true; // aparece após configurar o App ID (ver README-PUSH.md)
      return;
    }

    /* iOS sem estar instalado: Web Push só existe no app instalado
       (iOS 16.4+). O botão abre o modal de instalação — instala
       primeiro; as notificações vêm depois, dentro do app. */
    if (IS_IOS && !IS_STANDALONE) {
      btn.hidden = false;
      btn.addEventListener('click', () => {
        openInstallModal(IS_IOS_SAFARI ? 'ios' : 'ios-other', true);
      });
      return;
    }

    const sdk = document.createElement('script');
    sdk.src = 'https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.page.js';
    sdk.defer = true;
    document.head.appendChild(sdk);

    window.OneSignalDeferred = window.OneSignalDeferred || [];
    window.OneSignalDeferred.push(async function (OneSignal) {
      await OneSignal.init({
        appId: appId,
        serviceWorkerParam: { scope: '/rbcuiaba26/' },
        serviceWorkerPath: 'rbcuiaba26/sw.js',
        serviceWorkerUpdaterPath: 'rbcuiaba26/sw.js',
        allowLocalhostAsSecureOrigin: true,
      });

      /* reflete o estado real no botão (ativado / bloqueado / neutro) */
      const reflect = () => {
        const native = (typeof Notification !== 'undefined') ? Notification.permission : 'default';
        if (OneSignal.Notifications.permission) pushState = 'on';
        else if (native === 'denied') pushState = 'blocked';
        else pushState = 'idle';
        btn.classList.toggle('is-on', pushState === 'on');
        $('.btn-label', btn).textContent =
          t(pushState === 'on' ? 'pushGranted' : pushState === 'blocked' ? 'pushDenied' : 'pushBtn');
      };
      reflect();
      btn.hidden = false; // só aparece com SDK pronto — offline nada quebra

      btn.addEventListener('click', async () => {
        try { await OneSignal.Notifications.requestPermission(); }
        catch (e) { /* estado é refletido a seguir */ }
        reflect();
        toast(t(pushState === 'on' ? 'pushGranted' : 'pushDenied'));
      });
      try {
        OneSignal.Notifications.addEventListener('permissionChange', reflect);
      } catch (e) { /* SDK antigo sem o evento: sem prejuízo */ }
    });
  }

  /* ============================================================
     PWA: service worker + fluxo de instalação por plataforma
     ------------------------------------------------------------
     - Já instalado (standalone): botão oculto.
     - Android/Chrome/Edge: beforeinstallprompt → prompt() nativo;
       sem o evento, modal com instruções do menu ⋮.
     - iOS Safari: modal ilustrado "Compartilhar → Adicionar à
       Tela de Início → Adicionar".
     - iOS fora do Safari: modal "abra no Safari".
     - Desktop sem prompt: botão permanece oculto (nada quebrado).
     ============================================================ */
  function initPWA() {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('sw.js').catch(() => {});
    }
    const btn = $('#btnInstall');

    if (IS_STANDALONE) {
      btn.hidden = true;                    // já instalado
    } else if (IS_IOS || IS_ANDROID) {
      btn.hidden = false;                   // celular: sempre visível
    }
    /* desktop: aparece apenas se o navegador oferecer o prompt nativo
       (o beforeinstallprompt é capturado no topo do script) */
    if (deferredInstall && !IS_STANDALONE) btn.hidden = false;

    btn.addEventListener('click', async () => {
      if (deferredInstall) {                 // Android/Chrome/Edge: prompt nativo
        deferredInstall.prompt();
        const choice = await deferredInstall.userChoice;
        deferredInstall = null;
        if (choice && choice.outcome === 'accepted') btn.hidden = true;
        return;
      }
      if (IS_IOS) openInstallModal(IS_IOS_SAFARI ? 'ios' : 'ios-other', false);
      else if (IS_ANDROID) openInstallModal('android', false);
    });

    window.addEventListener('appinstalled', () => {
      btn.hidden = true;
      deferredInstall = null;
      closeInstallModal();
      toast(t('appInstalled'));
    });

    /* se o modo de exibição virar standalone, o botão some */
    if (window.matchMedia) {
      const mq = window.matchMedia('(display-mode: standalone)');
      const onChange = (ev) => { if (ev.matches) btn.hidden = true; };
      if (mq.addEventListener) mq.addEventListener('change', onChange);
      else if (mq.addListener) mq.addListener(onChange);
    }
  }

  /* Botão "Compartilhar" removido: o link circula pelo QR do crachá,
     pelo QR Code do crachá. */
  function initShare() {}

  /* ---------- toast discreto ---------- */
  let toastTimer = null;
  function toast(msg) {
    const el = $('#toast');
    el.textContent = msg;
    el.classList.add('is-visible');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('is-visible'), 2600);
  }

  /* ============================================================
     ARRANQUE
     ============================================================ */
  function init() {
    // Seletor de idioma
    $$('#langSwitch button').forEach((btn) => {
      btn.addEventListener('click', () => {
        lang = btn.dataset.lang;
        localStorage.setItem(LS.lang, lang);
        renderAll();
      });
    });

    // Links fixos
    $('#emergencyFab').href = 'tel:' + EVENT_INFO.emergencyTel;
    $('#emgPhoneFoot').href = 'tel:' + EVENT_INFO.emergencyTel;
    $('#emgPhoneFoot').textContent = EVENT_INFO.emergencyDisplay;
    $('#regEmail').href = 'mailto:' + EVENT_INFO.secretariatEmail;
    $('#regEmail').textContent = EVENT_INFO.secretariatEmail;

    $('#btnIcsAll').addEventListener('click', () => downloadICS(FLAT, 'rbcuiaba26-programa-completo.ics'));

    /* Google Agenda (agenda completa): assinatura por URL do .ics estático
       publicado em assets/agenda-rbcuiaba26.ics (regerar se a grade mudar —
       ver README-SETUP.md). O Google não aceita múltiplos eventos por link
       template; a assinatura via webcal:// cobre a programação inteira. */
    const feedHttp = (SITE_CONFIG.icsFeedUrl && /^https?:\/\//.test(SITE_CONFIG.icsFeedUrl))
      ? SITE_CONFIG.icsFeedUrl
      : SITE_CONFIG.siteUrl + 'assets/agenda-rbcuiaba26.ics';
    const icsFeedUrl = 'webcal://' + feedHttp.replace(/^https?:\/\//, '');
    $('#gcalAll').href = 'https://calendar.google.com/calendar/render?cid=' + encodeURIComponent(icsFeedUrl);

    /* Planilha do Google ANTES da primeira renderização.
       loadSheetData nunca rejeita: em qualquer falha, a grade
       embutida (data.js) e o avisos.json seguem valendo. */
    loadSheetData().then(() => {
      activeDay = defaultDay(); // recalcula com a grade em uso
      renderAll();
      initPWA();
      initPush();
      initShare();
      if (!DEMO) checkNotices(); // no demo, a tarja mostra o aviso de exemplo

      // Relógio: atualiza o cartão a cada segundo (contagens vivas)
      setInterval(updateNowCard, 1000);
      // Revalida a grade (estados em curso/passado) a cada minuto
      setInterval(renderSchedule, 60000);
    });
  }

  document.addEventListener('DOMContentLoaded', init);
})();
