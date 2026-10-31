# Profily sušení masa v závěsu (analýza, návrh)

Stav: implementována varianta **B + C** v [profiles.yaml](../esphome/packages/profiles.yaml).

## Co sušička umí ovlivnit

Hardware: ventilátory + HTU21D. Bez topení, chlazení, zvlhčování a vážení.

| Veličina               | Ovlivnitelné | Poznámka                                             |
|------------------------|--------------|------------------------------------------------------|
| Proudění vzduchu       | ano          | výkon ventilátorů; m/s neznáme bez anemometru        |
| Vlhkost v komoře       | částečně     | jen směrem k okolí (výměna vzduchu), nelze zvlhčit   |
| Teplota                | ne           | daná místností (sklep, garáž, byt)                   |
| Úbytek hmotnosti       | ne           | hlavní kritérium hotovosti, vyžaduje tenzometr (HX711) |

Profil proto v praxi určuje: cílovou vlhkost a limity proudění po fázích, délku
programu a **hlídací meze** teploty a vlhkosti (alarm, když místnost profilu neodpovídá).

## Nalezené profily

Hodnoty jsou z návodů, fór a několika studií, liší se mezi zdroji. Jsou to výchozí body,
ne ověřené limity bezpečnosti potravin. Solení / nakládání probíhá před sušením mimo sušičku.

| # | Profil | Teplota | RH | Proudění | Doba | Hotovo | Vhodnost pro tuto sušičku |
|---|--------|---------|----|----------|------|--------|---------------------------|
| 1 | **Biltong teplý** | 1. den 22–24 °C, pak 25–33 °C | < 50–55 % | stálé, mírné, ne přímo na maso | 2–6 dní | při stisku nepovolí | dobrá v teplé místnosti, bez topení se 30 °C nedosáhne |
| 2 | **Biltong / droëwors tradiční** | 15–20 °C | 60–70 % | dobré větrání | 3–7 dní | pevné, ne tvrdé | **velmi dobrá** (byt, sklep) |
| 3 | **Bresaola / sušená svalovina** | 12–18 °C, ideálně < 15 °C | 75–80 % | mírné; při rychlém osychání povrchu snížit | 3–8 týdnů | úbytek 35–40 % | dobrá ve sklepě; vlhkost hlídat, nelze zvlhčit |
| 4 | **Fermentovaný salám (sušení)** | 12–15 °C | 90–95 % (fermentace) → 85 → 70–75 % | 0,8 m/s na začátku, pak 0,5 m/s | 3–8 týdnů | úbytek 30–40 % | **jen fáze sušení**, fermentace potřebuje zvlhčování/teplo |
| 5 | **Bündnerfleisch** | 9–18 °C | 70–80 % | řízená cirkulace | 10–24 týdnů | úbytek 45–55 % | dobrá ve sklepě, dlouhý program; lisování je ruční krok |
| 6 | **Pastırma** | 15 °C → 20 °C | 80 % → 70 % | mírné | ~25–30 dní | – | dobrá; fáze oddělené ručním lisováním a nanesením çemenu |

Detail fází pastırmy (studie): 6 dní 15 °C / 80 % → lisování → 5 dní 20 °C / 70 % →
lisování → 5 dní → çemen (1 den, 7 °C, mimo sušičku) → 10 dní 20 °C / 70 %.

Společné poznatky:

- Příliš silné proudění nebo nízká vlhkost na začátku = **zatvrdnutí povrchu** (case hardening),
  vnitřek nevyschne. Proudění se proto v čase snižuje, ne zvyšuje.
- Při sušení za studena hlídat teplotu < 15,6 °C (růst *S. aureus*).
- RH v komoře by měla být cca o 5 % nižší než aktivita vody (aw) výrobku.
- Vzduch přivádět dole, odvádět nahoře, nefoukat přímo na maso.

## Zvažované varianty

### A. Předvolby (jednoduché)

`select: Profil` = Vlastní / 1–6. Výběr profilu jednorázově nastaví stávající parametry
(cílová vlhkost, pásmo, min/max výkon, max teplota, délka programu). Bez fází.

### B. Fázové profily (doporučeno)

Každý profil = tabulka fází: délka, cílová RH, pásmo, min/max výkon, meze T a RH.
Fáze se přepínají automaticky podle uplynulé doby programu (balíček `runtime.yaml`).

- Nové entity: `Profil`, `Fáze` (text), `Do další fáze` (h), `Vyžadován zásah` (binary,
  např. lisování u pastırmy; program čeká na tlačítko `Pokračovat`).
- Profily jako tabulka v `esphome/packages/profiles.yaml`. Úprava tabulky = nový build,
  parametry „Vlastní“ zůstávají nastavitelné z HA.

### C. Hlídání mezí profilu (doporučeno s A i B)

`binary_sensor: Teplota mimo profil`, `Vlhkost mimo profil` se zpožděním 30 min, pro
upozornění z HA (např. sklep se přes den ohřál nad 15 °C).

### D. Hardwarová rozšíření (volitelně, jen návrh)

| Rozšíření              | Přínos                                          | Piny          |
|------------------------|-------------------------------------------------|---------------|
| Tenzometr + HX711      | konec programu podle úbytku hmotnosti (%)       | D2/D3         |
| SHT41/SHT45 místo HTU21D | přesnější a odolnější při RH 75–95 %          | stejná I2C    |
| Relé zvlhčovač / topení | fermentace salámů, biltong 30 °C              | D6, D7, D10   |

