# Regras de vendas — V1

## Fluxo
1. Caixa deve estar aberto.
2. Operador escolhe Portaria ou Entrega.
3. O preço aplicado é copiado para o item da venda.
4. Desconto pode ser em valor ou percentual.
5. Pagamento fecha exatamente o total da venda.
6. Ao concluir, venda + itens + pagamentos + estoque + caixa são gravados em uma única transação SQLite.
7. Cada item gera `SALE_EXIT` no estoque.
8. Cancelamento não apaga a venda: muda status, devolve estoque e gera `REVERSAL` no caixa.

## Pagamentos
- Dinheiro
- PIX
- Débito
- Crédito
- Fiado
- Pagamento misto: estrutura suportada pelo serviço; interface completa será refinada junto da etapa de clientes.

## Fiado
Venda fiado exige cliente e cria débito na caderneta. A seleção/cadastro de cliente será conectada na Issue #6.

## Troco
Somente dinheiro usa valor recebido e troco. O caixa considera como venda apenas o valor efetivo da compra, nunca o valor entregue pelo cliente.
