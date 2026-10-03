/**
 * View — dono exclusivo do DOM do painel.
 *
 * Só este módulo chama getElementById / innerHTML. Ele não conhece o
 * localStorage nem as regras de negócio: recebe dados prontos para exibir e
 * avisa o controlador por callbacks (registrados de uma vez em `ligar`).
 */
window.App = window.App || {};
window.App.View = (function () {
  'use strict';

  const $ = id => document.getElementById(id);

  /** Rótulo e cor de cada status canônico do ticket — decisão de apresentação. */
  const STATUS_TICKET_META = {
    para_atribuir: { label: 'Para atribuir',          cls: 'badge-atribuido'    },
    processando:   { label: 'Processando',            cls: 'badge-processando'  },
    fechado:       { label: 'Fechado',                cls: 'badge-fechado'      },
    concluido_tk:  { label: 'Processamento concluído', cls: 'badge-concluido-tk' },
    sem_status:    { label: 'Sem status',             cls: 'badge-gray'         },
  };

  const OPCAO_PADRAO = {
    'filter-base':       'Todas as bases',
    'filter-embarcador': 'Todos os embarcadores',
    'filter-problema':   'Todos os tipos',
    'filter-assistente': 'Todos os assistentes',
  };

  // Callbacks fornecidos pelo controlador em `ligar`.
  const on = {};

  function escaparAtributo(s) {
    return escaparHtml(s).replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function escaparHtml(s) {
    return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  // ─── Tema ───────────────────────────────────────────────────────────

  function aplicarTema(tema) {
    const escuro = tema === 'dark';
    document.documentElement.setAttribute('data-theme', escuro ? 'dark' : 'light');
    $('theme-icon').className = escuro ? 'ti ti-sun' : 'ti ti-moon';
    $('theme-label').textContent = escuro ? 'Modo claro' : 'Modo escuro';
  }

  function getTemaAtual() {
    return document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
  }

  function aplicarLayout(layout) {
    const valor = layout === 'original' ? 'original' : 'novo';
    document.documentElement.dataset.layout = valor;
    document.querySelectorAll('[data-layout-choice]').forEach(button => {
      button.setAttribute('aria-pressed', String(button.dataset.layoutChoice === valor));
    });
    document.querySelectorAll('details.menu').forEach(menu => { menu.open = false; });
  }

  function renderStatusTabs(dados) {
    const atual = $('filter-ticket-status').value;
    const base = $('filter-base').value;
    const lista = base ? dados.filter(row => row.base === base) : dados;
    const tabs = [['', 'Todos'], ...Object.entries(STATUS_TICKET_META).map(([key, meta]) => [key, meta.label])];
    $('status-tabs').innerHTML = tabs.map(([key, label]) => {
      const qtd = key ? lista.filter(row => row.statusTicket === key).length : lista.length;
      return `<button type="button" data-status="${key}" aria-pressed="${key === atual}">${label}<span class="tab-count">${qtd}</span></button>`;
    }).join('');
  }

  // ─── Barra do atendente e preferências ──────────────────────────────

  function setAtendente(nome) { $('assistente-input').value = nome; }

  /** Nome digitado, ou 'Atendente' quando em branco. */
  function getAtendente() { return $('assistente-input').value.trim() || 'Atendente'; }

  const IDS_PREF = { produto: 'pref-produto', valor: 'pref-valor', telEntregador: 'pref-tel-entregador' };

  function setPrefs(prefs) {
    Object.keys(IDS_PREF).forEach(chave => { $(IDS_PREF[chave]).checked = !!prefs[chave]; });
  }

  function getPrefs() {
    const prefs = {};
    Object.keys(IDS_PREF).forEach(chave => { prefs[chave] = $(IDS_PREF[chave]).checked; });
    return prefs;
  }

  // ─── Filtros ────────────────────────────────────────────────────────

  const IDS_FILTRO = [
    'filter-base', 'filter-embarcador', 'filter-problema', 'filter-status', 'filter-ticket-status',
    'filter-assistente', 'filter-search', 'sort-order',
  ];

  /** Estado atual dos filtros, no formato que `Dominio.filtrarEOrdenar` espera. */
  function lerFiltros() {
    return {
      base:         $('filter-base').value,
      embarcador:   $('filter-embarcador').value,
      problema:     $('filter-problema').value,
      status:       $('filter-status').value,
      statusTicket: $('filter-ticket-status').value,
      assistente:   $('filter-assistente').value,
      busca:        $('filter-search').value,
      ordenacao:    $('sort-order').value,
    };
  }

  function preencherSelect(id, valores) {
    const select = $(id);
    select.innerHTML = `<option value="">${OPCAO_PADRAO[id]}</option>`;
    valores.forEach(v => {
      const opcao = document.createElement('option');
      opcao.value = v;
      opcao.textContent = v;
      select.appendChild(opcao);
    });
  }

  function preencherFiltros(opcoes) {
    preencherSelect('filter-base', opcoes.bases);
    preencherSelect('filter-embarcador', opcoes.embarcadores);
    preencherSelect('filter-problema', opcoes.problemas);
    preencherSelect('filter-assistente', opcoes.assistentes);
    if (!opcoes.statusTickets.includes('para_atribuir')) $('filter-ticket-status').value = '';
  }

  function resetarFiltros() {
    $('filter-base').innerHTML       = `<option value="">${OPCAO_PADRAO['filter-base']}</option>`;
    $('filter-embarcador').innerHTML = `<option value="">${OPCAO_PADRAO['filter-embarcador']}</option>`;
    $('filter-problema').innerHTML   = `<option value="">${OPCAO_PADRAO['filter-problema']}</option>`;
    $('filter-search').value = '';
    $('sort-order').value = '';
    $('filter-status').value = '';
    $('filter-ticket-status').value = 'para_atribuir';
    $('filter-assistente').value = '';
  }

  // ─── Visibilidade das seções ────────────────────────────────────────

  function mostrarPainel() {
    $('toolbar').style.display = 'block';
    $('upload-area').style.display = 'none';
    $('stats').style.display = 'flex';
    $('filter-bar').style.display = 'flex';
  }

  function mostrarUpload() {
    $('toolbar').style.display = 'none';
    mostrarModoSelecao(false);
    $('upload-area').style.display = 'block';
    $('stats').style.display = 'none';
    $('filter-bar').style.display = 'none';
    $('bulk-bar').style.display = 'none';
    $('info-bar').style.display = 'none';
    $('cards-container').innerHTML = '';
  }

  // ─── Barras informativas ────────────────────────────────────────────

  function renderInfoBar(info) {
    const barra = $('info-bar');
    barra.style.display = 'flex';
    barra.innerHTML =
      `<span><i class="ti ti-file-spreadsheet" aria-hidden="true"></i> Aba: <b>${escaparHtml(info.abaNome)}</b> &bull; Linhas: <b>${info.linhas}</b> &bull; Acareações: <b>${info.acareacoes}</b> &bull; Ignorados: <b>${info.ignorados}</b></span>
       <button class="btn btn-sm" data-acao="trocar-planilha"><i class="ti ti-refresh"></i> Trocar planilha</button>`;
  }

  function renderStats(stats) {
    $('st-total').textContent = stats.total;
    $('st-wp').textContent    = stats.whatsapp;
    $('st-pres').textContent  = stats.presencial;
    $('st-done').textContent  = stats.concluidas;
  }

  function renderBulkBar(qtd) {
    $('bulk-bar').style.display = 'flex';
    $('bulk-count').textContent =
<<<<<<< HEAD
      `${qtd} ticket${qtd === 1 ? '' : 's'} ${qtd === 1 ? 'visível' : 'visíveis'} (respeitando os filtros atuais)`;
=======
      `${qtd} ticket${qtd === 1 ? '' : 's'} visível${qtd === 1 ? '' : 'eis'}`;
>>>>>>> f372530 (Integrate Claude Design with functional dashboard and standalone)
  }

  // ─── Seleção e observação em massa ──────────────────────────────────

  function renderContadorSelecionados(qtd) {
    $('bulk-selected-count').textContent = `${qtd} selecionado${qtd === 1 ? '' : 's'}`;
  }

  /** Mostra/esconde o campo de observação em massa e os controles de seleção. */
  function mostrarModoSelecao(ativo) {
    $('bulk-obs-wrap').style.display = ativo ? 'block' : 'none';
    $('bulk-selecao-controles').style.display = ativo ? 'flex' : 'none';
    if (ativo) $('bulk-obs-input').focus();
  }

  function getTextoObsEmMassa()   { return $('bulk-obs-input').value.trim(); }
  function limparTextoObsEmMassa() { $('bulk-obs-input').value = ''; }

  // ─── Cards ──────────────────────────────────────────────────────────

  function badgeStatusTicket(row) {
    if (!row.statusTicketRaw) return '';
    const meta = STATUS_TICKET_META[row.statusTicket] || STATUS_TICKET_META.sem_status;
    return `<span class="badge ${meta.cls}" title="Status no BI: ${escaparAtributo(row.statusTicketRaw)}">${meta.label}</span>`;
  }

  /**
   * @param {object} item     { idx, row, presencial, telInvalido, concluido, lider, obs, temObs, selecionado }
   * @param {object} opcoes   { modoSelecao }
   */
  function montarCard(item, opcoes) {
    const { idx, row, presencial, telInvalido, concluido, lider } = item;
    const modoSelecao = opcoes && opcoes.modoSelecao;

    const caixaSelecao = modoSelecao
      ? `<input type="checkbox" class="card-select" data-acao="selecionar" data-idx="${idx}" ${item.selecionado ? 'checked' : ''} title="Selecionar para ações em massa">`
      : '';

    return `
      <div class="card ${presencial ? 'presencial' : ''} ${concluido ? 'concluido' : ''}" id="card-${idx}">
        <div class="card-top">
          <div class="card-top-esq">
            ${caixaSelecao}
            <div>
              <div class="card-title"><span class="remessa">${escaparHtml(row.remessa)}</span><span>${escaparHtml(row.embarcador)}</span></div>
              <div class="card-subtitle">${escaparHtml(row.base)}${row.rne ? ' &bull; ' + escaparHtml(row.rne) : ''}</div>
            </div>
          </div>
          <div class="badges">
            <span class="badge ${presencial ? 'badge-red' : 'badge-blue'}" id="badge-tipo-${idx}">${presencial ? 'Presencial' : 'WhatsApp'}</span>
            <span class="badge badge-amber">${escaparHtml(row.problema)}</span>
            ${badgeStatusTicket(row)}
            ${row.valorFmt ? `<span class="badge badge-gray">${escaparHtml(row.valorFmt)}</span>` : ''}
            <span class="badge badge-done" id="badge-done-${idx}" style="display:${concluido ? '' : 'none'}"><i class="ti ti-check"></i> Concluída</span>
          </div>
        </div>
        <div class="card-grid">
          <div class="field ${Number.isFinite(row.prazoTs) && row.prazoTs <= Date.now() + 86400000 ? 'urgent' : ''}"><div class="field-label">Vencimento</div><div class="field-value">${escaparHtml(row.vencimento)}</div></div>
          <div class="field"><div class="field-label">Entregador</div><div class="field-value">${escaparHtml(row.entregador)}</div></div>
          <div class="field ${telInvalido ? 'missing-phone' : ''}"><div class="field-label">Telefone cliente</div><div class="field-value">${telInvalido ? 'Sem número' : escaparHtml(row.tel)}</div></div>
          <div class="field"><div class="field-label">Telefone entregador</div><div class="field-value">${escaparHtml(row.telEntregador || 'N/A')}</div></div>
          <div class="field field-product"><div class="field-label">Produto</div><div class="field-value">${escaparHtml(row.item || 'Não informado')}</div></div>
        </div>
        <div class="card-actions">
          <button class="btn btn-teal" data-acao="copiar-wpp" data-idx="${idx}"><i class="ti ti-message"></i> Copiar ativo</button>
          <button class="btn btn-blue" data-acao="copiar-feishu" data-idx="${idx}"><i class="ti ti-copy"></i> Copiar template Feishu</button>
          <button class="btn btn-done ${concluido ? 'ativo' : ''}" id="btn-done-${idx}" data-acao="alternar-concluido" data-idx="${idx}">
            <i class="ti ti-check"></i> ${concluido ? 'Concluída' : 'Concluir'}
          </button>
          <button class="btn btn-obs ${item.temObs ? 'ativo' : ''}" id="btn-obs-${idx}" data-acao="alternar-obs" data-idx="${idx}"><i class="ti ti-note"></i> Obs</button>
          <span class="lider-rotulo">@ Líder:</span>
          <input class="lider-input" id="lider-input-${idx}" type="text" placeholder="Nome do líder" value="${escaparAtributo(lider)}"
            data-acao="lider" data-idx="${idx}" data-base="${escaparAtributo(row.base)}">
          ${!telInvalido ? `<label class="toggle-label"><input type="checkbox" data-acao="presencial" data-idx="${idx}" ${item.marcadoPresencial ? 'checked' : ''}> Presencial</label>` : ''}
        </div>
        <div class="obs-wrap" id="obs-wrap-${idx}" style="display:${item.temObs ? 'block' : 'none'}">
          <textarea class="obs-textarea" id="obs-input-${idx}" data-acao="obs" data-idx="${idx}"
            placeholder="Digite a observação (aparece só no template Feishu)...">${escaparHtml(item.obs)}</textarea>
        </div>
      </div>`;
  }

  function renderCards(itens, opcoes) {
    const container = $('cards-container');
    if (!itens.length) {
      container.innerHTML = '<div class="empty"><i class="ti ti-inbox"></i>Nenhuma acareação encontrada</div>';
      return;
    }
    container.innerHTML = itens.map(item => montarCard(item, opcoes)).join('');
  }

  /** Atualiza só o card afetado, sem re-renderizar a lista inteira. */
  function marcarPresencial(idx, presencial) {
    const card = $('card-' + idx);
    if (card) card.classList.toggle('presencial', presencial);
    const badge = $('badge-tipo-' + idx);
    if (badge) {
      badge.className = 'badge ' + (presencial ? 'badge-red' : 'badge-blue');
      badge.textContent = presencial ? 'Presencial' : 'WhatsApp';
    }
  }

  function marcarConcluido(idx, concluido) {
    const card = $('card-' + idx);
    if (card) card.classList.toggle('concluido', concluido);
    const badge = $('badge-done-' + idx);
    if (badge) badge.style.display = concluido ? '' : 'none';
    const botao = $('btn-done-' + idx);
    if (botao) {
      botao.classList.toggle('ativo', concluido);
      botao.innerHTML = concluido
        ? '<i class="ti ti-check"></i> Concluída'
        : '<i class="ti ti-check"></i> Concluir';
    }
  }

  function marcarObs(idx, temObs) {
    const botao = $('btn-obs-' + idx);
    if (botao) botao.classList.toggle('ativo', temObs);
  }

  /** Abre/fecha o textarea de observação de um card; ao abrir, foca nele. */
  function alternarPainelObs(idx) {
    const wrap = $('obs-wrap-' + idx);
    if (!wrap) return;
    const mostrando = wrap.style.display !== 'none';
    wrap.style.display = mostrando ? 'none' : 'block';
    if (!mostrando) {
      const campo = $('obs-input-' + idx);
      if (campo) campo.focus();
    }
  }

  function getValorLider(idx) {
    const input = $('lider-input-' + idx);
    return input ? input.value.trim() : null;
  }

  function getValorObs(idx) {
    const campo = $('obs-input-' + idx);
    return campo ? campo.value.trim() : null;
  }

  /** Replica o líder digitado nos demais cards da mesma base. */
  function espelharLider(base, nome, origem) {
    document.querySelectorAll('.lider-input[data-base]').forEach(el => {
      if (el.dataset.base === base && el !== origem) el.value = nome;
    });
  }

  // ─── Input de arquivo ───────────────────────────────────────────────

  function tratarSelecaoArquivo(e) {
    const file = e.target.files[0];
    if (!file) return;
    e.target.value = ''; // permite reescolher o mesmo arquivo depois
    if (on.aoSelecionarArquivo) on.aoSelecionarArquivo(file);
  }

  /** Recria o <input type=file> zerado e devolve o novo elemento. */
  function resetarInputArquivo() {
    const antigo = $('file-input');
    const novo = document.createElement('input');
    novo.type = 'file';
    novo.id = 'file-input';
    novo.accept = '.xlsx,.xls,.csv,.ods';
    novo.style.display = 'none';
    novo.addEventListener('change', tratarSelecaoArquivo);
    antigo.replaceWith(novo);
    return novo;
  }

  function abrirSeletorArquivo() { $('file-input').click(); }

  /**
   * Revela a atribuição no JMS. Fica escondida por padrão: só existe pra quem
   * está com o servidor local (servidor_atribuir.py) ligado — o resto do time
   * não tem o login CE nem o servidor, então o botão só confundiria.
   */
  function mostrarBotaoAtribuir() {
    ['btn-atribuir', 'atribuir-titulo', 'atribuir-separador'].forEach(id => {
      const el = $(id);
      if (el) el.style.display = '';
    });
  }

  // ─── Ligação com o controlador ──────────────────────────────────────

  /** Extrai { acao, idx, elemento } de um alvo de evento dentro dos cards. */
  function acaoDe(alvo, seletor) {
    const el = alvo.closest(seletor);
    if (!el) return null;
    return { acao: el.dataset.acao, idx: Number(el.dataset.idx), elemento: el };
  }

  function despachar(alvo) {
    if (alvo && on.aoAgirNoCard) on.aoAgirNoCard(alvo);
  }

  function ligarEventos() {
    $('theme-toggle').addEventListener('click', () => on.aoAlternarTema && on.aoAlternarTema());
    document.querySelectorAll('[data-layout-choice]').forEach(button => {
      button.addEventListener('click', () => on.aoMudarLayout && on.aoMudarLayout(button.dataset.layoutChoice));
    });
    $('status-tabs').addEventListener('click', e => {
      const button = e.target.closest('button[data-status]');
      if (!button) return;
      $('filter-ticket-status').value = button.dataset.status;
      if (on.aoMudarFiltros) on.aoMudarFiltros();
    });

    $('upload-area').addEventListener('click', e => {
      if (e.target.id === 'file-input') return; // evita reentrar pelo clique programático
      abrirSeletorArquivo();
    });
    $('file-input').addEventListener('change', tratarSelecaoArquivo);
    $('upload-area').addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); abrirSeletorArquivo(); }
    });

    $('assistente-input').addEventListener('input', e => {
      if (on.aoMudarAtendente) on.aoMudarAtendente(e.target.value);
    });

    Object.keys(IDS_PREF).forEach(chave => {
      $(IDS_PREF[chave]).addEventListener('change', () => on.aoMudarPrefs && on.aoMudarPrefs(getPrefs()));
    });

    IDS_FILTRO.forEach(id => {
      const evento = id === 'filter-search' ? 'input' : 'change';
      $(id).addEventListener(evento, () => on.aoMudarFiltros && on.aoMudarFiltros());
    });

    $('info-bar').addEventListener('click', e => {
      if (e.target.closest('[data-acao="trocar-planilha"]') && on.aoTrocarPlanilha) on.aoTrocarPlanilha();
    });

    $('btn-copiar-remessas').addEventListener('click', e => {
      if (on.aoCopiarRemessas) on.aoCopiarRemessas(e.currentTarget);
    });
    $('btn-baixar-planilha').addEventListener('click', e => {
      if (on.aoBaixarPlanilha) on.aoBaixarPlanilha(e.currentTarget);
    });
    $('btn-bulk-obs-toggle').addEventListener('click', () => on.aoAlternarObsEmMassa && on.aoAlternarObsEmMassa());
    $('btn-selecionar-visiveis').addEventListener('click', () => on.aoSelecionarVisiveis && on.aoSelecionarVisiveis());
    $('btn-limpar-selecao').addEventListener('click', () => on.aoLimparSelecao && on.aoLimparSelecao());
    $('btn-aplicar-obs').addEventListener('click', () => on.aoAplicarObsEmMassa && on.aoAplicarObsEmMassa());
    $('btn-atribuir').addEventListener('click', () => on.aoAtribuirTickets && on.aoAtribuirTickets());

    // Delegação nos cards: o container sobrevive aos re-renders, os cards não.
    const cards = $('cards-container');
    cards.addEventListener('click', e => despachar(acaoDe(e.target, 'button[data-acao]')));

    cards.addEventListener('input', e => {
      const alvo = acaoDe(e.target, '[data-acao="lider"], [data-acao="obs"]');
      if (alvo) despachar(Object.assign(alvo, { valor: alvo.elemento.value }));
    });

    cards.addEventListener('change', e => {
      const alvo = acaoDe(e.target, '[data-acao="presencial"], [data-acao="selecionar"]');
      if (alvo) despachar(Object.assign(alvo, { marcado: alvo.elemento.checked }));
    });
  }

  /** Registra os callbacks do controlador e liga todos os listeners. */
  function ligar(handlers) {
    Object.assign(on, handlers);
    ligarEventos();
  }

  return {
    ligar,
    aplicarTema, getTemaAtual,
    aplicarLayout, renderStatusTabs,
    setAtendente, getAtendente,
    setPrefs, getPrefs,
    lerFiltros, preencherFiltros, resetarFiltros,
    mostrarPainel, mostrarUpload,
    renderInfoBar, renderStats, renderBulkBar, renderCards,
    renderContadorSelecionados, mostrarModoSelecao, getTextoObsEmMassa, limparTextoObsEmMassa,
    marcarPresencial, marcarConcluido, marcarObs, alternarPainelObs,
    getValorLider, getValorObs, espelharLider,
    resetarInputArquivo, abrirSeletorArquivo, mostrarBotaoAtribuir,
  };
})();
