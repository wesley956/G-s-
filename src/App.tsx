import { Navigate, Route, Routes } from "react-router-dom";
import { AppShell } from "./components/layout/AppShell";
import { AccountsPage } from "./pages/AccountsPage";
import { CashRegisterPage } from "./pages/CashRegisterPage";
import { CustomerAccountPage } from "./pages/CustomerAccountPage";
import { CustomerFormPage } from "./pages/CustomerFormPage";
import { CustomersPage } from "./pages/CustomersPage";
import { DashboardPage } from "./pages/DashboardPage";
import { InventoryPage } from "./pages/InventoryPage";
import { NewSalePage } from "./pages/NewSalePage";
import { ProductFormPage } from "./pages/ProductFormPage";
import { ProductsPage } from "./pages/ProductsPage";
import { SalesPage } from "./pages/SalesPage";
import { PlaceholderPage } from "./pages/PlaceholderPage";

export default function App() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/sales/new" element={<NewSalePage />} />
        <Route path="/sales" element={<SalesPage />} />
        <Route path="/products" element={<ProductsPage />} />
        <Route path="/products/new" element={<ProductFormPage />} />
        <Route path="/inventory" element={<InventoryPage />} />
        <Route path="/customers" element={<CustomersPage />} />
        <Route path="/customers/new" element={<CustomerFormPage />} />
        <Route path="/accounts" element={<AccountsPage />} />
        <Route path="/accounts/:customerId" element={<CustomerAccountPage />} />
        <Route path="/cash" element={<CashRegisterPage />} />
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
