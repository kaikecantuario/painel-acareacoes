/**
 * Planilha — todo o contato com a biblioteca XLSX fica aqui.
 *
 * Leitura do arquivo do BI, detecção automática das colunas e exportação da
 * lista filtrada. Nenhum outro módulo referencia `XLSX`.
 */
window.App = window.App || {};
window.App.Planilha = (function () {
  'use strict';

  const App = window.App;

  // ─── Leitura ────────────────────────────────────────────────────────

  /**
   * Escolhe a aba de dados: prioriza uma chamada "export", senão a primeira
   * que tenha "base responsavel" no cabeçalho, senão a última do arquivo.
   */
  function encontrarAba(wb) {
    if (!wb.SheetNames.length) throw new Error('o arquivo não contém abas');
    for (const nome of wb.SheetNames) {
      if (nome.toLowerCase().includes('export')) return nome;
    }
    for (const nome of wb.SheetNames) {
      const raw = XLSX.utils.sheet_to_json(wb.Sheets[nome], { defval: '', range: 0 });
      if (raw.length && App.Dominio.strip(Object.keys(raw[0]).join(' ')).includes('base responsavel')) return nome;
    }
    return wb.SheetNames[wb.SheetNames.length - 1];
  }

  /** Identidade do layout da planilha — usada para reaproveitar o mapeamento salvo. */
  function assinatura(cols) {
    return cols.slice().sort().join('|');
  }

  /**
   * Acha a coluna que melhor corresponde a um campo: primeiro por nome exato
   * (sem acento), depois por conter o candidato. Colunas já reivindicadas por
   * um campo anterior são puladas.
   */
  function detectarColuna(cols, candidatos, usadas) {
    const strip = App.Dominio.strip;
    usadas = usadas || new Set();

    for (const candidato of candidatos) {
      const alvo = strip(candidato);
      for (const col of cols) if (!usadas.has(col) && strip(col) === alvo) return col;
    }
    for (const candidato of candidatos) {
      const alvo = strip(candidato);
      for (const col of cols) if (!usadas.has(col) && strip(col).includes(alvo)) return col;
    }
    return null;
  }

  /** Mapa campo → coluna para todos os campos, respeitando a ordem de prioridade. */
  function detectarMapa(cols, campos) {
    const mapa = {};
    const usadas = new Set();
    campos.forEach(campo => {
      const col = detectarColuna(cols, campo.candidatos, usadas);
      mapa[campo.id] = col;
      if (col) usadas.add(col);
    });
    return mapa;
  }

  /** Formato nativo do WPS: o XLSX não lê e ainda aceita o arquivo em silêncio. */
  const EXT_NAO_SUPORTADAS = ['et', 'ett'];

  /**
   * CSV salvo em UTF-8 sem BOM sai com acento quebrado quando lido como bytes.
   * Devolve o texto decodificado, ou null se não for UTF-8 válido (ANSI/cp1252),
   * caso em que o XLSX resolve pelo caminho normal.
   */
  function decodificarUtf8(bytes) {
    try {
      const txt = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
      return txt.charCodeAt(0) === 0xFEFF ? txt.slice(1) : txt;
    } catch (_) {
      return null;
    }
  }

  /**
   * Lê a planilha escolhida (.xlsx, .xls, .csv ou .ods).
   * @returns {Promise<{abaNome: string, raw: object[], cols: string[]}>}
   */
  function ler(file) {
    return new Promise((resolve, reject) => {
      const ext = (file.name.split('.').pop() || '').toLowerCase();
      if (EXT_NAO_SUPORTADAS.includes(ext)) {
        reject(new Error('formato nativo do WPS (.' + ext + ') não é suportado — no WPS use ' +
          'Arquivo > Salvar como > Pasta de trabalho do Excel (*.xlsx)'));
        return;
      }
      const reader = new FileReader();
      reader.onerror = () => reject(new Error('não foi possível ler o arquivo'));
      reader.onload = ev => {
        try {
          let dados = ev.target.result;
          let tipo = 'array';
          if (ext === 'csv') {
            const txt = decodificarUtf8(new Uint8Array(dados));
            if (txt !== null) { dados = txt; tipo = 'string'; }
          }
          const wb = XLSX.read(dados, { type: tipo, cellDates: false });
          const abaNome = encontrarAba(wb);
          const raw = XLSX.utils.sheet_to_json(wb.Sheets[abaNome], { defval: '', raw: true });
          resolve({ abaNome, raw, cols: raw.length ? Object.keys(raw[0]) : [] });
        } catch (err) {
          reject(err);
        }
      };
      reader.readAsArrayBuffer(file);
    });
  }

  // ─── Exportação ─────────────────────────────────────────────────────

  /** Colunas do arquivo exportado, na ordem — cabeçalho → como extrair da acareação. */
  const COLUNAS_EXPORT = [
    ['Remessa',                r => r.remessa],
    ['Status do Ticket',       r => r.statusTicketRaw || ''],
    ['Assistente Responsável', r => r.assistenteResp || ''],
    ['Base',                   r => r.base],
    ['Problema',               r => r.problema],
    ['Embarcador',             r => r.embarcador],
    ['Destinatário',           r => r.destinatario],
    ['Telefone',               r => r.tel],
    ['Telefone Entregador',    r => r.telEntregador || ''],
    ['Entregador',             r => r.entregador],
    ['Data da Entrega',        r => r.dataBaixa],
    ['Vencimento',             r => r.vencimento],
    ['Valor',                  r => r.valorFmt || ''],
    ['Item',                   r => r.item || ''],
    ['RNE',                    r => r.rne || ''],
  ];

  function nomeArquivoExport(agora) {
    const pad = n => String(n).padStart(2, '0');
    return `acareacoes_${agora.getFullYear()}${pad(agora.getMonth() + 1)}${pad(agora.getDate())}` +
           `_${pad(agora.getHours())}${pad(agora.getMinutes())}.xlsx`;
  }

  /** Gera e dispara o download do .xlsx com as acareações informadas. */
  function exportarAcareacoes(rows) {
    const linhas = rows.map(row => {
      const linha = {};
      COLUNAS_EXPORT.forEach(([cabecalho, extrair]) => { linha[cabecalho] = extrair(row); });
      return linha;
    });

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(linhas), 'Acareações');
    XLSX.writeFile(wb, nomeArquivoExport(new Date()));
  }

  return { encontrarAba, assinatura, detectarColuna, detectarMapa, ler, exportarAcareacoes };
})();
