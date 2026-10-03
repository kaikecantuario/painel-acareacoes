/**
 * Templates — geração dos textos copiados pelo atendente.
 *
 * Funções puras: recebem a acareação e as opções já resolvidas pelo chamador.
 * Não leem preferências do storage nem campos do formulário — quem chama é que
 * decide se o produto entra no ativo ou se o valor entra no template Feishu.
 */
window.App = window.App || {};
window.App.Templates = (function () {
  'use strict';

  const ARTIGOS = [
    { marcas: ['mercado', 'mercado livre', 'magalu', 'kwai'], artigo: 'do' },
    { marcas: ['cainiao', 'shein'], artigo: 'da' },
    { marcas: ['wepink'], artigo: 'na' },
    { marcas: ['tiktok'], artigo: 'no' },
  ];

  /** Preposição correta para "parceira de entregas ___ *Embarcador*". */
  function artigoEmbarcador(nome) {
    const n = String(nome).toLowerCase();
    for (const regra of ARTIGOS) {
      if (regra.marcas.some(m => n.includes(m))) return regra.artigo;
    }
    return nome.match(/[aei]$/i) ? 'da' : 'do';
  }

  // ─── Variantes da mensagem ativa (WhatsApp) ─────────────────────────

  function ativoMercadoLivre(ctx) {
    return `Olá, *${ctx.nome}*!\n\n` +
      `Me chamo ${ctx.assistente} e sou da Transportadora J&T Express, parceira de entregas do *Mercado Livre*.\n` +
      `Verificamos que você abriu uma reclamação referente ${ctx.incluirProduto && ctx.item !== 'N/A' ? 'ao produto *' + ctx.item + '*, ID' : 'ao pedido'} *${ctx.remessa}* e entregue dia *${ctx.data}*.\n\n` +
      `Para que possamos auxiliar, escolha uma opção:\n\n` +
      `1 - Recebi o produto\n` +
      `2 - Não recebi o produto\n` +
      `3 - Recebi o pacote com produtos faltantes\n` +
      `4 - Recebi o produto com defeito\n` +
      `5 - Recebi um produto diferente do comprado`;
  }

  /** Usada por TikTok e WePink — mesmo texto, muda só a preposição do embarcador. */
  function ativoSeteOpcoes(ctx) {
    return `Olá, *${ctx.nome}*!\n\n` +
      `Meu nome é ${ctx.assistente}, representante da transportadora J&T Express.\n` +
      `Verificamos que você abriu uma reclamação referente ao pedido *${ctx.remessa}*${ctx.produto}, realizado ${artigoEmbarcador(ctx.embarcador)} *${ctx.embarcador}*.\n\n` +
      `Para que possamos auxiliar, escolha uma das opções abaixo e responda apenas com o n°:\n\n` +
      `1 - Recebi o produto.\n` +
      `2 - Recebi o produto, corretamente lacrado e embalado.\n` +
      `3 - Não recebi o produto\n` +
      `4 - Recebi o produto com itens faltantes\n` +
      `5 - Recebi o produto, porém com a embalagem externa em más condições.\n` +
      `6 - Recebi o produto diferente do que comprei\n` +
      `7 - Recebi o produto com defeito`;
  }

  function ativoPadrao(ctx) {
    return `Olá, *${ctx.nome}*!\n\n` +
      `Sou ${ctx.assistente}, representante da Transportadora J&T Express, parceira de entregas ${artigoEmbarcador(ctx.embarcador)} *${ctx.embarcador}*\n` +
      `Verificamos que você abriu uma reclamação referente ao pedido *${ctx.remessa}*${ctx.produto}\n\n` +
      `Para que possamos auxiliar, escolha uma opção:\n\n` +
      `1️⃣ Recebi o produto\n` +
      `2️⃣ Não recebi o produto\n` +
      `3️⃣ Recebi o pacote com produtos faltantes\n` +
      `4️⃣ Recebi o produto com defeito\n` +
      `5️⃣ Recebi um produto diferente do comprado\n` +
      `6️⃣ Recebi o produto danificado`;
  }

  /**
   * @param {object} row      acareação
   * @param {object} opcoes   { assistente, incluirProduto }
   */
  function gerarMensagemWpp(row, opcoes) {
    const o = opcoes || {};
    const embarcador = row.embarcador || 'N/A';
    const ctx = {
      nome:       row.destinatario || 'Cliente',
      assistente: o.assistente || 'Atendente',
      embarcador: embarcador,
      remessa:    row.remessa || 'N/A',
      data:       row.dataBaixa || 'N/A',
      item:       row.item || 'N/A',
      incluirProduto: !!o.incluirProduto,
      produto:    (o.incluirProduto && row.item) ? `, produto *${row.item}*` : '',
    };

    const marca = embarcador.toLowerCase();
    if (marca.includes('mercado')) return ativoMercadoLivre(ctx);
    if (marca.includes('tiktok') || marca.includes('wepink')) return ativoSeteOpcoes(ctx);
    return ativoPadrao(ctx);
  }

  // ─── Template do Feishu ─────────────────────────────────────────────

  /**
   * @param {object} row      acareação
   * @param {object} opcoes   { assistente, lider, presencial, incluirValor, incluirTelEntregador, obs }
   */
  function gerarTemplateFeishu(row, opcoes) {
    const o = opcoes || {};
    const linhas = [
      ``,
      `${row.problema} - ${row.base}`,
      `Nº: ${row.remessa}`,
      `EMBARCADOR: ${row.embarcador}`,
      `DATA DA BAIXA: ${row.dataBaixa}`,
      `ENTREGADOR: ${row.entregador}`,
      `VENCIMENTO: ${row.vencimento}`,
      `TEL: ${o.presencial ? 'Apenas presencial' : (row.tel || 'N/A')}`,
    ];

    if (o.incluirTelEntregador && row.telEntregador) linhas.push(`TEL ENTREGADOR: ${row.telEntregador}`);
    if (o.incluirValor && row.valorFmt) linhas.push(`VALOR: ${row.valorFmt}`);
    linhas.push(`Atendente responsável: ${o.assistente || 'Atendente'}`);

    const lider = String(o.lider || '').trim();
    if (lider) linhas.push(``, `@${lider}`);

    const obs = String(o.obs || '').trim();
    if (obs) linhas.push(``, `Obs: ${obs}`);

    return linhas.join('\n');
  }

  return { gerarMensagemWpp, gerarTemplateFeishu, artigoEmbarcador };
})();
