# Hardware: vrtací šablona a krycí mřížka ventilátoru

[fan_grille.scad](fan_grille.scad), parametrický model pro OpenSCAD (Customizer: Window > Customizer).

## Díly

| `part`     | Popis |
|------------|-------|
| `template` | vrtací šablona: vodicí pouzdra pro 4 montážní otvory, středový pilotní otvor pro vrták korunky, kruhové okno pro obkreslení výřezu, rysky os na hranách a v ploše |
| `grille`   | krycí mřížka se stejnou roztečí děr, montuje se šrouby ventilátoru (volitelně se zápustnými hlavami) |
| `both`     | oba díly vedle sebe |

Mřížka má stejnou rozteč i otvory, takže v nouzi poslouží i jako šablona pro 4 díry.

## Rozměry ventilátorů

| `fan_size` | Rozteč děr | Průměr výřezu |
|-----------:|-----------:|--------------:|
| 40         | 32         | 38            |
| 60         | 50         | 57            |
| 80         | 71,5       | 76            |
| 92         | 82,5       | 88            |
| **120**    | **105**    | **116**       |
| 140        | 124,5      | 134           |
| 0          | `custom_*` | `custom_*`    |

## Hlavní parametry

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

## Postup vrtání

1. Narýsovat osy otvoru na stěně, šablonu srovnat ryskami na hranách.
2. Převrtat 4 montážní otvory přes pouzdra a pilotní otvor uprostřed.
3. Obkreslit vnější hranu kruhového okna, šablonu sundat.
4. Vyříznout výřez korunkou (Ø dle tabulky, u 120 mm korunka 114–116) nebo přímočarou pilou.

## Export STL

```sh
scripts/scad.sh                     # 120 mm, výchozí parametry
scripts/scad.sh 80                  # 80 mm
scripts/scad.sh 120 'pattern="rings"' 'hub_d=40'
```

Výstup `hw/stl/` (není v gitu). Tisk: PETG (vlhkost, teplota), 0,2 mm vrstva, bez podpor,
mřížka i šablona tisknout plochou stranou dolů.
