import react from "@astrojs/react";
import { defineConfig } from "astro/config";

export default defineConfig({
  compressHTML: true,
  integrations: [react()],
  output: "static",
});
