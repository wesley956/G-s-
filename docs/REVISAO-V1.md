# Revisão das issues #1–#7

A revisão compara os requisitos das issues com o código acumulado dos PRs #9–#15. Correções estão no PR #17, originalmente empilhado no #15. A cadeia de 16 PRs foi integrada à `main` em 06/10/2026; a homologação no depósito segue na [issue #32](https://github.com/wesley956/G-s-/issues/32).

| Issue | Problema identificado | Correção |
| --- | --- | --- |
| #1 Fundação | Falhas sem tratamento, ausência de log e painel com números fixos | Tratamento nos formulários/listas, recuperação de falha de conexão, limite de log local e painel lendo SQLite |
| #2 Produtos | Preços não editáveis, categoria só predefinida e valores com ponto decimal multiplicados por 100 | Edição de cadastro/preços, nova categoria, validação de valores; estoque inicial registrado no histórico |
| #3 Estoque | Saldo lido antes da transação, devolução ausente da tela e motivo opcional | Movimentação nativa, devolução física, motivo obrigatório, proteção de saldo e histórico indivisível |
| #4 Caixa | PIX/cartão/fiado estornados do dinheiro físico; movimentações e fechamento sem checar caixa atual | Regras nativas, conferência dentro da transação, estorno conforme forma de pagamento, recebimentos por forma e proteção contra envio repetido |
| #5 Vendas | Pagamento misto ausente; preços/estoque da tela tratados como verdade; numeração concorrente | Parcelas por forma, troco da parcela em dinheiro, preços do cadastro, estoque e numeração verificados no backend |
| #6 Caderneta | Pagamentos não identificavam débitos parciais/quitados, saldo lido antes da transação | Alocação por débito, estados parcial/quitado, saldo e recebimento validados juntos, vencimento opcional na venda fiado |
| #7 Comprovantes | Snapshot escrito em transação distribuída por chamadas IPC | Snapshot e venda na mesma transação nativa; mantidos layouts, PDF e reimpressão |
| #16 Integridade | BEGIN/COMMIT enviados em chamadas independentes do pool | Uma conexão SQLx reservada por Transaction, BEGIN IMMEDIATE, rollback automático e chave de operação para repetição segura |

## Verificação

- Testes de valores/comprovantes e resumo de caixa usam SQLite real para leituras.
- Testes financeiros executam o código Rust real com um pool de 3–5 conexões e banco em arquivo: falhas injetadas, concorrência, repetição da mesma operação, cancelamento, pagamentos parciais, reabertura e dados originais.
- Roteiros de navegador usam o mesmo domínio Rust via executável de teste. Os diálogos de impressão e seletores de arquivos são emulados nos roteiros de navegador.
- A CI verifica compilação Windows e publica o executável de teste para reprodução local.

## Regras e limites

- Cancelamento de venda de caixa já fechado registra a devolução no caixa atualmente aberto, preservando o fechamento histórico.
- Venda fiado que já recebeu pagamento é bloqueada para cancelamento simples. A issue #20 acrescenta estorno explícito na caderneta: devolve o recebimento inteiro, reabre os débitos e preserva as alocações históricas. O cancelamento só é liberado quando não houver recebimento ativo destinado à venda. Registros anteriores à migração 5 sem vínculo ao caixa exigem revisão; não são associados por data/descrição.
- A devolução manual de estoque registra somente o retorno físico. Para devolver pagamento e anular venda, use o cancelamento da venda, evitando registrar o retorno duas vezes.
- Automático significa abrir o diálogo do Windows; não significa impressão silenciosa. Impressora física e diálogo de PDF continuam pendentes de homologação no Windows.
- Nas rodadas posteriores, fornecedores (#22 / PR #23), despesas completas (#24 / PR #26) e relatórios (#25 / PR #27) receberam implementação e foram integrados. Consulte os documentos específicos de [fornecedores](FORNECEDORES.md), [despesas](DESPESAS.md) e [relatórios](RELATORIOS.md). A homologação e os itens ainda pendentes no [roadmap](ROADMAP.md) continuam separados da implementação.

## Resultado da rodada

- 13 testes locais de valores, caixa e comprovantes aprovados.
- 13 testes nativos de integridade aprovados.
- Compilação Rust Windows aprovada na CI de 05/10/2026.
- Roteiros de comprovantes e revisão funcional aprovados localmente com o executável Rust da CI; sem erros de console.
- O roteiro encontrou uma corrida no carregamento da edição de produto que podia sobrescrever a digitação. O formulário agora espera a carga e descarta respostas de efeitos desmontados.
- A repetição de recebimento após perder a resposta do backend foi verificada: o pagamento já confirmado não é duplicado.
- CI final da revisão aprovada: [execução 37380250344](https://github.com/wesley956/G-s-/actions/runs/37380250344), commit `4fe7156`. Backup manual aprovado com 17 testes nativos e os três roteiros: [execução 37380257149](https://github.com/wesley956/G-s-/actions/runs/37380257149), commit `277e742`.
