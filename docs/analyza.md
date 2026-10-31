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

## Dlouhodobý program

Časovač sušení v řádu dnů až desítek týdnů (0,5 až 420 dní, krok 0,5 dne).

- **Program start** vynuluje čítače programu a spustí odpočet, **Program stop** ho ukončí.
- **Program odpočet**: `Reálný čas` počítá od startu včetně výpadků (konec je pevné datum),
  `Jen doba provozu` počítá jen dobu, kdy byla jednotka zapnutá (výpadek konec posune).
- **Program po dokončení**: `Pokračovat` (jen nahlásí dokončení) nebo `Vypnout ventilátory`
  (přepne režim na Vypnuto).
- Stav programu je ve flash, výpadek napájení program nepřeruší.
- Čas se bere z NTP (`pool.ntp.org`), časová zóna `Europe/Prague`. Bez sítě po startu nelze
  vyhodnotit výpadek ani reálný odpočet, do synchronizace se počítá jen doba provozu.

## Výpadky a statistiky

Jednotka každou minutu aktualizuje čas posledního běhu (`last_seen`), do flash se zapisuje
**jednou za 15 minut** (`flash_write_interval`). Po startu a synchronizaci času:

```
výpadek = čas_startu - last_seen
```

- Přesnost je 15 min: výpadek napájení se nahlásí až o 15 min delší, čítač provozu o stejnou
  dobu kratší. Součet provoz + výpadky tak stále odpovídá reálnému času.
- Čistý restart (OTA, tlačítko Restart) zapíše flash před vypnutím, a pokud trvá méně než
  `outage_min_s` (120 s), za výpadek se nepovažuje.
- Ukládá se posledních 8 výpadků (začátek, délka).
- Zápis 15 min ≈ 35 000 zápisů ročně do NVS 448 kB s vyrovnáváním opotřebení, životnost flash
  tím není omezena.

| Entita                     | Popis                                          |
|----------------------------|------------------------------------------------|
| Program délka              | nastavení délky programu (dny)                 |
| Program start / stop       | tlačítka                                       |
| Program běží / dokončen    | binary_sensor                                  |
| Program uplynulo / zbývá   | dny                                            |
| Program konec              | předpokládané datum a čas konce                |
| Program doba provozu       | h, jak dlouho jednotka během programu běžela   |
| Program doba výpadků       | h                                              |
| Program počet výpadků      |                                                |
| Celková doba provozu       | h, `total_increasing`                          |
| Doba běhu ventilátorů      | h, výkon > 0 %                                 |
| Celková doba výpadků       | h, `total_increasing`                          |
| Počet výpadků              | `total_increasing`                             |
| Dostupnost                 | % provoz / (provoz + výpadky)                  |
| Poslední výpadek (+ délka) | timestamp, min                                 |
| Historie výpadků           | text, posledních 8: `dd.mm. HH:MM XhYYm`       |
| Poslední start             | timestamp                                      |
| Vynulovat statistiky       | nuluje celkové čítače a historii, ne program   |

Timestampy jsou v ESPHome typu float, přesnost je proto cca ±1 min.

### Analýza v Home Assistant

- Senzory se `state_class` ukládá HA do dlouhodobých statistik (hodinové agregace)
  **natrvalo**, bez ohledu na `purge_keep_days`.
- Historie textových a timestamp senzorů se maže po `purge_keep_days` (výchozí 10 dní).
  Na zařízení zůstává posledních 8 výpadků a celkové čítače.
- Přehled: [homeassistant/dashboard.yaml](../homeassistant/dashboard.yaml) (karty programu,
  provozu, výpadků a grafy po dnech a týdnech). Export dat: Historie v HA → stáhnout CSV.

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
| Čidlo selže při startu (ESPHome ho už nezkouší) | watchdog: bez platné vlhkosti 10 min → restart; interval se po každém neúspěšném restartu zdvojnásobí (max 6 h), po první platné hodnotě se vynuluje |
| Výpadek ESP                              | MOSFET + pull-down: ventilátory na 100 %            |
| Rušení tachometru od PWM                 | PCNT filtr 13 µs, volitelně RC 10 k / 1 nF          |
| Vlhkost na elektronice                   | XIAO a step-down mimo komoru                        |
| Jednotka bez internetu po startu | výpadek se nevyhodnotí do synchronizace NTP; pro provoz offline doplnit RTC DS3231 |
| Mezera v cestě projektu                  | ESP-IDF odmítá build, `scripts/esphome.sh` přesměruje build do `~/.cache` |
| Bezpečnost potravin                      | firmware neřídí teplotu, dodržet postup pro daný typ masa |
