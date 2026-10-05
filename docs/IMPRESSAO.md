# Comprovantes de venda — Issue #7

## Fluxo

1. Finalizar a venda com caixa aberto.
2. O comprovante é associado à venda. Itens e preços usam os registros originais;
   os dados do depósito, do cliente e o rodapé são preservados na finalização.
3. Conforme a configuração, abrir a visualização, abrir a impressão com uma ou
   duas vias, ou continuar sem abrir o comprovante.
4. Visualizar, escolher papel/vias, imprimir, salvar PDF ou fechar.
5. Reabrir por **Vendas → Comprovante / reimprimir** ou pelo botão da última venda.

Imprimir e salvar PDF não registram uma nova venda nem movimentam estoque/caixa.
Falhas nessa etapa mostram aviso separado; a venda concluída permanece salva.
Vendas canceladas têm aviso explícito, data e motivo de cancelamento. Fiado tem
aviso de que o comprovante não representa quitação.

## Configuração local

Rota `/settings/printer`, acessível por Configurações:

- Nome do depósito, CPF/CNPJ, endereço, telefone e mensagem no rodapé.
- Papel padrão: térmica de 58 mm, térmica de 80 mm ou A4.
- `ASK`: abrir a visualização após cada venda.
- `AUTO_ONE` / `AUTO_TWO`: abrir automaticamente a janela de impressão com as vias preparadas.
- `NEVER`: não abrir automaticamente; consulta manual continua disponível.

**Impressão automática aqui significa abrir o diálogo do Windows. A confirmação
da impressora continua necessária; não há envio silencioso para o spooler.**
Usa `window.print()`, compatível com WebView2. Selecione o driver instalado e o
tamanho da bobina no Windows. O driver controla o comprimento/corte da bobina.
Para duas vias, o documento já contém a via do cliente e do estabelecimento:
deixe a quantidade de cópias do driver em **1**. Desative cabeçalhos/rodapés do driver.

## PDF

Gerado no computador com `pdf-lib`, carregado apenas quando necessário, sem CDN,
internet ou impressora virtual. O comando Rust `save_receipt_pdf` abre a janela
nativa de salvamento e grava o arquivo no local escolhido pelo operador.
Cancelar o diálogo não registra um PDF salvo. Falhas de gravação são exibidas.
O comando recebe os bytes e o número da venda, sem aceitar um caminho arbitrário.

PDFs térmicos usam largura de 58/80 mm e altura conforme o conteúdo. A4 pagina
recibos longos. Cada via é separada. Acentos portugueses são preservados; símbolos
fora do conjunto da fonte Helvetica, como emojis, são substituídos por `?` no PDF.

## Persistência e compatibilidade

Migração SQLite v3 adiciona:

- `sale_receipt_snapshots`: identificação do depósito/cliente e rodapé originais.
- `receipt_output_events`: `PRINT_DIALOG` ou `PDF_SAVED`, papel, vias e data.

`PRINT_DIALOG` registra uma solicitação, não comprova impressão física. Dados
corrompidos geram erro antes da renderização. Vendas anteriores à migração podem
ser impressas com identificação cadastral atual e aviso explícito; seus itens,
preços, pagamentos e totais continuam vindo da venda original.

## Validação

`npm ci`, `npm test` (Node 24) e `npm run build`. Os testes usam SQLite real em uma
conexão, com ponte de SQL de teste: não certificam o pool nativo do plugin Tauri.
Cobrem migrações, preservação dos dados originais, rollback forçado, ausência de
duplicação ao reimprimir, cancelamento, legado, corrupção, largura dos PDFs,
duas vias, caracteres e paginação. PDFs de amostra foram renderizados com Poppler.

`node tests/browser-harness.mjs` inicia um ambiente local de teste da interface.
Ele usa SQLite em memória e emula IPC, salvamento e impressão. Nunca é incluído
no build do aplicativo e não serve como homologação do Windows.

O CI verifica o frontend e a compilação Rust no Windows. Antes de encerrar a issue,
homologar no desktop real:

- Finalizar venda e conferir SQLite/caixa/estoque após fechar e reabrir.
- Salvar PDF: concluir, cancelar, sobrescrever e simular falha de acesso à pasta.
- Imprimir 58/80 mm e A4, uma/duas vias e vendas longas.
- Verificar cancelamento do diálogo e tentar novamente pelo histórico.
- Testar `ASK`, `AUTO_ONE`, `AUTO_TWO` e `NEVER` sem conexão de internet.

O comprovante é um documento interno não fiscal.
