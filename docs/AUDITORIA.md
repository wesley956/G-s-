# Auditoria das operações confirmadas

A tela **Auditoria** consulta o histórico local em modo de leitura. Datas inicial e final são inclusivas, no horário do computador. Há filtros por tipo e busca literal nos identificadores e dados informados na operação; acentos devem coincidir com o registro. A busca não inclui nomes atuais nem os dados acrescentados aos detalhes a partir dos comprovantes.

Cada página contém até 25 operações, ordenadas por data UTC decrescente e identificador decrescente. A primeira consulta fixa o maior `rowid`; páginas seguintes mantêm esse limite, mesmo se novas operações forem confirmadas. **Consultar / atualizar** inicia uma nova consulta. Filtros exibidos acima da lista identificam a consulta efetivamente carregada. Falhas permitem repetição e identificam listas anteriores; respostas após sair da tela são descartadas.

## Cobertura

A fonte é `operation_results`: pedido, resposta e data gravados na mesma transação da operação nativa. Repetir a mesma operação não duplica o histórico. Falhas com reversão da transação não aparecem como operações confirmadas. A consulta não chama o mecanismo de escrita, não altera registros, não exclui eventos e não oferece repetição de operações.

Inclui venda, cancelamento, estoque, recebimento e devolução de caderneta, despesa e devolução de despesa, abertura/movimento/fechamento de caixa, débito manual, cadastro/edição de produto e fornecedor, situação do fornecedor e criação de categoria.

Cadastro e situação de clientes, ativação rápida de produtos, preferências e backups usam outros caminhos e não aparecem. Registros anteriores à adoção desse mecanismo podem faltar. Não se presume operador, nome histórico ausente, valores anteriores ou transições não registradas. Portanto esta tela é uma consulta das operações confirmadas disponíveis, com cobertura parcial de alterações do aplicativo.

## Detalhes e referências

Detalhes exibem campos permitidos e legíveis: centavos em reais, pagamento, motivo, quantidade, valores de fechamento, nome informado e referências disponíveis. O JSON bruto não é exibido. Registros desconhecidos ou incompletos permanecem consultáveis, com aviso, sem reconstrução de valores.

Vendas usam número, itens e cliente do comprovante preservado; despesas usam o fornecedor registrado no pagamento original. Renomear ou inativar cadastros não modifica esses nomes. Outros eventos podem preservar somente um ID. Os links abrem históricos ou cadastros atuais existentes, inclusive inativos; dados atuais não são apresentados como dados históricos.

Não há nova migração. Consulta, filtros, contagem, paginação e referências são lidos na mesma transação SQLite. O histórico acompanha o banco no backup/restauração existente.

## Validação

Testes nativos cobrem repetição, reversão de falha, leitura sem alterações, todos os tipos, centavos, nomes preservados, inativos, registros antigos/incompletos, busca literal, datas locais inclusivas, paginação com novas operações e backup/reabertura. O fluxo de interface usa esse domínio nativo e SQLite real para erro/repetição, filtros, detalhes, paginação, navegação e telas de 1024 e 1280 pixels.
