import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// The SPA must build same-origin so its API/auth calls hit the agent's own
// origin through the edge (see amodal.json `runtimeApp`). `pnpm dev` / `npm run
// dev` talks to a local runtime via VITE_RUNTIME_URL (default localhost:3001,
// resolved in src/main.tsx).
export default defineConfig({
  plugins: [react()],
});
