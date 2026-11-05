import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
export default defineConfig({
  worker: { format: "es" },
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["mqsio-icon-180.png", "mqsio-full-logo.png"],
      manifest: {
        name: "MQSIO",
        short_name: "MQSIO",
        description: "Field evidence, precisely located.",
        theme_color: "#681B35",
        background_color: "#F5EEE9",
        display: "standalone",
        start_url: ".",
        icons: [
          {
            src: "mqsio-icon-192.png",
            sizes: "192x192",
            type: "image/png",
            purpose: "any",
          },
          {
            src: "mqsio-icon-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "any",
          },
        ],
      },
      workbox: {
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
        globPatterns: ["**/*.{js,css,html,svg,png}"],
      },
    }),
  ],
});
