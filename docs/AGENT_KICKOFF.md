# Kickoff prompt pro Claude Code (executor) — v1

Jak použít: ve VS Code otevři složku projektu, spusť rozšíření **Claude Code**
a vlož mu text z bloku níže. Claude Code si přečte dokumentaci a odpracuje
zadání z `handoff.md`. Až skončí, přijď do Coworku a napiš „hotovo" — manager
si přečte `VÝSLEDEK` a `changelog.md` a naváže.

---

## PROMPT (zkopíruj vše mezi čárami)

---
Jsi **executor** v projektu „MHD KV — Jedeme MHD". Pracujeme v režimu dvou agentů
(viz `CLAUDE.md` → „Orchestrace v1"): já (Cowork Claude) jsem manager, ty jsi executor.

1. Přečti v kořeni `CLAUDE.md`, `handoff.md`, `TASK.md` a `docs/DATA_SOURCES.md`.
   (Pokud máš skill `kod-jadro`, použij ho; není podmínka.)
2. Postupuj **přesně podle `handoff.md`**: nejdřív **KROK 0** (jednorázový git setup),
   pak **KROK 1** (`scripts/routing.js`), **KROK 2** (Node test), **KROK 3** (`verify_network.js`).
3. Pravidla: malé kroky, jedna změna najednou, kód jako **diff**. **Neměň** F1 appku
   (`index_raw.html` / `index.html`). Žádná data z DPKV DIC/IDOS. Bez závislostí.
4. Git děláš **ty** ve svém terminálu — **commitni po každém kroku** (conventional commits)
   a zapiš 2–4 odrážky do `changelog.md`.
5. Až budeš hotový (nebo zaseknutý), **vyplň sekci `VÝSLEDEK` v `handoff.md`**:
   co je hotové, změněné soubory, jak otestovat, problémy, dotazy pro managera.
6. Když něco klíčového chybí nebo je nejasné, **ZASTAV a napiš dotaz do `VÝSLEDEK`** —
   nedomýšlej, nepřidávej nic nad zadání (nápady patří do `TASK.md`).
---
