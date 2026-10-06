# Roadmap

Os itens marcados têm implementação na cadeia de PRs, ainda não integrada à `main`. Integração e homologação no equipamento do depósito são etapas separadas.

## Fase 0 — Fundação
- [x] Inicializar Tauri + React + TypeScript
- [x] SQLite e migrações
- [x] Estrutura de navegação
- [x] Configuração local
- [x] Logging e tratamento de erros

## Fase 1 — Operação principal
- [x] Produtos e categorias
- [x] Estoque
- [x] Caixa
- [x] Nova venda
- [x] Pagamentos
- [x] Desconto e troco
- [x] Histórico e cancelamento

## Fase 2 — Cliente e crédito
- [x] Clientes
- [x] Caderneta/fiado
- [x] Pagamentos parciais
- [x] Lançamentos manuais
- [x] Vencimentos

## Fase 3 — Impressão
- [x] Layout 58 mm
- [x] Layout 80 mm
- [x] A4/PDF
- [x] 1 e 2 vias
- [x] Reimpressão
- [x] Preferências de impressora

## Fase 4 — Gestão
- [x] Despesas
- [x] Fornecedores
- [x] Relatórios
- [x] Estoque mínimo
- [ ] Dashboard final — faltam totais do dia por forma, vendas fiado e quantidade de clientes com saldo em aberto ([#28](https://github.com/wesley956/G-s-/issues/28))

## Fase 5 — Segurança operacional
- [x] Backup manual
- [x] Backup automático
- [x] Restauração
- [ ] Auditoria — há histórico financeiro e repetição protegida; a consulta geral de alterações ainda precisa de escopo e implementação
- [x] Instalador Windows
- [x] Testes de recuperação e upgrade

## Integração e homologação

- [ ] Integrar os PRs empilhados na ordem das dependências
- [ ] Homologar instalação/upgrade e recuperação no equipamento do depósito
- [ ] Homologar impressora física e seletores de PDF, backup e CSV
