# Hardware

## Vrtací šablona a krycí mřížka ventilátoru

[fan_grille.scad](fan_grille.scad), parametrický model pro OpenSCAD (Customizer: Window > Customizer).

### Díly

| `part`     | Popis |
|------------|-------|
| `template` | vrtací šablona: vodicí pouzdra pro 4 montážní otvory, středový pilotní otvor pro vrták korunky, kruhové okno pro obkreslení výřezu, rysky os na hranách a v ploše |
| `grille`   | krycí mřížka se stejnou roztečí děr, montuje se šrouby ventilátoru (volitelně se zápustnými hlavami) |
| `both`     | oba díly vedle sebe |

Mřížka má stejnou rozteč i otvory, takže v nouzi poslouží i jako šablona pro 4 díry.

### Rozměry ventilátorů

| `fan_size` | Rozteč děr | Průměr výřezu |
|-----------:|-----------:|--------------:|
| 40         | 32         | 38            |
| 60         | 50         | 57            |
| 80         | 71,5       | 76            |
| 92         | 82,5       | 88            |
| **120**    | **105**    | **116**       |
| 140        | 124,5      | 134           |
| 0          | `custom_*` | `custom_*`    |

### Hlavní parametry

| Parametr | Výchozí | Popis |
|----------|---------|-------|
| `margin` | 0 | okraj přesahující rám ventilátoru |
| `hole_d` | 4,5 | montážní otvor (4,3 M4, 5,0 samořezné šrouby ventilátoru) |
| `pattern` | hex | `hex`, `rings` (soustředné kruhy + žebra), `slots` (lamely), `round` |
| `opening` / `bar` | 8 / 1,6 | velikost otvoru / šířka materiálu mezi otvory |
| `hub_d` | 0 | plný kruh nad nábojem motoru (např. 40 u 120 mm) |
| `countersink` | true | zahloubení pro zápustné šrouby |
| `bushing_h` | 6 | výška vodicích pouzder šablony (0 = plochá) |
| `pilot_d` | 6,5 | středový otvor pro vrták korunky |

Vzor `slots` má dlouhé tenké lamely; pro komoru s masem (čištění, tuhost) je vhodnější `hex` nebo `rings`.

### Postup vrtání

1. Narýsovat osy otvoru na stěně, šablonu srovnat ryskami na hranách.
2. Převrtat 4 montážní otvory přes pouzdra a pilotní otvor uprostřed.
3. Obkreslit vnější hranu kruhového okna, šablonu sundat.
4. Vyříznout výřez korunkou (Ø dle tabulky, u 120 mm korunka 114–116) nebo přímočarou pilou.

## Kryt čidla HTU21D s magnety

[htu21d_case.scad](htu21d_case.scad), kryt modulu GY-21 / HTU21D přichycený neodymovými
magnety na plech. Rozměry podle [Case for HTU21d PCB](https://www.thingiverse.com/thing:1760764)
(dustin_sn, CC BY-NC-SA), geometrie je nová a parametrická.

Změny proti originálu:

- bez uší pro šrouby, místo nich příruba se 4 kapsami pro magnety, otevřenými k plechu,
- bez bočního výřezu pro vodiče: záda jsou otevřená, vodiče vedou přímo otvorem ve stěně,
- prostor za deskou pro ohyb vodičů (`wire_space`),
- rohová osazení drží čip 1,3 mm pod stropem, výstupky (`bump`) drží desku zespodu,
- boční štěrbiny u čidla pro rychlejší odezvu (`vents`).

Výchozí rozměry: dutina 16 × 16 mm (deska 15,6 mm + vůle), tělo 20 × 20 × 8,5 mm,
příruba 31,3 × 31,3 × 2,8 mm, magnety Ø6 × 2 mm (kapsa Ø6,2).

| Parametr | Výchozí | Popis |
|----------|---------|-------|
| `pcb_w`, `pcb_l` | 15,6 | rozměr desky (změřit konkrétní modul) |
| `window_offset` | 3,5 | posun okna nad čip, směrem od konektoru (konektor = +Y) |
| `wire_space` | 4 | prostor pro vodiče mezi deskou a stěnou |
| `magnets` | 4 | 0, 2 nebo 4 |
| `magnet_d`, `magnet_h` | 6, 2 | rozměr magnetu, kapsa = `magnet_d + magnet_clear` |
| `vents` | true | boční štěrbiny |

Montáž:

1. Do stěny vyvrtat otvor Ø6–8 mm pod stranou desky s konektorem, hrany odjehlit.
2. Vodiče protáhnout, připájet k desce, desku zacvaknout do krytu čipem k oknu.
3. Magnety vlepit do kapes (vteřinové lepidlo / epoxid), všechny stejnou polaritou ke stěně.
4. Otvor ve stěně kolem vodičů utěsnit silikonem (vlhkost v komoře).

Magnety přitahují jen feromagnetický plech, na nerez řady 300 (A2/A4) nedrží.

Tisk: PETG, příruba dolů, bez podpor.

```sh
scripts/scad.sh case                          # výchozí
scripts/scad.sh case 'magnet_d=8' 'magnet_h=3'
```

## Export STL (ventilátor)

```sh
scripts/scad.sh                     # 120 mm, výchozí parametry
scripts/scad.sh 80                  # 80 mm
scripts/scad.sh 120 'pattern="rings"' 'hub_d=40'
```

Výstup `hw/stl/` (není v gitu). Tisk: PETG (vlhkost, teplota), 0,2 mm vrstva, bez podpor,
mřížka i šablona tisknout plochou stranou dolů.
