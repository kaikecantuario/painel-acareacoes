const { test, expect } = require('@playwright/test');
const XLSX = require('xlsx');
const path = require('node:path');
const fs = require('node:fs');
const { pathToFileURL } = require('node:url');

const serial = (day, hour = 12) => Date.UTC(2026, 9, day, hour) / 86400000 + 25569;
const statuses = ['Para ser atribuído', 'Para ser atribuído', 'Para ser atribuído', 'Para ser atribuído', 'Processando', 'Fechado', 'Processamento concluído', ''];
const rows = statuses.map((status, i) => ({
  Remessa: `JT00${i + 1}`, 'Tipo de item problemático nível 2': i % 2 ? 'Incorrect item' : 'Delivered but not received',
  'Base Responsável': i < 4 ? 'F São Paulo' : 'F Osasco', 'Status do Ticket': status,
  'Assistente Responsável': i % 2 ? 'Brian' : 'Eude', 'Telefone do Destinatário': i === 1 ? 'N/A' : '(11) 98812-3340',
  'Telefone do entregador': '(11) 97740-1122', Entregador: i % 2 ? 'Rafael Souza' : 'Carlos Mendes',
  'Data da Entrega': serial(1), 'Prazo Regional': i === 7 ? '' : serial(3 + i, i === 0 ? 22 : 12),
  Valor: i === 0 ? 'R$ 1.249,90' : i === 7 ? '' : 100 + i, Produto: i === 2 ? '' : `Produto ${i + 1}`,
  'Origem do Pedido': ['Mercado Livre', 'TikTok Shop', 'WePink', 'Shein', 'Cainiao', 'Shopee', 'Temu', 'Magalu'][i],
  'Nome do Destinatário': `Cliente ${i + 1}`, RNE: `RNE ${i + 1}`,
}));
const inputRows = [...rows, { ...rows[0], Remessa: '', Produto: 'Ignorar remessa vazia' }, { ...rows[0], Remessa: 'IGNORAR', 'Tipo de item problemático nível 2': 'Outro' }];
function workbook(data = inputRows, name = 'export BI', extension = 'xlsx') {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet([{ Ajuda: 'não usar' }]), 'Instruções');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data), name);
  return { name: `fixture.${extension}`, mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer: XLSX.write(wb, { type: 'buffer', bookType: extension === 'xls' ? 'biff8' : 'xlsx' }) };
}
async function prepare(page, target = '/index.html') {
  await page.route('http://127.0.0.1:8899/**', route => route.abort());
  await page.addInitScript(() => {
    window.__copies = [];
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async text => { window.__copies.push(text); } } });
  });
  await page.goto(target);
}
async function load(page, file = workbook()) {
  await page.locator('#file-input').setInputFiles(file);
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByRole('button', { name: 'Confirmar e carregar' }).click();
  await expect(page.locator('#st-total')).toHaveText('8');
}
async function settings(page) { await page.locator('#menu-ajustes > summary').click(); }
async function all(page) {
  if (await page.locator('html').getAttribute('data-layout') === 'novo') await page.locator('[data-status=""]').click();
  else await page.locator('#filter-ticket-status').selectOption('');
}
async function filter(page, id, value) {
  await page.locator('#menu-filtros').evaluate(menu => { menu.open = true; });
  await page.locator('#' + id).selectOption(value);
  await page.locator('#menu-filtros').evaluate(menu => { menu.open = false; });
}
async function action(page, id) {
  await page.locator('#menu-acoes > summary').click();
  await page.locator('#' + id).click();
}
async function copy(page, selector) {
  const count = await page.evaluate(() => window.__copies.length);
  await page.locator(selector).click();
  await expect.poll(() => page.evaluate(() => window.__copies.length)).toBe(count + 1);
  return page.evaluate(() => window.__copies.at(-1));
}

