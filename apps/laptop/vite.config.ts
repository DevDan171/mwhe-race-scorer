import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

import { devSyncPlugin } from "./dev-sync.ts";

export default defineConfig({
  plugins: [react(), devSyncPlugin()],
  base: "./",
  server: {
    port: 1420,
    strictPort: true,
    host: "127.0.0.1",
  },
  clearScreen: false,
});
