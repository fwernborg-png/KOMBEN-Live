import {
  StrictMode,
} from "react";

import {
  createRoot,
} from "react-dom/client";

import "./index.css";

import App from "./App";

import {
  AuthGate,
} from "./auth/AuthGate";

import {
  installAuthenticatedWorkerFetch,
} from "./lib/authenticatedFetch";

installAuthenticatedWorkerFetch();

if (
  "serviceWorker" in navigator
) {
  window.addEventListener(
    "load",
    () => {
      navigator.serviceWorker
        .register("/sw.js")
        .catch(
          (error) => {
            console.error(
              "Kunde inte registrera service worker:",
              error,
            );
          },
        );
    },
  );
}

createRoot(
  document.getElementById(
    "root",
  )!,
).render(
  <StrictMode>
    <AuthGate>
      <App />
    </AuthGate>
  </StrictMode>,
);
