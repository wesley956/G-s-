# Relatórios offline — issue #25

`/reports` consulta o SQLite local pelo domínio Rust. Vendas, formas, produtos, despesas, movimentos, fechamentos, cadernetas e estoque compartilham uma transação de leitura. Não cria lançamentos nem registros de operação. Não exige conexão ou nova migração; mantém o schema 7.

## Período e interpretação

As duas datas são inclusivas no horário local do computador. O período inicial vai do primeiro dia do mês ao dia atual local, sem usar o dia UTC do navegador.

- Vendas brutas, descontos e pagamentos originais usam a finalização da venda. Vendas canceladas posteriormente continuam aparecendo na data original; o cancelamento usa a data do cancelamento. Líquido = bruto − descontos − cancelamentos no período.
- Recebimentos e suas devoluções usam a data do movimento de caixa e os vínculos de `account_payment_refunds`. Aparecem separados das vendas, inclusive em pagamentos parciais de fiado.
- Produtos mantêm ID e nome registrados na venda. Quantidades canceladas usam a data do cancelamento. Os valores por produto são brutos antes do desconto da venda, sem rateio inventado.
- Despesas usam o movimento original e, para devoluções, o movimento vinculado em `expense_refunds`. Categoria e nome histórico do fornecedor são preservados. Uma devolução de despesa usa `SUPPLY`, mas não entra nos suprimentos comuns nem no faturamento.
- Movimentos usam sua data de criação. Dinheiro físico segue as mesmas regras do caixa; PIX, cartões e fiado não compõem dinheiro disponível. Fundos de abertura são separados do movimento líquido, que não representa saldo disponível.
- Fechamentos usam a data do fechamento e os valores esperados/contados gravados na sessão. Diferença = contado − esperado. Cancelamentos posteriores não reescrevem o fechamento.
- Cadernetas e estoque são **atuais na data da consulta**, incluindo cadastros inativos. Não representam reconstrução histórica na data final do período.

Resultados negativos são possíveis em períodos com devoluções de operações anteriores. Estornos legados sem vínculo são identificados para conferência: seu efeito em dinheiro permanece visível, sem presumir que eram vendas ou recebimentos.

## CSV

A exportação consulta uma nova fotografia consistente do período, gera o CSV no backend e abre o seletor nativo. A tela recebe a mesma fotografia usada no arquivo. Cancelar não grava arquivo; falhas aparecem na tela. O nome sugerido inclui o instante de geração para facilitar exportações repetidas. Um arquivo existente nunca é truncado: escolha um novo nome.

UTF-8 com BOM, separador `;`, nove colunas fixas, campos entre aspas e linhas CRLF. Aspas, separadores e quebras de linha em textos são escapados. Valores monetários usam vírgula decimal e duas casas, sem arredondamento por ponto flutuante. Quantidades usam duas casas. Datas do período, dos eventos e dos valores atuais usam dia/mês/ano, no horário local; a geração também inclui o instante UTC identificado nos metadados.

Textos iniciados por `=`, `+`, `-`, `@`, inclusive após espaços/controles, e controles tabulação/quebra de linha iniciais recebem apóstrofo para evitar interpretação como fórmula. Colunas monetárias/quantidades geradas pelo backend preservam números negativos.

## Verificação

Testes do domínio cobrem pagamentos mistos, desconto, recebimento parcial e devolução, quatro formas de despesas, centavos, cancelamento em outra data, caixas fechados, nomes históricos, cadastros inativos, períodos vazios/inválidos, limites inclusivos, backup/reabertura, CSV e falha de criação sem sobrescrita.

`node tests/browser-reports.mjs` usa o mesmo domínio Rust do aplicativo e SQLite em arquivo. Verifica limites em America/Sao_Paulo, as seis seções, exportação com cancelamento/falha/sucesso, CSV parseável com textos adversos, consultas sem alterações financeiras e recuperação dos dados. A impressão e os seletores são emulados nos roteiros de navegador. A CI conserva os outros seis roteiros e os testes de instalador Windows.

Os PRs foram integrados à main em 06/10/2026. A operação do seletor e a abertura do CSV no aplicativo de planilha instalado ainda precisam de homologação no equipamento do depósito.
