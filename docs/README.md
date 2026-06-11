# CDD Stoich Tools — Documentation

This folder is the documentation hub for the **CDD Stoich Tools** browser
extension. The documents below were written to be read by a developer who is new
to the project (and, in places, new to browser extensions in general).

> The top-level [`../README.md`](../README.md) is the product/overview README
> (what the extension does, how to build it). The documents here go deeper.

## Documents

| Document | What it's for | Read it when… |
| --- | --- | --- |
| [ARCHITECTURE_REVIEW.md](./ARCHITECTURE_REVIEW.md) | Full architectural audit: boot sequence, the two-world model, every significant file (why it exists / who uses it / what breaks if removed), strengths, weaknesses, and recommendations. | You want to understand or maintain the whole codebase. |
| [DATA_FLOW_DIAGRAMS.md](./DATA_FLOW_DIAGRAMS.md) | A sequence diagram and a module-dependency diagram (Mermaid) tracing one CDD response from `fetch`/XHR all the way to a rendered Sample Panel, including every payload shape. | You want to *see* how data moves between modules and across the two worlds. |
| [FEATURE_CATALOG.md](./FEATURE_CATALOG.md) | A complete inventory of every feature, grouped into 8 areas, each with user value, entry point, data source, dependencies, maintenance difficulty, and regression risk. | You need to find a feature, or judge how risky a change is. |
| [ADDING_NEW_FIELDS.md](./ADDING_NEW_FIELDS.md) | A step-by-step, self-contained guide to adding a new Sample-Panel field (CDD JSON → resolver → flatSample → registry → popup), with three worked examples. | You want to add or change a panel field. |
| [LEARNING_GUIDE.md](./LEARNING_GUIDE.md) | A teaching guide to **browser-extension architecture** (content scripts, page scripts, `postMessage`, `MutationObserver`, `chrome.storage`, popups, `manifest.json`, Vite) using this project as a real-world example. | You want to *learn the concepts*, not just this codebase. |
| [RELEASE_NOTES.md](./RELEASE_NOTES.md) | User-facing release notes for the current release. | You're cutting or reviewing a release. |

## Suggested reading order

**To learn browser extensions (concepts first):**
1. [LEARNING_GUIDE.md](./LEARNING_GUIDE.md) — the concepts, taught with this code.
2. [ARCHITECTURE_REVIEW.md](./ARCHITECTURE_REVIEW.md) — how those concepts are
   assembled here.
3. [DATA_FLOW_DIAGRAMS.md](./DATA_FLOW_DIAGRAMS.md) — watch the data move.

**To maintain or extend the project (task first):**
1. [ARCHITECTURE_REVIEW.md](./ARCHITECTURE_REVIEW.md) §11 (60-second orientation).
2. [FEATURE_CATALOG.md](./FEATURE_CATALOG.md) — find the feature and its risk.
3. [ADDING_NEW_FIELDS.md](./ADDING_NEW_FIELDS.md) — the most common change, worked
   end to end.

## One-paragraph orientation

CDD Stoich Tools is a **Manifest V3** extension for the CDD Vault web app. It has
no backend. A **content script** builds extra UI on CDD pages; it also injects a
**page script** into CDD's own JavaScript world so it can read the JSON CDD loads
in the background. The two halves talk **only** through tagged
`window.postMessage`. The flagship feature is a floating **Sample Panel**; around
it are print sheets, dose-response tools, and a bag of DOM/CSS fixes. Start
reading at [`src/content/main.js`](../src/content/main.js) → `init()`.
</content>
