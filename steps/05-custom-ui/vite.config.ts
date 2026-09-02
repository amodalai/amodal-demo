import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// The SPA must build same-origin so its API/auth calls hit the agent's own
// origin through the edge (see amodal.json `runtimeApp`).
export default defineConfig({
  plugins: [react()],
});
