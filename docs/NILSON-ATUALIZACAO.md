# Nilson gás e Água — atualização 0.2.0

Esta atualização mantém o funcionamento offline e o identificador do banco da V1 (`br.gs.deposito`). As migrações 1–7 permanecem intactas; a migração 8 acrescenta entregadores, entregas, proteção administrativa e regras de acréscimo.

## Primeiro uso

1. Em **Configurações → Administrador**, o responsável cadastra sua própria senha, com pelo menos seis caracteres. Não há uma senha padrão de fábrica.
2. Para mudar essa senha, é obrigatório informar a atual. A senha é protegida com Argon2id e não é gravada no histórico de operações.
3. Em **Entregadores**, cadastre nome e telefone das pessoas que fazem as entregas.
4. Em **Configurações → Caderneta**, escolha a regra e informe a senha de administrador para salvá-la.

## Venda e entrega

O botão Finalizar venda mostra o que falta: carregar os dados, abrir o caixa, adicionar um produto ou conferir um total maior que zero. Cursor de espera indica apenas uma operação em andamento. Pagamento em dinheiro sem valor recebido informado considera o valor exato; quando informado, ele deve cobrir a parcela em dinheiro e o troco é calculado.

Na opção Entrega, informe endereço, número (ou s/n) e entregador. Os produtos são os próprios itens do pedido. O comprovante e o PDF incluem esses dados.

No retorno, em **Vendas → Finalizar entrega / comprovante**, marque a entrega como finalizada e confira/imprima a notinha. Essa ação não lança uma segunda venda, não movimenta novamente o estoque e não duplica o recebimento. O pagamento já foi registrado ao finalizar a venda. Alterar um cadastro de entregador não muda os nomes, telefones e endereços já registrados na venda.

## Acréscimo da caderneta

A cobrança vem **desativada** na atualização. O responsável configura:

- Valor fixo por semana, por débito, como R$ 5,00.
- Somente semanas completas ou cálculo proporcional por dia.
- Todos os dias (sete por semana) ou segunda a sexta (cinco por semana).
- Uma prévia com valor original, período considerado, acréscimo e total.

A contagem exclui a data inicial e inclui a final. Feriados de segunda a sexta contam nesse modo; não existe um calendário de feriados. O cálculo proporcional arredonda o total acumulado para centavos, sem arredondar cada dia isoladamente. Não há juros sobre juros.

Exemplo: com R$ 5 por semana, proporcional por dia e segunda a sexta, da sexta-feira 06/11/2026 à segunda-feira 09/11/2026 conta um dia, acrescentando R$ 1. No modo semanas completas, esse mesmo intervalo ainda não acrescenta valor.

As preferências salvas valem para **novos fiados e débitos manuais**. Cada débito conserva uma cópia da regra original. Alterar valor, forma de cálculo ou ativação global não reescreve dívidas e pagamentos anteriores.

Para um débito antigo, em **Cadernetas → cliente → Acréscimos por débito**, o administrador pode ativar uma regra e informar a data inicial. Escolher uma data passada pode gerar acréscimo retroativo. Também pode encerrar o acréscimo: o cálculo para na data atual e o valor já acumulado continua devido.

O saldo e as linhas identificadas como **Calculado** mostram a prévia até hoje. Consultar cliente, painel, relatório ou prévia não grava cobranças. Ao confirmar um recebimento ou encerrar uma regra, o valor devido é lançado na caderneta dentro da mesma transação. O dinheiro físico só muda com um recebimento em dinheiro.

Pagamento parcial mantém o acréscimo fixo ativo; a quitação do débito e de seus acréscimos encerra a cobrança. Um estorno de quitação reabre a dívida e inicia um novo período a partir do dia do estorno, sem cobrar retroativamente pelos dias em que ela estava quitada. Uma regra encerrada manualmente não é reativada por um estorno.

## Cancelamentos

Em **Vendas → Cancelar**, informe motivo e senha de administrador. A autorização é verificada no comando nativo, inclusive em uma repetição da operação. Venda fiada com recebimento vinculado continua exigindo o estorno do recebimento antes do cancelamento. Cancelar uma venda devolve os produtos ao estoque, registra os estornos e cancela os débitos e acréscimos relacionados. Operações repetidas com o mesmo identificador não duplicam os efeitos.

## Atualização e validação

Use o instalador NSIS (`setup.exe`) para atualizar a instalação do mesmo usuário do Windows. Preserve uma cópia de segurança antes da atualização. O identificador do aplicativo e o código de atualização MSI da V1 são mantidos. O instalador NSIS migra os atalhos e o registro do nome anterior apenas quando identifica o executável e o caminho da aplicação antiga; não remove o diretório de dados.

O relato da bolinha azul não determina sozinho a causa da falha na máquina do depósito. Esta versão esclarece os bloqueios conhecidos e deve ser validada também nesse computador. Testes automatizados não substituem a conferência da impressora térmica, da largura da bobina e da impressão física.
