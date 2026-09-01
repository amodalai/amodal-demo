import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { AmodalProvider } from "@amodalai/react";
import App from "./App.js";
import "@amodalai/react/style.css";
import "./styles.css";

// Same-origin in cloud (the runtime serves both the SPA and the API on one
// domain), falling back to localhost:3001 for `npm run dev`. The httpOnly
// session cookie rides every same-origin request, so the SDK needs no bearer:
// an empty token means no Authorization header.
const runtimeUrl = import.meta.env.VITE_RUNTIME_URL ?? "http://localhost:3001";

const root = document.getElementById("root");
if (!root) throw new Error("Missing #root");

createRoot(root).render(
  <StrictMode>
    <AmodalProvider runtimeUrl={runtimeUrl} getToken={async () => ""}>
      <App />
    </AmodalProvider>
  </StrictMode>,
);
