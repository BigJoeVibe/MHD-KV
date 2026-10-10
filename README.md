# MHD KV — „Jedeme MHD"

Osobní webová appka s odjezdy MHD autobusů v Karlových Varech — rychlý přehled
„kdy mi to jede" z domových zastávek do centra. Statická stránka běžící na
GitHub Pages, laděná na mobil.

## Instalace / spuštění

Není potřeba build ani instalace.

- **Lokálně:** stáhni repo a otevři `index.html` v prohlížeči
  (Chrome / Firefox / Safari na mobilu).
- **Online:** nasazeno přes GitHub Pages z repa `BigJoeVibe/MHD-KV`
  (branch `main`) — commit do `main` se projeví do ~1 minuty.

## Použití

Čtyři taby: **Moje trasy** (vlastní oblíbené trasy, upravíš tlačítkem „Upravit Moje trasy"),
**Tabule** (všechno, co jede ze zastávky), **Hledat** (spojení A → B) a **Nastavení**
(vyhledávání, přestupy, záloha a přenos tras mezi zařízeními). Přepínač **Teď** × **Jindy**.
Klepnutím na číslo linky otevřeš její jízdní řád na dpkv.cz. Optimalizováno pro mobil, tmavý motiv.

## Verze

Aktuální: **v0.2.0**. Schéma verzí a plán fází viz `changelog.md`,
`TASK.md` a `docs/ROADMAP.md`.

## Autor

Osobní projekt (Big Joe). Data: CIS JŘ (JrUtil GTFS), denně obnovovaná přes GitHub Actions.
