# Lançamento — passo a passo (na ordem)

Site: `https://viaveritasvita.github.io/rbcuiaba26/` · Evento: sábado, 7 de novembro de 2026 · Cuiabá – MT

| Página | Endereço | Para quem |
|---|---|---|
| Ágape — refeições (página de entrada) | `/rbcuiaba26/` | todos os irmãos |
| Programação | `/rbcuiaba26/programacao.html` | todos os irmãos |
| Painel das refeições | `/rbcuiaba26/painel.html` | organização e Grande Tesoureiro (com senha) |

---

## PARTE 1 — Planilha dos pedidos · ~10 min

**1.** sheets.google.com → planilha nova → nome **"Refeições — Jornada RB Cuiabá"**.

**2.** **Extensões → Apps Script**. Apague o que aparecer, abra `planilha/AppsScript-refeicoes.gs`,
copie tudo e cole. Na linha `const CHAVE_PAINEL = 'TROQUE-ESTA-SENHA';` ponha uma senha sua
(é a senha do painel). Salvar (disquete).

**3.** No menu de funções (ao lado de "Executar"), escolha **configurar** → **Executar** → autorize
a conta (Avançado → Acessar o projeto). Volte à planilha: devem existir as abas **Pedidos** e **Resumo**.

**4.** **Implantar → Nova implantação** → engrenagem → **App da Web** →
*Executar como* = **Eu** · *Quem pode acessar* = **Qualquer pessoa** → **Implantar** →
copie a **URL que termina em /exec**.

**5.** Abra essa URL no navegador. Deve aparecer `{"ok":true,"servico":"Refeições · Jornada RB Cuiabá 2026"}`.

> Mudou o código do Apps Script depois? **Implantar → Gerenciar implantações → lápis →
> Versão: Nova versão → Implantar.** A URL continua a mesma.

---

## PARTE 2 — Dados do Pix e da planilha no site · ~3 min

Abra `refeicoes-config.js` e preencha:

- `apiUrl` → a URL /exec do passo 4.
- `pix.chave` → a chave Pix do Grande Tesoureiro. **Use chave aleatória ou e-mail**
  (o repositório é público; CPF ou telefone ficariam expostos).
  Telefone, se for o caso, no formato `+5565999999999`.
- `pix.nome` → nome do titular **como está no banco**, sem acento, até 25 letras.
- `pix.banco` → opcional, só para exibir.
- `encerraEm` → opcional, data em que os pedidos fecham.

**Teste obrigatório antes de divulgar:** gere um pedido de verdade, leia o QR com o app do banco
e confira se aparecem o **nome do tesoureiro** e o **valor**. Não precisa pagar.

---

## PARTE 3 — GitHub (site no ar) · ~10 min

**6.** github.com com a conta `viaveritasvita` → **New** → *Repository name* = `rbcuiaba26` ·
**Public** · sem README → **Create repository**.

**7.** Clique em **"uploading an existing file"** e **arraste TUDO** de dentro da pasta `site/`
(arquivos soltos **e** as pastas `assets/` e `planilha/`). *Arraste — "choose your files" ignora
pastas.* Confira se aparecem `assets/brasao.png` e `assets/qrcode.min.js` → **Commit changes**.

**8.** **Settings → Pages** → *Deploy from a branch* → **main** / **(root)** → **Save**.
Em 1–3 min o site abre em `https://viaveritasvita.github.io/rbcuiaba26/`.

---

## PARTE 4 — Divulgação

**9.** tinyurl.com → `https://viaveritasvita.github.io/rbcuiaba26/` → alias `rbcuiaba26` →
gere o QR para o grupo/convite. O link abre direto na página do **Ágape**; dali o irmão
vai para a **Programação** pela barra do topo (e vice-versa).

---

## Como o tesoureiro confere

1. Cada pedido gera um código (ex.: `RB7K3QZX`). Ele vai **dentro do Pix** (identificador) e
   aparece na planilha, aba **Pedidos**.
2. Status automáticos: **Pix gerado** (o irmão viu o QR) → **Pagamento informado** (tocou em
   "Já fiz o Pix").
3. Com o extrato em mãos, o tesoureiro troca o Status para **Confirmado** (ou **Não localizado**).
   A data da confirmação é gravada sozinha, e o irmão passa a ver "Confirmado" no celular.
4. Aba **Resumo**: quantos cafés, almoços e jantares encomendar ao buffet e quanto já entrou.
5. `painel.html` mostra o mesmo, em tela, com busca, link de WhatsApp e exportação em CSV.

---

## Depois do lançamento — o que muda onde

| Quer mudar… | Onde | Precisa subir o CACHE em `sw.js`? |
|---|---|---|
| Preço, cardápio, chave Pix, prazo | `refeicoes-config.js` | Não (é lido da rede) |
| Horário ou título da programação | `data.js` (depois `node planilha/gerar-ics.js`) | Não |
| Local do evento | `data.js` → `LOCATIONS` e `loc:` nas sessões | Não |
| Textos, cores, layout, `refeicoes.js` | arquivo correspondente | **Sim** (`rbcuiaba26-v1` → `v2`…) |
