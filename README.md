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
  packages/
    base.yaml           deska, WiFi, API, OTA, web server, diagnostika
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
  dashboard.yaml        přehled pro analýzu (karty, grafy)
scripts/
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
- [ ] Volitelně: tenzometr HX711 (konec podle úbytku hmotnosti), SHT41 místo HTU21D
