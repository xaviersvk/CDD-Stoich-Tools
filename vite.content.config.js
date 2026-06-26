import { defineConfig } from "vite";
import { resolve } from "path";
import { mkdirSync, copyFileSync, cpSync, existsSync, rmSync } from "fs";

// smiles-drawer's PixelsToSvg (used only by GaussDrawer, which we never call)
// builds an SVG via `div.innerHTML = svgString`. AMO's linter flags any
// innerHTML assignment, so rewrite that one spot to a DOMParser-based parse at
// build time. Pattern: `return d.innerHTML=c,d.firstElementChild`.
function patchSmilesDrawerInnerHtml() {
    const PATTERN =
        /return (\w+)\.innerHTML\s*=\s*(\w+),\1\.firstElementChild/;

    return {
        name: "patch-smiles-drawer-innerhtml",
        enforce: "pre",
        transform(code, id) {
            if (!id.includes("smiles-drawer") || !PATTERN.test(code)) return null;
            return {
                code: code.replace(
                    PATTERN,
                    'return new DOMParser().parseFromString($2,"image/svg+xml").documentElement'
                ),
                map: null,
            };
        },
    };
}

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

            const popupSrc = resolve(__dirname, "src/popup");
            const popupDist = resolve(distDir, "popup");

            if (existsSync(popupSrc)) {
                rmSync(popupDist, { recursive: true, force: true });
                cpSync(popupSrc, popupDist, {
                    recursive: true
                });
            }

            // The popup loads as an ES module and imports the shared field
            // registry at runtime, so the shared sources must ship in dist too.
            const sharedSrc = resolve(__dirname, "src/shared");
            const sharedDist = resolve(distDir, "shared");

            if (existsSync(sharedSrc)) {
                rmSync(sharedDist, { recursive: true, force: true });
                cpSync(sharedSrc, sharedDist, {
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
            input: resolve(__dirname, "src/content/main.js"),
            output: {
                entryFileNames: "assets/content.js",
                inlineDynamicImports: true
            }
        }
    },
    plugins: [patchSmilesDrawerInnerHtml(), copyExtensionAssets()]
});