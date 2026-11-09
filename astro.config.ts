import react from "@astrojs/react";
import { defineConfig } from "astro/config";

export default defineConfig({
  // CI sets this from GitHub Pages' base path (e.g. "/draggle").
  base: process.env.DRAGGLE_BASE || "/",
  compressHTML: true,
  integrations: [react()],
  // no code blocks to highlight, and Shiki's inline styles would break the CSP
  markdown: { syntaxHighlight: false },
  output: "static",
  // GitHub Pages can't send headers, so Astro writes the CSP as a <meta> tag,
  // hashing the inline scripts and styles it emits.
  security: {
    csp: {
      directives: ["default-src 'self'", "object-src 'none'", "base-uri 'none'"],
    },
  },
});
