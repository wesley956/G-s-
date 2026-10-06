# Revisão das issues #1–#7

A revisão compara os requisitos das issues com o código acumulado dos PRs #9–#15. Correções estão no PR #17, empilhado no #15. Esses PRs ainda não foram integrados à `main`.

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
- Roteiros de navegador usam o mesmo domínio Rust via executável de teste. Somente o diálogo de impressora e o seletor de PDF são emulados.
- A CI verifica compilação Windows e publica o executável de teste para reprodução local.

## Regras e limites

- Cancelamento de venda de caixa já fechado registra a devolução no caixa atualmente aberto, preservando o fechamento histórico.
- Venda fiado que já recebeu pagamento é bloqueada para cancelamento simples. A devolução desses recebimentos precisa de um fluxo próprio; apagar a dívida criaria saldo incorreto.
- A devolução manual de estoque registra somente o retorno físico. Para devolver pagamento e anular venda, use o cancelamento da venda, evitando registrar o retorno duas vezes.
- Automático significa abrir o diálogo do Windows; não significa impressão silenciosa. Impressora física e diálogo de PDF continuam pendentes de homologação no Windows.
- Despesas avulsas são lançadas pelo caixa. Fornecedores, relatórios e o módulo completo de despesas ainda são telas reservadas e não fazem parte das issues #1–#7. O restante do escopo V1 não deve ser apresentado como concluído.

## Resultado da rodada

- 13 testes locais de valores, caixa e comprovantes aprovados.
- 13 testes nativos de integridade aprovados.
- Compilação Rust Windows aprovada na CI de 05/10/2026.
- Roteiros de comprovantes e revisão funcional aprovados localmente com o executável Rust da CI; sem erros de console.
- O roteiro encontrou uma corrida no carregamento da edição de produto que podia sobrescrever a digitação. O formulário agora espera a carga e descarta respostas de efeitos desmontados.
- A repetição de recebimento após perder a resposta do backend foi verificada: o pagamento já confirmado não é duplicado.
- CI final da revisão aprovada: [execução 37380250344](https://github.com/wesley956/G-s-/actions/runs/37380250344), commit `4fe7156`. Backup manual aprovado com 17 testes nativos e os três roteiros: [execução 37380257149](https://github.com/wesley956/G-s-/actions/runs/37380257149), commit `277e742`.
