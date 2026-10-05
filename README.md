# G-s-

Sistema desktop **100% offline** para gestão de depósito/distribuidora, inicialmente pensado para operação de água, gás e produtos relacionados.

## Objetivo
Substituir controles em papel/caderno por um programa Windows simples, rápido e confiável, sem depender de internet.

## Escopo da V1
- Dashboard operacional
- Abertura, movimentação e fechamento de caixa
- Nova venda com preços de **Portaria** e **Entrega**
- Desconto em valor ou percentual
- Pagamentos em dinheiro, PIX, débito, crédito, fiado e pagamento misto
- Troco automático
- Cadastro de produtos e categorias
- Controle de estoque com entradas, saídas, ajustes e estoque mínimo
- Cadastro de clientes e comércios
- Caderneta/contas a receber com pagamentos parciais e vencimento
- Lançamento manual de notas/valores a receber
- Cadastro de fornecedores
- Despesas e sangrias
- Histórico de vendas
- Cancelamento com estorno de estoque/caixa
- Relatórios básicos
- Impressão de comprovante de cada venda em 58 mm, 80 mm, A4 ou PDF
- Impressão de 1 ou 2 vias e reimpressão pelo histórico
- Backup local e restauração de backup

## Princípios
1. Offline-first: nenhuma função essencial depende de internet.
2. Segurança dos dados: SQLite local + backup automático.
3. Simplicidade: fluxo rápido para operação diária.
4. Auditabilidade: vendas e movimentações importantes não são apagadas; são canceladas/estornadas com histórico.
5. Evolução: arquitetura organizada para futura expansão sem reescrever o sistema do zero.

## Tecnologias sugeridas
- Desktop: Tauri
- Frontend: React + TypeScript
- Banco local: SQLite
- Empacotamento: instalador Windows
- Impressão: suporte a térmica 58/80 mm e A4/PDF

## Módulos
- Início
- Nova Venda
- Vendas
- Produtos
- Estoque
- Clientes
- Cadernetas
- Caixa
- Despesas
- Fornecedores
- Relatórios
- Configurações

## Status
Projeto em definição e preparação da V1.
