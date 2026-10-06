# Fornecedores

O módulo oferece cadastro offline, edição, busca e ativação/desativação. Somente o nome é obrigatório; contato, telefone, WhatsApp, CPF/CNPJ, e-mail, endereço e observações são opcionais. Campos vazios ficam sem valor no banco. Nomes/documentos não são considerados identificadores únicos: empresas com nomes iguais podem ser cadastradas separadamente.

| Rota | Função |
| --- | --- |
| `/suppliers` | Lista, busca por identificação/contato e filtros Todos/Ativos/Inativos |
| `/suppliers/new` | Novo cadastro |
| `/suppliers/:supplierId/edit` | Edição, inclusive de fornecedor inativo |

A busca ignora maiúsculas e acentos. Desativar mantém os dados e altera somente o status; ativar torna o fornecedor disponível novamente. Não existe exclusão física. O formulário só permite editar após concluir a leitura dos dados. Registros inexistentes ou falhas de leitura possuem retorno e opção de tentar carregar novamente.

As gravações usam o domínio Rust na mesma transação do registro da operação. Uma tentativa repetida após perder a resposta recupera o resultado sem criar outro fornecedor. Se isso ocorrer, repita Salvar com os mesmos dados; se quiser mudar os dados já salvos, volte à lista e edite o cadastro encontrado. A mudança de status também preserva a tentativa ao repetir após uma falha de resposta, sem reenviar contatos antigos.

O backend confere campos obrigatórios, tipos, situação, limites de tamanho e formato básico do e-mail. CPF/CNPJ e telefone são informações de contato; não há consulta externa ou validação cadastral governamental.

A migração 6 cria `suppliers` sem alterar as migrações anteriores. Backup inclui identificação, contatos, observações e situação. Restauração aceita bancos completos das versões 4, 5, 6 ou 7, com seus checksums conhecidos; bancos antigos recebem as migrações necessárias antes do uso. Versões futuras e schema incompleto permanecem bloqueados.

Esta entrega é de cadastro. O módulo de despesas (#24) permite vincular pagamentos a fornecedores ativos e mantém o nome do fornecedor no histórico, inclusive após renomear ou desativar. Compras e contas a pagar continuam fora desta entrega. A cadeia de PRs foi integrada à main; homologação no depósito permanece pendente.

Verificação: testes nativos de criação/edição, repetição concorrente, situação, validação, rollback e backup reaberto; roteiro de interface com backend Rust real para falha de resposta, busca por acentos, edição, filtros, recarga e restauração; teste Windows com restauração de banco v4 e reinstalação preservando o fornecedor.
