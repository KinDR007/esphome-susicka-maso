# Analýza

## Požadavky

- Řízení 1–2 ventilátorů 12 V 4pin PWM, měření jejich otáček.
- Měření teploty a vlhkosti v komoře (HTU21D).
- Automatický režim řízení, ruční režim, vypnutí.
- ESPHome, balíčky stahované z GitHubu, lokální `secrets.yaml` mimo repozitář.
- Napájení 12 V, ESP z 5V step-downu.

## Fyzikální omezení

Sušička obsahuje pouze ventilátory, nemá topení, chlazení ani odvlhčovač. Ventilátor
dokáže jen:

- odvádět vlhkost od masa a z komory výměnou vzduchu s okolím,
- vyrovnávat teplotu s okolím.

Vlhkost v komoře proto nelze snížit pod vlhkost okolního vzduchu a teplotu nelze snížit
pod teplotu okolí. Automatika reguluje intenzitu výměny vzduchu, ne absolutní hodnoty.
Pro řízené zrání (salámy, 12–15 °C, 70–80 % RH) by bylo nutné doplnit chlazení a zvlhčování,
pro sušení typu biltong / jerky (20–28 °C, 50–60 % RH) postačuje ventilace.

## Volba komponent

| Oblast         | Volba                    | Důvod                                               |
|----------------|--------------------------|-----------------------------------------------------|
| PWM výstup     | LEDC 25 kHz              | frekvence dle Intel spec., mimo slyšitelné pásmo    |
| Budič PWM      | N-MOSFET open-drain      | GPIO nejsou 5V tolerantní; fail-safe 100 % při resetu |
| Tachometr      | `pulse_counter` (PCNT)   | hardwarové čítání, bez zátěže CPU, filtr 13 µs      |
| Čidlo          | nativní `htu21d`         | vlastní komponenta není potřeba                     |
| API            | šifrovací klíč           | `api: password` je od ESPHome 2026.1 odstraněn      |

Vlastní C++ komponenty nejsou potřeba, vše pokrývají nativní komponenty a lambda.

## Automatický režim

Každou sekundu se vypočte požadovaný výkon:

```
k_rh  = clamp((RH - cílová_vlhkost) / pásmo_vlhkosti, 0, 1)
k_t   = clamp((T - max_teplota) / 3 °C, 0, 1)
výkon = min_výkon + (max_výkon - min_výkon) * max(k_rh, k_t)
```

- Pod cílovou vlhkostí běží ventilátory na minimálním výkonu (cirkulace kolem masa).
- Nad cílem výkon roste lineárně, na horní hranici pásma je maximum.
- Při překročení maximální teploty se výkon zvyšuje bez ohledu na vlhkost.
- Změna výkonu je omezena na 5 %/s, nedochází ke skokům a cukání ventilátorů.
- Pokud čidlo 60 s nedodá platnou hodnotu vlhkosti, použije se nouzový výkon.
- Režim a všechny parametry se ukládají do flash a přežijí restart.

Zvažované varianty:

| Varianta              | Hodnocení                                                          |
|-----------------------|--------------------------------------------------------------------|
| Hystereze on/off      | jednoduchá, ale ventilátor cyklicky startuje a vypíná              |
| PID (`climate: pid`)  | integrační složka nemá smysl, akční veličina neumí cíl dosáhnout pod úroveň okolí, vede k windupu |
| **Proporcionální s rampou** | zvoleno: plynulé, předvídatelné, bez ladění konstant      |

## Entity v Home Assistant

| Entita                   | Typ           | Výchozí |
|--------------------------|---------------|---------|
| Režim                    | select        | Automaticky / Ručně / Vypnuto |
| Ruční výkon              | number        | 50 %    |
| Cílová vlhkost           | number (config)| 60 %   |
| Pásmo regulace vlhkosti  | number (config)| 15 %   |
| Maximální teplota        | number (config)| 28 °C  |
| Minimální výkon          | number (config)| 25 %   |
| Maximální výkon          | number (config)| 100 %  |
| Nouzový výkon            | number (config)| 60 %   |
| Teplota, Vlhkost         | sensor        |         |
| Výkon ventilátorů        | sensor        |         |
| Ventilátor N otáčky      | sensor (RPM)  |         |
| Ventilátor N porucha     | binary_sensor | výkon ≥ 20 % a < 200 RPM po dobu 20 s |
| Stav regulace            | text_sensor   |         |

## Rizika

| Riziko                                   | Opatření                                            |
|------------------------------------------|-----------------------------------------------------|
| Kondenzace na HTU21D při RH > 90 %       | čidlo v proudu vzduchu; při trvalé vysoké vlhkosti zvážit SHT41 s ohřevem |
| Ventilátor se při 0 % nezastaví          | vlastnost ventilátoru, režim Vypnuto pak drží minimální otáčky; pro úplné vypnutí doplnit spínání +12 V (P-MOSFET) |
| Výpadek ESP                              | MOSFET + pull-down: ventilátory na 100 %            |
| Rušení tachometru od PWM                 | PCNT filtr 13 µs, volitelně RC 10 k / 1 nF          |
| Vlhkost na elektronice                   | XIAO a step-down mimo komoru                        |
| Mezera v cestě projektu                  | ESP-IDF odmítá build, `scripts/esphome.sh` přesměruje build do `~/.cache` |
| Bezpečnost potravin                      | firmware neřídí teplotu, dodržet postup pro daný typ masa |
