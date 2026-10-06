# Roadmap

Os itens marcados têm implementação integrada à `main` em 06/10/2026. Homologação no equipamento do depósito permanece uma etapa separada, acompanhada na [issue #32](https://github.com/wesley956/G-s-/issues/32) e no [roteiro de homologação](HOMOLOGACAO.md).

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
- [x] Dashboard final — indicadores reais, formas separadas, fiado e clientes com dívida; atualização e repetição ([#28](https://github.com/wesley956/G-s-/issues/28), `docs/DASHBOARD.md`)

## Fase 5 — Segurança operacional
- [x] Backup manual
- [x] Backup automático
- [x] Restauração
- [x] Auditoria — consulta offline das operações confirmadas, filtros, paginação e detalhes preservados; cobertura parcial explicitada ([#30](https://github.com/wesley956/G-s-/issues/30), `docs/AUDITORIA.md`)
- [x] Instalador Windows
- [x] Testes de recuperação e upgrade

## Integração e homologação

- [x] Integrar os 16 PRs empilhados na ordem das dependências, preservando histórico e conferindo a árvore de cada entrega
- [ ] Homologar instalação/upgrade e recuperação no equipamento do depósito
- [ ] Homologar impressora física e seletores de PDF, backup e CSV
