# DATA_FORMAT — struktura dat v appce

**POVINNÉ ČTENÍ před jakoukoli editací `DATA.routes`.** Pojmenování typů dne je matoucí a snadno způsobí bug.

---

## Lokace v souboru

V `index_raw.html` je objekt `DATA` ihned za `<script>` tagem (~řádky 130–430). Struktura:

```js
const DATA = {
  routes: [ /* pole objektů linek */ ],
  holidays: [ /* "M-D" řetězce státních svátků */ ],
  holidayPeriods: [ /* { from: "MM-DD", to: "MM-DD" } pro školní prázdniny */ ]
  // Poznámky jsou nově per-route (route.notes), ne globální DATA.notes
};
```

---

## `routes[]` — jedna linka × jeden směr × jedna výchozí zastávka

```js
{
  id: "line3_kratka",              // unikátní string, snake_case
  line: "3",                        // číslo linky jako string
  from: "Krátká",                   // název výchozí zastávky (kde Joe nastupuje)
  to: "Tržnice",                    // název cílové zastávky
  travelMinutes: 13,                // doba jízdy z `from` do `to` v minutách
  colorClass: "line-3",             // CSS třída pro barvu badge
  validFrom: "1.12.2025",           // datum platnosti jízdního řádu (zobrazuje se v UI)
  dpkvUrl: "https://www.dpkv.cz/_data/d-3/3102.htm",  // URL DPKV stránky zastávky
  warnings: [                       // pole výluk/upozornění, může být []
    { text: "Výluka do 30.6.2026", validUntil: "2026-06-30" }
  ],
  notes: {                          // mapa písmeno → text (per-route, ne globální!)
    "L": "jede jen do zastávky Lidická"
  },
  departures: {
    workday:         { /* hodina → ["minuty"] */ },
    workday_holiday: { /* hodina → ["minuty"] nebo null */ },
    weekend:         { /* hodina → ["minuty"] */ },
    xmas_night:      { /* jen linka 51 */ },
    nye_night:       { /* jen linka 51 */ }
  }
}
```

---

## ⚠️ POZOR — Typy dne (5 kategorií, ne 3)

| Klíč v datech | Co to reálně je | Kdy platí |
|---|---|---|
| `workday` | Pracovní den | Po–Pá, mimo svátky a prázdniny |
| `workday_holiday` | Pracovní den o školních prázdninách | Po–Pá v prázdninovém období (léto, vánoce) |
| `weekend` | Víkend a státní svátky | So, Ne + všechny státní svátky |
| `xmas_night` | Vánoční noční provoz (linka 51) | 24.12. od 18:00 do 25.12. do 13:00 |
| `nye_night` | Silvestrovský noční provoz (linka 51) | 31.12. od 22:00 do 1.1. do 13:00 |

**Fallback logika (`getEffectiveDayType`):**
- Pokud route nemá daný typ → použije se: `xmas_night→weekend`, `nye_night→weekend`, `workday_holiday→workday`
- Linka 9 má `workday_holiday: null` → padá na `workday`

**DPKV sloupce → naše typy:**
- „Pondělí–pátek mimo prázdnin" → `workday`
- „Pondělí–pátek o prázdninách" → `workday_holiday`
- „Sobota, neděle, svátek" → `weekend`

---

## Formát odjezdů

```js
workday: {
  5: ["42"],
  6: ["06", "30", "54L"],   // "54L" = 6:54, jede jen do Lidické
  7: ["16L", "42"],
  ...
}
```

- Klíče: čísla hodin 0–23, chybějící hodina = žádný odjezd
- Hodnoty: pole stringů. Číslo + optional suffix písmen (poznámka)
- Linka 51 (noční): klíče 22–23 + 0–6 (přechod přes půlnoc)

---

## Warnings (výluky a upozornění)

```js
warnings: [
  { text: "Výluka do 30.6.2026", validUntil: "2026-06-30" }
]
```

- `validUntil` ve formátu `"YYYY-MM-DD"` — po tomto datu warning zmizí automaticky
- Prázdné pole `[]` = žádné upozornění
- Funkce `getActiveWarnings(route, now)` filtruje dle dnešního data

**Kdy aktualizovat:** po skončení výluky linky 9 (30.6.2026) — vymazat warnings pole A aktualizovat data odjezdů na normální trasu (d-9/, ne d-9a/).

---

## Poznámky (notes) — nově per-route

```js
notes: {
  "L": "jede jen do zastávky Lidická",
  "D": "z Horního nádraží pokračuje jako linka 11 směr Divadelní náměstí",
  "T": "jede jen do zastávky Tržnice"
}
```

- Každá route má vlastní `notes` objekt (ne sdílený `DATA.notes` jako dřív)
- Legenda v odjezdovém tabu zobrazuje jen písmena přítomná v aktuálně viditelných spojích
- Legenda v jízdním řádu zobrazuje vždy celou notes mapu dané route

---

## CSS třídy barev linek

```css
.line-3  { background: #1e4080; }
.line-9  { background: #7a4b10; }
.line-13 { background: #8b2d42; }
.line-15 { background: #1a7a5a; }
.line-51 { background: #111111; border: 1px solid #333; }
.line-51 span { color: #f0728a; }
```

Při přidání nové linky MUSÍŠ přidat `.line-X` CSS třídu, jinak badge bude bez stylu.

---

## Klíčové funkce (referenčně)

| Funkce | Co dělá |
|---|---|
| `getDayType(date)` | Vrací jeden z 5 typů dne pro dané datum/čas |
| `getEffectiveDayType(route, dayType)` | Fallback — najde nejbližší dostupný typ dne pro danou route |
| `getActiveWarnings(route, now)` | Vrací warnings, jejichž `validUntil` ještě nenastal |
| `getUpcomingDepartures(route, dayType, now, count)` | Nejbližší odjezdy, řeší přechod přes půlnoc pro noční linky |

---

## Test po editaci

1. Otevři `index.html` lokálně
2. Tab „Odjezdy" → „Jindy" → zkus: pondělí (workday), letní pondělí (workday_holiday), sobotu (weekend), 1.1. (weekend), 24.12. 20:00 (xmas_night pro linku 51)
3. Zkontroluj, že se zobrazuje správná legenda a případné warnings