for (const target of ['index.html', 'standalone.html']) {
  for (const layout of ['novo', 'original']) for (const theme of ['light', 'dark']) {
    test(`${target}: ${layout}/${theme} — importação, preferências, filtros, ações e persistência`, async ({ page }) => {
      const errors = []; page.on('pageerror', e => errors.push(e.message));
      await prepare(page, '/' + target);
      await page.locator(`[data-layout-choice="${layout}"]`).click();
      if (theme === 'dark') await page.locator('#theme-toggle').click();
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
      await load(page);
      await expect(page.locator('.card')).toHaveCount(4);
      await expect(page.locator('#info-bar')).toContainText('Ignorados: 2');
      await expect(page.locator('#card-0')).toContainText('R$ 1.249,90');
      await expect(page.locator('#card-1')).toContainText('Sem número');
      await expect(page.locator('#card-2')).toContainText('Não informado');
      await page.locator('#assistente-input').fill('Marina');
      // Todas as oito combinações das três preferências em cada tema/layout.
      for (let mask = 0; mask < 8; mask++) {
        await settings(page);
        for (const [bit, id] of ['pref-produto', 'pref-valor', 'pref-tel-entregador'].entries()) {
          await page.locator('#' + id).setChecked(Boolean(mask & (1 << bit)));
        }
        await page.locator('#menu-ajustes > summary').click();
        const wpp = await copy(page, '#card-0 [data-acao="copiar-wpp"]');
        expect(wpp).toContain('Marina'); expect(wpp).toContain('JT001');
        expect(wpp.includes('Produto 1')).toBe(Boolean(mask & 1));
        const fei = await copy(page, '#card-0 [data-acao="copiar-feishu"]');
        expect(fei.includes('VALOR:')).toBe(Boolean(mask & 2));
        expect(fei.includes('TEL ENTREGADOR:')).toBe(Boolean(mask & 4));
      }
      for (const idx of [1, 2, 3]) {
        const message = await copy(page, `#card-${idx} [data-acao="copiar-wpp"]`);
        expect(message).toContain(`JT00${idx + 1}`);
        expect(message).toContain(idx === 1 ? 'no *TikTok*' : idx === 2 ? 'na *WePink*' : 'da *Shein*');
      }
      await page.locator('#lider-input-0').fill('Líder Ana');
      await expect(page.locator('#lider-input-1')).toHaveValue('Líder Ana');
      await page.locator('#card-0 [data-acao="alternar-obs"]').click();
      await page.locator('#obs-input-0').fill('Contato realizado <ok> & confirmado');
      await page.locator('#card-0 [data-acao="presencial"]').check();
      const template = await copy(page, '#card-0 [data-acao="copiar-feishu"]');
      expect(template).toContain('Apenas presencial'); expect(template).toContain('@Líder Ana'); expect(template).toContain('Contato realizado <ok> & confirmado');
      await expect(page.locator('#st-pres')).toHaveText('2');
      await page.locator('#filter-search').fill('rafael'); await expect(page.locator('.card')).toHaveCount(2);
      await page.locator('#filter-search').fill('JT001'); await expect(page.locator('.card')).toHaveCount(1);
      await page.locator('#filter-search').fill('não encontrado'); await expect(page.locator('.empty')).toBeVisible();
      await action(page, 'btn-copiar-remessas'); await expect(page.locator('#toast')).toHaveText('Nenhum ticket para copiar.');
      await page.locator('#filter-search').fill(''); await all(page); await expect(page.locator('.card')).toHaveCount(8);
      await filter(page, 'filter-base', 'F OSASCO'); await expect(page.locator('.card')).toHaveCount(4);
      await filter(page, 'filter-assistente', 'Brian'); await expect(page.locator('.card')).toHaveCount(2);
      await filter(page, 'filter-assistente', ''); await filter(page, 'filter-base', '');
      await filter(page, 'filter-problema', 'Item incorreto'); await expect(page.locator('.card')).toHaveCount(4);
      await filter(page, 'filter-problema', '');
      for (const [order, first] of [['valor-desc', 'card-0'], ['valor-asc', 'card-1'], ['prazo-asc', 'card-0'], ['prazo-desc', 'card-6']]) {
        await filter(page, 'sort-order', order); await expect(page.locator('.card').first()).toHaveAttribute('id', first);
      }
      await filter(page, 'sort-order', ''); await filter(page, 'filter-status', 'pendente');
      await page.locator('#card-0 [data-acao="alternar-concluido"]').click();
      await expect(page.locator('#card-0')).toHaveCount(0); await expect(page.locator('#st-done')).toHaveText('1');
      await filter(page, 'filter-status', 'concluido'); await expect(page.locator('.card')).toHaveCount(1);
      await filter(page, 'filter-status', '');
      await action(page, 'btn-bulk-obs-toggle'); await page.locator('#btn-selecionar-visiveis').click();
      await expect(page.locator('#bulk-selected-count')).toHaveText('8 selecionados');
      await page.locator('#btn-limpar-selecao').click(); await expect(page.locator('#bulk-selected-count')).toHaveText('0 selecionados');
      await page.locator('#bulk-obs-input').fill('Observação em massa'); await page.locator('#btn-aplicar-obs').click();
      await expect(page.locator('#toast')).toHaveText('Nenhum ticket selecionado.');
      await page.locator('#btn-selecionar-visiveis').click(); await page.locator('#btn-aplicar-obs').click();
      await expect(page.locator('#obs-input-0')).toHaveValue('Observação em massa'); await expect(page.locator('#bulk-obs-wrap')).toBeHidden();
      await action(page, 'btn-copiar-remessas');
      expect(await page.evaluate(() => window.__copies.at(-1))).toBe(rows.map(r => r.Remessa).join('\n'));
      const downloadPromise = page.waitForEvent('download'); await action(page, 'btn-baixar-planilha');
      const download = await downloadPromise; const exported = XLSX.readFile(await download.path());
      const exportedRows = XLSX.utils.sheet_to_json(exported.Sheets[exported.SheetNames[0]]);
      expect(exportedRows).toHaveLength(8); expect(exportedRows[0].Remessa).toBe('JT001');
      await page.reload();
      await expect(page.locator('html')).toHaveAttribute('data-layout', layout); await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
      await expect(page.locator('#assistente-input')).toHaveValue('Marina');
      await load(page); await expect(page.locator('#card-0')).toHaveClass(/concluido/); await expect(page.locator('#card-0')).toHaveClass(/presencial/);
      await expect(page.locator('#obs-input-0')).toHaveValue('Observação em massa'); await expect(page.locator('#lider-input-0')).toHaveValue('Líder Ana');
      // Trocar arquivo zera seleção e filtros sem perder marcações salvas.
      await action(page, 'btn-bulk-obs-toggle'); await page.locator('#btn-selecionar-visiveis').click();
      const chooser = page.waitForEvent('filechooser'); await page.locator('[data-acao="trocar-planilha"]').click();
      await chooser; await expect(page.locator('#upload-area')).toBeVisible(); await expect(page.locator('#bulk-obs-wrap')).toBeHidden();
      await load(page, workbook(inputRows, 'Base Responsável', 'xls')); await expect(page.locator('#card-0')).toHaveClass(/presencial/);
      await expect(page.locator('#bulk-selected-count')).toHaveText('0 selecionados');
      expect(errors).toEqual([]);
    });
  }
}

