import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const checkoutServer = process.env.API_PROXY_TARGET || "http://localhost:4242";

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      "/api": checkoutServer,
    },
  },
});
