import { defineConfig } from "vite";
import { resolve } from "path";
import { mkdirSync, copyFileSync, cpSync, existsSync } from "fs";

function copyExtensionAssets() {
    return {
        name: "copy-extension-assets",
        closeBundle() {
            const distDir = resolve(__dirname, "dist");

            mkdirSync(distDir, { recursive: true });

            copyFileSync(
                resolve(__dirname, "manifest.json"),
                resolve(distDir, "manifest.json")
            );

            if (existsSync(resolve(__dirname, "icons"))) {
                cpSync(resolve(__dirname, "icons"), resolve(distDir, "icons"), {
                    recursive: true
                });
            }

            if (existsSync(resolve(__dirname, "README.txt"))) {
                copyFileSync(
                    resolve(__dirname, "README.txt"),
                    resolve(distDir, "README.txt")
                );
            }
        }
    };
}

export default defineConfig({
    build: {
        outDir: "dist",
        emptyOutDir: true,
        target: "es2020",
        minify: false,
        rollupOptions: {
            input: {
                content: resolve(__dirname, "src/content/main.js"),
                inject: resolve(__dirname, "src/inject/main.js")
            },
            output: {
                entryFileNames: "assets/[name].js",

                // 🔥 KRITICKÉ
                inlineDynamicImports: true,

                // odstráň tieto:
                // chunkFileNames
                // assetFileNames
            }
        }
    },
    plugins: [copyExtensionAssets()]
});