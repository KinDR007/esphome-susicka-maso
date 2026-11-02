# Sušička na maso (ESPHome)

Řízení ventilace sušičky masa: Seeed XIAO ESP32S3, čidlo HTU21D, 1–2 ventilátory 12 V 4pin PWM
s měřením otáček, automatický režim podle vlhkosti a teploty, dlouhodobý program sušení
a evidence výpadků napájení.

## Struktura

```
docs/
  analyza.md            požadavky, volba řešení, algoritmus automatiky, rizika
  zapojeni.md           pinout, schémata zapojení, kusovník
  profily.md            rešerše a profily sušení se zdroji
esphome/
  susicka-maso.yaml     konfigurace zařízení, balíčky stahuje z GitHubu
  susicka-maso-local.yaml  totéž s lokálními balíčky (vývoj)
  secrets.yaml.example  šablona tajných údajů
  components/susicka_ui/  vlastní webové rozhraní zařízení (app.js, app.css, guide.yaml)
  packages/
    base.yaml           deska, WiFi, API, OTA, web server, diagnostika
    webui.yaml          vlastní webové rozhraní místo stránky ESPHome
    htu21d.yaml         I2C + teplota/vlhkost
    control.yaml        režimy a automatická regulace
    runtime.yaml        dlouhodobý program, výpadky, statistiky provozu
    profiles.yaml       fázové profily sušení (biltong, bresaola, salám, ...)
    fan.yaml            jeden PWM ventilátor + tachometr (vkládá se 1–2×)
hw/
  fan_grille.scad       parametrická vrtací šablona a krycí mřížka ventilátoru
  htu21d_case.scad      kryt čidla HTU21D s magnety, vodiče skrz stěnu
  README.md             parametry, postup vrtání, export STL
homeassistant/
  dashboard.yaml        jednoduchý pohled (nativní karty)
  dashboard_v2.yaml     dashboard ve stylu Přehledu, průvodce profily (custom karty)
scripts/
  check_dashboard.py    kontrola dashboardů a webového UI: entity, tabulky profilů, JS šablony
  webui_dev.py          vývojový server webového UI (ukázková data / proxy na zařízení)
  esphome.sh            config / compile / run / logs
  scad.sh               export STL (šablona, mřížka, kryt čidla) do hw/stl/
```

## Použití v ESPHome (Home Assistant add-on / dashboard)

1. Zkopírovat [esphome/susicka-maso.yaml](esphome/susicka-maso.yaml) do konfigurace ESPHome.
2. Do `secrets.yaml` v ESPHome doplnit klíče podle
   [esphome/secrets.yaml.example](esphome/secrets.yaml.example)
   (`api_key` vygenerovat: `python3 -c "import os,base64;print(base64.b64encode(os.urandom(32)).decode())"`).
3. Pro jeden ventilátor smazat blok `fan2` v sekci `packages`.
4. Nainstalovat. Balíčky se stáhnou z GitHubu a obnovují se jednou denně (`refresh: 1d`).

## Lokální build

```sh
cp esphome/secrets.yaml.example esphome/secrets.yaml   # a vyplnit
scripts/esphome.sh config            # validace, lokální balíčky
scripts/esphome.sh compile           # kompilace
scripts/esphome.sh run               # kompilace + nahrání (USB / OTA)
scripts/esphome.sh logs
scripts/esphome.sh config remote     # validace varianty s balíčky z GitHubu
```

Cesta projektu obsahuje mezeru, kterou ESP-IDF nepodporuje; skript proto ukládá build
do `~/.cache/esphome-susicka-maso`.

`esphome/secrets.yaml` a `zadani.md` jsou v `.gitignore` a nesmí se commitovat.

## Dashboard Home Assistant

[homeassistant/dashboard_v2.yaml](homeassistant/dashboard_v2.yaml) má stejný vzhled jako
redesignovaný Přehled: bloky s velkou hodnotou, grafem a řádky detailů.

- Sekce: komora, ventilátory, program s časovou osou fází, průvodce profily, graf za 7 dní,
  nastavení regulace, provoz a výpadky, dlouhodobé statistiky.
- Průvodce profily: u každého profilu popis, vhodné maso, prostředí, příprava, fáze
  (délka, cílová RH, výkon, teplota), ruční zásahy a kdy je hotovo.
  Nahoře je výpis profilů, které odpovídají aktuální teplotě v komoře.
  Tlačítko „Zvolit profil“ si vyžádá potvrzení.
- Custom karty (HACS): button-card, stack-in-card, mini-graph-card, apexcharts-card,
  mushroom, card-mod.
