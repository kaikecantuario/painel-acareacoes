/**
 * Store — único ponto de contato com o localStorage.
 *
 * Nenhum outro módulo conhece nomes de chave nem chama localStorage direto.
 * Quem precisa de um dado persistido pede aqui; quem precisa gravar, avisa aqui.
 */
window.App = window.App || {};
window.App.Store = (function () {
  'use strict';

  const CHAVES = {
    tema:       'tema',
    layout:     'painel-layout',
    prefs:      'prefs',
    atendente:  'atendente',
    lideres:    'lideres',
    presencial: 'presencial',
    concluido:  'concluido',
    obs:        'obs',
  };
  const PREFIXO_MAPA = 'col_map_';

  function lerTexto(chave) {
    try { return localStorage.getItem(chave); } catch (e) { return null; }
  }
  function gravarTexto(chave, valor) {
    try { localStorage.setItem(chave, valor); } catch (e) { /* storage cheio ou bloqueado */ }
  }
  function lerObjeto(chave) {
    try {
      const valor = JSON.parse(lerTexto(chave) || '{}');
      return Object.assign(Object.create(null), valor && typeof valor === 'object' && !Array.isArray(valor) ? valor : {});
    } catch (e) { return Object.create(null); }
  }
  function gravarObjeto(chave, valor) {
    gravarTexto(chave, JSON.stringify(valor));
  }

  // Espelhos em memória: são a fonte de leitura durante a sessão e o storage
  // é atualizado a cada escrita. Evita reparsear JSON a cada card renderizado.
  const lideres    = lerObjeto(CHAVES.lideres);
  const presencial = lerObjeto(CHAVES.presencial);
  const concluido  = lerObjeto(CHAVES.concluido);
  const obs        = lerObjeto(CHAVES.obs);

  function chaveMapa(assinatura) {
    return PREFIXO_MAPA + encodeURIComponent(assinatura);
  }

  return {
    // ── Tema ──────────────────────────────────────────────────────────
    getTema()      { return lerTexto(CHAVES.tema) || 'light'; },
    setTema(tema)  { gravarTexto(CHAVES.tema, tema); },
    getLayout() { return lerTexto(CHAVES.layout) === 'original' ? 'original' : 'novo'; },
    setLayout(layout) { gravarTexto(CHAVES.layout, layout === 'original' ? 'original' : 'novo'); },

    // ── Atendente logado ──────────────────────────────────────────────
    getAtendente()      { return lerTexto(CHAVES.atendente) || ''; },
    setAtendente(nome)  { gravarTexto(CHAVES.atendente, nome); },

    // ── Preferências de conteúdo das mensagens ────────────────────────
    getPrefs() {
      const p = lerObjeto(CHAVES.prefs);
      return { produto: !!p.produto, valor: !!p.valor, telEntregador: !!p.telEntregador };
    },
    setPrefs(prefs) {
      gravarObjeto(CHAVES.prefs, {
        produto: !!prefs.produto,
        valor: !!prefs.valor,
        telEntregador: !!prefs.telEntregador,
      });
    },

    // ── Líder por base ────────────────────────────────────────────────
    getLider(base)        { return lideres[base] || ''; },
    setLider(base, nome)  { lideres[base] = nome; gravarObjeto(CHAVES.lideres, lideres); },

    // ── Marcação "atendimento presencial" por remessa ─────────────────
    isPresencial(remessa)          { return !!presencial[remessa]; },
    setPresencial(remessa, valor)  { presencial[remessa] = valor; gravarObjeto(CHAVES.presencial, presencial); },
    limparPresencial() {
      Object.keys(presencial).forEach(k => delete presencial[k]);
      gravarObjeto(CHAVES.presencial, presencial);
    },

    // ── Marcação "concluída" por remessa ──────────────────────────────
    isConcluido(remessa) { return !!concluido[remessa]; },
    alternarConcluido(remessa) {
      concluido[remessa] = !concluido[remessa];
      gravarObjeto(CHAVES.concluido, concluido);
      return concluido[remessa];
    },

    // ── Observação por remessa (só aparece no template Feishu) ────────
    getObs(remessa) { return obs[remessa] || ''; },
    temObs(remessa) { return !!obs[remessa]; },
    /** Texto em branco remove a observação em vez de guardar string vazia. */
    setObs(remessa, valor) {
      if (valor && valor.trim()) obs[remessa] = valor;
      else delete obs[remessa];
      gravarObjeto(CHAVES.obs, obs);
    },

    // ── Mapeamento de colunas, indexado pela assinatura da planilha ───
    getMapeamento(assinatura) {
      try {
        let bruto = lerTexto(chaveMapa(assinatura));
        // Reaproveita mapeamentos da versão anterior quando disponíveis.
        if (!bruto) {
          try { bruto = lerTexto(PREFIXO_MAPA + btoa(assinatura).slice(0, 40)); } catch (e) { /* Unicode sem chave antiga */ }
        }
        return bruto ? JSON.parse(bruto) : null;
      } catch (e) { return null; }
    },
    setMapeamento(assinatura, mapa) {
      try { gravarTexto(chaveMapa(assinatura), JSON.stringify(mapa)); } catch (e) { /* assinatura fora do Latin-1 */ }
    },
    limparMapeamentos() {
      try {
        Object.keys(localStorage)
          .filter(k => k.startsWith(PREFIXO_MAPA))
          .forEach(k => localStorage.removeItem(k));
      } catch (e) { /* storage bloqueado */ }
    },
  };
})();
