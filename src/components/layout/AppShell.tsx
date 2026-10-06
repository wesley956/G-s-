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
        <Outlet />
      </main>
    </div>
  );
}
