/* ============================================================
   AppsScript-refeicoes.gs — registro dos pedidos de refeição
   Jornada dos Graus Filosóficos · Rito Brasileiro · Cuiabá 2026

   Onde colar: planilha "Refeições — Jornada RB" → Extensões →
   Apps Script. Passo a passo completo em LANCAMENTO.md.

   O que faz:
   - POST {acao:'registrar'} → cria (ou atualiza) a linha do pedido
     com status "Pix gerado" no momento em que o QR aparece.
   - POST {acao:'pago'}      → marca "Pagamento informado" quando
     o irmão toca em "Já fiz o Pix".
   - GET ?acao=status&codigo=RBXXXXXX → devolve só o status
     (a página mostra "Confirmado" quando o tesoureiro confirmar).
   - GET ?acao=listar&chave=SENHA     → lista tudo para o painel.html.

   O tesoureiro confere o extrato e troca a coluna Status para
   "Confirmado" (menu suspenso). Nada mais precisa ser editado.
   ============================================================ */

/* Senha do painel.html — TROQUE antes de implantar.
   Fica só aqui no Apps Script, nunca no GitHub. */
const CHAVE_PAINEL = 'TROQUE-ESTA-SENHA';

const ABA = 'Pedidos';
const CABECALHO = [
  'Código', 'Status', 'Criado em', 'Pagamento informado em', 'Confirmado em',
  'Irmão', 'WhatsApp', 'Loja simbólica', 'Sessões', 'Refeições do irmão',
  'Acomp. café', 'Acomp. almoço', 'Acomp. jantar', 'Cafés', 'Almoços', 'Jantares',
  'Valor (R$)', 'Observação do tesoureiro',
];
const COL = Object.fromEntries(CABECALHO.map((h, i) => [h, i + 1]));
const STATUS = ['Pix gerado', 'Pagamento informado', 'Confirmado', 'Não localizado', 'Cancelado'];
const NOMES_REFEICAO = { cafe: 'café', almoco: 'almoço', jantar: 'jantar' };

/* Rode UMA VEZ (menu Executar → configurar) para montar a aba. */
function configurar() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  ss.setSpreadsheetTimeZone('America/Cuiaba');
  let sh = ss.getSheetByName(ABA);
  if (!sh) sh = ss.insertSheet(ABA, 0);
  sh.getRange(1, 1, 1, CABECALHO.length).setValues([CABECALHO])
    .setFontWeight('bold').setBackground('#581828').setFontColor('#e6cd94');
  sh.setFrozenRows(1);
  sh.setColumnWidth(COL['Refeições do irmão'], 200);
  sh.setColumnWidth(COL['Sessões'], 260);
  const regra = SpreadsheetApp.newDataValidation().requireValueInList(STATUS, true).build();
  sh.getRange(2, COL['Status'], 1000, 1).setDataValidation(regra);
  sh.getRange(2, COL['Valor (R$)'], 1000, 1).setNumberFormat('"R$" #,##0.00');
  sh.getRange(2, COL['WhatsApp'], 1000, 1).setNumberFormat('@');

  // cores por status
  const faixa = sh.getRange(2, 1, 1000, CABECALHO.length);
  const f = (txt, cor) => SpreadsheetApp.newConditionalFormatRule()
    .whenFormulaSatisfied('=$B2="' + txt + '"').setBackground(cor).setRanges([faixa]).build();
  sh.setConditionalFormatRules([
    f('Confirmado', '#e3f1e6'),
    f('Pagamento informado', '#fdf3d8'),
    f('Não localizado', '#f7e0e0'),
    f('Cancelado', '#eeeeee'),
  ]);
  montarResumo_(ss);
}

/* Aba "Resumo": números para o buffet e para o tesoureiro (fórmulas vivas). */
function montarResumo_(ss) {
  let r = ss.getSheetByName('Resumo');
  if (!r) r = ss.insertSheet('Resumo');
  r.clear();
  const p = "'" + ABA + "'!";
  const col = function (h) { const l = letra_(COL[h]); return p + l + '2:' + l; };
  const st = col('Status');
  const linhas = [
    ['Resumo dos pedidos', ''],
    ['Pedidos (exceto cancelados)', '=COUNTIFS(' + col('Código') + ',"<>",' + st + ',"<>Cancelado")'],
    ['Cafés da manhã', '=SUMIFS(' + col('Cafés') + ',' + st + ',"<>Cancelado")'],
    ['Almoços', '=SUMIFS(' + col('Almoços') + ',' + st + ',"<>Cancelado")'],
    ['Jantares', '=SUMIFS(' + col('Jantares') + ',' + st + ',"<>Cancelado")'],
    ['Valor total (R$)', '=SUMIFS(' + col('Valor (R$)') + ',' + st + ',"<>Cancelado")'],
    ['Valor confirmado (R$)', '=SUMIFS(' + col('Valor (R$)') + ',' + st + ',"Confirmado")'],
    ['Aguardando conferência (R$)', '=SUMIFS(' + col('Valor (R$)') + ',' + st + ',"Pagamento informado")'],
    ['Pix gerado sem aviso de pagamento', '=COUNTIFS(' + st + ',"Pix gerado")'],
  ];
  r.getRange(1, 1, linhas.length, 2).setValues(linhas);
  r.getRange('A1').setFontWeight('bold').setFontSize(13);
  r.getRange('B6:B8').setNumberFormat('"R$" #,##0.00');
  r.setColumnWidth(1, 280);
}

