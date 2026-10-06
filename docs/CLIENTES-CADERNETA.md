# Clientes, caderneta e fiado — V1

## Clientes
Podem ser pessoa ou comércio. O cadastro é local e pode ser usado em vendas e lançamentos mensais.

## Caderneta
Saldo é calculado por movimentações:
- DEBIT: aumenta o saldo.
- PAYMENT: reduz o saldo.
- ADJUSTMENT: aumenta o saldo quando positivo.
- CANCELLED: ignorado no cálculo.

## Venda fiado
Ao selecionar Fiado na venda:
1. Cliente é obrigatório.
2. A venda é concluída normalmente.
3. Estoque é baixado.
4. Um débito é criado na caderneta.
5. O valor aparece no saldo do cliente.

## Lançamento manual
Permite registrar notas e cobranças que não nasceram de uma venda no sistema, com descrição e vencimento.

## Pagamento
- Pode ser parcial ou integral.
- Não pode ultrapassar o saldo atual.
- Exige caixa aberto.
- É registrado na caderneta e também como RECEIPT no caixa.
- Pode ser dinheiro, PIX, débito ou crédito.

## Regra importante
Nenhum pagamento ou débito é apagado. Correções futuras devem ser feitas por ajuste/estorno auditável.
