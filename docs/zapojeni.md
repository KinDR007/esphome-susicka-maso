# Zapojení

## Přehled

```
 230 V AC ──► [Zdroj 12 V / 2 A] ──┬──► [Pojistka 1 A] ──┬──────────────► +12 V ventilátory
                                   │                     │
                                   │                     └──► [Step-down 12→5 V] ──►|── 5V (XIAO)
                                   │                                           D1 SS14
 GND ──────────────────────────────┴────────── společná zem (zdroj, step-down, XIAO, ventilátory, HTU21D)
```

- Step-down (např. MP1584EN, LM2596, Mini-360) **nastavit na 5,0 V před připojením XIAO**.
- Schottkyho dioda D1 (SS14 / 1N5819) chrání USB port počítače, pokud je XIAO zároveň napájené
  ze step-downu i z USB-C. Na 5V pinu XIAO pak bude cca 4,7 V, což je v pořádku.
- Všechny země propojit v jednom bodě.

## Pinout XIAO ESP32S3

| Pin XIAO | GPIO   | Funkce              | Připojeno na                              |
|----------|--------|---------------------|-------------------------------------------|
| 5V       | –      | napájení 5 V vstup  | step-down výstup přes D1                  |
| GND      | –      | zem                 | společná zem                              |
| 3V3      | –      | výstup 3,3 V        | HTU21D VIN, pull-upy tachometrů           |
| D0       | GPIO1  | PWM ventilátor 1    | PWM pin 4 ventilátoru 1 (nebo gate Q1)    |
| D1       | GPIO2  | tachometr vent. 1   | TACH ventilátoru 1 (pull-up 10 k na 3V3)  |
| D4       | GPIO5  | I2C SDA             | HTU21D SDA                                |
| D5       | GPIO6  | I2C SCL             | HTU21D SCL                                |
| D8       | GPIO7  | PWM ventilátor 2    | PWM pin 4 ventilátoru 2 (nebo gate Q2)    |
| D9       | GPIO8  | tachometr vent. 2   | TACH ventilátoru 2 (pull-up 10 k na 3V3)  |
| –        | GPIO21 | stavová LED         | LED na desce (není třeba zapojovat)       |

Volné pro rozšíření: D2 (GPIO3, strapping pin, jen jako výstup s rozmyslem), D3 (GPIO4),
D6 (GPIO43), D7 (GPIO44), D10 (GPIO9).

Piny se mění v `substitutions` a `vars` v [esphome/susicka-maso.yaml](../esphome/susicka-maso.yaml).

## 4pinový PWM ventilátor

Konektor (Intel 4-Wire PWM Fan spec):

| Pin | Barva (obvyklá) | Signál   |
|-----|-----------------|----------|
| 1   | černá           | GND      |
| 2   | žlutá / červená | +12 V    |
| 3   | zelená          | TACH, open-collector, 2 pulzy/otáčku |
| 4   | modrá           | PWM, 25 kHz, ventilátor má vlastní pull-up na 3,3–5 V |

### Řízení PWM přes N-MOSFET (volitelné)

GPIO ESP32 nejsou 5V tolerantní a PWM vstup ventilátoru je vytažený na až 5 V.
Open-drain spínání tranzistorem tento problém odstraní.

```
                                      Ventilátor pin 4 (PWM)
                                              │
                                            D │
 XIAO D0 (GPIO1) ──[R1 100 Ω]──┬────────── G ─┤  Q1 2N7002 / BS170
                               │            S │
                         [R2 10 kΩ]           │
                               │              │
 GND ──────────────────────────┴──────────────┘
```

- Logika je invertovaná (MOSFET sepnut = PWM linka v nule), v ESPHome je proto
  `fan_pwm_inverted: "true"`.
- R2 drží MOSFET vypnutý během resetu a bootu ESP: PWM linku pak vytáhne ventilátor
  a ten běží na **100 %**. Při výpadku řídicí jednotky tak sušička dál větrá (fail-safe).
- Q1 = 2N7002 (SOT-23), BS170 (TO-92) nebo BSS138. Ventilátor 2 analogicky s Q2 na D8.

