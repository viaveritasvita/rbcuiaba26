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
   - POST {acao:'confirmar', chave, itens:[{codigo, obs}]} → marca
     vários pedidos como Confirmado (conferência pelo extrato).

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
  // acrescentadas depois do lançamento (sempre no fim, para não deslocar as colunas)
  'Titular da conta do Pix', 'Banco do Pix',
  'Centavos de identificação', 'Comprovante',
];
const COL = Object.fromEntries(CABECALHO.map((h, i) => [h, i + 1]));
const STATUS = ['Pix gerado', 'Pagamento informado', 'Confirmado', 'Não localizado', 'Cancelado'];
const NOMES_REFEICAO = { cafe: 'café', almoco: 'almoço', jantar: 'jantar' };

/* Rode UMA VEZ (menu Executar → configurar) para montar a aba.
   Rodar de novo é seguro: também cria a pasta dos comprovantes no Drive. */
function configurar() {
  pastaComprovantes_();
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
  sh.getRange(2, COL['Centavos de identificação'], 1000, 1).setNumberFormat('"R$" 0.00');
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
    const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(ABA);
    garantirCabecalho_(sh);
    const agora = new Date();

    /* Conferência do tesoureiro: marca vários pedidos como Confirmado
       de uma vez (painel ou automação), protegida pela senha do painel.
       itens: [{ codigo: 'RB...', obs: 'Pix 99Pay 24/10 09:03' }] */
    if (d.acao === 'confirmar') {
      if (d.chave !== CHAVE_PAINEL || CHAVE_PAINEL === 'TROQUE-ESTA-SENHA') return json_({ ok: false, erro: 'senha incorreta' });
      const feitos = [], ausentes = [];
      (d.itens || []).forEach(function (it) {
        const l = acharLinha_(sh, String(it.codigo || ''));
        if (!l) { ausentes.push(it.codigo); return; }
        sh.getRange(l, COL['Status']).setValue('Confirmado');
        sh.getRange(l, COL['Confirmado em']).setValue(agora);
        if (it.obs) sh.getRange(l, COL['Observação do tesoureiro']).setValue(texto_(it.obs, 300));
        feitos.push(it.codigo);
      });
      return json_({ ok: true, confirmados: feitos, naoEncontrados: ausentes });
    }

    /* Remove linhas de teste (ou pedidos desistidos), protegida pela senha.
       codigos: ['RB...']. Não apaga o comprovante do Drive. */
    if (d.acao === 'remover') {
      if (d.chave !== CHAVE_PAINEL || CHAVE_PAINEL === 'TROQUE-ESTA-SENHA') return json_({ ok: false, erro: 'senha incorreta' });
      const removidos = [];
      (d.codigos || []).forEach(function (cod) {
        const l = acharLinha_(sh, String(cod || ''));
        if (l) { sh.deleteRow(l); removidos.push(cod); }
      });
      return json_({ ok: true, removidos: removidos });
    }

    if (!/^RB[A-Z0-9]{6}$/.test(d.codigo || '')) return json_({ ok: false, erro: 'código inválido' });
    const linha = acharLinha_(sh, d.codigo);

    if (d.acao === 'registrar') {
      const acomp = d.acomp || {};
      const base = Math.round((Number(d.valorBase !== undefined ? d.valorBase : d.valor) || 0) * 100) / 100;
      // página antiga (sem valorBase) gera o Pix sem centavos: não acrescentar nenhum
      const cent = d.valorBase === undefined ? 0 : escolherCentavos_(sh, linha, base, d.centavosFixos);
      const valorFinal = Math.round((base + cent / 100) * 100) / 100;
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
        'Valor (R$)': valorFinal,
        'Centavos de identificação': cent / 100,
        'Titular da conta do Pix': texto_(d.pagadorOutro ? d.pagador : (d.pagador ? d.pagador + ' (o próprio)' : ''), 120),
        'Banco do Pix': texto_(d.bancoPagador, 60),
      };
      if (linha) {
        // pedido alterado: atualiza os dados, sem rebaixar um status já avançado
        Object.keys(valores).forEach(function (h) { sh.getRange(linha, COL[h]).setValue(valores[h]); });
      } else {
        valores['Status'] = 'Pix gerado';
        valores['Criado em'] = agora;
        sh.appendRow(CABECALHO.map(function (h) { return valores[h] !== undefined ? valores[h] : ''; }));
      }
      return json_({ ok: true, centavos: cent, valor: valorFinal });
    }

    /* Comprovante enviado pelo irmão (foto ou PDF, em base64):
       vai para a pasta do Drive e o link fica na linha do pedido. */
    if (d.acao === 'comprovante') {
      if (!linha) return json_({ ok: false, erro: 'pedido não encontrado' });
      const tipos = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/heic': 'heic', 'application/pdf': 'pdf' };
      const ext = tipos[d.mime];
      if (!ext) return json_({ ok: false, erro: 'tipo de arquivo não aceito' });
      if (!d.dados || d.dados.length > 8 * 1024 * 1024) return json_({ ok: false, erro: 'arquivo grande demais' });
      const nomeIrmao = String(sh.getRange(linha, COL['Irmão']).getValue()).slice(0, 60);
      const blob = Utilities.newBlob(Utilities.base64Decode(d.dados), d.mime, d.codigo + ' - ' + nomeIrmao + '.' + ext);
      const arq = pastaComprovantes_().createFile(blob);
      sh.getRange(linha, COL['Comprovante']).setValue(arq.getUrl());
      const st = sh.getRange(linha, COL['Status']).getValue();
      if (st === 'Pix gerado') {
        sh.getRange(linha, COL['Status']).setValue('Pagamento informado');
        sh.getRange(linha, COL['Pagamento informado em']).setValue(agora);
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

/* ---------------- centavos de identificação ----------------
   Cada pedido recebe centavos (R$ 0,01 a 0,99) que nenhum outro pedido
   ativo com o mesmo valor base usa. Assim, só pelo valor no extrato o
   tesoureiro sabe de quem é o Pix. Pedido alterado mantém os centavos
   se o valor base não mudou. */
function escolherCentavos_(sh, linha, base, fixos) {
  if (fixos !== undefined && fixos !== null && fixos !== '') return Math.max(0, Math.min(99, Number(fixos) || 0));
  const ultima = sh.getLastRow();
  const usados = {};
  if (ultima >= 2) {
    const vals = sh.getRange(2, 1, ultima - 1, CABECALHO.length).getValues();
    vals.forEach(function (r, i) {
      if (!r[0] || r[COL['Status'] - 1] === 'Cancelado') return;
      const c = Math.round((Number(r[COL['Centavos de identificação'] - 1]) || 0) * 100);
      const b = Math.round(((Number(r[COL['Valor (R$)'] - 1]) || 0) - c / 100) * 100) / 100;
      if (b !== base) return;
      if (linha && i + 2 === linha) { usados.proprio = c; return; }
      usados[c] = true;
    });
  }
  if (usados.proprio && !usados[usados.proprio]) return usados.proprio;
  const livres = [];
  for (let c = 1; c <= 99; c++) if (!usados[c]) livres.push(c);
  return livres.length ? livres[Math.floor(Math.random() * livres.length)] : 0;
}

/* Pasta "Comprovantes — Ágape Jornada RB 2026" no Drive do dono da planilha */
function pastaComprovantes_() {
  const props = PropertiesService.getScriptProperties();
  const id = props.getProperty('PASTA_COMPROVANTES');
  if (id) { try { return DriveApp.getFolderById(id); } catch (e) { /* apagada: cria outra */ } }
  const pasta = DriveApp.createFolder('Comprovantes — Ágape Jornada RB 2026');
  props.setProperty('PASTA_COMPROVANTES', pasta.getId());
  return pasta;
}

/* ---------------- utilidades ---------------- */
/* Colunas novas entram no fim do cabeçalho sem mexer nas linhas já gravadas */
function garantirCabecalho_(sh) {
  const atual = sh.getRange(1, 1, 1, CABECALHO.length).getValues()[0];
  if (atual.join('|') === CABECALHO.join('|')) return;
  sh.getRange(1, 1, 1, CABECALHO.length).setValues([CABECALHO])
    .setFontWeight('bold').setBackground('#581828').setFontColor('#e6cd94');
}
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