## Implementace

Použití: vybrat `Profil` (nastaví i `Program délka`), stisknout `Program start`.
Fáze se přepínají podle uplynulé doby programu (`Program odpočet`). Při změně fáze se
zapíšou parametry regulace (cílová RH, pásmo, min/max výkon, max teplota), během fáze je
lze z HA ručně doladit, další fáze je přepíše. `Vlastní` = profil se nepoužije.

Ruční kroky (lisování, çemen) nepozastavují program: na konci fáze se zapne
`Vyžadován zásah` s textem v `Požadovaný zásah`, po provedení stisknout `Zásah proveden`.

`Teplota mimo profil` a `Vlhkost mimo profil` se zapnou, když je hodnota 30 min mimo
meze aktuální fáze (vypnou se po 5 min v mezích).

Výkon ventilátorů je v %, vztah k m/s závisí na komoře. Fáze se sníženým max. výkonem
odpovídají doporučení snižovat proudění v pozdějších fázích.

| Profil | Fáze (délka, cílová RH, výkon min–max, Tmax pro zvýšení proudění) | Meze alarmu T / RH | Celkem |
|--------|------------------------------------------------------------|--------------------|--------|
| Biltong teplý | Náběh 1 d, 55 %, 40–100 %, 24 °C → Sušení 4 d, 50 %, 40–100 %, 33 °C | 18–26 / 30–70 → 20–35 / 25–60 | 5 d |
| Biltong / droëwors tradiční | Sušení 6 d, 65 %, 30–80 %, 20 °C | 12–22 / 45–80 | 6 d |
| Bresaola | Náběh 7 d, 80 %, 15–60 % → Sušení 35 d, 75 %, 15–50 %; Tmax 15 °C | 10–16 / 70–90 → 65–85 | 42 d |
| Fermentovaný salám (sušení) | Osychání 7 d, 85 %, 30–80 % → Sušení 14 d, 80 %, 20–60 % → Dosoušení 14 d, 75 %, 15–50 %; Tmax 15 °C | 10–16 / 78–95 → 70–88 → 65–82 | 35 d |
| Bündnerfleisch | 21 d 80 % → *lisování* → 28 d 77 % → *lisování* → 28 d 75 % → *lisování* → 21 d 72 %; výkon 20–60 → 15–50 %, Tmax 14 °C | 8–18 / 62–88 | 98 d |
| Pastırma | 6 d 80 %, 16 °C → *lisování* → 5 d 70 %, 21 °C → *lisování* → 5 d → *çemen* → 10 d 70 % | 12–18 / 70–88 → 16–23 / 60–80 | 26 d |

Úprava profilu: tabulka ve skriptu `profile_update` v `profiles.yaml` (řádek = fáze),
nová volba se přidá do `options` selectu a do pole `profiles[]` ve stejném pořadí.

## Zdroje

- Biltong, teploty a fáze: [Earthworm Express, Biltong time](https://earthwormexpress.com/artisan-curing/anneliese-se-biltong-resep/biltong-time/),
  [Smoking Meat Forums, making biltong](https://www.smokingmeatforums.com/threads/making-biltong.233869/post-1463843),
  [Smoking Meat Forums, biltong box](https://www.smokingmeatforums.com/threads/biltong-box.89039/latest),
  [meately.com](https://meately.com/?p=4507)
- Droëwors: [Preprints.org review](https://www.preprints.org/manuscript/202505.1294/v1),
  [Smoking Meat Forums, droewors](https://www.smokingmeatforums.com/threads/droewors-south-african-dried-sausage.235700/latest),
  [INTA repository](https://repositorio.inta.gob.ar/handle/20.500.12123/6091?show=full)
- Bresaola: [Smoking Meat Forums, bresaola](https://www.smokingmeatforums.com/threads/bresaola.257738/post-1659291),
  [Smoking Meat Forums, curing chamber](https://www.smokingmeatforums.com/threads/curing-chamber.320165/post-2445062),
  [pantsdownapronson.com](https://www.pantsdownapronson.com/beef-bresaola-recipe/)
- Fermentovaný salám: [Smoking Meat Forums (citace Marianski)](https://www.smokingmeatforums.com/threads/refrigerate-prior-to-fermenting-salami-or-not.295126/post-2054725),
  [MDPI Sci 6/3/53](https://mdpi.com/2413-4155/6/3/53),
  [VUT Brno, sušení a zrání masných výrobků](https://dspace.vut.cz/server/api/core/bitstreams/9edc479a-4b83-46b1-953c-4c1d86cf3947/content)
- Bündnerfleisch: [Wikipedia](https://en.wikipedia.org/wiki/B%C3%BCndnerfleisch),
  [Heat Pumping Technologies, case study](https://heatpumpingtechnologies.org/project59/case-studies/air-dried-beef-bundnerfleisch-switzerland/),
  [Fooby](https://fooby.ch/en/cookery-school/food-lexicon/buendnerfleisch.html)
- Pastırma: [meatsandsausages.com](https://meatsandsausages.com/hams-other-meats/pastirma),
  [UK product specification Pastarma Govezhda](https://assets.publishing.service.gov.uk/media/665da56bdc15efdddf1a8650/Product_specification_Pastarma_Govezhda.pdf),
  [PMC5112424](https://pmc.ncbi.nlm.nih.gov/articles/PMC5112424)
