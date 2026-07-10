import { defineConfig } from "vite";
import { resolve } from "path";
import { mkdirSync, copyFileSync, cpSync, existsSync, rmSync, readFileSync, writeFileSync } from "fs";

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

            // Chrome and Firefox disagree about MV3 backgrounds and neither
            // tolerates the other's key: Chrome rejects `background.scripts`
            // ("requires manifest version of 2 or lower"), and Firefox has no
            // `background.service_worker` at all. Chrome also warns about
            // `browser_specific_settings`, which is a Gecko-only key. So ship a
            // manifest per browser, each carrying only what that browser knows.
            //
            // dist/manifest.json is the Chrome one, dist/manifest.firefox.json
            // the Firefox one. .github/workflows/publish.yml moves the Firefox
            // one over manifest.json before signing for AMO, and deletes it
            // before zipping for the Web Store.
            //
            // The repo's manifest.json is the shared source: it holds the
            // version (publish.yml checks it against the git tag) and every key
            // both browsers accept.
            const manifest = JSON.parse(
                readFileSync(resolve(__dirname, "manifest.json"), "utf8")
            );

            const { browser_specific_settings, ...chromeManifest } = manifest;
            chromeManifest.background = { service_worker: "background.js" };

            writeFileSync(
                resolve(distDir, "manifest.json"),
                JSON.stringify(chromeManifest, null, 2) + "\n"
            );

            const firefoxManifest = {
                ...manifest,
                background: { scripts: ["background.js"] }
            };

            writeFileSync(
                resolve(distDir, "manifest.firefox.json"),
                JSON.stringify(firefoxManifest, null, 2) + "\n"
            );

            if (existsSync(resolve(__dirname, "icons"))) {
                cpSync(resolve(__dirname, "icons"), resolve(distDir, "icons"), {
                    recursive: true
                });
            }

            const optionsSrc = resolve(__dirname, "src/options");
            const optionsDist = resolve(distDir, "options");

            if (existsSync(optionsSrc)) {
                rmSync(optionsDist, { recursive: true, force: true });
                cpSync(optionsSrc, optionsDist, {
                    recursive: true
                });
            }

            // Turns a click on the toolbar icon into the options page. Not
            // bundled: it is two lines and has no imports.
            copyFileSync(
                resolve(__dirname, "src/background.js"),
                resolve(distDir, "background.js")
            );

            // The options page loads as an ES module and imports the shared
            // field registry at runtime, so the shared sources must ship in
            // dist too.
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