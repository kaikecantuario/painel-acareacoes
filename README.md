# Painel de Acareações

O `index.html` usa o visual do Claude Design conectado às funções reais de importação Excel, mensagens WhatsApp/Feishu, filtros, exportação e observações. O botão Novo/Original muda o layout; ambos têm temas claro e escuro e compartilham os mesmos dados e ações.

## Uso

Abra `index.html` com a pasta `assets/` disponível ou abra `standalone.html`, que incorpora todos os recursos em um único arquivo e funciona offline. Carregue o Excel do BI e confirme o mapeamento das colunas. Os tickets vêm exclusivamente da planilha, sem dados fictícios.

Atendente, preferências, tema, layout, líder por base, observações e marcações por remessa são salvos no armazenamento local do navegador. Ao reabrir, carregue novamente a planilha; o arquivo Excel não é armazenado. O armazenamento pode variar entre navegadores e caminhos de arquivos locais.

A exportação `Painel de Acareacoes - Standalone.html` foi usada como referência do Claude Design. A versão operacional gerada é `standalone.html`.
Se a exportação original existir localmente, o build guarda uma cópia em `artifacts/claude-design-reference.html` e atualiza o arquivo aberto no editor com o mesmo conteúdo funcional do standalone.

## Gerar o standalone e testar

Requer Node.js 20 ou superior e Microsoft Edge instalado para os testes.

```sh
npm ci
npm run build:standalone
npm test
```

Edite `index.html` e os módulos em `assets/`; depois gere novamente `standalone.html`. O build incorpora também XLSX, fontes e ícones, sem usar CDNs durante a execução.

Os testes usam planilhas sintéticas XLSX/XLS, verificam os dois arquivos, os dois layouts, os dois temas, as oito combinações de preferências, filtros, persistência, clipboard, exportação/reimportação, telas de 375/768/1440 pixels e casos de erro. As imagens são gravadas em `artifacts/` e o relatório em `playwright-report/`.
O resultado e os limites da validação estão em [VALIDACAO.md](VALIDACAO.md).

## Atribuição no JMS

A função de atribuição depende do servidor local em `127.0.0.1:8899` e do acesso JMS já configurado. O botão aparece quando o servidor responde ou com `?atribuir=1`. A suíte simula as respostas de plano, token e execução; não atribui tickets reais nem valida credenciais reais.