test('importação vazia, inválida, mapeamento obrigatório e cancelamento', async ({ page }) => {
  await prepare(page); const dialogs = []; page.on('dialog', async d => { dialogs.push(d.message()); await d.accept(); });
  await page.locator('#file-input').setInputFiles(workbook([]));
  await expect.poll(() => dialogs.length).toBe(1); expect(dialogs[0]).toContain('Planilha vazia');
  await page.locator('#file-input').setInputFiles({ name: 'invalid.xlsx', mimeType: 'application/octet-stream', buffer: Buffer.from([80, 75, 3, 4, 0, 0, 0]) });
  await expect.poll(() => dialogs.length).toBe(2); expect(dialogs[1]).toContain('Erro ao ler');
  await page.locator('#file-input').setInputFiles(workbook([{ A: 'JT001', B: 'Incorrect item', C: 'BASE' }]));
  await page.getByRole('button', { name: 'Confirmar e carregar' }).click();
  await expect.poll(() => dialogs.length).toBe(3); expect(dialogs[2]).toContain('Campos obrigatórios');
  await page.keyboard.press('Escape'); await expect(page.getByRole('dialog')).toHaveCount(0);
  await load(page);
  await page.locator('#file-input').setInputFiles(workbook([{ ...rows[0], 'Tipo de item problemático nível 2': 'Não acareação' }]));
  await page.getByRole('button', { name: 'Confirmar e carregar' }).click();
  await expect.poll(() => dialogs.length).toBe(4); await expect(page.locator('.card')).toHaveCount(4);
});

test('clipboard real, fallback e rejeição sem falso sucesso', async ({ page, context }) => {
  await page.route('http://127.0.0.1:8899/**', r => r.abort());
  await context.grantPermissions(['clipboard-read', 'clipboard-write']); await page.goto('/index.html'); await load(page);
  await page.locator('#card-0 [data-acao="copiar-wpp"]').click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toContain('JT001');
  await page.evaluate(() => {
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: () => Promise.reject(new Error('denied')) } });
    window.__fallback = ''; document.execCommand = () => { window.__fallback = document.activeElement.value; return true; };
  });
  await page.locator('#card-1 [data-acao="copiar-feishu"]').click();
  await expect.poll(() => page.evaluate(() => window.__fallback)).toContain('JT002');
  await page.evaluate(() => { document.execCommand = () => false; });
  await page.locator('#card-0 [data-acao="copiar-feishu"]').click();
  await expect(page.locator('#toast')).toContainText('Não foi possível copiar');
});

