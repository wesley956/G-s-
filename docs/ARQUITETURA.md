# Arquitetura inicial

## Modelo
Aplicativo desktop Windows, offline-first.

```
UI React/TypeScript
       ↓
Camada de serviços
       ↓
Tauri/Rust
       ↓
SQLite local
       ↓
Backups locais
```

## Entidades principais
- Product
- Category
- Sale
- SaleItem
- Payment
- Customer
- CustomerAccountEntry
- InventoryMovement
- CashSession
- CashTransaction
- Expense
- Supplier
- AppSetting
- AuditLog

## Identificadores
Usar UUID como chave primária. Números de venda podem ser sequenciais e independentes do UUID.

## Campos de auditoria
Sempre que aplicável:
`created_at`, `updated_at`, `created_by`, `updated_by`, `cancelled_at`, `cancelled_by`.

## Regras de consistência
- Venda concluída, estoque e caixa devem ser gravados em transação única.
- Cancelamento deve gerar estornos; não apagar registros financeiros.
- Preço vendido deve ser copiado para SaleItem para preservar histórico.
- Backup deve usar snapshot consistente do SQLite.
- Migrações do banco devem ser versionadas.

## Segurança local
- Banco e backups nunca devem conter senhas em texto puro.
- Credenciais locais, se usadas, devem ser hashadas.
- Arquivos de configuração sensíveis não entram no Git.
