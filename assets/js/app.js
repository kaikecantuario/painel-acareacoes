/**
 * app — controlador do painel.
 *
 * Guarda a lista carregada e faz a ponte entre os módulos: lê o estado no
 * Store, pede as regras ao Dominio, manda a View desenhar. É o único lugar
 * onde as camadas se encontram; nenhuma delas chama a outra pelas costas.
 */
(function () {
  'use strict';

  const { Store, Dominio, Templates, Planilha, UI, ModalMapa, View, Atribuir } = window.App;

  /** Acareações da planilha carregada. O índice na lista é o id usado pelos cards. */
  let acareacoes = [];

  /** O .xlsx original — a atribuição no JMS precisa do arquivo, não das linhas
   *  já processadas (ver o cabeçalho de atribuir.js). */
  let arquivoCarregado = null;

  /** Índices marcados para as ações em massa, e se o modo de seleção está ligado. */
  const selecionados = new Set();
  let modoSelecaoObs = false;

  // ─── Predicados de estado (Store + regras) ──────────────────────────

  const semTelefone   = row => Dominio.isNumeroInvalido(row.tel);
  const ehPresencial  = row => semTelefone(row) || Store.isPresencial(row.remessa);
  const estaConcluido = row => Store.isConcluido(row.remessa);

  // ─── Renderização ───────────────────────────────────────────────────

  function paraItemDeCard({ row, idx }) {
    return {
      idx: idx,
      row: row,
      telInvalido: semTelefone(row),
      presencial: ehPresencial(row),
      marcadoPresencial: Store.isPresencial(row.remessa),
      concluido: estaConcluido(row),
      lider: Store.getLider(row.base),
      obs: Store.getObs(row.remessa),
      temObs: Store.temObs(row.remessa),
      selecionado: selecionados.has(idx),
    };
  }

  function atualizarStats() {
    View.renderStats(Dominio.calcularStats(acareacoes, ehPresencial, estaConcluido));
  }

  function visiveis() {
    return Dominio.filtrarEOrdenar(acareacoes, View.lerFiltros(), estaConcluido);
  }

  function renderizar() {
    const itens = visiveis();
    atualizarStats();
    View.renderStatusTabs(acareacoes);
    View.renderBulkBar(itens.length);
    View.renderContadorSelecionados(selecionados.size);
    View.renderCards(itens.map(paraItemDeCard), { modoSelecao: modoSelecaoObs });
  }

  // ─── Ações de um card ───────────────────────────────────────────────

  function copiarAtivo(row, botao) {
    UI.copiar(
      Templates.gerarMensagemWpp(row, {
        assistente: View.getAtendente(),
        incluirProduto: Store.getPrefs().produto,
      }),
      { botao: botao, mensagem: 'Mensagem copiada!' }
    );
  }

  function copiarFeishu(row, idx, botao) {
    const prefs = Store.getPrefs();
    const liderDigitado = View.getValorLider(idx);
    const obsDigitada = View.getValorObs(idx);
    UI.copiar(
      Templates.gerarTemplateFeishu(row, {
        assistente: View.getAtendente(),
        lider: liderDigitado !== null ? liderDigitado : Store.getLider(row.base),
        obs: obsDigitada !== null ? obsDigitada : Store.getObs(row.remessa),
        presencial: ehPresencial(row),
        incluirValor: prefs.valor,
        incluirTelEntregador: prefs.telEntregador,
      }),
      { botao: botao, mensagem: 'Template copiado!' }
    );
  }

  function alternarConcluido(row, idx) {
    Store.alternarConcluido(row.remessa);
    renderizar();
  }

  function definirPresencial(row, idx, marcado) {
    Store.setPresencial(row.remessa, marcado);
    View.marcarPresencial(idx, semTelefone(row) || marcado);
    atualizarStats();
  }

  function definirLider(row, nome, origem) {
    Store.setLider(row.base, nome);
    View.espelharLider(row.base, nome, origem);
  }

  function definirObs(row, idx, texto) {
    Store.setObs(row.remessa, texto);
    View.marcarObs(idx, Store.temObs(row.remessa));
  }

  function definirSelecao(idx, marcado) {
    if (marcado) selecionados.add(idx); else selecionados.delete(idx);
    View.renderContadorSelecionados(selecionados.size);
  }

  const ACOES_CARD = {
    'copiar-wpp':         (row, e) => copiarAtivo(row, e.elemento),
    'copiar-feishu':      (row, e) => copiarFeishu(row, e.idx, e.elemento),
    'alternar-concluido': (row, e) => alternarConcluido(row, e.idx),
    'alternar-obs':       (row, e) => View.alternarPainelObs(e.idx),
    'obs':                (row, e) => definirObs(row, e.idx, e.valor),
    'presencial':         (row, e) => definirPresencial(row, e.idx, e.marcado),
    'lider':              (row, e) => definirLider(row, e.valor, e.elemento),
    'selecionar':         (row, e) => definirSelecao(e.idx, e.marcado),
  };

  function tratarAcaoDeCard(evento) {
    const row = acareacoes[evento.idx];
    const acao = ACOES_CARD[evento.acao];
    if (row && acao) acao(row, evento);
  }

  // ─── Ações em massa ─────────────────────────────────────────────────

  function copiarRemessasFiltradas(botao) {
    const itens = visiveis();
    if (!itens.length) { UI.toast('Nenhum ticket para copiar.'); return; }
    UI.copiar(itens.map(({ row }) => row.remessa).join('\n'), {
      botao: botao,
      mensagem: `${itens.length} remessa(s) copiada(s)!`,
    });
  }

  function baixarPlanilhaFiltrada() {
    const itens = visiveis();
    if (!itens.length) { UI.toast('Nenhum ticket para exportar.'); return; }
    try {
      Planilha.exportarAcareacoes(itens.map(({ row }) => row));
      UI.toast(`Planilha com ${itens.length} ticket(s) baixada!`);
    } catch (err) {
      UI.toast('Não foi possível baixar a planilha: ' + err.message);
    }
  }

  function fecharObsEmMassa() {
    modoSelecaoObs = false;
    View.mostrarModoSelecao(false);
    selecionados.clear();
    renderizar();
  }

  function alternarObsEmMassa() {
    if (modoSelecaoObs) { fecharObsEmMassa(); return; }
    modoSelecaoObs = true;
    View.mostrarModoSelecao(true);
    renderizar();
  }

  function selecionarVisiveis() {
    visiveis().forEach(({ idx }) => selecionados.add(idx));
    renderizar();
  }

  function limparSelecao() {
    selecionados.clear();
    renderizar();
  }

  function aplicarObsEmMassa() {
    const texto = View.getTextoObsEmMassa();
    if (!texto) { UI.toast('Digite uma observação.'); return; }
    if (!selecionados.size) { UI.toast('Nenhum ticket selecionado.'); return; }

    selecionados.forEach(idx => {
      const row = acareacoes[idx];
      if (row) Store.setObs(row.remessa, texto);
    });

    UI.toast(`Obs aplicada a ${selecionados.size} ticket(s)!`);
    View.limparTextoObsEmMassa();
    fecharObsEmMassa();
  }

  // ─── Carregamento da planilha ───────────────────────────────────────

  function finalizarCarregamento(abaNome, totalLinhas, ignorados) {
    View.renderInfoBar({
      abaNome: abaNome,
      linhas: totalLinhas,
      acareacoes: acareacoes.length,
      ignorados: ignorados,
    });

    View.mostrarPainel();
    View.preencherFiltros(Dominio.opcoesDeFiltro(acareacoes));
    renderizar();
  }

  function carregarArquivo(file) {
    Planilha.ler(file).then(planilha => {
      if (!planilha.raw.length) { alert('Planilha vazia.'); return; }

      const assinatura = Planilha.assinatura(planilha.cols);
      const mapaSalvo = Store.getMapeamento(assinatura);

      ModalMapa.abrir({
        cols: planilha.cols,
        mapa: mapaSalvo || Planilha.detectarMapa(planilha.cols, Dominio.CAMPOS),
        foiSalvo: !!mapaSalvo,
        onFechar: () => View.resetarInputArquivo(),
        onConfirmar: mapa => {
          Store.setMapeamento(assinatura, mapa);
          const resultado = Dominio.processarDados(planilha.raw, mapa, View.getAtendente());
          if (!resultado.dados.length) { alert('Nenhuma acareação válida encontrada.'); return; }
          arquivoCarregado = file;
          Atribuir.guardarArquivo(file);
          selecionados.clear();
          modoSelecaoObs = false;
          View.mostrarModoSelecao(false);
          View.resetarFiltros();
          acareacoes = resultado.dados;
          finalizarCarregamento(planilha.abaNome, planilha.raw.length, resultado.ignorados);
        },
      });
    }).catch(err => {
      alert('Erro ao ler o arquivo: ' + err.message +
        '\n\nFormatos aceitos: .xlsx, .xls, .csv e .ods.');
      console.error(err);
    });
  }

  function trocarPlanilha() {
    acareacoes = [];
    arquivoCarregado = null;
    Atribuir.guardarArquivo(null);
    selecionados.clear();
    modoSelecaoObs = false;
    View.resetarFiltros();
    View.mostrarUpload();
    View.resetarInputArquivo().click();
  }

  // ─── Inicialização ──────────────────────────────────────────────────

  function alternarTema() {
    const novo = View.getTemaAtual() === 'dark' ? 'light' : 'dark';
    View.aplicarTema(novo);
    Store.setTema(novo);
  }

  View.ligar({
    aoAlternarTema: alternarTema,
    aoMudarLayout: layout => { Store.setLayout(layout); View.aplicarLayout(layout); },
    aoSelecionarArquivo: carregarArquivo,
    aoMudarAtendente: nome => Store.setAtendente(nome),
    aoMudarPrefs: prefs => Store.setPrefs(prefs),
    aoMudarFiltros: renderizar,
    aoAgirNoCard: tratarAcaoDeCard,
    aoTrocarPlanilha: trocarPlanilha,
    aoCopiarRemessas: copiarRemessasFiltradas,
    aoBaixarPlanilha: baixarPlanilhaFiltrada,
    aoAlternarObsEmMassa: alternarObsEmMassa,
    aoSelecionarVisiveis: selecionarVisiveis,
    aoLimparSelecao: limparSelecao,
    aoAplicarObsEmMassa: aplicarObsEmMassa,
    aoAtribuirTickets: () => Atribuir.abrir(arquivoCarregado),
  });

  // O botão de atribuir só aparece se o servidor local estiver no ar
  // (ou se a URL trouxer ?atribuir=1 — ver atribuir.js).
  Atribuir.deveMostrar().then(disponivel => { if (disponivel) View.mostrarBotaoAtribuir(); });

  View.aplicarTema(Store.getTema());
  View.aplicarLayout(Store.getLayout());
  View.setAtendente(Store.getAtendente());
  View.setPrefs(Store.getPrefs());
})();
