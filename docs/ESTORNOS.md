# Estorno de recebimentos da caderneta

Em Caderneta → cliente, escolha **Estornar** no recebimento. A confirmação informa o valor completo, a forma original e a parcela de cada débito que será reaberta. Informe o motivo e confirme somente após providenciar a devolução ao cliente. PIX e cartões exigem que a devolução seja realizada no banco ou na operadora; o aplicativo registra o movimento local, sem integração com essas instituições.

O recebimento é estornado inteiro. Se cobriu várias notas ou vendas, todas as parcelas aparecem antes da confirmação. Não há devolução parcial nessa entrega.

É necessário um caixa aberto. A saída usa o caixa atual e a forma original; fechamentos anteriores não são alterados. Dinheiro exige saldo físico disponível; registre um suprimento se necessário. PIX e cartões reduzem os recebimentos da respectiva forma, sem reduzir o dinheiro físico nem o total de vendas.

O recebimento original fica como **Estornado**, com motivo e data. Suas alocações continuam guardadas, mas deixam de abater os débitos. Outras parcelas pagas continuam válidas. A operação não muda a venda ou o estoque: depois de devolver todos os recebimentos ativos ligados à venda, cancele a venda em Vendas para registrar seu retorno de estoque e o estorno dos pagamentos feitos na própria venda.

Os novos recebimentos têm vínculo explícito com o caixa. Recebimentos anteriores à migração 5 sem esse vínculo mostram **Revisar histórico** e não permitem estorno automático. Não se pode identificar o movimento correto apenas pela data, descrição ou valor. Essa revisão de registros antigos é uma limitação desta entrega.

Recebimento, alocações, estorno e histórico são gravados em transação nativa. Tentativas concorrentes não devolvem duas vezes. Se a resposta falhar após gravar, repita a confirmação com o mesmo motivo: a interface conserva a identificação da tentativa e recupera seu resultado.

A migração 5 preserva os dados e checksums anteriores. A restauração reconhece backups v4/v5/v6 válidos; o aplicativo atualiza as cópias anteriores antes de usá-las. Backups futuros ou migrações divergentes permanecem bloqueados.

Validação automatizada: testes nativos de pagamentos parciais e múltiplos débitos, concorrência, repetição, rollback, caixa fechado, devolução tardia, formas originais, cliente inativo, saldo insuficiente e vínculos ausentes; resumo de caixa em SQLite real; roteiro de interface com domínio Rust real. O teste do instalador restaura uma cópia v4 e confere a atualização nativa para v5. Integração da cadeia de PRs e homologação no equipamento do depósito continuam pendentes.
