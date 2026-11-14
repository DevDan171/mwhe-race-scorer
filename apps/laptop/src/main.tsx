import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { App } from "./App";
import { HubProvider } from "./hub-context";
import "./styles.css";

const root = document.getElementById("root");
if (!root) throw new Error("Missing #root");

createRoot(root).render(
  <StrictMode>
    <HubProvider>
      <App />
    </HubProvider>
  </StrictMode>,
);
