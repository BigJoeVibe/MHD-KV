# Handoff — EXECUTOR spec (J8b: GitHub Actions workflow pro automatickou obnovu dat)

> 🟢 **AKTIVNÍ ZADÁNÍ (manager, 2026-07-23).** J8a (`update_data.js` + guard) i J8-fix (refresh-stabilita,
> guard reálně prošel 26/26 na čerstvých datech) jsou HOTOVÉ. Teď **poslední kus J8 — automatizace bez lidí.**
> Rozhodnutí Joe (23.7.): **A) auto-commit rovnou do `main`** (guard je „ventil" místo člověka) + **denní cron**.
> Archiv J8-fix je v gitu (`d8c7456`, `aba419b`) a `changelog.md`.

> **Předávka pro nižšího CC (executor).** Implementuj dle bodů, **nic nad zadání**. Git děláš ty.
> Commit + krátký test/ověření po každém kroku.

## Jak začít
1. „Použij skill **kod-jadro**."
2. Přečti `CLAUDE.md`, `TASK.md` (sekce TEĎ), `docs/DATA_SOURCES.md` (→ „Aktualizace dat — architektura"
   a „Rizika"), `scripts/update_data.js`, tento soubor.
3. **Před prvním commitem** commitni necommitnuté manager docs (`handoff.md`, `TASK.md`).

---

## Kontext (POTVRZENO, neodvozovat znovu)
- `scripts/update_data.js` (J8a): stáhne GTFS → filtr KV → `build_network.js` → **guard** (validní JSON +
  prahy linky≥20/zast≥140/spoje≥9000 + pokles ≤20 % + `verify_network.js` FAIL:0). Při FAIL → rollback +
  **nenulový exit**. Při úspěchu zapíše `data/data_source_state.json` (má `lastModified`, `size`, `counts`).
- Guard je refresh-stabilní (J8-fix) → auto-commit je bezpečný: špatná data se **nezapíšou**.
- **GitHub Pages deployuje z `main` automaticky** (~1 min po commitu). Repo: `BigJoeVibe/MHD-KV`.
- Runner `ubuntu-latest` má `curl`, `unzip`, Node — stejné nástroje jako lokálně. Disk ~14 GB (ZIP 123 MB +
  stream 1,4 GB se vejde).

---

## J8b-1 — `update_data.js`: levný „Last-Modified" pre-check + `--force`

Aby denní běh **zbytečně nestahoval 123 MB**, když se zdroj nezměnil:
- Na začátku udělej **HTTP HEAD** (nebo `curl -sI`) na zdrojovou URL → přečti `Last-Modified` (příp. `Content-Length`).
- Porovnej s `lastModified` uloženým v `data/data_source_state.json`. **Když se shodují → skonči brzy**
  (exit 0, výpis „zdroj beze změny, přeskočeno"), NEstahuj, NEbuilduj.
- Přidej přepínač **`--force`** (a/nebo env `FORCE=1`), který pre-check přeskočí a stáhne vždy —
  pro ruční `workflow_dispatch` a pro test.
- Když se `Last-Modified` liší → pokračuj celým dosavadním pipelinem (stáhnout → filtr → build → guard).
- Ošetři, když zdroj `Last-Modified` nevrací (fallback: stáhni vždy, ať se nezasekne).

**Commit J8b-1** + test: spusť 2× po sobě bez `--force` → první může stáhnout, druhý musí hlásit „beze změny"
a nestahovat; s `--force` stáhne vždy.

---

## J8b-2 — `.github/workflows/update-data.yml`

```yaml
name: update-data
on:
  schedule:
    - cron: '0 3 * * *'        # 03:00 UTC denně (pozn. UTC — v ČR 04:00/05:00)
  workflow_dispatch:            # ruční spuštění (tlačítko v Actions) — pustí s FORCE=1
permissions:
  contents: write               # aby GITHUB_TOKEN mohl commitnout
concurrency:
  group: update-data
  cancel-in-progress: false
jobs:
  update:
    runs-on: ubuntu-latest
    timeout-minutes: 20
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '20' }
      - name: Run update
        run: node scripts/update_data.js
        env:
          FORCE: ${{ github.event_name == 'workflow_dispatch' && '1' || '' }}
      - name: Commit changes (jen když se něco změnilo)
        run: |
          git config user.name  "github-actions[bot]"
          git config user.email "github-actions[bot]@users.noreply.github.com"
          git add data/network.json data/data_source_state.json
          if git diff --cached --quiet; then
            echo "Žádná změna dat — necommitovat."
          else
            git commit -m "chore(data): automatická obnova jízdních řádů $(date -u +%F)"
            git push
          fi
```
- **Klíč:** guard je uvnitř `update_data.js` → když data nejsou zdravá, skript **skončí nenulově**,
  krok „Run update" selže → job je červený (GitHub pošle e-mail) a **žádný commit se nestane**. Přesně
  chtěné chování (radši stará platná data).
- Ověř, že `git push` z workflow funguje (default `GITHUB_TOKEN` + `permissions: contents: write`).

**Commit J8b-2.**

---

## J8b-3 — Keepalive proti 60dennímu auto-vypnutí

GitHub **vypne scheduled workflow po 60 dnech bez commitu** do repa (tiše, jen e-mail). JŘ se mění řídce →
hrozí. Řešení (nízký šum):
- Po datovém kroku: když **NEnastala** změna dat a **poslední commit na `main` je starší než ~50 dní**,
  udělej **keepalive commit** — bump `lastChecked` v `data/data_source_state.json` (`git commit`/`push`).
- Jinak nic (běžně se necommituje každý den).
- Implementuj buď jako další krok ve stejném workflow (spočítej `git log -1 --format=%ct` stáří), nebo malou
  logikou v `update_data.js`. Drž to jednoduché a **idempotentní**.

**Commit J8b-3** + do `VÝSLEDEK` napiš, jak keepalive funguje.

---

## J8b-4 — Ověření na reálném runneru (ne jen lokálně)

- Po mergi do `main` spusť workflow ručně přes **Actions → update-data → Run workflow** (`workflow_dispatch`,
  poběží s `FORCE=1`). Ověř: job zelený, stáhne, guard projde, a **buď** commitne obnovená data (pokud se liší
  od repa), **nebo** čistě skončí bez commitu (když jsou data shodná).
- Zkontroluj log: čas běhu, počty po filtru, guard PASS. Zkontroluj, že se v repu neobjevil `data_raw/`
  (má být gitignored) ani dočasné soubory.
- Do `VÝSLEDEK` napiš: odkaz/čas běhu, co se stalo (commit / beze změny), případné úpravy oproti specu.

---

## Rizika / na co dát pozor
- **Cron není přesný na minutu** (u denního běhu nevadí). UTC — neřeš letní/zimní čas.
- **Velký soubor:** `stop_times` 1,38 GB streamem (už řeší `update_data.js`) — na runneru hlídej `timeout-minutes`.
- 📌 **Licence [k dořešení]:** před veřejným/ostrým během ověřit podmínky užití GTFS (JrUtil/CIS) + **uvést
  atribuci**. Neblokuje technicky J8b, ale zapiš jako must-do před „vypuštěním do světa" (už je v `TASK.md`/`DATA_SOURCES.md`).

---

## Mimo scope J8b (NEIMPLEMENTOVAT)
- Front-end fetch `network.json` za běhu = **J4** (bez toho se auto-obnova k uživateli nedostane — ale to je
  úkol UI fáze, ne J8).
- Vlastní stabilní id zastávek / registr = budoucí (viz `TASK.md`, váže se na J4/J6).

---

## VÝSLEDEK (vyplní executor)

**J8b-1, J8b-2, J8b-3 hotové a pushnuté na `main` (commity `f575a0f`, `a5d51db`, `3f56e75`).
J8b-4 čeká na ruční spuštění — viz níže, potřebuje Joeovu akci v prohlížeči.**

- **J8b-1** (`scripts/update_data.js`): přidán `isForced()` (`--force` nebo env `FORCE=1`/`true`) a
  `headLastModified()` (levný `curl -sI` bez stažení 123MB ZIPu). Na začátku `main()`: bez force se
  porovná HEAD `Last-Modified` s uloženým stavem (`data/data_source_state.json`) — při shodě skript
  vypíše „zdroj beze změny — přeskočeno" a skončí (exit 0) bez stažení/buildu. Když HEAD selže nebo
  hlavička chybí → fallback pokračuje stažením (ať se pipeline nezasekne). **Testováno 3×:** (1) beze
  změny zdroje → přeskočeno za 0,2 s; (2) `--force` → plný běh, guard 26/26 PASS, 51,4 s (data beze
  změny oproti předchozímu buildu, jen `updatedAt` v state se posunul); (3) znovu bez `--force` po
  forced běhu → opět přeskočeno (idempotence potvrzena).
- **J8b-2** (`.github/workflows/update-data.yml`): denní cron `0 3 * * *` (UTC) + `workflow_dispatch`
  (posílá `FORCE=1`). Krok „Commit changes" commitne `data/network.json` + `data_source_state.json`
  jen když se liší (`git diff --cached --quiet`), jinak nic. `permissions: contents write` pro push
  přes `GITHUB_TOKEN`, `concurrency` group proti souběžným během. Přesně dle specu.
- **J8b-3** (keepalive): přidán jako další krok ve stejném workflow (ne v `update_data.js`, dle
  nabízené varianty ze specu) — spustí se jen `if: steps.commit_data.outputs.committed == 'false'`.
  Spočítá stáří posledního commitu (`git log -1 --format=%ct`); když je `>=50` dní, bumpne `lastChecked`
  v `data_source_state.json` a commitne/pushne. Jinak (běžný den, žádná datová změna, commit mladší
  než 50 dní) se nic neděje — žádný šum v historii. Idempotentní.
- **Push:** `git push` proveden (repo `BigJoeVibe/MHD-KV`, `main` je teď `3f56e75`) — workflow soubor
  musí být na `main`, aby ho GitHub Actions vůbec viděl/nabídl k ručnímu spuštění.

**J8b-4 (ověření na reálném runneru) — NEDOKONČENO, čeká na Joea:**
- Nemám k dispozici `gh` CLI ani GitHub token s právem `workflow_dispatch` (nekonfigurováno v tomto
  prostředí) → nemůžu workflow spustit ručně sám. **Repo je public**, takže čtení stavu běhu přes
  API/web jde bez auth, ale spuštění potřebuje kliknutí v prohlížeči nebo autentizovaný `gh`/token.
- **Prosba na Joea:** GitHub → repo `BigJoeVibe/MHD-KV` → tab **Actions** → workflow **update-data**
  (levý panel) → tlačítko **Run workflow** (větev `main`) → **Run workflow**. Poběží s `FORCE=1`
  (stáhne vždy, i když zdroj nezměněn od včerejška).
- Po doběhnutí (řádově do 2 minut dle lokálních testů, `timeout-minutes: 20` jako pojistka) zkontroluj:
  job zelený, log ukazuje `GUARD: ... PASS` / `SOUHRN PASS: 26, FAIL: 0`, a buď proběhl commit
  „chore(data): automatická obnova..." (pokud se data od posledního lokálního běhu liší), nebo skončil
  čistě beze commitu (data shodná — pravděpodobnější, protože lokální `--force` běh proběhl dnes,
  23.7., těsně předtím).
- Dej vědět výsledek (zelené/červené, commit/bez commitu) — dopíšu sem detail a uzavřu J8 jako celek.

**Problémy/nápady:** žádné nové technické. Otevřené (mimo scope, do budoucna): licence GTFS atribuce
(už v `TASK.md`), `data_raw/` v repu zkontrolovat po prvním reálném běhu na runneru (má zůstat
gitignored, lokální testy to potvrdily).
