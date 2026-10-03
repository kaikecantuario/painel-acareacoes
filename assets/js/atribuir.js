/**
 * Atribuir — ponte com o servidor local que atribui os tickets no JMS.
 *
 * O painel é um site estático: não tem como falar com o JMS (o token é
 * pessoal e a API não aceita chamada de outra origem). Quem faz o trabalho é
 * o `servidor_atribuir.py`, que roda no PC de quem tem o login CE e escuta em
 * 127.0.0.1:8899. Este módulo só conversa com ele:
 *
 *   /ping      → decide se o botão aparece (sem servidor, ninguém vê nada)
 *   /plano     → manda o .xlsx e recebe o dry-run pra conferir
 *   /executar  → só depois da confirmação explícita
 *   /token     → guarda o authtoken quando a sessão do JMS expira
 *
 * Mandamos o ARQUIVO, não as linhas já processadas do painel: a classificação
 * TikTok-plataforma × ticket comum depende do texto cru do tipo de problema
 * (prefixos "TT-" / "[LATAM]"), que o Dominio normaliza e descarta.
 *
 * Autocontido, como o ModalMapa: monta o próprio diálogo e some sem deixar
 * estado global para trás.
 */
window.App = window.App || {};
window.App.Atribuir = (function () {
  'use strict';

  const SERVIDOR = 'http://127.0.0.1:8899';
  const TIMEOUT_PING = 1500;

  /** O .xlsx que o painel carregou — o mesmo arquivo é reenviado ao servidor. */
  let arquivo = null;
  /** Plano montado no servidor, aguardando confirmação. De uso único. */
  let planoId = null;
  /** Ação a repetir depois de o usuário colar um token novo. */
  let aoDestravar = null;

  function Falha(tipo, mensagem) {
    this.tipo = tipo;
    this.mensagem = mensagem;
  }

  function guardarArquivo(file) {
    arquivo = file || null;
    planoId = null;
  }

  // ─── Conversa com o servidor local ──────────────────────────────────

  function post(rota, corpo) {
    return fetch(SERVIDOR + rota, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(corpo || {}),
    }).catch(() => {
      throw new Falha('offline',
        'O servidor local não respondeu. Confira se a janela do atribuidor está aberta — e, se o Chrome ' +
        'perguntar sobre acessar a rede local, clique em Permitir. Se ele nem perguntar, abra o painel ' +
        'direto por http://127.0.0.1:8899 (aí não existe essa barreira).');
    }).then(resp =>
      resp.json().catch(() => ({})).then(dados => {
        if (!resp.ok) throw new Falha(dados.erro || 'erro', dados.mensagem || ('HTTP ' + resp.status));
        return dados;
      })
    );
  }

  /**
   * Decide se o botão aparece. O ping resolve o caso normal; a querystring
   * ?atribuir=1 é a saída pro Chrome 138+, que trata "página pública falando
   * com 127.0.0.1" como acesso à rede local e só libera com permissão do
   * usuário — permissão que ele costuma só perguntar quando a chamada nasce
   * de um clique, e não de um ping automático no carregamento. Com o
   * ?atribuir=1 (guarde como favorito) o botão aparece mesmo sem o ping, e o
   * clique é que dispara a pergunta do navegador.
   */
  function deveMostrar() {
    if (/[?&]atribuir=1/.test(window.location.search)) return Promise.resolve(true);
    return detectar();
  }

  /** true se o servidor local está no ar. Erro de rede aqui é normal (é o time). */
  function detectar() {
    if (!window.AbortController) return Promise.resolve(false);
    const parar = new AbortController();
    const relogio = setTimeout(() => parar.abort(), TIMEOUT_PING);
    return fetch(SERVIDOR + '/ping', { signal: parar.signal })
      .then(resp => resp.ok)
      .catch(() => false)
      .then(ok => { clearTimeout(relogio); return ok; });
  }

  function lerBase64(file) {
    return new Promise((resolve, reject) => {
      const leitor = new FileReader();
      leitor.onerror = () => reject(new Falha('erro', 'Não deu para ler o arquivo da planilha.'));
      leitor.onload = () => resolve(String(leitor.result).split(',')[1]);
      leitor.readAsDataURL(file);
    });
  }

  // ─── Diálogo ────────────────────────────────────────────────────────

  function escapar(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function caixa() {
    let el = document.getElementById('modal-atribuir');
    if (!el) {
      el = document.createElement('div');
      el.id = 'modal-atribuir';
      document.body.appendChild(el);
      el.addEventListener('click', e => {
        if (e.target.classList.contains('modal-overlay')) fechar();
      });
    }
    return el;
  }

  function fechar() {
    const el = document.getElementById('modal-atribuir');
    if (el) el.innerHTML = '';
    aoDestravar = null;
  }

  function desenhar(conteudo) {
    caixa().innerHTML = '<div class="modal-overlay"><div class="modal">' + conteudo + '</div></div>';
  }

  function aoClicar(id, funcao) {
    const el = document.getElementById(id);
    if (el) el.addEventListener('click', funcao);
  }

  function cabecalho(titulo) {
    return '<div class="modal-header"><h2><i class="ti ti-user-check"></i> ' + escapar(titulo) + '</h2>' +
           '<button class="modal-close" id="atr-fechar" title="Fechar">&#x2715;</button></div>';
  }

  function telaEspera(texto) {
    desenhar(cabecalho('Atribuir tickets') +
      '<p class="modal-sub">' + escapar(texto) + '</p>' +
      '<div class="atr-espera"><i class="ti ti-loader"></i> Falando com o JMS…</div>');
    aoClicar('atr-fechar', fechar);
  }

  function blocoLog(linhas) {
    if (!linhas || !linhas.length) return '';
    return '<details class="atr-log"><summary>Detalhes do servidor</summary><pre>' +
      escapar(linhas.join('\n')) + '</pre></details>';
  }

  function linhaDoPlano(item) {
    if (item.ok) {
      return '<div class="atr-item atr-ok"><span class="atr-remessa">' + escapar(item.remessa) + '</span>' +
        '<span class="atr-tag">' + escapar(item.tipo) + '</span>' +
        '<span class="atr-destino">→ ' + escapar(item.destino) + '</span></div>';
    }
    return '<div class="atr-item atr-pulado"><span class="atr-remessa">' + escapar(item.remessa) + '</span>' +
      '<span class="atr-tag">' + escapar(item.tipo) + '</span>' +
      '<span class="atr-destino">' + escapar(item.motivo) + '</span></div>';
  }

  function telaPlano(dados) {
    const itens = dados.itens || [];
    const prontos = itens.filter(i => i.ok);

    if (!itens.length) {
      desenhar(cabecalho('Atribuir tickets') +
        '<p class="modal-sub">Nenhuma remessa com status “Para ser atribuído” nesta planilha.</p>' +
        blocoLog(dados.log) +
        '<div class="modal-footer"><button class="btn btn-sm" id="atr-fechar2">Fechar</button></div>');
      aoClicar('atr-fechar', fechar);
      aoClicar('atr-fechar2', fechar);
      return;
    }

    planoId = dados.plano_id;
    desenhar(cabecalho('Confira antes de atribuir') +
      '<p class="modal-sub">Nada foi alterado no JMS ainda — esta é só a simulação.</p>' +
      '<div class="atr-resumo"><b>' + prontos.length + '</b> pronto(s) para atribuir · <b>' +
      (itens.length - prontos.length) + '</b> pulado(s)</div>' +
      '<div class="atr-lista">' + itens.map(linhaDoPlano).join('') + '</div>' +
      blocoLog(dados.log) +
      '<div class="modal-footer">' +
      '<button class="btn btn-sm" id="atr-cancelar">Cancelar</button>' +
      (prontos.length
        ? '<button class="btn btn-blue btn-sm" id="atr-confirmar"><i class="ti ti-check"></i> Atribuir ' +
          prontos.length + ' ticket(s)</button>'
        : '') +
      '</div>');

    aoClicar('atr-fechar', fechar);
    aoClicar('atr-cancelar', fechar);
    aoClicar('atr-confirmar', executar);
  }

  function telaResultado(dados) {
    desenhar(cabecalho('Pronto') +
      '<p class="modal-sub">Atribuição enviada ao JMS. Confira o resultado abaixo.</p>' +
      '<pre class="atr-saida">' + escapar((dados.log || []).join('\n')) + '</pre>' +
      '<div class="modal-footer"><button class="btn btn-blue btn-sm" id="atr-ok">Fechar</button></div>');
    aoClicar('atr-fechar', fechar);
    aoClicar('atr-ok', fechar);
  }

  function telaErro(falha) {
    desenhar(cabecalho('Não deu certo') +
      '<p class="modal-sub">' + escapar(falha.mensagem) + '</p>' +
      '<div class="modal-footer"><button class="btn btn-sm" id="atr-ok">Fechar</button></div>');
    aoClicar('atr-fechar', fechar);
    aoClicar('atr-ok', fechar);
  }

  /** Sessão do JMS expirou: pede o authtoken novo e repete a ação interrompida. */
  function telaToken(falha) {
    desenhar(cabecalho('Cole o token do JMS') +
      '<p class="modal-sub">' + escapar(falha.mensagem) + '</p>' +
      '<ol class="atr-passos">' +
      '<li>Na aba do JMS onde você já está logado com o login CE, abra o DevTools (F12) → Console.</li>' +
      '<li>Rode: <code>localStorage.getItem(\'YL_TOKEN\')</code></li>' +
      '<li>Cole o valor aqui (sem as aspas).</li>' +
      '</ol>' +
      '<textarea id="atr-token" class="atr-token" rows="3" placeholder="authtoken…"></textarea>' +
      '<div class="modal-footer">' +
      '<button class="btn btn-sm" id="atr-cancelar">Cancelar</button>' +
      '<button class="btn btn-blue btn-sm" id="atr-salvar-token"><i class="ti ti-check"></i> Salvar e continuar</button>' +
      '</div>');

    aoClicar('atr-fechar', fechar);
    aoClicar('atr-cancelar', fechar);
    aoClicar('atr-salvar-token', () => {
      const campo = document.getElementById('atr-token');
      const token = campo ? campo.value.trim() : '';
      if (!token) { campo && campo.focus(); return; }
      const repetir = aoDestravar;
      telaEspera('Guardando o token…');
      post('/token', { token: token })
        .then(() => { if (repetir) repetir(); else fechar(); })
        .catch(tratarFalha);
    });

    const campo = document.getElementById('atr-token');
    if (campo) campo.focus();
  }

  function tratarFalha(falha) {
    if (!(falha instanceof Falha)) {
      telaErro(new Falha('erro', String(falha && falha.message ? falha.message : falha)));
      return;
    }
    if (falha.tipo === 'token') { telaToken(falha); return; }
    telaErro(falha);
  }

  // ─── Ações ──────────────────────────────────────────────────────────

  function montarPlano() {
    aoDestravar = montarPlano;
    telaEspera('Cruzando a planilha com o JMS…');
    lerBase64(arquivo)
      .then(b64 => post('/plano', { arquivo_b64: b64, nome: arquivo.name }))
      .then(telaPlano)
      .catch(tratarFalha);
  }

  function executar() {
    if (!planoId) { telaErro(new Falha('erro', 'Gere a lista de novo antes de atribuir.')); return; }
    const id = planoId;
    planoId = null;                       // plano é de uso único, dos dois lados
    aoDestravar = null;                   // token novo no meio da execução exige refazer o plano
    telaEspera('Atribuindo no JMS…');
    post('/executar', { plano_id: id })
      .then(telaResultado)
      .catch(tratarFalha);
  }

  /** Chamado pelo botão do painel. */
  function abrir(file) {
    if (file) guardarArquivo(file);
    if (!arquivo) {
      window.App.UI.toast('Carregue a planilha do BI primeiro.');
      return;
    }
    montarPlano();
  }

  document.addEventListener('keydown', e => {
    const el = document.getElementById('modal-atribuir');
    if (e.key === 'Escape' && el && el.innerHTML) fechar();
  });

  return { detectar, deveMostrar, abrir, guardarArquivo, fechar };
})();
