import { NavLink } from "react-router-dom";
export function SettingsLinks() {
  return <nav className="settings-links" aria-label="Configurações do depósito">
    <NavLink to="/settings/printer">Impressão</NavLink>
    <NavLink to="/settings/admin">Administrador</NavLink>
    <NavLink to="/settings/accounts">Caderneta</NavLink>
    <NavLink to="/settings/backup">Backup</NavLink>
  </nav>;
}
