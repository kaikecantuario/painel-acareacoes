const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
// Escapa não ASCII (válido em strings/regex) para o editor não acusar falsos erros em linhas enormes.
const ascii = (code) => code.replace(/[^\x00-\x7f]/g, (c) => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0'));
let html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
html = html.replace(/<link rel="stylesheet" href="(assets\/[^"]+)"\s*>/g, (_, asset) =>
  `<style data-source="${asset}">\n${fs.readFileSync(path.join(root, asset), 'utf8').replace(/speak:none;?/g, '')}\n</style>`);
html = html.replace(/<script src="(assets\/[^"]+)"\s*><\/script>/g, (_, asset) =>
  `<script data-source="${asset}">\n${ascii(fs.readFileSync(path.join(root, asset), 'utf8').replace(/<\/script/gi, '<\\/script'))}\n</script>`);
const output = html;
fs.writeFileSync(path.join(root, 'standalone.html'), output);
// Atualiza também a exportação aberta no editor, preservando o arquivo original.
const original = path.join(root, 'Painel de Acareacoes - Standalone.html');
if (fs.existsSync(original)) {
  if (fs.readFileSync(original, 'utf8').includes('type="__bundler/manifest"')) {
    fs.mkdirSync(path.join(root, 'artifacts'), { recursive: true });
    const backup = path.join(root, 'artifacts', 'claude-design-reference.html');
    if (!fs.existsSync(backup)) fs.copyFileSync(original, backup);
  }
  fs.writeFileSync(original, output);
}
console.log('standalone.html gerado com estilos, fontes, ícones, XLSX e funções incorporados.');
