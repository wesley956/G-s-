import { Navigate, Route, Routes } from "react-router-dom";
import { AppShell } from "./components/layout/AppShell";
import { BackupSettingsPage } from "./pages/BackupSettingsPage";
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
import { PrinterSettingsPage } from "./pages/PrinterSettingsPage";
import { SuppliersPage } from "./pages/SuppliersPage";
import { SupplierFormPage } from "./pages/SupplierFormPage";
import { ExpensesPage } from "./pages/ExpensesPage";
import { ExpenseFormPage } from "./pages/ExpenseFormPage";
import { PlaceholderPage } from "./pages/PlaceholderPage";
import "./styles/receipt.css";

export default function App() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/sales/new" element={<NewSalePage />} />
        <Route path="/sales" element={<SalesPage />} />
        <Route path="/products" element={<ProductsPage />} />
        <Route path="/products/:productId/edit" element={<ProductFormPage />} />
        <Route path="/products/new" element={<ProductFormPage />} />
        <Route path="/inventory" element={<InventoryPage />} />
        <Route path="/customers" element={<CustomersPage />} />
        <Route path="/customers/new" element={<CustomerFormPage />} />
        <Route path="/accounts" element={<AccountsPage />} />
        <Route path="/accounts/:customerId" element={<CustomerAccountPage />} />
        <Route path="/cash" element={<CashRegisterPage />} />
        <Route path="/expenses" element={<ExpensesPage />} />
        <Route path="/expenses/new" element={<ExpenseFormPage />} />
        <Route path="/suppliers" element={<SuppliersPage />} />
        <Route path="/suppliers/new" element={<SupplierFormPage />} />
        <Route path="/suppliers/:supplierId/edit" element={<SupplierFormPage />} />
        <Route path="/reports" element={<PlaceholderPage title="Relatórios" />} />
        <Route path="/settings" element={<Navigate to="/settings/printer" replace />} />
        <Route path="/settings/backup" element={<BackupSettingsPage />} />
        <Route path="/settings/printer" element={<PrinterSettingsPage />} />
      </Route>
      <Route path="/" element={<Navigate to="/dashboard" replace />} />
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}
