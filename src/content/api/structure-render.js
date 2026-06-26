// content/api/structure-render.js
//
// Renders a SMILES string to inline SVG markup using SmilesDrawer, fully
// client-side. The markup is inlined into the tooltip (not used as an <img src>)
// so it stays crisp at any size -- no rasterization / pixelation.
//
// Look is tuned for a small tooltip thumbnail: black & white, thick bonds and
// larger heteroatom labels (O, N, ...) so the structure stays legible.

import SmilesDrawer from "smiles-drawer";

const LOG_PREFIX = "[CDD inventory plugin]";
const SVG_NS = "http://www.w3.org/2000/svg";
const THEME = "bw";

// All atoms black on white. Thick bonds + big fonts keep it readable when the
// SVG is scaled down into the tooltip. We do NOT set width/height: SmilesDrawer
// sizes the SVG + viewBox to fit the molecule; the tooltip caps display size.
const MOLECULE_OPTIONS = {
    padding: 16,
    bondThickness: 2.2,
    bondLength: 22,
    fontSizeLarge: 11,
    fontSizeSmall: 7,
    themes: {
        [THEME]: {
            FOREGROUND: "#000000",
            C: "#000000",
            N: "#000000",
            O: "#000000",
            F: "#000000",
            CL: "#000000",
            BR: "#000000",
            I: "#000000",
            P: "#000000",
            S: "#000000",
            B: "#000000",
            SI: "#000000",
            H: "#000000",
            BACKGROUND: "#FFFFFF",
        },
    },
};

let drawer = null;

function getDrawer() {
    if (!drawer) {
        drawer = new SmilesDrawer.SmiDrawer(MOLECULE_OPTIONS);
    }
    return drawer;
}

// Returns a Promise<string | null> resolving to inline `<svg>...</svg>` markup.
// Never rejects: any parse/render failure resolves to null so callers can show
// a quiet fallback.
export function renderSmilesToSvg(smiles) {
    return new Promise((resolve) => {
        if (!smiles || typeof smiles !== "string") {
            resolve(null);
            return;
        }

        let container;
        let svg;
        try {
            // Keep the SVG target bare (no preset width/height/style): SmilesDrawer
            // sets the viewBox + size itself, and attributes added up front throw
            // off its sizing and produce an empty drawing. Move it offscreen via a
            // wrapper so the serialized SVG stays clean, while still being laid out
            // for accurate text measurement.
            container = document.createElement("div");
            container.style.cssText =
                "position:absolute;left:-99999px;top:0;width:0;height:0;overflow:hidden;";
            svg = document.createElementNS(SVG_NS, "svg");
            container.appendChild(svg);
            document.body.appendChild(container);
        } catch (err) {
            console.warn(`${LOG_PREFIX} could not create SVG element`, { err });
            container?.remove();
            resolve(null);
            return;
        }

        const done = (result) => {
            container.remove();
            resolve(result);
        };

        try {
            getDrawer().draw(
                smiles,
                svg,
                THEME,
                () => {
                    try {
                        done(new XMLSerializer().serializeToString(svg));
                    } catch (err) {
                        console.warn(`${LOG_PREFIX} SMILES serialize failed`, {
                            smiles,
                            err,
                        });
                        done(null);
                    }
                },
                (err) => {
                    console.warn(`${LOG_PREFIX} SMILES parse failed`, {
                        smiles,
                        err,
                    });
                    done(null);
                }
            );
        } catch (err) {
            console.warn(`${LOG_PREFIX} SMILES render threw`, { smiles, err });
            done(null);
        }
    });
}
