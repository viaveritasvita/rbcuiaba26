/* ============================================================
   i18n.js — TEXTOS DE INTERFACE (somente PT)
   O motor (app.js) lê I18N[lang][chave] e recua para I18N.pt.
   Este evento é só em português: existe apenas o bloco `pt`.
   ============================================================ */

const I18N = {
  pt: {
    langName: 'Português',
    docTitle: 'Programação — Jornada dos Graus Filosóficos · Rito Brasileiro · Cuiabá 2026',
    eyebrow: 'Sábado · Cuiabá · MT',
    programTitle: 'Jornada dos Graus Filosóficos',
    datesPlaque: '7 de novembro de 2026',
    motto1: 'Investidura e fundação dos Corpos Filosóficos',
    motto2: '4ª Delegacia Litúrgica de Mato Grosso · Supremo Conclave do Brasil',

    weekdays: { mon: 'Segunda-feira', tue: 'Terça-feira', wed: 'Quarta-feira', thu: 'Quinta-feira', fri: 'Sexta-feira', sat: 'Sábado', sun: 'Domingo' },
    weekdaysShort: { mon: 'Seg', tue: 'Ter', wed: 'Qua', thu: 'Qui', fri: 'Sex', sat: 'Sáb', sun: 'Dom' },
    monthShort: 'nov',
    dayOfMonthLabel: 'de novembro',

    now: 'Agora',
    next: 'A seguir',
    startsIn: 'começa em',
    endsIn: 'termina em',
    openingCountdown: 'Contagem para a abertura',
    openingDate: 'Sábado, 7 de novembro · 7h',
    closedTitle: 'Trabalhos encerrados',
    closedMsg: 'A Jornada dos Graus Filosóficos cumpriu o seu propósito. Gratidão a todos os irmãos que fizeram parte desta fundação.',
    days: 'd', hours: 'h', minutes: 'min', seconds: 's',

    tabsLabel: 'Dias do evento',
    viewAll: 'Programação completa',
    viewMine: 'Meu roteiro',
    emptyMine: 'O seu roteiro ainda está vazio.',
    vesperTag: 'atividades preliminares · véspera',
    tabVesperMini: 'preliminares',

    legendTitle: 'Legenda de cores',
    legendLogistics: 'Refeições',

    inProgress: 'em curso',
    restrictedLabel: 'Atenção',
    noteLabel: 'Observação',
    openMap: 'Abrir no mapa',
    gcalBtn: 'Google Agenda',
    icsBtn: 'Baixar (.ics)',
    addAllToCalendar: 'Agenda (.ics)',
    addAllToCalendarLong: 'Baixar agenda completa (.ics)',
    favAdd: 'Adicionar ao meu roteiro',
    favRemove: 'Remover do meu roteiro',
    toBeDefined: 'Local a definir',

    locationsTitle: 'Locais',
    locationsSub: 'Toda a Jornada acontece no mesmo endereço',
    addressLabel: 'Endereço',

    noticesTitle: 'Aviso da organização',
    dismissNotice: 'Dispensar aviso',
    /* usado APENAS no modo de pré-visualização (?demo=1) */
    demoNoticeText: 'Exemplo de aviso (demonstração): a sessão da tarde começará pontualmente às 13h30.',
    pushBtn: 'Receber avisos',
    pushGranted: 'Avisos ativados',
    pushDenied: 'Avisos bloqueados no navegador',
    whatsappBtn: 'Avisos no WhatsApp',
    installBtn: 'Instalar app',

    /* fluxo de instalação (modal iOS / Android) — trechos entre **asteriscos**
       aparecem em negrito no modal */
    installModalTitle: 'Instalar o aplicativo',
    installIntroIOS: 'No iPhone e no iPad, a instalação é feita pelo Safari, em três passos:',
    iosStep1: 'Toque no ícone **Compartilhar** na barra do Safari.',
    iosStep2: 'Role a lista e toque em **“Adicionar à Tela de Início”**.',
    iosStep3: 'Confirme em **Adicionar** e abra o aplicativo pelo novo ícone na tela de início.',
    iosPushNote: 'No iPhone, as notificações só funcionam depois de instalar assim.',
    pushAfterInstall: 'Para receber avisos no iPhone, instale o aplicativo primeiro — as notificações são ativadas depois, dentro do aplicativo instalado.',
    iosOtherIntro: 'Neste aparelho, somente o **Safari** consegue instalar o aplicativo.',
    iosOtherStep1: 'Abra o **Safari** e visite **{url}**.',
    iosOtherStep2: 'Lá, toque em **“Instalar app”** para ver o passo a passo.',
    androidIntro: 'Se o convite de instalação não apareceu, instale pelo menu do navegador:',
    androidStep1: 'Toque no menu **⋮** no canto do navegador.',
    androidStep2: 'Toque em **“Instalar aplicativo”** (ou **“Adicionar à tela inicial”**) e confirme.',
    closeModal: 'Fechar',
    appInstalled: 'Aplicativo instalado',

    shareBtn: 'Compartilhar',
    shareText: 'Jornada dos Graus Filosóficos do Rito Brasileiro · Cuiabá – MT, 7 de novembro de 2026',
    linkCopied: 'Link copiado',
    icsReady: 'Arquivo de agenda gerado',

    emergencyLabel: 'Emergências',
    emergencyAria: 'Ligar para o telefone de emergência',
    contactTitle: 'Contato',
    registrationEmailLabel: 'Grande Secretaria',

    offlineReady: 'Disponível offline',
    footerNote: 'Aplicativo oficial do encontro · funciona offline',
    /* "ViaVeritasVita" é nome próprio (não se traduz) */
    brandTagline: 'conheça nossa estrutura de apoio à Maçonaria',
  },
};
