/* ============================================================
   refeicoes.js — MOTOR DA PÁGINA DO ÁGAPE (REFEIÇÕES)
   Monta o pedido (o irmão + acompanhantes contados por refeição),
   calcula o total, gera o Pix (BR Code com valor e código) e
   registra o pedido na planilha do Google via Apps Script.
   O que se edita fica em refeicoes-config.js — não aqui.
   ============================================================ */
(function () {
  'use strict';

  const C = REFEICOES_CONFIG;
  const P = C.precoPorQuantidade;
  const IDS = C.refeicoes.map((r) => r.id);
  const LS = {
    pedido: 'rbcuiaba26.pedido',   // último pedido feito neste aparelho
    fila: 'rbcuiaba26.fila',       // envios que falharam (sem internet) e serão reenviados
  };
  const API_OK = !!C.apiUrl && !/^COLE_/.test(C.apiUrl);
  const PIX_OK = !!C.pix.chave && !/^COLE_/.test(C.pix.chave);

  const $ = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));
  const esc = (s) => String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const brl = (v) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  /* "2 jantares", "1 café" — rótulo curto com plural */
  const qtd = (id, n) => {
    const r = C.refeicoes.find((x) => x.id === id);
    return `${n} ${r.curto[n === 1 ? 0 : 1]}`;
  };

  function lsGet(k, fallback) {
    try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : fallback; } catch (e) { return fallback; }
  }
  function lsSet(k, v) {
    try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* modo privado: segue sem memória */ }
  }

  /* ============================================================
     ESTADO DO PEDIDO
     irmao  = refeições que o próprio irmão vai fazer
     acomp  = quantos acompanhantes em cada refeição
     auto   = refeições do irmão ainda seguem a sugestão das sessões
     ============================================================ */
  const novoEstado = () => ({
    sessoes: new Set(),
    irmao: new Set(),
    acomp: Object.fromEntries(IDS.map((id) => [id, 0])),
    auto: true,
    pedido: null, // pedido gerado (código, valor, payload Pix)
  });
  let state = novoEstado();

  /* ---------- preços ----------
     Irmão: pelo número de refeições dele.
     Acompanhantes: os que estão nas três refeições (o menor contador)
     pagam o pacote; dos que sobram, os que estão em duas pagam o preço
     de duas; o restante, avulso. */
  const valorIrmao = () => P[state.irmao.size] || 0;
  function pacotesAcomp(a) {
    const n = IDS.map((id) => a[id] || 0);
    const k3 = Math.min(...n);
    const resto = n.map((x) => x - k3).sort((x, y) => y - x); // [maior, meio, 0]
    const k2 = resto[1];
    const k1 = resto[0] - resto[1];
    return { k3, k2, k1 };
  }
  function valorAcomp() {
    const { k3, k2, k1 } = pacotesAcomp(state.acomp);
    return k3 * P[3] + k2 * P[2] + k1 * P[1];
  }
  const total = () => valorIrmao() + valorAcomp();
  const contagem = () => Object.fromEntries(IDS.map((id) => [id, (state.irmao.has(id) ? 1 : 0) + state.acomp[id]]));

  /* ============================================================
     PIX — BR Code estático com valor (padrão EMV do Banco Central)
     ============================================================ */
  function semAcento(s, max) {
    return String(s).normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[^A-Za-z0-9 ]/g, '').toUpperCase().trim().slice(0, max);
  }
  const tlv = (id, v) => id + String(v.length).padStart(2, '0') + v;
  function crc16(str) {
    let crc = 0xFFFF;
    for (let i = 0; i < str.length; i++) {
      crc ^= str.charCodeAt(i) << 8;
      for (let j = 0; j < 8; j++) crc = (crc & 0x8000) ? ((crc << 1) ^ 0x1021) & 0xFFFF : (crc << 1) & 0xFFFF;
    }
    return crc.toString(16).toUpperCase().padStart(4, '0');
  }
  function pixPayload(valor, txid) {
    const conta = tlv('00', 'br.gov.bcb.pix') + tlv('01', C.pix.chave.trim());
    const p = tlv('00', '01')
      + tlv('26', conta)
      + tlv('52', '0000')
      + tlv('53', '986')
      + tlv('54', valor.toFixed(2))
      + tlv('58', 'BR')
      + tlv('59', semAcento(C.pix.nome, 25))
      + tlv('60', semAcento(C.pix.cidade, 15))
      + tlv('62', tlv('05', txid))
      + '6304';
    return p + crc16(p);
  }

  /* Código do pedido: vai no Pix (identificador) e na planilha.
     Sem 0/O/1/I para não confundir quem lê no extrato. */
  function novoCodigo() {
    const abc = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
    let s = 'RB';
    const rnd = new Uint32Array(6);
    (window.crypto || window.msCrypto).getRandomValues(rnd);
    rnd.forEach((n) => { s += abc[n % abc.length]; });
    return s;
  }

  /* ============================================================
     ENVIO À PLANILHA (Apps Script)
     Corpo em text/plain = requisição simples (sem preflight).
     Sem internet: guarda na fila e reenvia depois.
     ============================================================ */
  async function enviar(dados) {
    if (!API_OK) return false;
    try {
      const res = await fetch(C.apiUrl, { method: 'POST', body: JSON.stringify(dados) });
      const json = await res.json().catch(() => ({}));
      return json.ok !== false;
    } catch (e) {
      try {
        await fetch(C.apiUrl, { method: 'POST', mode: 'no-cors', body: JSON.stringify(dados) });
        return true;
      } catch (e2) {
        const fila = lsGet(LS.fila, []);
        fila.push(dados);
        lsSet(LS.fila, fila);
        return false;
      }
    }
  }
  async function esvaziarFila() {
    const fila = lsGet(LS.fila, []);
    if (!fila.length || !API_OK) return;
    lsSet(LS.fila, []);
    for (const d of fila) await enviar(d);
  }
  async function consultarStatus(codigo) {
    if (!API_OK) return null;
    try {
      const res = await fetch(C.apiUrl + '?acao=status&codigo=' + encodeURIComponent(codigo));
      const json = await res.json();
      return json && json.ok ? json.status : null;
    } catch (e) { return null; }
  }

  /* ============================================================
     RENDERIZAÇÃO
     ============================================================ */
  function renderPrecos() {
    $('#rfPrices').innerHTML = `
      <div class="rf-price"><span class="rf-price-v">${brl(P[1])}</span><span class="rf-price-l">cada refeição<br>por pessoa</span></div>
      <div class="rf-price is-best"><span class="rf-price-v">${brl(P[3])}</span><span class="rf-price-l">as três refeições<br>por pessoa</span></div>`;
  }

  function renderSessoes() {
    $('#fSessoes').innerHTML = C.sessoes.map((s) => `
      <label class="rf-session">
        <input type="checkbox" value="${s.id}">
        <span class="rf-check" aria-hidden="true"></span>
        <span class="rf-session-text"><strong>${esc(s.nome)}</strong><span>${esc(s.detalhe)}</span></span>
      </label>`).join('');
    $$('#fSessoes input').forEach((el) => el.addEventListener('change', () => {
      el.checked ? state.sessoes.add(el.value) : state.sessoes.delete(el.value);
      if (state.auto) aplicarSugestao();
      renderMeals();
    }));
  }

  /* Sessões marcadas → refeições sugeridas para o irmão */
  function aplicarSugestao() {
    const sug = new Set();
    C.sessoes.forEach((s) => { if (state.sessoes.has(s.id)) s.sugere.forEach((m) => sug.add(m)); });
    state.irmao = sug;
  }

  function mealHTML(r) {
    const vou = state.irmao.has(r.id);
    const n = state.acomp[r.id];
    const pessoas = (vou ? 1 : 0) + n;
    return `<div class="rf-card rf-mealcard${pessoas ? ' is-on' : ''}" data-meal="${r.id}">
      <div class="rf-mealcard-head">
        <div>
          <strong>${esc(r.nome)}</strong>
          <span class="rf-muted">${esc(r.hora)} · ${brl(P[1])} por pessoa</span>
        </div>
        <span class="rf-mealcard-count">${pessoas ? `${pessoas} ${pessoas > 1 ? 'pessoas' : 'pessoa'}` : '—'}</span>
      </div>
      <div class="rf-mealcard-row">
        <label class="rf-me${vou ? ' is-on' : ''}">
          <input type="checkbox" data-eu="${r.id}"${vou ? ' checked' : ''}>
          <span class="rf-check" aria-hidden="true"></span>
          <span>Eu vou</span>
        </label>
        <div class="rf-acomp">
          <span class="rf-muted">Acompanhantes</span>
          <div class="rf-stepper" role="group" aria-label="Acompanhantes no ${esc(r.nome.toLowerCase())}">
            <button type="button" data-menos="${r.id}" aria-label="Menos um acompanhante no ${esc(r.nome.toLowerCase())}"${n <= 0 ? ' disabled' : ''}>−</button>
            <output aria-live="polite">${n}</output>
            <button type="button" data-mais="${r.id}" aria-label="Mais um acompanhante no ${esc(r.nome.toLowerCase())}"${n >= C.maxAcompanhantes ? ' disabled' : ''}>+</button>
          </div>
        </div>
      </div>
      <details class="rf-menu"><summary>Cardápio</summary><p>${esc(r.cardapio)}</p></details>
    </div>`;
  }

  function renderMeals() {
    // preserva os cardápios abertos entre uma renderização e outra
    const abertos = new Set($$('#fMeals details[open]').map((d) => d.closest('[data-meal]').dataset.meal));
    $('#fMeals').innerHTML = C.refeicoes.map(mealHTML).join('');
    abertos.forEach((id) => { const d = $(`#fMeals [data-meal="${id}"] details`); if (d) d.open = true; });

    $$('#fMeals [data-eu]').forEach((el) => el.addEventListener('change', () => {
      el.checked ? state.irmao.add(el.dataset.eu) : state.irmao.delete(el.dataset.eu);
      state.auto = false;
      renderMeals();
    }));
    $$('#fMeals [data-mais]').forEach((el) => el.addEventListener('click', () => {
      state.acomp[el.dataset.mais] = Math.min(C.maxAcompanhantes, state.acomp[el.dataset.mais] + 1);
      renderMeals();
    }));
    $$('#fMeals [data-menos]').forEach((el) => el.addEventListener('click', () => {
      state.acomp[el.dataset.menos] = Math.max(0, state.acomp[el.dataset.menos] - 1);
      renderMeals();
    }));
    renderResumo();
  }

  function descreverAcomp(a) {
    const { k3, k2, k1 } = pacotesAcomp(a);
    const partes = [];
    if (k3) partes.push(`${k3} nas três (${brl(P[3])} cada)`);
    if (k2) partes.push(`${k2} em duas (${brl(P[2])} cada)`);
    if (k1) partes.push(`${k1} ${k1 > 1 ? 'refeições avulsas' : 'refeição avulsa'} (${brl(P[1])} cada)`);
    return partes.join(' · ');
  }

  function renderResumo() {
    const c = contagem();
    const nome = $('#fNome').value.trim() || 'Você';
    const refsIrmao = C.refeicoes.filter((r) => state.irmao.has(r.id)).map((r) => r.nome);
    const temAcomp = IDS.some((id) => state.acomp[id]);
    const listaAcomp = IDS.filter((id) => state.acomp[id]).map((id) => qtd(id, state.acomp[id]));
    let linhas = `<li><span class="rf-sum-who">${esc(nome)}<small>${refsIrmao.length ? esc(refsIrmao.join(' · ')) : 'não vai às refeições'}</small></span><span>${valorIrmao() ? brl(valorIrmao()) : '—'}</span></li>`;
    if (temAcomp) {
      linhas += `<li><span class="rf-sum-who">Acompanhantes<small>${esc(listaAcomp.join(' · '))}<br>${esc(descreverAcomp(state.acomp))}</small></span><span>${brl(valorAcomp())}</span></li>`;
    }
    $('#rfResumo').innerHTML = `
      <ul class="rf-sum-list">${linhas}</ul>
      <div class="rf-sum-counts">${IDS.map((id) => `<span>${esc(qtd(id, c[id]))}</span>`).join('')}</div>
      <div class="rf-sum-total"><span>Total a pagar</span><strong>${brl(total())}</strong></div>`;
    $('#barTotal').textContent = brl(total());
  }

  /* ============================================================
     VALIDAÇÃO E GERAÇÃO DO PIX
     ============================================================ */
  function erro(msg, foco) {
    const el = $('#rfErro');
    el.textContent = msg;
    el.hidden = !msg;
    if (msg && foco) { foco.focus({ preventScroll: true }); foco.scrollIntoView({ behavior: 'smooth', block: 'center' }); }
  }

  function validar() {
    const nome = $('#fNome').value.trim();
    const whats = $('#fWhats').value.replace(/\D/g, '');
    if (nome.split(/\s+/).length < 2) return erro('Informe o seu nome completo.', $('#fNome')), false;
    if (whats.length < 10 || whats.length > 13) return erro('Informe um WhatsApp válido, com DDD.', $('#fWhats')), false;
    if (!$('#fLoja').value.trim()) return erro('Informe a sua Loja simbólica.', $('#fLoja')), false;
    if (total() <= 0) return erro('Escolha ao menos uma refeição.', $('#fMeals input')), false;
    erro('');
    return true;
  }

  const pagadorOutro = () => $('input[name="pagador"]:checked').value === 'outro';
  function marcarPagador(outro) {
    $$('input[name="pagador"]').forEach((el) => {
      el.checked = (el.value === 'outro') === outro;
      el.closest('label').classList.toggle('is-on', el.checked);
    });
    $('#fPagadorBox').hidden = !outro;
  }

  function montarPedido(codigo) {
    const c = contagem();
    return {
      acao: 'registrar',
      codigo,
      nome: $('#fNome').value.trim(),
      whatsapp: $('#fWhats').value.trim(),
      loja: $('#fLoja').value.trim(),
      sessoes: C.sessoes.filter((s) => state.sessoes.has(s.id)).map((s) => s.nome),
      // quem faz o Pix (opcional): ajuda a achar o pagamento no extrato
      pagadorOutro: pagadorOutro(),
      pagador: pagadorOutro() ? $('#fPagador').value.trim() : $('#fNome').value.trim(),
      bancoPagador: $('#fBanco').value.trim(),
      irmao: IDS.filter((id) => state.irmao.has(id)),
      acomp: { ...state.acomp },
      cafe: c.cafe || 0,
      almoco: c.almoco || 0,
      jantar: c.jantar || 0,
      valorIrmao: valorIrmao(),
      valorAcomp: valorAcomp(),
      valor: total(),
    };
  }

  async function gerarPix(ev) {
    if (ev) ev.preventDefault();
    if (!validar()) return;

    // Alterar o pedido mantém o mesmo código (a planilha atualiza a linha)
    const codigo = (state.pedido && state.pedido.codigo) || novoCodigo();
    const dados = montarPedido(codigo);
    // Sem chave Pix (versão de avaliação): percorre o fluxo, mas sem QR
    const payload = PIX_OK ? pixPayload(dados.valor, codigo) : '';
    state.pedido = { ...dados, payload, status: 'Pix gerado', criadoEm: new Date().toISOString() };
    lsSet(LS.pedido, state.pedido);

    mostrarPagamento();
    enviar(dados); // registra já na geração do QR (sem esperar)
  }

  function desenharQr(texto) {
    const qr = qrcode(0, 'M');
    qr.addData(texto);
    qr.make();
    $('#payQr').innerHTML = qr.createSvgTag({ cellSize: 6, margin: 2, scalable: true });
  }

  const resumoCurto = (p) => IDS.filter((id) => p[id]).map((id) => qtd(id, p[id])).join(' · ');

  function mostrarPagamento() {
    const p = state.pedido;
    $('#rfForm').hidden = true;
    $('#rfFeito').hidden = true;
    $('#rfSaved').innerHTML = '';
    $('#rfPagamento').hidden = false;
    $('#rfBar').hidden = true;
    document.body.dataset.modo = 'pagamento';

    $('#payCodigo').textContent = p.codigo;
    $('#payCodigo2').textContent = p.codigo;
    $('#payTotal').textContent = brl(p.valor);
    $('#payQuem').textContent = `${p.nome} · ${resumoCurto(p)}`;
    $('#payChave').textContent = C.pix.chave;
    $('#payFavorecido').textContent = C.pix.titular || C.pix.nome;
    $('#payBanco').textContent = C.pix.banco;
    $('#payBanco').hidden = $('#payBancoLbl').hidden = !C.pix.banco;
    $('#payValor').textContent = brl(p.valor);
    $('#btnCopiaCola').hidden = $('#btnCopiaChave').hidden = !p.payload;
    if (p.payload) desenharQr(p.payload);
    else {
      $('#payChave').textContent = 'a definir';
      $('#payQr').innerHTML = '<p class="rf-qr-demo">Versão de avaliação<br><small>O QR Code do Pix do Grande Tesoureiro aparece aqui, já com o valor.</small></p>';
    }
    window.scrollTo({ top: 0 });
  }

  async function informarPagamento() {
    const p = state.pedido;
    p.status = 'Pagamento informado';
    p.pagoEm = new Date().toISOString();
    lsSet(LS.pedido, p);
    enviar({ acao: 'pago', codigo: p.codigo });
    mostrarFeito();
  }

  function mostrarFeito() {
    const p = state.pedido;
    $('#rfForm').hidden = true;
    $('#rfPagamento').hidden = true;
    $('#rfFeito').hidden = false;
    $('#rfBar').hidden = true;
    document.body.dataset.modo = 'feito';
    $('#doneNome').textContent = p.nome.split(' ')[0];
    $('#doneCodigo').textContent = p.codigo;
    $('#doneTotal').textContent = brl(p.valor);
    window.scrollTo({ top: 0 });
  }

  function voltarAoFormulario(limpar) {
    if (limpar) {
      state = novoEstado();
      $('#rfForm').reset();
      marcarPagador(false);
      $$('#fSessoes input').forEach((el) => { el.checked = false; });
    }
    $('#rfPagamento').hidden = true;
    $('#rfFeito').hidden = true;
    $('#rfForm').hidden = false;
    $('#rfBar').hidden = false;
    document.body.dataset.modo = '';
    renderMeals();
    window.scrollTo({ top: $('#rfForm').offsetTop - 70, behavior: 'smooth' });
  }

  /* Recarrega um pedido salvo no formulário (para "Alterar o pedido") */
  function preencherFormulario(p) {
    $('#fNome').value = p.nome;
    $('#fWhats').value = p.whatsapp;
    $('#fLoja').value = p.loja || '';
    state.sessoes = new Set(C.sessoes.filter((s) => (p.sessoes || []).includes(s.nome)).map((s) => s.id));
    $$('#fSessoes input').forEach((el) => { el.checked = state.sessoes.has(el.value); });
    state.irmao = new Set(p.irmao || []);
    state.acomp = Object.fromEntries(IDS.map((id) => [id, (p.acomp && p.acomp[id]) || 0]));
    state.auto = false;
    marcarPagador(!!p.pagadorOutro);
    $('#fPagador').value = p.pagadorOutro ? (p.pagador || '') : '';
    $('#fBanco').value = p.bancoPagador || '';
  }

  /* ---------- pedido salvo neste aparelho ---------- */
  async function renderSalvo() {
    const p = lsGet(LS.pedido, null);
    if (!p || !p.acomp) return; // ignora formato antigo
    state.pedido = p;
    preencherFormulario(p);
    const box = $('#rfSaved');
    const desenhar = (status) => {
      const conf = /confirmad/i.test(status);
      box.innerHTML = `<div class="rf-card rf-saved${conf ? ' is-ok' : ''}">
        <div class="rf-saved-head">
          <div><span class="rf-muted">Seu pedido</span><strong>${esc(p.codigo)} · ${brl(p.valor)}</strong></div>
          <span class="rf-badge${conf ? ' is-ok' : ''}">${esc(status)}</span>
        </div>
        <p class="rf-muted">${esc(p.nome)} · ${esc(resumoCurto(p))}</p>
        <div class="rf-saved-actions">
          ${conf ? '' : '<button type="button" class="rf-btn rf-btn-gold" id="savedPix">Ver o Pix</button>'}
          <button type="button" class="rf-btn rf-btn-ghost" id="savedNovo">Novo pedido</button>
        </div>
      </div>`;
      const ver = $('#savedPix');
      if (ver) ver.addEventListener('click', mostrarPagamento);
      $('#savedNovo').addEventListener('click', () => { box.innerHTML = ''; voltarAoFormulario(true); });
    };
    desenhar(p.status);
    renderMeals();
    const remoto = await consultarStatus(p.codigo);
    if (remoto && remoto !== p.status) { p.status = remoto; lsSet(LS.pedido, p); desenhar(remoto); }
  }

  /* ---------- utilidades ---------- */
  let toastTimer;
  function toast(msg) {
    const el = $('#toast');
    el.textContent = msg;
    el.classList.add('is-visible');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('is-visible'), 2200);
  }
  async function copiar(texto, msg) {
    try { await navigator.clipboard.writeText(texto); }
    catch (e) {
      const ta = document.createElement('textarea');
      ta.value = texto; document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy'); } catch (e2) { /* sem cópia */ }
      ta.remove();
    }
    toast(msg);
  }

  function mascaraWhats(el) {
    el.addEventListener('input', () => {
      const d = el.value.replace(/\D/g, '').slice(0, 11);
      if (d.length <= 2) el.value = d.length ? '(' + d : '';
      else if (d.length <= 6) el.value = `(${d.slice(0, 2)}) ${d.slice(2)}`;
      else if (d.length <= 10) el.value = `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
      else el.value = `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
    });
  }

  /* ============================================================
     INÍCIO
     ============================================================ */
  function init() {
    renderPrecos();
    renderSessoes();
    mascaraWhats($('#fWhats'));
    $('#rfIncluso').textContent = C.inclusoTexto;

    if (C.encerraEm && Date.now() > Date.parse(C.encerraEm)) {
      $('#rfForm').hidden = true;
      $('#rfBar').hidden = true;
      $('#rfClosed').hidden = false;
    }

    $('#fNome').addEventListener('input', renderResumo);
    $$('input[name="pagador"]').forEach((el) => el.addEventListener('change', () => {
      marcarPagador(el.value === 'outro');
      if (el.value === 'outro') $('#fPagador').focus();
    }));
    $$('#fAtalhos [data-atalho]').forEach((el) => el.addEventListener('click', () => {
      state.irmao = new Set(el.dataset.atalho.split(','));
      state.auto = false;
      renderMeals();
    }));
    $('#rfForm').addEventListener('submit', gerarPix);
    $('#barGerar').addEventListener('click', gerarPix);
    $('#btnCopiaCola').addEventListener('click', () => copiar(state.pedido.payload, 'Código Pix copiado'));
    $('#btnCopiaChave').addEventListener('click', () => copiar(C.pix.chave, 'Chave Pix copiada'));
    $('#btnPaguei').addEventListener('click', informarPagamento);
    $('#btnAlterar').addEventListener('click', () => { preencherFormulario(state.pedido); voltarAoFormulario(false); });
    $('#btnNovo').addEventListener('click', () => voltarAoFormulario(true));

    if (!API_OK) $('#rfFootNote').textContent = 'Modo de teste · planilha ainda não conectada';
    $('#rfDemo').hidden = PIX_OK;

    renderMeals();
    renderSalvo();
    esvaziarFila();
    window.addEventListener('online', esvaziarFila);

    if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
  }

  init();
})();
