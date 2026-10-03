/**
 * ModalMapa — diálogo de confirmação do mapeamento campo → coluna.
 *
 * Autocontido: monta o HTML, valida os obrigatórios e devolve o mapa pronto
 * pelo callback `onConfirmar`. O estado do diálogo aberto vive no closure,
 * não em variáveis globais.
 */
window.App = window.App || {};
window.App.ModalMapa = (function () {
  'use strict';

  const App = window.App;

  // Diálogo atualmente aberto: { cols, campos, onConfirmar, onFechar }
  let aberto = null;

  function container() {
    return document.getElementById('modal-container');
  }

  function escaparAtributo(s) {
    return escaparHtml(s).replace(/"/g, '&quot;');
  }

  function escaparHtml(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

  /** Verde = detectado, vermelho = obrigatório sem coluna, neutro = opcional vazio. */
  function classeDoSelect(campo, valor) {
    if (valor) return 'auto';
    return campo.obrigatorio ? 'missing' : '';
  }

  function montarLinha(campo, cols, selecionada) {
    const opcoes = cols
      .map(c => `<option value="${escaparAtributo(c)}" ${c === selecionada ? 'selected' : ''}>${escaparHtml(c)}</option>`)
      .join('');

    return `<div class="modal-row">
        <label>${campo.label}${campo.obrigatorio ? '<span class="req">*</span>' : ''}</label>
        <select id="map-${campo.id}" class="${classeDoSelect(campo, selecionada)}">
          ${opcoes}
          <option value="" ${!selecionada ? 'selected' : ''}>— não usar —</option>
        </select>
      </div>`;
  }

  function montarHtml(cols, campos, mapa) {
    const linhas = campos.map(campo => montarLinha(campo, cols, mapa[campo.id] || '')).join('');

    return `<div class="modal-overlay"><div class="modal" role="dialog" aria-modal="true" aria-labelledby="map-title">
      <div class="modal-header">
        <h2 id="map-title"><i class="ti ti-table-options"></i> Confirme as colunas da planilha</h2>
        <button class="modal-close" data-acao="fechar" title="Fechar">&#x2715;</button>
      </div>
      <p class="modal-sub">Verifique se cada campo foi associado à coluna correta.</p>
      <div class="modal-saved-notice" id="modal-saved-notice"><i class="ti ti-check"></i> Mapeamento salvo anteriormente — verifique se ainda está correto.</div>
      <div class="modal-legend">
        <span><span class="dot dot-green"></span> Detectado automaticamente</span>
        <span><span class="dot dot-red"></span> Obrigatório não encontrado</span>
        <span><span class="dot dot-gray"></span> Opcional não encontrado</span>
      </div>
      ${linhas}
      <div class="modal-footer">
        <button class="btn btn-sm" data-acao="limpar"><i class="ti ti-trash"></i> Limpar mapeamentos salvos</button>
        <button class="btn btn-blue btn-sm" data-acao="confirmar"><i class="ti ti-check"></i> Confirmar e carregar</button>
      </div>
    </div></div>`;
  }

  function fechar() {
    const aoFechar = aberto && aberto.onFechar;
    aberto = null;
    container().innerHTML = '';
    if (aoFechar) aoFechar();
  }

  /** Lê os selects; devolve null (e alerta) se faltar algum obrigatório. */
  function coletarMapa() {
    const mapa = {};
    const faltando = [];

    aberto.campos.forEach(campo => {
      const sel = document.getElementById('map-' + campo.id);
      const valor = sel ? sel.value : '';
      mapa[campo.id] = valor || null;
      if (campo.obrigatorio && !valor) faltando.push(campo.label);
    });

    if (faltando.length) {
      alert('Campos obrigatórios não mapeados:\n• ' + faltando.join('\n• '));
      return null;
    }
    return mapa;
  }

  function confirmar() {
    const mapa = coletarMapa();
    if (!mapa) return;
    const aoConfirmar = aberto.onConfirmar;
    fechar();
    if (aoConfirmar) aoConfirmar(mapa);
  }

  function limparSalvos() {
    App.Store.limparMapeamentos();
    App.UI.toast('Mapeamentos apagados!');
  }

  const ACOES = { fechar, confirmar, limpar: limparSalvos };

  /**
   * @param {object} opcoes { cols, mapa, foiSalvo, campos?, onConfirmar, onFechar }
   */
  function abrir(opcoes) {
    const cols = opcoes.cols;
    const campos = opcoes.campos || App.Dominio.CAMPOS;

    aberto = {
      cols: cols,
      campos: campos,
      onConfirmar: opcoes.onConfirmar,
      onFechar: opcoes.onFechar,
    };

    container().innerHTML = montarHtml(cols, campos, opcoes.mapa || {});
    if (opcoes.foiSalvo) document.getElementById('modal-saved-notice').style.display = 'block';
    container().querySelector('select').focus();
  }

  // Listeners registrados uma única vez, por delegação: o conteúdo do
  // container é recriado a cada abertura, mas o container em si não.
  container().addEventListener('click', e => {
    if (!aberto) return;
    if (e.target.classList.contains('modal-overlay')) { fechar(); return; } // clique fora do diálogo
    const botao = e.target.closest('[data-acao]');
    if (botao && ACOES[botao.dataset.acao]) ACOES[botao.dataset.acao]();
  });

  // Recolore o select conforme o usuário troca a coluna escolhida
  container().addEventListener('change', e => {
    if (!aberto) return;
    const sel = e.target.closest('select[id^="map-"]');
    if (!sel) return;
    const campo = aberto.campos.find(c => 'map-' + c.id === sel.id);
    if (campo) sel.className = classeDoSelect(campo, sel.value);
  });

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && aberto) fechar();
    if (e.key === 'Tab' && aberto) {
      const nodes = Array.from(container().querySelectorAll('button, select'));
      const first = nodes[0], last = nodes[nodes.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  });

  return { abrir, fechar };
})();
