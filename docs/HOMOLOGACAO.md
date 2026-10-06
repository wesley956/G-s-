# Homologação no depósito

Use uma instalação de homologação, em outro usuário Windows ou máquina de teste, para não misturar lançamentos fictícios com a operação real. Antes de atualizar uma instalação com dados, exporte um backup pelo aplicativo e mantenha uma cópia externa. Não apague nem substitua o banco de produção para executar este roteiro.

Registre a versão 0.1.0, o commit e o link da CI do instalador, Windows/build, modelo da impressora, driver, largura de papel e resultado. Os links da versão integrada e as pendências ficam na [issue #32](https://github.com/wesley956/G-s-/issues/32). A instalação NSIS foi testada automaticamente em VM; o MSI foi gerado, mas sua instalação física exige validação própria.

## Instalação e operação offline

1. Instale o arquivo terminado em `-setup.exe` extraído do artefato Windows da CI. Ele inclui o instalador offline do WebView2. Confira abertura da janela, navegação e ausência de erro.
2. Retire o acesso à internet mantendo, se necessário, a rede local usada pela impressora. Reinicie o aplicativo e execute o roteiro abaixo.
3. Em Configurações, preencha identificação e rodapé do depósito. Cadastre um cliente e um fornecedor de teste.
4. Cadastre Gás Teste com preço Portaria R$100,00, Entrega R$110,00 e estoque 10; Água Teste com ambos os preços R$15,00 e estoque 10.

## Conferência financeira

Todos os valores abaixo são simulações na instalação de homologação. PIX e cartões são apenas registros offline; não execute transferências reais para testar.

| Etapa | Ação | Dinheiro esperado no caixa |
| --- | --- | --- |
| 1 | Abrir caixa com R$100,00 | R$100,00 |
| 2 | Vender 1 Gás Teste em Entrega, dinheiro recebido R$120,00; confirmar troco R$10,00 | R$210,00 |
| 3 | Vender 1 Água Teste por PIX, R$15,00 | R$210,00 |
| 4 | Vender 1 Gás Teste em Portaria: R$40,00 dinheiro, R$30,00 PIX e R$30,00 fiado do cliente de teste | R$250,00 |
| 5 | Receber R$10,00 da caderneta em dinheiro; dívida restante R$20,00 | R$260,00 |
| 6 | Estornar o recebimento com motivo; dívida retorna a R$30,00 | R$250,00 |
| 7 | Cancelar a venda mista com retorno do produto; dívida zera e parcelas são devolvidas pelas formas originais | R$210,00 |
| 8 | Registrar despesa de R$20,00 em dinheiro vinculada ao fornecedor de teste | R$190,00 |
| 9 | Cancelar a despesa após simular devolução integral, com motivo | R$210,00 |
| 10 | Registrar sangria de R$10,00 e fechar com dinheiro contado R$200,00 | R$200,00; diferença R$0,00 |

Ao final, devem restar duas vendas válidas totalizando R$125,00: R$110,00 em dinheiro e R$15,00 em PIX. Estoque: Gás Teste 9, Água Teste 9. A caderneta do cliente não deve ter saldo. O histórico conserva a venda cancelada, o recebimento/devolução, a despesa/devolução e os motivos. Confira esses fatos no painel, relatórios e Auditoria; ajuste o período à data local do teste. O saldo físico inclui abertura e sangria, por isso não equivale ao total de vendas.

Em um novo caixa de teste, confira também débito, crédito, desconto em reais/percentual, suprimento, entrada/perda/ajuste de estoque e cancelamento de venda de caixa já fechado. Fechamentos anteriores devem permanecer iguais. A auditoria mostra somente a cobertura explicitada na tela.

## Impressão e arquivos

- Imprima o comprovante da venda em dinheiro na largura real do depósito (58 ou 80 mm). Confira nome, itens, preço Entrega, recebido R$120,00, troco R$10,00, margem, corte e legibilidade.
- Confira uma e duas vias, reimpressão pelo histórico, aviso de venda cancelada e aviso de fiado. Fechar o diálogo de impressão não deve repetir a venda.
- Salve A4/PDF pelo seletor real, abra o arquivo e confira conteúdo. Cancele uma seleção e tente um destino sem permissão: o aplicativo deve tratar a falha sem lançar outra venda.
- Exporte CSV dos relatórios, abra no programa de planilha do cliente e confira datas, acentos, colunas e valores.

## Backup, recuperação e reinstalação

1. Crie e exporte um backup dos dados de teste. Confira a lista e o arquivo externo. Ative a rotina automática e confira uma cópia após a próxima inicialização elegível segundo a política configurada.
2. Anote vendas, estoque, caderneta e fechamentos. Faça mais um lançamento fictício para distinguir o estado atual do backup.
3. Na instalação de homologação, restaure o backup pelo seletor e confirmação nativos. O aplicativo deve reiniciar, voltar ao estado anotado e preservar uma cópia preventiva do estado substituído.
4. Reinstale o mesmo instalador e confira novamente os dados. Ao testar atualização entre versões diferentes, registre ambas as versões e confira migrações e dados preservados.
5. Reative a internet, se desejado, e registre evidências dos resultados e qualquer falha na issue #32. Liberar o uso diário somente após aprovação no equipamento e na impressora do depósito.