- Instalace jako samostatný dashboard: Nastavení → Dashboardy → Přidat → Upravit →
  Editor kódu → vložit celý soubor.
  Do dashboardu, který už má šablony `vrm_head`/`vrm_details`, stačí vložit položku z `views:`.
- Nasazeno v HA jako dashboard `/dashboard-susicka` (Sušička na maso). Aktualizace: znovu
  vložit soubor v editoru kódu, nebo `tools/save_dashboard.sh` z projektu úklidu dashboardů
  (JSON převedený z YAML).

Tabulky fází v dashboardu musí odpovídat [profiles.yaml](esphome/packages/profiles.yaml).
Kontrola po každé změně profilů nebo dashboardu:

```sh
scripts/check_dashboard.py   # potřebuje PyYAML a node (PyYAML má i python ESPHome)
```

## Webové rozhraní zařízení

Zařízení má na `http://susicka-maso.local/` vlastní stránku místo standardní stránky ESPHome
(přihlášení `web_username` / `web_password`). Je uložená ve firmwaru (15 kB gzip), funguje
bez internetu i bez Home Assistantu a má stejný obsah jako dashboard v2:

- komora (teplota, vlhkost, průběh od otevření stránky), ventilátory a režim, ruční výkon,
- program s časovou osou fází, start/stop, upozornění na zásah s tlačítkem „Zásah proveden“,
- průvodce profily s volbou profilu, nastavení regulace, provoz a výpadky, restart, log.

Akce měnící stav (start, stop, profil, restart, vynulování) si vyžádají potvrzení.
Vzhled se přepíná v hlavičce (Auto podle systému / světlý / tmavý), volba se pamatuje v prohlížeči.
Tlačítko „Původní rozhraní“ načte stránku ESPHome z internetu.

Rozhraní je komponenta [esphome/components/susicka_ui](esphome/components/susicka_ui),
zapíná ji balíček [webui.yaml](esphome/packages/webui.yaml) a `external_components`
v konfiguraci zařízení. Texty průvodce jsou v `guide.yaml`, `scripts/check_dashboard.py`
hlídá shodu s `profiles.yaml` a s dashboardem v2.

Omezení: v záložní síti `susicka-maso fallback` (zařízení se nepřipojí k WiFi) obsluhuje
všechny stránky captive portál pro nastavení WiFi, webové rozhraní tam není dostupné.

Vývoj bez nahrávání firmwaru:

```sh
P=$(head -1 $(command -v esphome) | cut -c3-)      # python s PyYAML
$P scripts/webui_dev.py --mock                    # ukázková data (běžící program, zásah)
$P scripts/webui_dev.py --device susicka-maso.local   # živá data, ovládání se jen loguje
# http://localhost:8099/
```

## Dokumentace

- [Zapojení](docs/zapojeni.md)
- [Analýza, automatický režim, program a výpadky](docs/analyza.md)
- [Profily sušení](docs/profily.md)
- [Šablona a mřížka ventilátoru, kryt čidla](hw/README.md)

## TODO

- [x] Konfigurace ESPHome, validace a kompilace (ESPHome 2026.5)
- [x] Balíčky na GitHubu, ověřeno stažení přes `config remote`
- [ ] Ověřit na hardwaru: směr PWM (MOSFET), RPM proti údaji výrobce, fail-safe při resetu
- [x] Dlouhodobý program, detekce výpadků, statistiky (zápis do flash 1× za 15 min)
- [x] Fázové profily sušení s alarmy mezí
- [x] Parametrická vrtací šablona a mřížka ventilátoru (OpenSCAD)
- [x] Kryt HTU21D s magnety (OpenSCAD)
- [ ] Změřit desku HTU21D a ověřit kryt tiskem
- [x] Watchdog čidla (restart při chybějících datech, zdvojování intervalu)
- [ ] Ověřit na hardwaru: watchdog čidla (test build `-s sensor_reboot_timeout 60`)
- [ ] Ověřit na hardwaru: detekce výpadku odpojením napájení, dokončení programu
- [ ] Doladit výchozí parametry automatiky a profilů podle reálné komory
- [x] Dashboard v2 ve stylu Přehledu s průvodcem profily
- [x] Nasadit dashboard v2 v HA (`/dashboard-susicka`)
- [ ] Ověřit vzhled dashboardu s živými daty zařízení
- [x] Vlastní webové rozhraní zařízení (bez HA a internetu), nasazeno přes OTA
- [ ] Rozhodnout: webové UI i v záložní síti (bez `captive_portal`, WiFi pak jen přes flash)
- [ ] Volitelně: tenzometr HX711 (konec podle úbytku hmotnosti), SHT41 místo HTU21D