### Přímé připojení (bez tranzistoru, aktuální konfigurace)

PWM pin ventilátoru (pin 4) přímo na GPIO (D0, resp. D8), `fan_pwm_inverted: "false"`.

- Funguje s většinou ventilátorů: PWM vstup má v ventilátoru pull-up na 3,3–5 V,
  ESP stahuje linku do nuly a v 1 drží 3,3 V, což ventilátor bere jako logickou 1.
- Je-li pull-up ventilátoru na 5 V, teče do GPIO přes ochrannou diodu proud
  řádově 0,1 mA ((5 − 3,6) V / ~10 kΩ). Je to mimo specifikaci ESP32, v praxi obvykle bez potíží.
  Volitelně sériový rezistor 1 kΩ mezi GPIO a PWM pin proud omezí.
- Během resetu a bootu je GPIO ve vysoké impedanci a ventilátor díky svému pull-upu běží na 100 %.

### Tachometr

```
 3V3 ──[R3 10 kΩ]──┬───────────────── XIAO D1 (GPIO2)
                   │
                   ├──[C1 1 nF]── GND   (volitelně, filtr rušení)
                   │
 Ventilátor pin 3 (TACH, open-collector)
```

- Ventilátor dává 2 pulzy na otáčku, firmware přepočítává na RPM.
- Ventilátor 2 analogicky na D9 (GPIO8).

## HTU21D (I2C)

```
 HTU21D modul        XIAO ESP32S3
 VIN  ─────────────── 3V3
 GND  ─────────────── GND
 SDA  ─────────────── D4 (GPIO5)
 SCL  ─────────────── D5 (GPIO6)
```

- Adresa 0x40, napájení 3,3 V (moduly GY-21 / SHT21 mají pull-upy 4,7–10 kΩ osazené).
  Pokud modul pull-upy nemá, doplnit 4,7 kΩ z SDA a SCL na 3V3.
- Kabel k čidlu do cca 1 m, ideálně stíněný nebo kroucený pár (SDA+GND, SCL+GND).
  Při delším kabelu snížit `frequency` v [htu21d.yaml](../esphome/packages/htu21d.yaml) na 50 kHz.
- Čidlo umístit do proudu vzduchu, mimo přímý odtah ventilátoru a mimo kapající maso.
  Elektroniku (XIAO, step-down) umístit mimo vlhkou komoru.

## Kusovník

| Pozice | Součástka                         | Ks  | Pozn.                          |
|--------|-----------------------------------|-----|--------------------------------|
| U1     | Seeed XIAO ESP32S3                | 1   |                                |
| U2     | Modul HTU21D (GY-21)              | 1   |                                |
| U3     | Step-down 12→5 V, min. 1 A        | 1   | MP1584EN, LM2596               |
| PS1    | Zdroj 12 V, min. 2 A              | 1   | dle počtu a odběru ventilátorů |
| F1     | Pojistka 1 A + držák              | 1   | 2 A u výkonnějších ventilátorů |
| M1, M2 | Ventilátor 12 V, 4pin PWM         | 1–2 | např. Arctic P12 PWM, Noctua   |
| Q1, Q2 | 2N7002 / BS170                    | 1–2 |                                |
| R1, R1'| 100 Ω                             | 1–2 | gate                           |
| R2, R2'| 10 kΩ                             | 1–2 | gate pull-down                 |
| R3, R3'| 10 kΩ                             | 1–2 | pull-up tachometru             |
| C1, C1'| 1 nF                              | 1–2 | volitelné                      |
| D1     | SS14 / 1N5819                     | 1   | ochrana USB                    |
| J1, J2 | konektor 4pin PC fan (Molex 47053)| 1–2 |                                |

## Odběr

| Spotřebič          | Proud           |
|--------------------|-----------------|
| Ventilátor 120 mm  | 0,1–0,3 A @ 12 V|
| XIAO ESP32S3 + WiFi| ~0,1–0,35 A @ 5 V (≈ 0,15 A @ 12 V přes step-down) |
| Celkem (2 vent.)   | do ~0,8 A @ 12 V|