test('dados com HTML, aspas e cabeçalhos Unicode são exibidos como texto', async ({ page }) => {
  await prepare(page);
  const dangerous = '<img src=x onerror="window.hacked=true"> & "ç"';
  await page.locator('#file-input').setInputFiles(workbook(rows.map(r => ({ ...r, Produto: dangerous, RNE: dangerous, Entregador: dangerous })), 'Dados <BI>'));
  await page.getByRole('button', { name: 'Confirmar e carregar' }).click();
  await expect(page.locator('#card-0')).toContainText(dangerous);
  expect(await page.evaluate(() => window.hacked)).toBeUndefined(); await expect(page.locator('#cards-container img')).toHaveCount(0);
  const collision = await page.evaluate(() => {
    const s = App.Store; s.setMapeamento('mesmo-prefixo-mais-de-quarenta-caracteres|A', { remessa: 'A' });
    s.setMapeamento('mesmo-prefixo-mais-de-quarenta-caracteres|B', { remessa: 'B' });
    s.setMapeamento('中文|Remessa', { remessa: 'Unicode' });
    return [s.getMapeamento('mesmo-prefixo-mais-de-quarenta-caracteres|A').remessa, s.getMapeamento('中文|Remessa').remessa];
  });
  expect(collision).toEqual(['A', 'Unicode']);
});

