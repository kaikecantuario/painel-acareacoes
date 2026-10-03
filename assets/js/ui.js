/**
 * UI — utilidades de interface sem vínculo com o domínio: toast e cópia
 * para a área de transferência. Servem a qualquer tela.
 */
window.App = window.App || {};
window.App.UI = (function () {
  'use strict';

  const DURACAO_TOAST = 2000;
  const DURACAO_FEEDBACK_BOTAO = 2000;
  let timerToast;
  const timersBotao = new WeakMap();

  function toast(msg) {
    const el = document.getElementById('toast');
    if (!el) return;
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(timerToast);
    timerToast = setTimeout(() => el.classList.remove('show'), DURACAO_TOAST);
  }

  /** Fallback para navegadores/contextos sem a Clipboard API (inclui file://). */
  function copiarViaTextarea(texto) {
    const foco = document.activeElement;
    const ta = document.createElement('textarea');
    ta.value = texto;
    ta.style.cssText = 'position:fixed;opacity:0;top:0;left:0;';
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    try {
      if (!document.execCommand('copy')) throw new Error('Cópia não autorizada pelo navegador');
    } finally {
      ta.remove();
      if (foco && foco.isConnected) foco.focus({ preventScroll: true });
    }
  }

  /** Marca o botão como "Copiado!" e restaura o rótulo original depois. */
  function piscarBotao(botao) {
    if (!botao) return;
    const anterior = timersBotao.get(botao);
    if (anterior) clearTimeout(anterior.timer);
    const original = anterior ? anterior.original : botao.innerHTML;
    botao.classList.add('btn-copied');
    botao.innerHTML = '<i class="ti ti-check"></i> Copiado!';
    const timer = setTimeout(() => {
      botao.classList.remove('btn-copied');
      botao.innerHTML = original;
      timersBotao.delete(botao);
    }, DURACAO_FEEDBACK_BOTAO);
    timersBotao.set(botao, { timer, original });
  }

  /**
   * @param {string} texto
   * @param {object} opcoes  { botao?: HTMLElement, mensagem?: string }
   */
  function copiar(texto, opcoes) {
    const o = opcoes || {};
    const confirmar = () => {
      toast(o.mensagem || 'Copiado!');
      piscarBotao(o.botao);
    };

    const fallback = () => { copiarViaTextarea(texto); confirmar(); };
    return Promise.resolve().then(() => {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        return navigator.clipboard.writeText(texto).then(confirmar, fallback);
      }
      return fallback();
    }).catch(() => { toast('Não foi possível copiar. Verifique a permissão do navegador.'); return false; });
  }

  return { toast, copiar };
})();
