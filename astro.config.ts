import react from "@astrojs/react";
import { defineConfig } from "astro/config";

export default defineConfig({
  // CI sets this from GitHub Pages' base path (e.g. "/draggle").
  base: process.env.DRAGGLE_BASE || "/",
  compressHTML: true,
  integrations: [react()],
  output: "static",
});
