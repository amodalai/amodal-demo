import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { AmodalProvider } from "@amodalai/react";
import App from "./App.js";
import "@amodalai/react/style.css";
import "./styles.css";

const runtimeUrl = import.meta.env.DEV
  ? import.meta.env.VITE_RUNTIME_URL || "http://localhost:3001"
  : window.location.origin;

const root = document.getElementById("root");
if (!root) throw new Error("Missing #root");

createRoot(root).render(
  <StrictMode>
    <AmodalProvider runtimeUrl={runtimeUrl}>
      <App />
    </AmodalProvider>
  </StrictMode>,
);
