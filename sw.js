/* ============================================================
   sw.js — SERVICE WORKER (PWA offline)
   Estratégia:
   - App shell em cache na instalação (funciona sem sinal
     dentro dos palácios).
   - avisos.json: sempre rede primeiro (avisos frescos),
     cache como reserva offline.
   - CSVs publicados da planilha do Google (programação/avisos
     ao vivo): rede primeiro, cache como reserva — a última
     versão vista fica disponível sem internet.
   - Demais requisições: cache primeiro, rede como reserva.
   Coexistência com push: importa o worker do OneSignal.
   ============================================================ */

/* Push OneSignal no mesmo worker (guardado: se o CDN falhar,
   o modo offline continua funcionando). */
try {
  importScripts('https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.sw.js');
} catch (e) {
  /* sem rede na instalação: apenas offline, sem push */
}

const CACHE = 'rbcuiaba26-v2';

const APP_SHELL = [
  './',
  './index.html',
  './programacao.html',
  './refeicoes.js',
  './refeicoes.css',
  './refeicoes-config.js',
  './navegacao.css',
  './assets/qrcode.min.js',
  './styles.css',
  './app.js',
  './data.js',
  './i18n.js',
  './manifest.json',
  './avisos.json',
  /* agenda completa estática (assinatura Google Agenda) — regerar se a grade mudar */
  './assets/agenda-rbcuiaba26.ics',
  './assets/app-icon-192.png',
  './assets/app-icon-512.png',
  './assets/app-icon-maskable-512.png',
  './assets/apple-touch-icon.png',
  './assets/favicon-48.png',
  './assets/brasao.png',
  /* brasão oficial (PNG) + fallback SVG */
  /* artes de fundo (nenhuma neste projeto) */
  'https://fonts.googleapis.com/css2?family=Cinzel:wght@600;700&family=Source+Serif+4:ital,opsz,wght@0,8..60,400;0,8..60,500;0,8..60,600;1,8..60,500&display=swap',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) =>
      /* addAll individual para não abortar tudo se um item falhar */
      Promise.allSettled(APP_SHELL.map((url) => cache.add(url)))
    ).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k.startsWith('rbcuiaba26-') && k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  /* Nunca interceptar o OneSignal */
  if (url.hostname.includes('onesignal.com')) return;

  /* avisos.json: rede primeiro (com reserva em cache) */
  if (url.pathname.endsWith('/avisos.json')) {
    event.respondWith(
      fetch(req).then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put('./avisos.json', copy));
        return res;
      }).catch(() => caches.match('./avisos.json'))
    );
    return;
  }

  /* Planilha do Google publicada (CSV da programação/avisos):
     rede primeiro (conteúdo fresco), cache como reserva offline.
     Se rede e cache falharem, o app.js recua para os dados embutidos. */
  if (url.hostname === 'docs.google.com' || url.hostname.endsWith('.googleusercontent.com')) {
    event.respondWith(
      fetch(req).then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
        }
        return res;
      }).catch(() =>
        caches.match(req).then((hit) => hit || Response.error())
      )
    );
    return;
  }

  /* Fontes do Google: cache dinâmico (os .woff2 chegam de fonts.gstatic.com) */
  if (url.hostname === 'fonts.gstatic.com' || url.hostname === 'fonts.googleapis.com') {
    event.respondWith(
      caches.match(req).then((hit) => hit || fetch(req).then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy));
        return res;
      }))
    );
    return;
  }

  /* Qualquer outro endereço externo (Apps Script dos pedidos, status do
     pagamento): nunca interceptar nem guardar em cache — sempre ao vivo. */
  if (url.origin !== self.location.origin) return;

  /* Páginas e config das refeições (preço, Pix): rede primeiro,
     para que uma correção valha na hora; cache só sem sinal. */
  if (url.origin === self.location.origin &&
      (req.mode === 'navigate' || /refeicoes-config\.js$|data\.js$/.test(url.pathname))) {
    event.respondWith(
      fetch(req).then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
        }
        return res;
      }).catch(() =>
        caches.match(req, { ignoreSearch: true }).then((hit) => hit || caches.match('./index.html'))
      )
    );
    return;
  }

  /* App shell: cache primeiro, rede como reserva */
  event.respondWith(
    caches.match(req, { ignoreSearch: true }).then((hit) =>
      hit || fetch(req).then((res) => {
        if (res.ok && url.origin === self.location.origin) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
        }
        return res;
      }).catch(() => caches.match('./index.html'))
    )
  );
});
