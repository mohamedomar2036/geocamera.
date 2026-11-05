import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["geocamera-icon-180.png", "geocamera-full-logo.png"],
      manifest: {
        name: "GeoCamera",
        short_name: "GeoCamera",
        description: "Field evidence, precisely located.",
        theme_color: "#681B35",
        background_color: "#F5EEE9",
        display: "standalone",
        start_url: ".",
        icons: [
          {
            src: "geocamera-icon-192.png",
            sizes: "192x192",
            type: "image/png",
            purpose: "any",
          },
          {
            src: "geocamera-icon-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "any",
          },
        ],
      },
      workbox: { globPatterns: ["**/*.{js,css,html,svg,png}"] },
    }),
  ],
});
