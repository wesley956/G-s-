# Painel inicial offline

A consulta `get_dashboard` executa uma única instrução de leitura no SQLite nativo. Data local, vendas, formas de pagamento, caixa, dívidas e estoque compartilham a mesma fotografia; nenhum lançamento ou migração é criado (schema 7).

Vendas hoje: total após descontos das vendas finalizadas na data local, incluindo as que foram canceladas depois. Cancelamentos hoje: valor das vendas canceladas nesta data, inclusive vendas anteriores. Vendas líquidas hoje: diferença entre esses eventos; pode ser negativa. Estas regras correspondem aos relatórios.

Vendas fiado hoje soma somente as parcelas `CREDIT_CUSTOMER` da finalização; uma venda mista contribui apenas com a parcela fiado. A tabela mantém vendas, estornos, recebimentos e devoluções de caderneta separados por forma. Troco não compõe a venda; despesas, suprimentos e suas devoluções não compõem faturamento. Nenhuma dessas colunas representa o saldo físico disponível do caixa.

Fiado em aberto e quantidade de clientes com dívida são atuais, contando saldos positivos e incluindo clientes inativos. Pagamentos cancelados não abatem a dívida. Estoque baixo conta somente produtos ativos no mínimo ou abaixo dele.

Atualizar painel consulta novamente a data local e todos os indicadores. Retorno à rota, foco da janela e retorno à aba também atualizam. A tela identifica a data e o instante consultados; após falha preserva os últimos dados com aviso explícito e permite repetir. Respostas de carregamentos desmontados são descartadas; atalhos anteriores são preservados.

Verificação: consultas concorrentes com vendas; pagamentos mistos e desconto em centavos; quitação/devolução e cliente inativo; cancelamento tardio e caixa fechado; limites de data local; período vazio; estoque ativo/inativo; ausência de gravações financeiras; backup/reabertura. Roteiro `tests/browser-dashboard.mjs` cobre tela, atualização, falha/repetição, desmontagem e 1024/1280 px com domínio Rust e SQLite reais. Seletores e IPC do Tauri são emulados no navegador; instalação e homologação física são etapas separadas.
