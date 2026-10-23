/* ============================================================
   refeicoes-config.js — TUDO O QUE SE EDITA NA PÁGINA DE REFEIÇÕES
   (preços, cardápio, Pix do tesoureiro, endereço da planilha)

   Depois de editar no GitHub: suba o CACHE em sw.js (v1 → v2…).

   ATENÇÃO: repositório público. Prefira uma chave Pix ALEATÓRIA
   ou de e-mail; CPF e telefone ficariam expostos a qualquer um.
   ============================================================ */

const REFEICOES_CONFIG = {
  /* URL /exec do Apps Script da planilha "Refeições" (ver LANCAMENTO.md).
     Enquanto começar com COLE_, o site funciona e gera o Pix normalmente,
     mas NÃO grava os pedidos na planilha (aparece um aviso no rodapé). */
  apiUrl: 'COLE_AQUI_A_URL_DO_APPS_SCRIPT',

  /* Dados do recebedor (Grande Tesoureiro da Delegacia).
     nome: até 25 letras, sem acento, como está no banco.
     cidade: até 15 letras, sem acento. */
  pix: {
    chave: 'COLE_AQUI_A_CHAVE_PIX',
    nome: 'MARCELO CORREIA',
    cidade: 'CUIABA',
    banco: '',               // ex.: 'Sicredi' — só para exibir
    titular: 'Ir. Marcelo Correia · Grande Tesoureiro da 4ª Delegacia Litúrgica',
  },

  /* Preço por pessoa conforme o NÚMERO de refeições escolhidas.
     Buffet: R$ 45 uma refeição · R$ 120 as três.
     Duas refeições = 2 × R$ 45 (confirmar com o buffet).
     Acompanhantes são contados por refeição; os que aparecem nas três
     (o menor dos três contadores) pagam o pacote de três. */
  precoPorQuantidade: { 1: 45, 2: 90, 3: 120 },

  refeicoes: [
    {
      id: 'cafe', nome: 'Café da manhã', hora: '07h00', curto: ['café', 'cafés'],
      cardapio: '5 tipos de frutas · 2 tipos de bolo · sanduíche de queijo e presunto no pão baguete · tortinha de frango · "buraco quente" (pão com carne moída) · café preto com e sem açúcar · leite · chá mate',
    },
    {
      id: 'almoco', nome: 'Almoço', hora: '12h30', curto: ['almoço', 'almoços'],
      cardapio: 'Culinária cuiabana: Maria Izabel · farofa de banana · feijão empamonado · salada verde · maionese. Sobremesa: furrundu, doce de leite e manjar de coco',
    },
    {
      id: 'jantar', nome: 'Jantar comemorativo', hora: '20h35', curto: ['jantar', 'jantares'],
      cardapio: 'Lagarto ao molho madeira · arroz branco · farofa de bacon · salada verde · maionese. Sobremesa: manjar de coco e mousse de maracujá',
    },
  ],

  inclusoTexto: 'Incluso em todas as refeições: refrigerante (normal e diet) e suco natural de laranja.',

  /* Sessões que o irmão pode marcar. "sugere" = refeições que a página
     marca sozinha quando ele escolhe a sessão (ele pode desmarcar). */
  sessoes: [
    { id: 'manha', nome: 'Manhã · Ilustre e Sublime Capítulo', detalhe: '07h00 às 12h30 · Graus 4º ao 18º', sugere: ['cafe', 'almoco'] },
    { id: 'tarde', nome: 'Tarde · Poderoso Grande Conselho', detalhe: '13h30 às 16h45 · Graus 19º ao 30º', sugere: ['almoco'] },
    { id: 'noite', nome: 'Noite · Colendo Alto Colégio', detalhe: '17h00 às 18h05 · Graus 31º e 32º', sugere: ['jantar'] },
    { id: 'grau33', nome: 'Investidura no Grau 33', detalhe: '18h30 às 20h00', sugere: ['jantar'] },
    { id: 'fundacao', nome: 'Solenidade Histórica de Fundação', detalhe: '20h00 às 20h35', sugere: ['jantar'] },
  ],

  /* Limite do contador de acompanhantes em cada refeição */
  maxAcompanhantes: 6,

  /* Data/hora em que a página para de aceitar pedidos (vazio = sem prazo).
     Formato: '2026-11-04T23:59:00-04:00' */
  encerraEm: '',
};
