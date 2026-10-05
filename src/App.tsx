import { Navigate, Route, Routes } from "react-router-dom";
import { AppShell } from "./components/layout/AppShell";
import { DashboardPage } from "./pages/DashboardPage";
import { PlaceholderPage } from "./pages/PlaceholderPage";

export default function App() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/sales/new" element={<PlaceholderPage title="Nova Venda" />} />
        <Route path="/sales" element={<PlaceholderPage title="Vendas" />} />
        <Route path="/products" element={<PlaceholderPage title="Produtos" />} />
        <Route path="/inventory" element={<PlaceholderPage title="Estoque" />} />
        <Route path="/customers" element={<PlaceholderPage title="Clientes" />} />
        <Route path="/accounts" element={<PlaceholderPage title="Cadernetas" />} />
        <Route path="/cash" element={<PlaceholderPage title="Caixa" />} />
        <Route path="/expenses" element={<PlaceholderPage title="Despesas" />} />
        <Route path="/suppliers" element={<PlaceholderPage title="Fornecedores" />} />
        <Route path="/reports" element={<PlaceholderPage title="Relatórios" />} />
        <Route path="/settings" element={<PlaceholderPage title="Configurações" />} />
      </Route>
      <Route path="/" element={<Navigate to="/dashboard" replace />} />
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}
