/**
 * Dominio — regras de negócio das acareações.
 *
 * Só funções puras: recebe dados, devolve dados. Não toca no DOM, no
 * localStorage nem no XLSX. Onde precisa saber se uma remessa está concluída
 * ou é presencial, recebe o predicado por parâmetro em vez de consultar o
 * estado global.
 */
window.App = window.App || {};
window.App.Dominio = (function () {
  'use strict';

  // ─── Vocabulário do BI ──────────────────────────────────────────────

  const MAPA_PROBLEMAS = [
    { chaves: ['[latam] delivered but not received', 'delivered but not received'], saida: 'Assinado não recebido' },
    { chaves: ['assinado nao recebido/签收未收到', 'assinado nao recebido'], saida: 'Assinado não recebido' },
    { chaves: ['verificacao do pod/pod核实', 'verificacao do pod'], saida: 'Verificação do POD' },
    { chaves: ['item damaged (packing damaged)', 'avaria apos entrega', 'avaria apos', 'danificado'], saida: 'Avaria após entrega' },
    { chaves: ['incorrect item', 'incorreto'], saida: 'Item incorreto' },
    { chaves: ['missing item or empty package', 'item faltante', 'pacote vazio', 'item faltante ou pacote vazio'], saida: 'Item faltante ou pacote vazio' },
    { chaves: ['pacote perdido'], saida: 'Pacote Perdido' },
    { chaves: ['troca de etiqueta', 'troca'], saida: 'Troca de etiqueta' },
  ];

  const EMBARCADORES_CONHECIDOS = {
    shein: 'Shein', cainiao: 'Cainiao', mercado: 'Mercado Livre', shopee: 'Shopee',
    temu: 'Temu', wepink: 'WePink', jequiti: 'Jequiti', tiktok: 'TikTok',
  };

  /**
   * Campos que o painel consome, com os nomes de coluna que já apareceram no BI.
   * A ordem importa: a detecção automática reserva a coluna para o primeiro
   * campo que a reivindicar (por isso `assistenteResp` vem antes de `tel`, e
   * `dataBaixa` lista "data da entrega" primeiro).
   */
  const CAMPOS = [
    { id: 'remessa',       label: 'Remessa / Nº do pedido',        obrigatorio: true,  candidatos: ['remessa', 'numero da remessa', 'numero do pedido', 'numero pedido', 'pedido', 'waybill', 'tracking', 'cod remessa', 'codigo remessa'] },
    { id: 'problema',      label: 'Tipo de problema (nível 2)',     obrigatorio: true,  candidatos: ['tipo de item problematico nivel 2', 'tipo de item problematico nivel2', 'tipo de item problematico', 'problema nivel 2', 'problema nivel2', 'nivel 2', 'nivel2', 'tipo do problema', 'tipo problema', 'problema'] },
    { id: 'base',          label: 'Base responsável',               obrigatorio: true,  candidatos: ['base', 'base responsavel', 'base responsável', 'base de distribuicao', 'base distribuicao', 'hub responsavel', 'hub'] },
    { id: 'statusTicket',  label: 'Status do Ticket',               obrigatorio: false, candidatos: ['status', 'status do ticket', 'status ticket', 'status da ocorrencia', 'status ocorrencia', 'status do chamado', 'situacao do ticket', 'situacao ticket'] },
    { id: 'assistenteResp',label: 'Assistente Responsável',         obrigatorio: false, candidatos: ['assistente', 'atendente', 'assistente responsavel', 'assistente responsável', 'atendente responsavel', 'atendente responsável', 'responsavel', 'responsável'] },
    { id: 'tel',           label: 'Telefone do destinatário',       obrigatorio: false, candidatos: ['telefone', 'celular', 'tel', 'fone', 'contato', 'telefone do destinatario', 'telefone do destinatário', 'telefone destinatario', 'telefone do cliente', 'celular do destinatario', 'celular destinatario'] },
    { id: 'telEntregador', label: 'Telefone do entregador',         obrigatorio: false, candidatos: ['telefone entregador', 'telefone do entregador', 'celular entregador', 'celular do entregador', 'tel entregador', 'fone entregador', 'contato entregador', 'whatsapp entregador', 'telefone motorista', 'celular motorista', 'tel motorista', 'contato do entregador'] },
    { id: 'entregador',    label: 'Entregador',                     obrigatorio: false, candidatos: ['entregador', 'nome do entregador', 'entregador responsavel', 'motorista', 'courier'] },
    { id: 'dataBaixa',     label: 'Data da entrega / baixa',        obrigatorio: false, candidatos: ['data da entrega', 'data de entrega', 'data entrega', 'data da baixa', 'data de baixa', 'data baixa', 'horario de entrega', 'horario entrega'] },
    { id: 'prazo',         label: 'Prazo regional / vencimento',    obrigatorio: false, candidatos: ['prazo', 'vencimento', 'prazo regional', 'prazo de vencimento', 'data de vencimento', 'prazo limite'] },
    { id: 'valor',         label: 'Valor do produto',               obrigatorio: false, candidatos: ['valor', 'preco', 'price', 'valor declarado', 'valor do produto', 'valor do pedido', 'valor mercadoria', 'valor nota fiscal', 'valor nf'] },
    { id: 'item',          label: 'Item / Descrição do produto',    obrigatorio: false, candidatos: ['conteudo do pacote', 'conteudo', 'produto', 'descricao', 'description', 'descricao do produto', 'descricao do item', 'nome do produto', 'nome do item', 'descricao produto', 'descricao item', 'item'] },
    { id: 'embarcador',    label: 'Embarcador / Origem do pedido',  obrigatorio: false, candidatos: ['embarcador', 'loja', 'origem', 'origem do pedido', 'nome do embarcador', 'lojista', 'shipper', 'seller'] },
    // 'nome destainario' cobre o typo que aparece em algumas exportações
    { id: 'destinatario',  label: 'Nome do destinatário',           obrigatorio: false, candidatos: ['destinatario', 'destinatário', 'cliente', 'nome destainario', 'nome do destinatario', 'nome do destinatário', 'nome destinatario', 'nome destinatário', 'nome do cliente', 'recipient'] },
    { id: 'rne',           label: 'RNE / Focal',                    obrigatorio: false, candidatos: ['rne', 'focal', 'numero rne', 'cod rne'] },
  ];

  // ─── Normalização ───────────────────────────────────────────────────

  /** Minúsculas, sem espaços nas pontas e sem acentos — base de toda comparação. */
  function strip(s) {
    return String(s || '').toLowerCase().trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  }

  /** Converte o tipo de problema do BI num rótulo canônico; null se não for acareação. */
  function normalizarProblema(v) {
    const s = strip(v);
    if (!s) return null;
    for (const entrada of MAPA_PROBLEMAS) {
      for (const chave of entrada.chaves) {
        if (s === chave || s.includes(chave)) return entrada.saida;
      }
    }
    return null;
  }

  /** Reduz as várias grafias de status do BI a uma chave canônica. */
  function normalizarStatusTicket(v) {
    const s = strip(v);
    if (!s) return 'sem_status';
    if (s.includes('para ser atribuido') || s.includes('para atribuir')) return 'para_atribuir';
    if (s.includes('processamento concluido')) return 'concluido_tk';
    if (s.includes('processando')) return 'processando';
    if (s.includes('fechado')) return 'fechado';
    return 'sem_status';
  }

  function normalizarEmbarcador(v) {
    const s = String(v || '').toLowerCase().trim();
    for (const chave in EMBARCADORES_CONHECIDOS) {
      if (s.includes(chave)) return EMBARCADORES_CONHECIDOS[chave];
    }
    return s.replace(/\b\w/g, c => c.toUpperCase());
  }

  // ─── Conversão de valores da planilha ───────────────────────────────

  /** Códigos numéricos (remessa) chegam como float do Excel; arredonda sem virar notação científica. */
  function tratarNumero(v) {
    if (v === null || v === undefined || String(v).trim() === '') return '';
    const s = String(v).trim();
    const n = parseFloat(s);
    if (!isNaN(n) && s.match(/^[\d.eE+\-]+$/)) return String(Math.round(n));
    return s;
  }

  function tratarValor(v) {
    if (v === null || v === undefined || String(v).trim() === '') return null;
    let texto = String(v).trim().replace(/R\$|\s/g, '');
    if (texto.includes(',')) texto = texto.replace(/\./g, '').replace(',', '.');
    const n = Number(texto);
    return Number.isFinite(n) ? n : null;
  }

  function formatarValor(n) {
    if (n === null || n === undefined) return null;
    return 'R$ ' + n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  const pad = n => String(n).padStart(2, '0');

  /** Serial do Excel → Date. O epoch do Excel é 1899-12-30, daí o -25569. */
  function dataDeSerialExcel(serial) {
    return new Date(Math.round((serial - 25569) * 86400 * 1000));
  }

  function ehVazio(v) {
    return v === null || v === undefined || String(v).trim() === '' || String(v) === 'NaN';
  }

  function dataUTC(d) {
    return `${pad(d.getUTCDate())}/${pad(d.getUTCMonth() + 1)}/${d.getUTCFullYear()}`;
  }

  function formatarDataExcel(v) {
    if (ehVazio(v)) return 'N/A';
    let d;
    if (typeof v === 'number') d = dataDeSerialExcel(v);
    else if (v instanceof Date) d = v;
    else d = new Date(v);
    if (isNaN(d)) return String(v).trim() || 'N/A';
    const h = d.getUTCHours(), mi = d.getUTCMinutes();
    return (h === 0 && mi === 0) ? dataUTC(d) : `${dataUTC(d)} às ${pad(h)}h${pad(mi)}`;
  }

  /** Nomes do time de plantão — expediente das 9h às 18h. */
  const ATENDENTES_PLANTAO = ['sabrina', 'malu', 'diogo', 'miqueias', 'renan', 'edja', 'wilson', 'lucas', 'ricardo'];

  /** O nome digitado em "Responsável pelos atendimentos" é de alguém do plantão? */
  function ehPlantao(nomeAtendente) {
    return ATENDENTES_PLANTAO.includes(strip(nomeAtendente).replace(/\s+/g, ' '));
  }

  /**
   * O prazo regional vence às 17h (plantão: 18h). Fora do expediente o BI
   * grava horários que não correspondem ao prazo real, então normalizamos:
   * depois do fim do expediente vira o fim do expediente no mesmo dia;
   * antes do início do expediente, o fim do expediente no dia anterior.
   */
  function ajustarVencimento(v, plantao) {
    if (ehVazio(v)) return 'N/A';
    if (typeof v !== 'number') {
      const s = String(v).trim();
      return s ? s.replace(/\s*-\s*/, ' - ') : 'N/A';
    }
    const d = dataDeSerialExcel(v);
    if (isNaN(d)) return String(v).trim() || 'N/A';
    const inicio = plantao ? 9 : 8;
    const fim = plantao ? 18 : 17;
    const h = d.getUTCHours();
    if (h >= fim) return `${dataUTC(d)} às ${fim}h00`;
    if (h < inicio) return `${dataUTC(new Date(d.getTime() - 86400000))} às ${fim}h00`;
    return `${dataUTC(d)} às ${pad(h)}h${pad(d.getUTCMinutes())}`;
  }

  /** Timestamp comparável para ordenar por prazo. Sem prazo vai para o fim. */
  function prazoTimestamp(v) {
    if (v === null || v === undefined || String(v).trim() === '') return Infinity;
    if (typeof v === 'number') {
      const d = dataDeSerialExcel(v);
      if (d.getUTCHours() >= 17) d.setUTCHours(17, 0, 0, 0);
      else if (d.getUTCHours() < 8) { d.setUTCDate(d.getUTCDate() - 1); d.setUTCHours(17, 0, 0, 0); }
      return new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), d.getUTCHours(), d.getUTCMinutes()).getTime();
    }
    const s = String(v).trim();
    const br = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s*(?:às|as|-)\s*(\d{1,2})(?:h|:)(\d{2})?)?$/);
    if (br) {
      const [, day, month, year, hour = '17', minute = '0'] = br;
      const date = new Date(+year, +month - 1, +day, +hour, +minute);
      return date.getFullYear() === +year && date.getMonth() === +month - 1 && date.getDate() === +day ? date.getTime() : Infinity;
    }
    const m = s.match(/^(\d{1,2})\/(\d{1,2})\s*-\s*(\d{1,2})h?/);
    if (m) {
      const d = new Date(new Date().getFullYear(), parseInt(m[2]) - 1, parseInt(m[1]), parseInt(m[3]), 0, 0);
      return isNaN(d) ? Infinity : d.getTime();
    }
    const d = new Date(s);
    return isNaN(d) ? Infinity : d.getTime();
  }

  function isNumeroInvalido(tel) {
    const t = String(tel || '').replace(/\D/g, '');
    return !t || t === '0' || t === '00' || t.length < 8;
  }

  // ─── Montagem das acareações ────────────────────────────────────────

  /**
   * Converte as linhas cruas da planilha em acareações, usando o mapa
   * campo → nome de coluna. Linhas cujo tipo de problema não é uma acareação
   * conhecida são descartadas e contadas em `ignorados`.
   */
  function processarDados(raw, mapa, atendente) {
    let ignorados = 0;
    const plantao = ehPlantao(atendente);
    const texto = (linha, coluna, padrao) => coluna ? String(linha[coluna] || padrao).trim() : padrao;

    const dados = raw.map(linha => {
      const problema = normalizarProblema(mapa.problema ? linha[mapa.problema] : '');
      const remessa = mapa.remessa ? tratarNumero(linha[mapa.remessa]) : '';
      if (!problema || !remessa) { ignorados++; return null; }

      const prazoRaw = mapa.prazo ? linha[mapa.prazo] : null;
      const valorNum = tratarValor(mapa.valor ? linha[mapa.valor] : null);
      const statusTicketRaw = texto(linha, mapa.statusTicket, '');

      return {
        remessa:        remessa,
        tel:            texto(linha, mapa.tel, ''),
        telEntregador:  texto(linha, mapa.telEntregador, ''),
        entregador:     mapa.entregador ? String(linha[mapa.entregador] || 'N/A').trim() : 'N/A',
        dataBaixa:      mapa.dataBaixa ? formatarDataExcel(linha[mapa.dataBaixa]) : 'N/A',
        vencimento:     prazoRaw != null ? ajustarVencimento(prazoRaw, plantao) : 'N/A',
        prazoTs:        prazoRaw != null ? prazoTimestamp(prazoRaw) : Infinity,
        valorNum:       valorNum,
        valorFmt:       formatarValor(valorNum),
        item:           texto(linha, mapa.item, ''),
        base:           mapa.base ? String(linha[mapa.base] || '').toUpperCase().trim() : 'N/A',
        embarcador:     mapa.embarcador ? normalizarEmbarcador(linha[mapa.embarcador]) : 'N/A',
        problema:       problema,
        destinatario:   mapa.destinatario ? String(linha[mapa.destinatario] || 'Cliente').trim() : 'Cliente',
        rne:            texto(linha, mapa.rne, ''),
        statusTicket:   normalizarStatusTicket(statusTicketRaw),
        statusTicketRaw: statusTicketRaw,
        assistenteResp: texto(linha, mapa.assistenteResp, ''),
      };
    }).filter(Boolean);

    return { dados, ignorados };
  }

  // ─── Consultas sobre a lista carregada ──────────────────────────────

  const ORDENACOES = {
    'valor-asc':  (a, b) => (a.row.valorNum ?? Infinity) - (b.row.valorNum ?? Infinity),
    'valor-desc': (a, b) => (b.row.valorNum ?? -Infinity) - (a.row.valorNum ?? -Infinity),
    'prazo-asc':  (a, b) => compararPrazo(a.row.prazoTs, b.row.prazoTs, 1),
    'prazo-desc': (a, b) => compararPrazo(a.row.prazoTs, b.row.prazoTs, -1),
  };

  function compararPrazo(a, b, ordem) {
    if (!Number.isFinite(a)) return Number.isFinite(b) ? 1 : 0;
    if (!Number.isFinite(b)) return -1;
    return (a - b) * ordem;
  }

  /**
   * Aplica filtros e ordenação, devolvendo `{ row, idx }` — `idx` é a posição
   * na lista original, que é como as ações identificam a acareação.
   *
   * @param {object}   criterios      { base, embarcador, problema, status, statusTicket, assistente, busca, ordenacao }
   * @param {function} estaConcluido  (row) => boolean
   */
  function filtrarEOrdenar(dados, criterios, estaConcluido) {
    const c = criterios || {};
    const busca = strip(c.busca);

    const itens = dados
      .map((row, idx) => ({ row, idx }))
      .filter(({ row }) => {
        if (c.base && row.base !== c.base) return false;
        if (c.embarcador && row.embarcador !== c.embarcador) return false;
        if (c.problema && row.problema !== c.problema) return false;
        if (busca && !strip([row.remessa, row.entregador, row.embarcador, row.item, row.destinatario, row.rne].join(' ')).includes(busca)) return false;
        if (c.status === 'pendente' && estaConcluido(row)) return false;
        if (c.status === 'concluido' && !estaConcluido(row)) return false;
        if (c.statusTicket && row.statusTicket !== c.statusTicket) return false;
        if (c.assistente && row.assistenteResp !== c.assistente) return false;
        return true;
      });

    const comparador = ORDENACOES[c.ordenacao];
    if (comparador) itens.sort(comparador);
    return itens;
  }

  /** Valores distintos para popular os selects de filtro. */
  function opcoesDeFiltro(dados) {
    const distintos = f => [...new Set(dados.map(f).filter(Boolean))].sort();
    return {
      bases:        [...new Set(dados.map(r => r.base))].sort(),
      embarcadores: distintos(r => r.embarcador),
      problemas:    [...new Set(dados.map(r => r.problema))].sort(),
      assistentes:  distintos(r => r.assistenteResp),
      statusTickets: distintos(r => r.statusTicket),
    };
  }

  /** Contadores do topo do painel — sempre sobre a lista inteira, não a filtrada. */
  function calcularStats(dados, ehPresencial, estaConcluido) {
    const presencial = dados.filter(ehPresencial).length;
    return {
      total:      dados.length,
      whatsapp:   dados.length - presencial,
      presencial: presencial,
      concluidas: dados.filter(estaConcluido).length,
    };
  }

  return {
    CAMPOS,
    strip,
    normalizarProblema,
    normalizarStatusTicket,
    normalizarEmbarcador,
    tratarNumero,
    tratarValor,
    formatarValor,
    formatarDataExcel,
    ajustarVencimento,
    ehPlantao,
    prazoTimestamp,
    isNumeroInvalido,
    processarDados,
    filtrarEOrdenar,
    opcoesDeFiltro,
    calcularStats,
  };
})();
