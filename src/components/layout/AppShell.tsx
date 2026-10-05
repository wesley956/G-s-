import {
  BarChart3,
  Boxes,
  CircleDollarSign,
  ClipboardList,
  LayoutDashboard,
  Package,
  ReceiptText,
  Settings,
  ShoppingCart,
  Truck,
  Users,
  WalletCards,
} from "lucide-react";
import { NavLink, Outlet } from "react-router-dom";
import { useEffect, useState } from "react";
import { checkBackupSchedule, getBackupStatus } from "../../services/backupService";

const items = [
  ["/dashboard", "Início", LayoutDashboard],
  ["/sales/new", "Nova Venda", ShoppingCart],
  ["/sales", "Vendas", ClipboardList],
  ["/products", "Produtos", Package],
  ["/inventory", "Estoque", Boxes],
  ["/customers", "Clientes", Users],
  ["/accounts", "Cadernetas", ReceiptText],
  ["/cash", "Caixa", WalletCards],
  ["/expenses", "Despesas", CircleDollarSign],
  ["/suppliers", "Fornecedores", Truck],
  ["/reports", "Relatórios", BarChart3],
  ["/settings", "Configurações", Settings],
] as const;

export function AppShell() {
  const [backupNotice, setBackupNotice] = useState<{ message: string; error: boolean } | null>(null);
  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        await checkBackupSchedule();
        const status = await getBackupStatus();
        if (!active) return;
        if (status.restoreReport) setBackupNotice({ message: status.restoreReport.message, error: !status.restoreReport.restored });
        else if (status.automaticError) setBackupNotice({ message: `O backup automático falhou: ${status.automaticError}`, error: true });
      } catch (error) {
        if (active) setBackupNotice({ message: `Não foi possível conferir o backup automático: ${String(error)}`, error: true });
      }
    })();
    return () => { active = false; };
  }, []);
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">GS</div>
          <div>
            <strong>G-s-</strong>
            <span>Gestão de Depósito</span>
          </div>
        </div>

        <nav className="nav-list">
          {items.map(([to, label, Icon]) => (
            <NavLink
              key={to}
              to={to}
              end={to === "/sales"}
              className={({ isActive }) => `nav-item ${isActive ? "active" : ""}`}
            >
              <Icon size={19} />
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>

        <div className="offline-badge">
          <span className="status-dot" />
          Sistema offline
        </div>
      </aside>

      <main className="content">
        {backupNotice && <div className={`feedback ${backupNotice.error ? 'error' : 'success'}`} role="status">{backupNotice.message}</div>}
        <Outlet />
      </main>
    </div>
  );
}
