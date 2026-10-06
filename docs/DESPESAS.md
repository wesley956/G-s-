# Despesas pagas

| Rota | Função |
| --- | --- |
| `/expenses` | Histórico, busca, período, fornecedor, situação, totais e cancelamento |
| `/expenses/new` | Registrar um pagamento realizado no caixa aberto |

Cada despesa registra descrição, categoria, valor em centavos e forma de pagamento. Fornecedor e observações são opcionais. Categorias são texto livre, com sugestões. São permitidos dinheiro, PIX, débito e crédito; fiado não é pagamento de uma despesa nesta entrega. Fornecedores inativos não aparecem no novo lançamento. O nome do fornecedor é preservado no momento do pagamento para continuar correto após renomear/desativar.

Dinheiro exige saldo físico disponível e reduz o caixa. PIX e cartões registram seus próprios pagamentos sem consumir dinheiro físico. O programa não executa pagamentos bancários: faça o pagamento antes de registrar. A despesa não cria entrada de estoque, conta a pagar, recorrência ou anexo.

O formulário mantém a identificação da tentativa durante uma falha. Se perder a resposta, repita com os mesmos dados. Se o pagamento já foi gravado e você mudar os dados, a tela orienta conferir a lista. Uma despesa paga não pode ser editada: para corrigir o financeiro, cancele após receber a devolução e faça o novo lançamento. O backend valida tipos, limites, fornecedor ativo e o caixa que estava aberto ao preencher o formulário. Um caixa fechado/trocado exige reabrir a tela.

## Histórico e cancelamento

A migração 7 adiciona `expenses` e `expense_refunds`, sem alterar migrações/checksums anteriores. As despesas avulsas existentes recebem metadados e categoria “Outras”, referenciando a saída original. Nenhuma saída é repetida, e valor, descrição, data e caixa originais são preservados. A operação antiga `CASH_MOVE/EXPENSE` continua criando uma despesa visível. A tela atual do caixa direciona novos pagamentos ao formulário completo.

Cancelar significa registrar uma **devolução integral efetivamente recebida**, por motivo obrigatório. Confirme apenas após recuperar o dinheiro ou após a devolução no banco/operadora. É necessário caixa aberto. O backend recupera valor e forma do pagamento original; a tela não determina o valor devolvido. A entrada usa movimento `SUPPLY` com vínculo específico em `expense_refunds`, apresentado como “Devolução de despesa”. Esse vínculo impede que ela seja contada como suprimento comum, recebimento de caderneta ou venda. Pagamentos e fechamentos anteriores permanecem intactos. Uma devolução não se repete, mesmo em tentativas concorrentes; repetir a mesma operação recupera seu resultado.

A listagem usa o período pela **data local do pagamento original**, com extremos inclusivos. Busca ignora maiúsculas/acentos e inclui descrição, categoria, fornecedor, observações e motivo. Situação e despesas líquidas consideram cancelamentos posteriores; a data da devolução aparece no histórico. O resumo do caixa soma despesas e devoluções **daquela sessão**, por forma: valores negativos indicam devoluções de pagamentos de outra sessão. Somente a parcela em dinheiro compõe o saldo físico. Esses totais representam recortes diferentes e não devem ser confundidos.

Não há cancelamento parcial. Históricos com forma/valor inválidos exigem revisão e não geram uma devolução automática. Não existe exclusão física.

## Backup e validação

Backup preserva fornecedores, metadados, pagamentos, devoluções e operações de repetição. A restauração aceita bancos completos v4/v5/v6/v7 com checksums conhecidos e migra antes do uso. O schema v7 incompleto é rejeitado.

Verificações incluídas: 17 testes JavaScript; sete cenários nativos novos para formas de pagamento, saldo, concorrência/repetição, validação, fornecedor inativo/nome histórico, rollback, cancelamento tardio, migração de avulsas e backup reaberto; roteiro de interface com Rust real para erro de saldo, resposta perdida, filtros, caixa fechado, cancelamentos em dinheiro/PIX, recarga e restauração; teste NSIS com atualização v4→v7 e reinstalação preservando despesas/devoluções. Os PRs foram integrados à main; homologação no equipamento do depósito permanece pendente.
