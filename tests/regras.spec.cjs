const { test, expect } = require('@playwright/test');
const vm = require('node:vm');
const fs = require('node:fs');
function app(storage = {}) {
  const context = vm.createContext({ window: {}, localStorage: { getItem: k => storage[k] ?? null, setItem: (k, v) => { storage[k] = v; }, removeItem: k => { delete storage[k]; } }, btoa: x => Buffer.from(x, 'binary').toString('base64') });
  for (const name of ['storage', 'dominio', 'templates', 'planilha']) vm.runInContext(fs.readFileSync(`assets/js/${name}.js`, 'utf8'), context);
  return context.window.App;
}
test('build incorpora todos os recursos e sincroniza o arquivo aberto no editor', () => {
  const html = fs.readFileSync('standalone.html', 'utf8');
  expect(html).not.toMatch(/<script src=|<link rel="stylesheet"/);
  expect(html).toContain('assets/js/app.js'); expect(html).toContain('assets/vendor/xlsx.full.min.js');
  if (fs.existsSync('Painel de Acareacoes - Standalone.html')) {
    expect(fs.readFileSync('Painel de Acareacoes - Standalone.html', 'utf8')).toBe(html);
    expect(fs.readFileSync('artifacts/claude-design-reference.html', 'utf8')).toContain('type="__bundler/manifest"');
  }
});
test('valores e números: vazios, zero, negativos, moeda e valores inválidos', () => {
  const d = app().Dominio;
  for (const [input, result] of [[null, null], ['', null], [0, 0], ['0', 0], ['R$ 1.249,90', 1249.9], ['-10,20', -10.2], ['invalido', null], ['12abc', null], [123.45, 123.45]]) expect(d.tratarValor(input)).toBe(result);
  expect(d.tratarNumero('JT001')).toBe('JT001'); expect(d.tratarNumero(1234)).toBe('1234'); expect(d.tratarNumero(null)).toBe('');
  for (const phone of ['', 'N/A', '0', '00', '123']) expect(d.isNumeroInvalido(phone)).toBe(true);
  expect(d.isNumeroInvalido('(11) 98812-3340')).toBe(false);
});
test('prazos: horários fora do expediente, datas brasileiras e datas ausentes', () => {
  const d = app().Dominio;
  const serial = hour => Date.UTC(2026, 9, 3, hour) / 86400000 + 25569;
  expect(d.ajustarVencimento(serial(22))).toBe('03/10/2026 às 17h00');
  expect(d.ajustarVencimento(serial(7))).toBe('02/10/2026 às 17h00');
  expect(d.ajustarVencimento(serial(12))).toBe('03/10/2026 às 12h00');
  expect(d.prazoTimestamp('03/10/2026 às 17h00')).toBe(d.prazoTimestamp(serial(22)));
  expect(d.prazoTimestamp('31/02/2026')).toBe(Infinity); expect(d.prazoTimestamp('N/A')).toBe(Infinity);
});
test('combinações de filtros e ordenações mantêm os índices das ações', () => {
  const d = app().Dominio;
  const rows = Array.from({ length: 30 }, (_, idx) => ({ remessa: `JT${idx}`, base: idx % 2 ? 'A' : 'B', problema: idx % 3 ? 'POD' : 'Avaria', statusTicket: ['para_atribuir', 'processando', 'fechado', 'concluido_tk', 'sem_status'][idx % 5], assistenteResp: idx % 2 ? 'Ana' : 'Bruno', entregador: 'João', valorNum: idx === 29 ? null : idx, prazoTs: idx === 29 ? Infinity : idx }));
  let cases = 0;
  for (const base of ['', 'A', 'B']) for (const problema of ['', 'POD', 'Avaria']) for (const status of ['', 'pendente', 'concluido']) for (const statusTicket of ['', 'para_atribuir', 'processando', 'fechado', 'concluido_tk', 'sem_status']) for (const assistente of ['', 'Ana', 'Bruno']) for (const ordenacao of ['', 'valor-asc', 'valor-desc', 'prazo-asc', 'prazo-desc']) {
    const criteria = { base, problema, status, statusTicket, assistente, ordenacao };
    const result = d.filtrarEOrdenar(rows, criteria, row => +row.remessa.slice(2) % 2 === 0);
    const expected = rows.map((row, idx) => ({ row, idx })).filter(({ row, idx }) => (!base || row.base === base) && (!problema || row.problema === problema) && (!statusTicket || row.statusTicket === statusTicket) && (!assistente || row.assistenteResp === assistente) && (!status || (status === 'concluido') === (idx % 2 === 0)));
    expect(Array.from(result, x => x.idx).sort((a, b) => a - b)).toEqual(expected.map(x => x.idx));
    for (const item of result) expect(item.row).toBe(rows[item.idx]);
    cases++;
  }
  expect(cases).toBe(2430);
  expect(d.filtrarEOrdenar(rows, { busca: 'joao' }, () => false)).toHaveLength(30);
});
test('estado salvo é restaurado e JSON corrompido não derruba a página', () => {
  const storage = { lideres: 'null', obs: '[]', concluido: '{invalido', prefs: '42' };
  let s = app(storage).Store;
  expect(s.getPrefs().produto).toBe(false); expect(s.getObs('JT1')).toBe('');
  s.setObs('JT1', 'Observação'); s.setLider('BASE', 'Ana'); s.setPresencial('JT1', true); s.alternarConcluido('JT1'); s.setTema('dark'); s.setLayout('original');
  s = app(storage).Store;
  expect(s.getObs('JT1')).toBe('Observação'); expect(s.getLider('BASE')).toBe('Ana'); expect(s.isPresencial('JT1')).toBe(true); expect(s.isConcluido('JT1')).toBe(true); expect(s.getTema()).toBe('dark'); expect(s.getLayout()).toBe('original');
  s.setObs('JT1', '  '); expect(app(storage).Store.temObs('JT1')).toBe(false);
  expect(s.isConcluido('__proto__')).toBe(false); s.setObs('__proto__', 'Texto válido'); expect(s.getObs('__proto__')).toBe('Texto válido');
  storage['col_map_' + Buffer.from('colunas antigas', 'binary').toString('base64').slice(0, 40)] = JSON.stringify({ remessa: 'Legado' });
  expect(s.getMapeamento('colunas antigas').remessa).toBe('Legado');
});
test('cabeçalhos são detectados sem reutilizar colunas e obrigatórios ignoram linhas vazias', () => {
  const { Dominio: d, Planilha: p } = app();
  const cols = ['Remessa', 'Problema', 'Base', 'Telefone', 'Telefone do Entregador', 'Assistente Responsável', 'Vencimento'];
  const map = p.detectarMapa(cols, d.CAMPOS);
  expect(map.tel).toBe('Telefone'); expect(map.telEntregador).toBe('Telefone do Entregador'); expect(map.assistenteResp).toBe('Assistente Responsável');
  const out = d.processarDados([{ Remessa: 'JT1', Problema: 'Incorrect item', Base: 'sp' }, { Remessa: '', Problema: 'Incorrect item', Base: 'sp' }, { Remessa: 'JT2', Problema: 'outro', Base: 'sp' }], map);
  expect(out.dados).toHaveLength(1); expect(out.ignorados).toBe(2); expect(out.dados[0].base).toBe('SP');
});
