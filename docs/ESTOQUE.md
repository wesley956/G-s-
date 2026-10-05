# Regras de estoque — V1

## Objetivo
Toda alteração de quantidade deve deixar histórico. O operador nunca deve editar o saldo do produto diretamente sem uma movimentação.

## Tipos
- `PURCHASE_ENTRY`: entrada vinculada a compra
- `SALE_EXIT`: saída automática por venda
- `MANUAL_ENTRY`: entrada manual
- `MANUAL_EXIT`: saída manual
- `ADJUSTMENT`: ajuste após contagem física
- `LOSS`: perda/quebra/dano
- `RETURN`: devolução
- `CANCELLED_SALE_RETURN`: retorno por cancelamento de venda

## Regras
1. Estoque negativo fica bloqueado na V1.
2. Ajuste trabalha com quantidade final real, calculando a diferença automaticamente.
3. Venda concluída futuramente gerará `SALE_EXIT`.
4. Cancelamento de venda que já baixou estoque gerará `CANCELLED_SALE_RETURN`.
5. Perda exige registro no histórico.
6. Toda movimentação atualiza o saldo e cria histórico na mesma transação SQLite.
7. Produto com saldo menor ou igual ao estoque mínimo é marcado como estoque baixo.