/* ---------------- entrada pela página ---------------- */
function doPost(e) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const d = JSON.parse(e.postData.contents);
    if (!/^RB[A-Z0-9]{6}$/.test(d.codigo || '')) return json_({ ok: false, erro: 'código inválido' });
    const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(ABA);
    const linha = acharLinha_(sh, d.codigo);
    const agora = new Date();

    if (d.acao === 'registrar') {
      const acomp = d.acomp || {};
      const valores = {
        'Código': d.codigo,
        'Irmão': texto_(d.nome, 120),
        'WhatsApp': texto_(d.whatsapp, 30),
        'Loja simbólica': texto_(d.loja, 120),
        'Sessões': (d.sessoes || []).map(function (s) { return texto_(s, 80); }).join('\n'),
        'Refeições do irmão': (d.irmao || []).map(function (id) { return NOMES_REFEICAO[id] || ''; }).join(', ') || '—',
        'Acomp. café': Number(acomp.cafe) || 0,
        'Acomp. almoço': Number(acomp.almoco) || 0,
        'Acomp. jantar': Number(acomp.jantar) || 0,
        'Cafés': Number(d.cafe) || 0,
        'Almoços': Number(d.almoco) || 0,
        'Jantares': Number(d.jantar) || 0,
        'Valor (R$)': Number(d.valor) || 0,
      };
      if (linha) {
        // pedido alterado: atualiza os dados, sem rebaixar um status já avançado
        Object.keys(valores).forEach(function (h) { sh.getRange(linha, COL[h]).setValue(valores[h]); });
      } else {
        valores['Status'] = 'Pix gerado';
        valores['Criado em'] = agora;
        sh.appendRow(CABECALHO.map(function (h) { return valores[h] !== undefined ? valores[h] : ''; }));
      }
      return json_({ ok: true });
    }

    if (d.acao === 'pago') {
      if (!linha) return json_({ ok: false, erro: 'pedido não encontrado' });
      const st = sh.getRange(linha, COL['Status']).getValue();
      if (st !== 'Confirmado') sh.getRange(linha, COL['Status']).setValue('Pagamento informado');
      sh.getRange(linha, COL['Pagamento informado em']).setValue(agora);
      return json_({ ok: true });
    }

    return json_({ ok: false, erro: 'ação desconhecida' });
  } finally {
    lock.releaseLock();
  }
}

/* ---------------- consultas ---------------- */
function doGet(e) {
  const q = e.parameter || {};
  const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(ABA);

  if (q.acao === 'status') {
    const linha = acharLinha_(sh, q.codigo || '');
    if (!linha) return json_({ ok: false });
    return json_({ ok: true, status: sh.getRange(linha, COL['Status']).getValue() });
  }

  if (q.acao === 'listar') {
    if (q.chave !== CHAVE_PAINEL || CHAVE_PAINEL === 'TROQUE-ESTA-SENHA') return json_({ ok: false, erro: 'senha incorreta' });
    const dados = sh.getDataRange().getValues();
    const cab = dados.shift();
    const pedidos = dados.filter(function (r) { return r[0]; }).map(function (r) {
      const o = {};
      cab.forEach(function (h, i) { o[h] = r[i] instanceof Date ? r[i].toISOString() : r[i]; });
      return o;
    });
    return json_({ ok: true, pedidos: pedidos, atualizado: new Date().toISOString() });
  }

  return json_({ ok: true, servico: 'Refeições · Jornada RB Cuiabá 2026' });
}

/* Quando o tesoureiro marca "Confirmado", grava a data sozinho.
   (Gatilho simples: funciona sem configurar nada.) */
function onEdit(e) {
  const sh = e.range.getSheet();
  if (sh.getName() !== ABA || e.range.getColumn() !== COL['Status'] || e.range.getRow() < 2) return;
  if (e.value === 'Confirmado') sh.getRange(e.range.getRow(), COL['Confirmado em']).setValue(new Date());
}

/* ---------------- utilidades ---------------- */
/* número da coluna → letra (1 → A, 27 → AA) */
function letra_(n) {
  let s = '';
  while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); }
  return s;
}
function acharLinha_(sh, codigo) {
  if (!codigo) return 0;
  const ultima = sh.getLastRow();
  if (ultima < 2) return 0;
  const achou = sh.getRange(2, 1, ultima - 1, 1).createTextFinder(codigo).matchEntireCell(true).findNext();
  return achou ? achou.getRow() : 0;
}
/* impede fórmula injetada (=, +, -, @ no início) e corta tamanho */
function texto_(s, max) {
  s = String(s == null ? '' : s).slice(0, max);
  return /^[=+\-@]/.test(s) ? "'" + s : s;
}
function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
