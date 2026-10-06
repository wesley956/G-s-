# Regras do Caixa — V1

## Objetivo
Controlar todo o movimento financeiro diário do depósito de forma simples e auditável.

## Abertura
- Apenas um caixa pode ficar aberto por vez.
- Abertura registra valor inicial de troco.
- Venda deverá exigir caixa aberto quando a Issue #5 for integrada.

## Movimentações
- `SALE`: gerada automaticamente por venda.
- `SUPPLY`: entrada manual de dinheiro para troco.
- `WITHDRAWAL`: sangria.
- `EXPENSE`: despesa paga pelo caixa.
- `REVERSAL`: estorno de venda/cancelamento.

## Fechamento
O valor esperado em dinheiro é:

```
abertura
+ vendas em dinheiro
+ suprimentos
- sangrias
- despesas
- estornos em dinheiro
```

PIX, débito, crédito e fiado entram no resumo de vendas, mas não compõem o dinheiro físico esperado.

O operador informa o valor contado e o sistema salva a diferença:

```
diferença = valor contado - valor esperado
```

## Auditoria
- Caixa fechado não é reaberto na V1.
- Sessões fechadas permanecem no histórico.
- Movimentações não devem ser apagadas.
