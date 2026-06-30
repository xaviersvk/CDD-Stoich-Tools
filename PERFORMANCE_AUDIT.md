# Performance audit — CDD-Stoich-Tools

_Vytvorené: 2026-06-30 (nekomitovať)_  
_Opravené: 2026-06-30 — pozri sekciu [Aplikované opravy](#aplikované-opravy) na konci dokumentu_

---

## 1. Prefix-color storage — koľko prefixov sa uloží?

**Súbor:** `src/shared/prefix-colors.js`  
**Storage kľúč:** `"cddPrefixColors"` (`chrome.storage.local`)  
**Dátová štruktúra:** prostý JS objekt `Record<prefix, hexColor|"">`, napr.
```json
{ "IXX-CL": "#1976d2", "PHA": "" }
```

### Limit

V kóde **neexistuje žiadny explicitný strop počtu prefixov.** Limity sú iba infraštruktúrne:

| Zdroj limitu | Hodnota |
|---|---|
| `chrome.storage.local` kvóta | 10 MB (default per-extension) |
| Jeden záznam (prefix + farba, JSON) | ~20–35 bajtov |
| Teoretické maximum pri 10 MB | ~300 000 – 500 000 prefixov |

V praxi sa toto číslo nikdy nedosiahne — prefix je odvodený z ID vzorky (napr. `IXX-CL-0000002-001-SM003035 → IXX-CL`), takže počet unikátnych prefixov odráža počet projektov/sérií vo vault-e, zvyčajne desiatky až nízke stovky.

Navyše platí:
- **`seenPrefixes` Set** (riadok 155) žije iba v pamäti počas session — po refreshi sa vyprázdni, no uložené záznamy v storage zostanú.
- **`changeListeners` Set** (riadok 151) — ďalší in-memory Set bez limitu, no v praxi drží 1–3 callbacky.
- Auto-discovery (funkcia `recordSampleIdPrefix`, riadok 214) nikdy neprepisuje existujúce záznamy, iba pridáva nové s prázdnou farbou.

---

## 2. Potenciálne performance problémy

### 2.1 Množstvo súbežných MutationObserver-ov

Toto je **najväčší systémový problém.** Každá mutácia DOM-u (napr. rerender MUI komponentu, Turbo navigácia, tooltip update) sa doručí do **6 až 8 observerov naraz**, pričom každý volá vlastný callback.

| Observer | Kde sleduje | Scope | Súbor |
|---|---|---|---|
| `watchUrlChanges` | `document.documentElement` | `childList, subtree` | `url-watcher.js:15` |
| `startDepletedMarkerObserver` | `document.documentElement` | `childList, subtree` | `depleted-marker.js:89` |
| `initInventoryGridColors` | `document.documentElement` | `childList, subtree` | `inventory-grid-colors.js:146` |
| `watchInventoryWellStructure` | `document.documentElement` | `childList, subtree, attributes(href)` | `inventory-well-structure.js:197` |
| `watchFileDialog` | `document.body` | `childList, subtree` | `main.js:42` |
| `watchKetcherDialog` | `document.body` | `childList, subtree` | `overlay-watcher.js:26` |
| `observeCopyableFields` | `document.body` | `childList, subtree` | `copyable-fields.js:164` |
| `watchConsumedBatches` | `document.body` | `childList, subtree, characterData, attributes(class)` | `consumed-batches-collapse.js:229` |

**Pozn.:** Väčšina callbackov je debounced cez `requestAnimationFrame` alebo `setTimeout`, čo zmierňuje dopad. Napriek tomu prehliadač musí doručiť udalosť do každého observera pri každej mutácii.

---

### 2.2 `watchConsumedBatches` — `characterData: true`

**Súbor:** `consumed-batches-collapse.js:229`

Observer má zapnuté `characterData: true` (bez filtrovania). Každá zmena textu kdekoľvek v `<body>` (vrátane dynamicky menených hodnôt, živých tickerov, atď.) spustí callback. Hoci je debounced cez rAF, samotný callback `collapseConsumedBatches()` vykonáva:

```js
document.querySelectorAll('#molecule-batches td[data-editable-cell-label="Consumed"]')
```

…čo je úplný scan tabuľky. Na stránke s veľa batch-mi (stovky riadkov) to môže byť pomalé.

---

### 2.3 `markDepletedSamplesInSelector` — `innerText` spôsobuje reflow

**Súbor:** `depleted-marker.js:50–73`

Funkcia sa volá pri každej mutácii (cez depleted observer). Pre každý `input[type="radio"]` číta `.innerText` alebo `.textContent` wrappera. Problém:

- `.innerText` **spúšťa layout reflow** (prehliadač musí prepočítať štýly a rozloženie pred vrátením hodnoty), na rozdiel od `.textContent`.
- Riadky 65 a 46: `wrapper.innerText || wrapper.textContent` — vždy sa skúsi `innerText` prvý.
- Pri stránke so stovkami radio-buttonov (napr. picker lokácií s mnohými pozíciami) to môže blokovať rendering.

---

### 2.4 `setInterval(check, 700)` v `url-watcher`

**Súbor:** `url-watcher.js:21`

```js
setInterval(check, 700);
```

URL sa sleduje aj MutationObserverom (riadok 15) a zároveň intervalom každých 700 ms. Interval je redundantný — MutationObserver zachytí Turbo/SPA navigácie skôr. Intervalový timer beží počas celej session bez možnosti zastavenia.

---

### 2.5 `mousemove` listener s `.closest()` na každý pohyb myšou

**Súbor:** `plate-location-tooltip.js:175`

```js
document.addEventListener("mousemove", (event) => {
    if (activePath === null || bubble?.hidden) return;
    if (!event.target.closest?.(PLATE_LINK_SELECTOR)) return;
    positionBubble(event);
});
```

Má dobrý early-exit guard (`activePath === null`), takže väčšinu času sa neexekutuje. Avšak keď je tooltip viditeľný, `.closest(PLATE_LINK_SELECTOR)` sa volá pri každom pohybe myšou (~60×/s). Nie je to kritické, ale zbytočné — stačilo by prepnúť na `mouseleave` na samotnom linku namiesto `mousemove` + `closest`.

---

### 2.6 `findCopyableFieldNodes` — 12 DOM query volaní naraz

**Súbor:** `copyable-fields.js:92`

```js
CONTAINER_SELECTORS.forEach((containerSelector) => {   // 3 selektory
    VALUE_SELECTORS.forEach((valueSelector) => {         // 4 selektory = 12 volaní
        container.querySelectorAll(valueSelector)
    });
});
```

Plus pre každý nájdený uzol ďalší `querySelector("a, button, input, textarea, select")` v `hasInteractiveContent`. Debounce je 200 ms, takže na bežné stránky to nestačí byť problém — na stránkach s tisíckami uzlov (`#molecule-batches-container`) by to mohlo byť badateľné.

---

### 2.7 `initInventoryGridColors` — full-page MutationObserver repaints grid pri každej mutácii

**Súbor:** `inventory-grid-colors.js:145–153`

```js
const observer = new MutationObserver(scheduleRecolor);
observer.observe(document.documentElement, { childList: true, subtree: true });
```

Každá mutácia kdekoľvek v dokumente (vrátane nesúvisiacich komponentov) zaradí `recolor()` do budúceho animation frame. `recolor()` robí:

```js
document.querySelector(GRID_SELECTOR);
grid.querySelectorAll(CELL_SELECTOR);
```

Keď grid nie je zobrazený, prvý querySelector vráti `null` a funkcia hneď skončí — to je OK. Ale keď je grid otvorený a stránka je aktívna (napr. tooltip updates, iné MUI eventy), `recolor` prebehne na každý frame s mutáciou.

---

### 2.8 `localStorage.setItem` synchrónne na každý `mousemove` pixel počas resize

**Súbor:** `location-picker-resize.js:130–137`

```js
function onMouseMove(moveEvent) {
    const delta = moveEvent.clientX - startX;
    const newWidth = clamp(startWidth + delta, MIN_WIDTH, MAX_WIDTH);
    applyWidth(treeContainer, newWidth);
    localStorage.setItem(STORAGE_KEY, String(newWidth)); // synchronous disk I/O
}
```

`localStorage.setItem` je synchrónna operácia (blokuje main thread). Volá sa pri každom pixeli pohybu myšou počas resize — potenciálne stovky volaní za sekundu.

---

### 2.9 `fetch-hook.js` / `xhr-hook.js` — čítanie celého tela KAŽDÉHO sieťového requestu

**Súbor:** `src/inject/hooks/fetch-hook.js`

Každý `fetch` call CDD aplikácie je interceptovaný. Pre každú odpoveď sa zavolá `.clone()` a telo sa úplne prečíta cez `await clone.text()` — vrátane obrazkov, HTML stránok a analytiky. Pre veľké HTML odpovede (výsledky vyhľadávania) to znamená čítanie megabajtov textu iba pre JSON.parse pokus.

Rovnaká situácia v `src/inject/hooks/xhr-hook.js` cez `this.responseText`.

---

### 2.10 `eln-title.js` — spread všetkých `<div>` elementov pri hľadaní ID

**Súbor:** `src/content/features/eln-title.js:62–69`

```js
const idElement = [...document.querySelectorAll("div")]
    .find(el => el.textContent?.trim().startsWith("ID:"));
```

Rozkopíruje celý NodeList všetkých `<div>` na stránke do haldy a číta `.textContent` každého z nich. Volaná v callbacku MutationObservera na navigačné zmeny aj pri title updatech.

---

### 2.11 `filter-default.js` — `getBoundingClientRect()` v slučke

**Súbor:** `src/content/features/ui-fixes/filter-default.js`

`getVisibleOptionLabels()` a `getVisibleMuiOptions()` volajú `getBoundingClientRect()` na každom `[data-autotest-id="option-label"]` resp. `[role="option"]` elemente. `getBoundingClientRect()` vynúti synchrónny layout flush. Tieto funkcie sa volajú v kritickej ceste otvárania dropdownu.

---

### 2.12 `multi-position-sample-create/init.js` — `headings()` scan pri každej mutácii

**Súbor:** `src/content/features/multi-position-sample-create/init.js:107–115`

```js
function headings() {
    return [...document.querySelectorAll("h1,h2,h3,.MuiDialogTitle-root")]
        .map(h => (h.textContent || "").trim())
        .filter(Boolean);
}
```

Volaná dvakrát pri každom `scan()` (raz pre `isCreateSampleDialogOpen`, raz pre `isPickLocationDialogOpen`). `scan()` je volaná MutationObserverom na `document.documentElement`.

---

## Súhrn — zoradené podľa závažnosti

| # | Problém | Súbor | Závažnosť | Stav |
|---|---|---|---|---|
| 1 | `fetch-hook` číta telo každého sieťového requestu | `fetch-hook.js`, `xhr-hook.js` | Vysoká | **Opravené** |
| 2 | 8–15 súbežných MutationObserver-ov sledujúcich celý dokument | viaceré | Stredná–Vysoká | Zostatok |
| 3 | `localStorage.setItem` synchrónne na každý `mousemove` pixel | `location-picker-resize.js:137` | Stredná | **Opravené** |
| 4 | `innerText` v `markDepletedSamplesInSelector` spôsobuje layout reflow | `depleted-marker.js:65` | Stredná | **Opravené** |
| 5 | `characterData: true` v `watchConsumedBatches` + triple setTimeout na hashchange | `consumed-batches-collapse.js:229` | Stredná | Zostatok |
| 6 | `[...document.querySelectorAll("div")]` spread všetkých divov + `.textContent` | `eln-title.js:63` | Stredná | **Opravené** |
| 7 | `getBoundingClientRect()` v slučke pri otváraní dropdownu | `filter-default.js` | Stredná | Zostatok |
| 8 | `setInterval(check, 700)` redundantný popri MutationObserveri | `url-watcher.js:21` | Nízka | Zostatok |
| 9 | `mousemove` + `.closest()` pri aktívnom tooltip-e | `plate-location-tooltip.js:175` | Nízka | Zostatok |
| 10 | 12× `querySelectorAll` + `hasInteractiveContent` per enhanceCopyableFields | `copyable-fields.js:92` | Nízka | Zostatok |
| 11 | `headings()` — dva querySelectorAll scany pri každej document mutácii | `multi-position-sample-create/init.js:107` | Nízka | Zostatok |
| 12 | `recolor()` spúšťaný každou document mutáciou (keď grid je viditeľný) | `inventory-grid-colors.js:71` | Nízka | Zostatok |

---

## Aplikované opravy

### Čo bolo opravené (2026-06-30)

#### 1. Prefix storage — hard limit 40 prefixov (`src/shared/prefix-colors.js`)

- Pridaná konštanta `MAX_PREFIX_COUNT = 40`.
- Nová funkcia `pruneToMaxPrefixes(map)` pri každom čítaní/zápise orezáva mapu: zachováva prefixes s priradenou farbou (priorita), zvyšok alfabeticky; `sanitizePrefixColorMap` ju volá automaticky.
- `recordSampleIdPrefix` skontroluje `Object.keys(cachedMap).length >= MAX_PREFIX_COUNT` a ignoruje ďalšie auto-objavy po dosiahnutí stropu.
- Existujúce záznamy s farbami sa **nikdy nestratia** (colored entries majú prednosť pri pruning).

**Riziko regresie:** Vaults s viac ako 40 prefixmi stratia auto-discovery nových sérii bez priameho upozornenia. Uživateľ ich môže pridať ručne v popup-e.

---

#### 2. Fetch/XHR hook — čítanie iba JSON odpovedí (`src/inject/hooks/fetch-hook.js`, `src/inject/hooks/xhr-hook.js`)

- `fetch-hook.js`: Pred klonovaním prečíta `content-type` z hlavičky (bez klonovania tela). Ak nie je `application/json` ani `text/json`, vráti response okamžite — žiadny clone, žiadne čítanie tela.
- `xhr-hook.js`: Rovnaká kontrola cez `this.getResponseHeader("content-type")` pred volaním `tryParseText`.
- Odstraňuje hlavný problém: čítanie HTML stránok, CSS, JS bundlov, obrázkov pri každej Turbo navigácii.

**Riziko regresie:** Ak CDD niekde vracia JSON s nesprávnym `content-type` (napr. `text/plain`), tá odpoveď sa preskočí. V praxi CDD API konzistentne vracia `application/json`.

---

#### 3. Resize — `localStorage.setItem` presunutý do `mouseup` (`src/content/features/ui-fixes/location-picker-resize.js`)

- `onMouseMove` aktualizuje iba CSS custom property (synchrónne, bez disk I/O).
- `localStorage.setItem` sa volá raz v `onMouseUp` — šírka sa uloží po pustení myši.
- `lastWidth` sleduje poslednú šírku počas dragu; `dblclick` reset zostal nezmenený.

**Riziko regresie:** Minimálne. Ak prehliadač havaruje počas dragu, šírka sa nestratí (uloží sa pri mouseup). Funkčnosť je identická — šírka sa vizuálne aktualizuje live, ukladá sa po dokončení.

---

#### 4. Depleted marker — `innerText` → `textContent` (`src/content/features/depleted-marker.js`)

- `wrapperMatchesDepleted`: `wrapper?.innerText || wrapper?.textContent` → `wrapper?.textContent`
- `markDepletedSamplesInSelector`: `wrapper.innerText || wrapper.textContent` → `wrapper.textContent`
- Eliminuje forced layout reflow v smyčke per radio button.

**Riziko regresie:** `textContent` vracia text vrátane skrytých elementov (`display:none`) a ignoruje CSS line-breaky, `innerText` nie. Pre účel kontroly či wrapper obsahuje depleted ID je rozdiel zanedbateľný — obe hodnoty obsahujú text identifikátora.

---

#### 5. ELN title — TreeWalker namiesto `[...querySelectorAll("div")]` (`src/content/features/eln-title.js`)

- `getEntryId()` nahradená TreeWalker-om s `NodeFilter.SHOW_ELEMENT` a early-exit pri prvom div-e začínajúcom na `"ID:"`.
- Žiadna alokácia NodeList-u ani heap array-u všetkých divov.
- Správanie identické: depth-first pre-order = rovnaké poradie ako `querySelectorAll`.

**Riziko regresie:** Nulové za predpokladu, že CDD ELN stránky renderujú ID element ako `<div>` s textom začínajúcim `"ID:"`. TreeWalker navštevuje elementy v rovnakom poradí ako `querySelectorAll`.

---

### Build výsledok

```
✓ content.js  440.13 kB │ gzip: 109.65 kB   (built in 1.10s)
✓ inject.js    25.24 kB │ gzip: 6.42 kB     (built in 189ms)
```

Žiadne chyby. Lint ani test skripty nie sú definované v `package.json`.

---

### Zostatok — neopravené problémy (mimo scope)

| Problém | Prečo nebolo opravené |
|---|---|
| 8–15 MutationObserver-ov na dokument | Refaktor by vyžadoval prepísanie každého feature modulu, vysoké riziko regresie |
| `characterData: true` + triple setTimeout v `consumed-batches` | Riziko narušenia logiky batch collapsu |
| `getBoundingClientRect()` v `filter-default.js` | Potrebuje overenie na živej CDD stránke |
| `setInterval` v `url-watcher.js` | Nízky dopad, vyžaduje overenie SPA edge cases pred odstránením |
