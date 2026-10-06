import React from "react";
import ReactDOM from "react-dom/client";
import { HashRouter } from "react-router-dom";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { logError } from "./lib/errors";
import App from "./App";
import "./styles/global.css";

window.addEventListener("error", event => logError(event.error || event.message));
window.addEventListener("unhandledrejection", event => logError(event.reason));

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <HashRouter>
      <ErrorBoundary><App /></ErrorBoundary>
    </HashRouter>
  </React.StrictMode>,
);
