# Backup — primeira entrega da issue #8

A tela Configurações → Backup cria snapshots consistentes do SQLite enquanto o aplicativo está aberto. SQLite `VACUUM INTO` inclui os dados confirmados do banco e não depende da cópia separada de arquivos WAL.

Antes de liberar a cópia, o backend abre o arquivo em modo somente leitura, verifica `quick_check`, vínculos estrangeiros e as tabelas esperadas. A cópia temporária é sincronizada e renomeada somente depois da validação. Interrupção não altera o banco operacional e arquivos `.partial` não aparecem na lista.

O aplicativo mantém as sete cópias locais mais recentes, sempre conservando a cópia recém-criada. A limpeza só ocorre depois de uma cópia nova válida; arquivos externos à nomenclatura de backup não são removidos. Falha de limpeza é informada sem tratar a cópia já salva como perdida.

“Salvar em outra pasta” abre o seletor do Windows. Escolha um arquivo novo com extensão `.sqlite`; arquivos existentes não são sobrescritos. Cancelar o seletor conserva o backup local. Cópias exportadas não entram na retenção local.

O caminho do banco continua sendo o diretório de configuração do aplicativo; backups locais ficam em sua subpasta `backups`. A interface não aceita caminhos arbitrários para criar snapshots nem para escolher o arquivo de origem da exportação.

## Verificação

- Abrir a cópia com outro pool sem arquivos auxiliares recupera vendas, estoque e comprovantes.
- Alterações posteriores no banco operacional não mudam a cópia.
- Gravações ainda não confirmadas não aparecem no backup.
- Retenção conserva arquivos desconhecidos.
- Exportação não sobrescreve arquivo existente.
- Arquivo corrompido ou SQLite de outro aplicativo é rejeitado sem alterar o banco original.
- Roteiro de navegador cria o snapshot usando o domínio Rust real e abre a cópia exportada.

## Ainda pendente na issue #8

- Rotina automática configurável e preferências de retenção.
- Restauração pelo aplicativo com pré-validação, cópia preventiva e recuperação após interrupção.
- Instaladores Windows NSIS/MSI e teste de instalação/upgrade.
- Homologação dos seletores de arquivo e de recuperação no Windows.

A issue permanece aberta. A primeira entrega não substitui nem restaura o banco operacional.