for (const layout of ['novo', 'original']) for (const theme of ['light', 'dark']) for (const width of [375, 768, 1440]) {
  test(`responsivo ${layout}/${theme}/${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 }); await prepare(page);
    await page.locator(`[data-layout-choice="${layout}"]`).click(); if (theme === 'dark') await page.locator('#theme-toggle').click();
    await load(page);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await settings(page);
    const box = await page.locator('#menu-ajustes .menu-painel').boundingBox();
    expect(box.x).toBeGreaterThanOrEqual(0); expect(box.x + box.width).toBeLessThanOrEqual(width);
    await page.keyboard.press('Escape'); await expect(page.locator('#menu-ajustes')).not.toHaveAttribute('open', '');
    await page.screenshot({ path: `artifacts/${layout}-${theme}-${width}.png`, fullPage: true });
  });
}

test('standalone realmente independente e offline, com movimento reduzido', async ({ page }) => {
  const requests = []; page.on('request', r => { if (/^https?:/.test(r.url())) requests.push(r.url()); });
  await page.route('**/*', r => /^https?:/.test(r.request().url()) ? r.abort() : r.continue());
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(pathToFileURL(path.resolve('standalone.html')).href);
  await load(page);
  await page.locator('#card-0 [data-acao="alternar-concluido"]').click(); await expect(page.locator('#st-done')).toHaveText('1');
  expect(requests.filter(url => !url.startsWith('http://127.0.0.1:8899/'))).toEqual([]);
  await expect(page.locator('#bg-flow')).toBeVisible();
});

test('storage bloqueado e dados salvos corrompidos não impedem o painel', async ({ page }) => {
  await page.addInitScript(() => { Storage.prototype.getItem = () => { throw new Error('blocked'); }; Storage.prototype.setItem = () => { throw new Error('blocked'); }; });
  await prepare(page); await load(page); await page.locator('#theme-toggle').click();
  await page.locator('#card-0 [data-acao="alternar-concluido"]').click(); await expect(page.locator('#st-done')).toHaveText('1');
});

test('biblioteca Excel: exportação filtrada pode ser reimportada', async ({ page }) => {
  await prepare(page); await load(page); await all(page); await filter(page, 'filter-base', 'F OSASCO');
  const waiting = page.waitForEvent('download'); await action(page, 'btn-baixar-planilha'); const download = await waiting;
  const wb = XLSX.readFile(await download.path()); expect(XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]])).toHaveLength(4);
  await page.locator('#file-input').setInputFiles({ name: 'reimport.xlsx', mimeType: 'application/octet-stream', buffer: fs.readFileSync(await download.path()) });
  await page.getByRole('button', { name: 'Confirmar e carregar' }).click();
  await expect(page.locator('#st-total')).toHaveText('4'); await all(page); await expect(page.locator('.card')).toHaveCount(4);
});

for (const layout of ['novo', 'original']) for (const theme of ['light', 'dark']) {
  test(`atribuidor ${layout}/${theme}: plano, token expirado, cancelamento e execução simulada`, async ({ page }) => {
    await prepare(page, '/standalone.html?atribuir=1');
    await page.locator(`[data-layout-choice="${layout}"]`).click(); if (theme === 'dark') await page.locator('#theme-toggle').click();
    let planCalls = 0, executions = 0, token = '';
    await page.route('http://127.0.0.1:8899/**', async route => {
      const request = route.request(); const headers = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'content-type', 'Access-Control-Allow-Methods': 'POST,GET,OPTIONS' };
      if (request.method() === 'OPTIONS') { await route.fulfill({ status: 204, headers }); return; }
      const pathname = new URL(request.url()).pathname;
      let status = 200, json = {};
      if (pathname === '/plano') {
        planCalls++; expect(request.postDataJSON().arquivo_b64.length).toBeGreaterThan(100);
        if (!token) { status = 401; json = { erro: 'token', mensagem: 'Sessão de teste expirada' }; }
        else json = { plano_id: 'teste-isolado', itens: [{ ok: true, remessa: 'JT001', tipo: 'Comum', destino: 'Equipe de teste' }, { ok: false, remessa: 'JT002', tipo: 'TikTok', motivo: 'Já atribuído' }] };
      } else if (pathname === '/token') { token = request.postDataJSON().token; }
      else if (pathname === '/executar') { executions++; expect(request.postDataJSON().plano_id).toBe('teste-isolado'); json = { log: ['Teste simulado concluído'] }; }
      await route.fulfill({ status, headers, contentType: 'application/json', body: JSON.stringify(json) });
    });
    await load(page); await action(page, 'btn-atribuir');
    await expect(page.locator('#atr-token')).toBeVisible(); await page.locator('#atr-token').fill('token-ficticio-para-teste');
    await page.locator('#atr-salvar-token').click(); await expect(page.locator('#atr-confirmar')).toBeVisible();
    expect(executions).toBe(0); await page.locator('#atr-cancelar').click();
    await action(page, 'btn-atribuir'); await page.locator('#atr-confirmar').click();
    await expect(page.locator('.atr-saida')).toHaveText('Teste simulado concluído'); expect(executions).toBe(1); expect(planCalls).toBe(3);
    await page.locator('#atr-ok').click(); await expect(page.locator('#modal-atribuir')).toBeEmpty();
  });
}

test('atribuidor indisponível e falha de exportação têm feedback de erro', async ({ page }) => {
  await prepare(page, '/index.html?atribuir=1'); await load(page);
  await action(page, 'btn-atribuir'); await expect(page.locator('#modal-atribuir')).toContainText('O servidor local não respondeu');
  await page.locator('#atr-ok').click();
  await page.evaluate(() => { XLSX.writeFile = () => { throw new Error('download bloqueado'); }; });
  await action(page, 'btn-baixar-planilha'); await expect(page.locator('#toast')).toContainText('Não foi possível baixar');
});

test('trocar tema e layout preserva texto digitado e observações abertas', async ({ page }) => {
  await prepare(page); await load(page);
  await page.locator('#card-0 [data-acao="alternar-obs"]').click(); await page.locator('#obs-input-0').fill('Texto em edição');
  await page.locator('#lider-input-0').fill('Líder em edição');
  for (const layout of ['original', 'novo']) {
    await page.locator(`[data-layout-choice="${layout}"]`).click(); await page.locator('#theme-toggle').click();
    await expect(page.locator('#obs-input-0')).toBeVisible(); await expect(page.locator('#obs-input-0')).toHaveValue('Texto em edição');
    await expect(page.locator('#lider-input-0')).toHaveValue('Líder em edição');
  }
});

test('volume: mil tickets mantêm contagem e busca funcionais', async ({ page }) => {
  await prepare(page);
  await page.locator('#file-input').setInputFiles(workbook(Array.from({ length: 1000 }, (_, i) => ({ ...rows[0], Remessa: `VOLUME${String(i).padStart(4, '0')}` }))));
  await page.getByRole('button', { name: 'Confirmar e carregar' }).click();
  await expect(page.locator('.card')).toHaveCount(1000); await expect(page.locator('#st-total')).toHaveText('1000');
  await page.locator('#filter-search').fill('VOLUME0999'); await expect(page.locator('.card')).toHaveCount(1);
});

test('planilha com apenas campos obrigatórios e sem status exibe os tickets', async ({ page }) => {
  await prepare(page);
  await page.locator('#file-input').setInputFiles(workbook([{ Remessa: 'SEM-OPCIONAIS', Problema: 'Incorrect item', Base: 'BASE' }]));
  await page.getByRole('button', { name: 'Confirmar e carregar' }).click();
  await expect(page.locator('.card')).toHaveCount(1); await expect(page.locator('#filter-ticket-status')).toHaveValue('');
  await expect(page.locator('#card-0')).toContainText('Sem número'); await expect(page.locator('#card-0')).toContainText('Não informado');
  const feishu = await copy(page, '#card-0 [data-acao="copiar-feishu"]'); expect(feishu).toContain('Apenas presencial');
});
