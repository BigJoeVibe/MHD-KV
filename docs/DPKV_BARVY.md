# Barvy linek DPKV — zdroj, rekonstrukce a použití v appce

Podklad pro **krok B** (barevné odznaky linek). Rozhodnuto Joem 14. 8. 2026:
oficiální barvy DPKV + **barva číslice se volí automaticky** podle kontrastu.

## Odkud to je (a odkud to NENÍ)

| zdroj | výsledek |
|---|---|
| GTFS `data_raw/kv_gtfs/routes.txt`, pole `route_color` | **prázdné u všech 132 záznamů** — ověřeno |
| Dopravní portál `dopravniportal.dpkv.cz` (CSS) | žádné barvy linek |
| **Schéma linek DPKV** `Schema-linek-DPKV_2025_2.webp`, platné od 1. 1. 2025 | ✅ jediný oficiální zdroj |

Zdrojová stránka: <https://www.dpkv.cz/cms/schema-linek/>

⚠️ **Hodnoty níže jsou [ODHAD] — rekonstrukce, ne oficiální brand hexy.** Odečteny z legendy
„Linkové vedení jednotlivých linek" ve schématu: obrázek načten do canvasu, z každého odznaku vzat
medián pixelů v prstenci mimo bílou číslici a mimo zaoblené rohy. Ověřeno vizuálně — vzorky
vykresleny vedle skutečných odznaků a porovnány. Obrázek je ztrátově komprimovaný (WebP), takže
odchylka jednotek na kanál je jistá. Kdyby DPKV někdy vydalo grafický manuál nebo vektorové schéma,
je to lepší zdroj a hodnoty se mají přepsat.

## Paleta

`fg` = barva číslice, zvolená podle kontrastu (viz níže). `poměr` = kontrast číslice vůči pozadí.

| linka | pozadí | fg | poměr | linka | pozadí | fg | poměr |
|---|---|---|---|---|---|---|---|
| 1 | `#2f2a84` | bílá | 11,76 | 13 | `#cd5342` | tmavá | 4,58 |
| 2 | `#5196cd` | tmavá | 5,53 | 15 | `#93be9e` | tmavá | 8,49 |
| 3 | `#928ebb` | tmavá | 5,72 | 16 | `#ca4169` | bílá | 4,70 |
| 4 | `#e5a9aa` | tmavá | 8,89 | 17 | `#ecba5e` | tmavá | 9,87 |
| 5 | `#9cb6de` | tmavá | 8,53 | 19 | `#aec763` | tmavá | 9,37 |
| 6 | `#6caa61` | tmavá | 6,35 | 21 | `#798193` | tmavá | 4,51 |
| 7 | `#d8b986` | tmavá | 9,41 | 22 | `#e19f5a` | tmavá | 7,82 |
| 8 | `#874686` | bílá | 6,46 | 23 | `#ce6c7b` | tmavá | 5,08 |
| 9 | `#f2cb5c` | tmavá | 11,33 | **51** | `#491a28` | bílá | 14,37 |
| 11 | `#7b997e` | tmavá | 5,63 | **52** | `#1b2e41` | bílá | 13,87 |
| 12 | `#a9936e` | tmavá | 5,95 | | | | |

**Bílá = `#ffffff`, tmavá = `#0a0c0f`.**

## Proč se barva číslice počítá

Appka má tmavý theme a odznaky měly natvrdo bílý text. Na paletě DPKV to nefunguje:
**16 z 21 barev nesplní s bílým textem 4,5 : 1 (WCAG AA), 10 z nich nesplní ani 3 : 1.**
Nejhorší je linka 9 (`#f2cb5c`) na **1,56 : 1** — žlutá s bílou číslicí je prakticky nečitelná.
DPKV má na tištěné mapě bílé číslice všude, ale tam jde o velký odznak na bílém papíře.

Řešení: barva pozadí zůstává **přesně** podle DPKV, mění se jen číslice — bílá, nebo tmavá,
podle toho, která má vůči pozadí vyšší kontrast.

**Proč zrovna `#0a0c0f` a ne čistá černá:** je to nejsvětlejší odstín, se kterým **všechny** linky
projdou AA. Naměřeno — nejhorší poměr po volbě barvy:

| tmavá | nejhorší poměr | |
|---|---|---|
| `#000000` | 4,70 (linka 16) | ✓ AA |
| **`#0a0c0f`** | **4,58 (linka 13)** | **✓ AA — použít** |
| `#10141a` | 4,32 (linka 13) | ✗ |
| `#14181f` | 4,28 (linka 13) | ✗ |
| `#1a1f28` | 4,23 (linka 21) | ✗ |

Kdyby se paleta někdy měnila, tuhle tabulku přepočítat — hranice je citlivá zejména u linek
13, 16 a 21.

## Linky, které barvu nemají

Naše data znají **23 linek**; schéma DPKV pokrývá **21** (19 denních + 2 noční).
**Chybí linky 20 a 44** — DPKV je vede mimo hlavní schéma jako zvláštní linky.

Linka 20 je zrovna ta kyvadlovka `Lázně I ↔ Parkoviště KOME`, kvůli které vznikl krok D.

📌 **K dořešení:** buď nechat neutrální odznak (dnešní `var(--bg4)`), nebo dohledat barvu na
stránce „Zvláštní linky" DPKV. Zatím platí neutrální odznak.

## Co tím odchází

Stará paleta z F1 (`.line-3`, `.line-9`, `.line-13`, `.line-15`, `.line-51` v `index_raw.html`)
byla vlastní vynález pro 5 linek staré appky a **stejně nikdy nefungovala** —
`KNOWN_LINE_CLASSES` byl `Set` stringů, ale `line` z `network.json` je číslo, takže `.has()`
nikdy nesedlo. Detail v `TASK.md` → krok B.
