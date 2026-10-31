# Sušička na maso (ESPHome)

Řízení ventilace sušičky masa: Seeed XIAO ESP32S3, čidlo HTU21D, 1–2 ventilátory 12 V 4pin PWM
s měřením otáček, automatický režim podle vlhkosti a teploty.

## Struktura

```
docs/
  analyza.md            požadavky, volba řešení, algoritmus automatiky, rizika
  zapojeni.md           pinout, schémata zapojení, kusovník
esphome/
  susicka-maso.yaml     konfigurace zařízení, balíčky stahuje z GitHubu
  susicka-maso-local.yaml  totéž s lokálními balíčky (vývoj)
  secrets.yaml.example  šablona tajných údajů
  packages/
    base.yaml           deska, WiFi, API, OTA, web server, diagnostika
    htu21d.yaml         I2C + teplota/vlhkost
    control.yaml        režimy a automatická regulace
    fan.yaml            jeden PWM ventilátor + tachometr (vkládá se 1–2×)
scripts/
  esphome.sh            config / compile / run / logs
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
- [Analýza a automatický režim](docs/analyza.md)
