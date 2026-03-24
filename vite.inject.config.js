import { defineConfig } from "vite";
import { resolve } from "path";

export default defineConfig({
    build: {
        outDir: "dist",
        emptyOutDir: false,
        target: "es2020",
        minify: false,
        rollupOptions: {
            input: resolve(__dirname, "src/inject/main.js"),
            output: {
                entryFileNames: "assets/inject.js",
                inlineDynamicImports: true
            }
        }
    }
});