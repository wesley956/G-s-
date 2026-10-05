# Escopo funcional — V1

## 1. Dashboard
Indicadores: caixa aberto/fechado, vendas do dia, total por forma de pagamento, vendas fiado, estoque baixo, clientes com saldo em aberto e atalhos operacionais.

## 2. Caixa
- Abertura com valor inicial
- Sangria
- Suprimento
- Despesas
- Fechamento com conferência entre valor esperado e informado
- Histórico de caixas fechados

### Estados
`OPEN`, `CLOSED`

## 3. Produtos
Campos mínimos:
- nome
- categoria
- código/SKU
- descrição
- preço de custo
- preço de portaria
- preço de entrega
- estoque atual
- estoque mínimo
- ativo/inativo

## 4. Nova venda
### Tipo
`COUNTER` (Portaria) ou `DELIVERY` (Entrega).

### Pagamentos
`CASH`, `PIX`, `DEBIT_CARD`, `CREDIT_CARD`, `CREDIT_CUSTOMER`, `MIXED`.

### Fluxo
Selecionar tipo -> adicionar produtos -> aplicar desconto opcional -> selecionar cliente quando necessário -> escolher pagamento -> finalizar -> baixar estoque -> registrar caixa -> gerar comprovante.

### Desconto
Permitir desconto em R$ ou %. Salvar subtotal, desconto e total final.

## 5. Impressão / nota interna
Ao finalizar uma venda:
- Visualizar comprovante
- Imprimir 1 via
- Imprimir 2 vias
- Salvar PDF
- Não imprimir

Formatos: 58 mm, 80 mm, A4 e PDF.

Configuração:
- perguntar sempre
- imprimir automaticamente 1 via
- imprimir automaticamente 2 vias
- nunca imprimir automaticamente

Reimpressão disponível no histórico.

> O documento é comprovante interno, não NFC-e.

## 6. Estoque
Movimentos:
`PURCHASE_ENTRY`, `SALE_EXIT`, `MANUAL_ENTRY`, `MANUAL_EXIT`, `ADJUSTMENT`, `LOSS`, `RETURN`, `CANCELLED_SALE_RETURN`.

Regras:
- Venda concluída baixa estoque uma única vez
- Cancelamento devolve estoque quando aplicável
- Ajustes exigem motivo
- Alerta de estoque mínimo

## 7. Clientes
Pessoa ou comércio. Campos: nome, telefone, WhatsApp, CPF/CNPJ opcional, endereço, observações.

## 8. Caderneta / Contas a receber
Permitir:
- venda fiado
- lançamento manual de nota/débito
- vencimento
- pagamento parcial
- quitação
- histórico por cliente
- saldo atual
- anexo/foto de comprovante ou nota

Estados: `OPEN`, `PARTIAL`, `PAID`, `OVERDUE`, `CANCELLED`.

## 9. Despesas
Categorias configuráveis, valor, data, descrição e vínculo opcional com caixa aberto.

## 10. Fornecedores
Cadastro simples e histórico de entradas/compras relacionadas.

## 11. Relatórios
- Vendas por período
- Caixa
- Formas de pagamento
- Produtos mais vendidos
- Estoque atual/baixo
- Descontos
- Despesas
- Contas em aberto
- Pagamentos recebidos

## 12. Backup
- Backup manual
- Backup automático ao fechar o aplicativo ou em rotina configurável
- Retenção de múltiplos backups
- Restauração validada
- Possibilidade de salvar em pendrive/HD/pasta escolhida

## 13. Rotas internas
```
/dashboard
/sales
/sales/new
/sales/:id
/products
/products/new
/products/:id
/inventory
/inventory/entry
/inventory/adjustment
/inventory/history
/customers
/customers/new
/customers/:id
/accounts
/accounts/:customerId
/cash
/cash/open
/cash/current
/cash/close
/cash/history
/expenses
/suppliers
/reports
/settings
/settings/backup
/settings/printer
```

## 14. Fora da V1
Sem pedidos online, PWA, SaaS, servidor obrigatório, cardápio, mesas, GPS, WhatsApp automático, painel web ou funções específicas de restaurante.
