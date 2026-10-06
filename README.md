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
- Estorno de recebimentos na caderneta, com motivo, devolução pela forma original e reabertura dos débitos (issue #20)
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

## Tecnologias
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
V1 em desenvolvimento, com PRs empilhados ainda não integrados à `main`.

As issues #1–#7 têm implementação e correções de revisão no PR #17. Os PRs #18 e #19 implementam a #8: backup manual/automático, retenção, exportação, restauração preventiva e instaladores offline. Consulte [a revisão](docs/REVISAO-V1.md) e [o estado do backup](docs/BACKUP.md).

Ainda pendentes: integração dos PRs e homologação de instalação/upgrade, recuperação, impressão e seletores no equipamento do depósito. O cadastro de fornecedores foi implementado na issue #22, com busca, edição, ativação e inclusão no backup. Relatórios e despesas completas continuam previstos; despesas avulsas já podem ser registradas pelo caixa.

## Desenvolvimento e verificação

Requisitos: Node.js 24, Rust estável e dependências do Tauri 2 para Windows (ferramentas MSVC e WebView2).

```sh
npm ci
npm test
npm run build
cargo test --manifest-path src-tauri/domain/Cargo.toml
npm run tauri -- dev
```

O navegador comum não possui acesso aos serviços nativos. Para os roteiros de interface, compile o executável de teste e instale Playwright temporariamente:

```sh
cargo build --manifest-path src-tauri/domain/Cargo.toml --bin domain-runner
npm install --no-save --package-lock=false playwright
npx playwright install chromium
node tests/browser-receipts.mjs
node tests/browser-audit.mjs
node tests/browser-backup.mjs
node tests/browser-refunds.mjs
node tests/browser-suppliers.mjs
```

Execute os roteiros um por vez. Eles usam SQLite em arquivo e o domínio Rust real, com impressão/seletor emulados. No Windows, informe `GAS_DOMAIN_RUNNER` com o caminho de `domain-runner.exe`. A CI executa testes nativos também no Windows, além de gerar NSIS/MSI e testar a instalação NSIS, a abertura do aplicativo instalado e o backup automático.
