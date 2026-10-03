# Validação da integração

Executada em 03/10/2026, no Windows, com Microsoft Edge sem janela, Playwright e planilhas sintéticas. Nenhum ticket real foi atribuído no JMS.

- `npm test`: 39 cenários passaram na execução completa.
- `npm test -- --grep "responsivo|offline|build incorpora"`: 14 cenários passaram após os ajustes finais de contraste, espaçamento e sincronização do arquivo do editor. Um deles é uma verificação adicional do build; os outros repetem cenários da suíte completa.
- Total: 40 cenários distintos verificados. O teste de combinações cobre 2.430 combinações de base, problema, situação, status do ticket, assistente e ordenação.
- `git diff --check`: sem erros de espaços em branco.

## Cobertura

Nos arquivos `index.html` e `standalone.html`, os layouts Novo e Original foram exercitados com temas claro e escuro. Para cada combinação, foram verificados importação XLSX/XLS, oito combinações das preferências de mensagem, textos WhatsApp/Feishu, líder por base, observações, atendimento presencial, conclusão, filtros, quatro ordenações, seleção, observações em massa, cópia de remessas, exportação e restauração do estado salvo.

Também foram verificados:

- Área de transferência real e fallback, incluindo permissão negada sem mensagem falsa de sucesso.
- Exportação dos tickets filtrados e reimportação do XLSX produzido.
- Planilhas vazias, arquivos inválidos, colunas obrigatórias ausentes, campos opcionais ausentes e cancelamento do mapeamento.
- Tickets sem status, sem telefone ou produto, remessas vazias e linhas fora do domínio.
- Datas Excel e brasileiras, normalização dos prazos, valores em reais, zeros e dados inválidos.
- Persistência após troca de tema, layout, planilha e recarga; armazenamento bloqueado e JSON corrompido.
- Cabeçalhos Unicode, colisões de mapeamento e compatibilidade com mapeamentos anteriores.
- Dados contendo HTML e aspas exibidos como texto.
- Telas de 375, 768 e 1440 pixels nos quatro pares de layout/tema, sem rolagem horizontal ou menus fora da tela.
- Standalone aberto diretamente como arquivo, sem recursos externos, com preferência de movimento reduzido.
- Importação e busca em uma planilha de mil tickets.
- Atribuidor: plano, sessão expirada, token fictício, cancelamento, execução simulada e servidor indisponível, nos quatro pares de layout/tema.

## Limites

Esta cobertura valida os cenários acima no Edge; não constitui uma garantia para todo arquivo ou navegador existente. A comunicação real com JMS depende do servidor e das credenciais do usuário e foi simulada. O Excel deve ser carregado novamente ao reabrir o painel; as marcações ficam no armazenamento local do navegador.
