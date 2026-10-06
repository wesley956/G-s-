# Backup e restauração — issue #8

Configurações → Backup permite criar, exportar e restaurar cópias das vendas, estoque, caixa, clientes e configurações. A rotina automática vem ativada, a cada 24 horas, com sete cópias locais. O operador pode desativar a rotina, escolher 1/6/12/24 horas e manter de 3 a 30 cópias.

## Criar e guardar

O backend usa `VACUUM INTO` para obter uma cópia consistente dos dados confirmados, incluindo o WAL. Não copia o arquivo de um banco em uso diretamente. A cópia é aberta somente para leitura e conferida: integridade, vínculos estrangeiros, tabelas e colunas da aplicação. O arquivo temporário é sincronizado e renomeado depois da validação; arquivos `.partial` não aparecem na lista.

A rotina funciona enquanto o aplicativo está aberto, conferindo o intervalo ao abrir e a cada minuto. Não é um serviço do Windows: períodos com o programa fechado são recuperados ao abrir novamente. Um backup manual recente também conta para o intervalo. Se o relógio do computador retroceder, a rotina aguarda alcançar novamente a data da última cópia; o backup manual continua disponível.

A limpeza ocorre somente depois de criar uma cópia válida e preserva arquivos desconhecidos e a cópia recém-criada. Falha de limpeza é informada sem tratar a cópia salva como perdida. Cópias preventivas de restauração podem ultrapassar temporariamente a retenção; a próxima cópia normal aplica o limite.

“Salvar em outra pasta” abre o seletor do Windows. Escolha um arquivo novo com extensão `.sqlite`: arquivos existentes não são sobrescritos. Cancelar conserva o backup local. Cópias exportadas não entram na retenção. Guarde uma cópia em pendrive ou outra unidade para proteção contra falha do computador.

## Restaurar

Escolha “Restaurar esta cópia” ou “Escolher arquivo para restaurar”. O backend confere também o histórico e os checksums das migrações. São aceitos bancos completos das versões 4, 5, 6 ou 7; após restaurar uma cópia anterior, o plugin SQL aplica as migrações até a versão 7 antes do uso. Backups incompletos, de outro aplicativo ou de versões desconhecidas são rejeitados antes de substituir dados.

O diálogo nativo informa o arquivo escolhido, a substituição de dados, a cópia preventiva e o reinício. Cancelar mantém o banco atual. Depois de confirmar:

1. Uma cópia independente do arquivo escolhido é preparada e validada, com hash SHA-256 e marcador de recuperação sincronizados.
2. O pool operacional é fechado e o aplicativo solicita reinício. Uma única instância impede outro processo do aplicativo usando o banco durante a troca.
3. Antes de inicializar o plugin SQL ou criar a janela, o backend confere a cópia preparada e salva uma cópia preventiva do banco atual. Ela inclui alterações confirmadas depois da preparação.
4. O banco atual é checkpointado, fechado e renomeado como reserva. A cópia preparada é instalada e conferida novamente.
5. A reserva temporária é removida depois da conferência. A cópia preventiva permanece na lista. A tela informa o resultado ao abrir.

Se o processo for interrompido entre os renomes, o próximo início continua a recuperação. Se a cópia preparada ou instalada estiver alterada/incompleta, o banco anterior é preservado ou reinstalado, e o arquivo rejeitado é guardado para diagnóstico. A impossibilidade de guardar ou conferir a cópia preventiva cancela a troca e preserva os dados atuais. Um marcador inválido impede a troca; não deve ser contornado substituindo o banco manualmente em uso.

O diretório de configuração contém `deposito.db`, a subpasta `backups` e, apenas durante recuperação, `restore-pending.sqlite`, `restore-pending.json` e `deposito.restore-previous.sqlite`. Esses arquivos de recuperação não devem ser editados. Na aplicação real, os caminhos de restauração externa vêm do seletor nativo; a interface não fornece caminhos arbitrários ao comando.

## Windows e validação

Os instaladores NSIS e MSI incluem o instalador offline do WebView2. A CI gera os dois formatos e executa instalação NSIS em um Windows descartável, abre o programa instalado e verifica migrações, backup automático, restauração no início e reinstalação da mesma versão preservando os dados. Esse teste não substitui a homologação no computador do depósito.

Os testes nativos cobrem concorrência, cópia reaberta sem WAL de origem, gravação não confirmada, retenção, exportação sem sobrescrita, política persistida, agendamento, restauração com cópia preventiva, interrupções entre renomes, reversão de instalação incompleta, cópia preventiva inválida, recuperação de WAL após perda do processo e migrações incompatíveis. O roteiro de interface usa o domínio Rust real; seletor, confirmação e reinício são emulados.

Pendências de homologação: instalação/upgrade mantendo dados em Windows 10/11 do depósito, confirmação/seletores reais, recuperação no equipamento e impressão física. PRs #18 e #19 permanecem empilhados e a issue #8 aberta até integração e homologação.
