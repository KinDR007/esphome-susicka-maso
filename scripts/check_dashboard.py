#!/usr/bin/env python3
"""Validate Home Assistant dashboards in homeassistant/ against the ESPHome packages.

Checks:
  - every susicka_na_maso entity id exists in the packages (HA naming: friendly name + name),
  - profile names and stage tables in dashboard variables match profiles.yaml,
  - every button-card JS template ([[[ ... ]]]) runs in node for several device states
    and returns a string.

Usage: scripts/check_dashboard.py [dashboard.yaml ...]   (default: homeassistant/*.yaml)
Needs PyYAML and node.
"""
import glob
import json
import os
import re
import subprocess
import sys
import tempfile
import shutil
import unicodedata

try:
    import yaml
except ImportError:
    sys.exit("PyYAML missing: pip install pyyaml, or run with ESPHome's python "
             "($(head -1 $(command -v esphome) | cut -c3-) scripts/check_dashboard.py)")

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PKG = os.path.join(ROOT, "esphome", "packages")
FRIENDLY = "Sušička na maso"
FAN_NAMES = ["Ventilátor 1", "Ventilátor 2"]
DOMAINS = {"sensor": "sensor", "binary_sensor": "binary_sensor", "text_sensor": "sensor",
           "number": "number", "select": "select", "button": "button", "switch": "switch"}
ENTITY_RE = re.compile(r"\b(?:sensor|binary_sensor|number|select|button|switch)\.susicka_na_maso_[a-z0-9_]+")


class Loader(yaml.SafeLoader):
    pass


Loader.add_multi_constructor("!", lambda loader, suffix, node: None)


def slug(text):
    t = unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode().lower()
    return re.sub(r"_+", "_", re.sub(r"[^a-z0-9]", "_", t)).strip("_")


def names(node):
    """All entity names in a component config (nested ones like htu21d temperature too)."""
    if isinstance(node, dict):
        if isinstance(node.get("name"), str):
            yield node["name"]
        for k, v in node.items():
            if k != "name":
                yield from names(v)
    elif isinstance(node, list):
        for v in node:
            yield from names(v)


def package_entities():
    ids = set()
    for path in glob.glob(os.path.join(PKG, "*.yaml")):
        with open(path, encoding="utf-8") as f:
            cfg = yaml.load(f, Loader=Loader) or {}
        for dom, ha_dom in DOMAINS.items():
            for name in names(cfg.get(dom) or []):
                for n in ([name.replace("${fan_name}", fn) for fn in FAN_NAMES] if "${fan_name}" in name else [name]):
                    ids.add(f"{ha_dom}.{slug(FRIENDLY + ' ' + n)}")
    return ids


def esphome_profiles():
    with open(os.path.join(PKG, "profiles.yaml"), encoding="utf-8") as f:
        text = f.read()
    cfg = yaml.load(text, Loader=Loader)
    options = next(s["options"] for s in cfg["select"] if s.get("id") == "dryer_profile")
    tables = {}
    for name, body in re.findall(r"static const Stage (\w+)\[\] = \{(.*?)\n\s*\};", text, re.S):
        rows = []
        for row in re.findall(r"\{([^{}]*)\}", body):
            parts = [p.strip() for p in re.findall(r'"[^"]*"|[^,]+', row)]
            nums = [float(p) for p in parts[:10]]
            strs = [None if p == "nullptr" else p.strip('"') for p in parts[10:12]]
            rows.append(nums + strs)
        tables[name] = rows
    order = re.search(r"static const Profile profiles\[\] = \{(.*?)\};", text, re.S)[1]
    stages = [tables.get(m, []) for m in re.findall(r"\{(\w+), \d+\}", order)]
    return options, stages


def walk(node, path=""):
    if isinstance(node, dict):
        for k, v in node.items():
            yield from walk(v, f"{path}.{k}")
    elif isinstance(node, list):
        for i, v in enumerate(node):
            yield from walk(v, f"{path}[{i}]")
    else:
        yield path, node


def find_variables(node, out):
    if isinstance(node, dict):
        if node.get("type") == "custom:button-card" and "variables" in node:
            out.append(node["variables"])
        for v in node.values():
            find_variables(v, out)
    elif isinstance(node, list):
        for v in node:
            find_variables(v, out)


def check_profiles(dash, options, stages, errors):
    found = []
    find_variables(dash, found)
    for var in found:
        profiles = var.get("profiles")
        if profiles is None:
            continue
        got = [p["name"] for p in profiles]
        if got != options:
            errors.append(f"profile names {got} != select options {options}")
            continue
        for p, ref in zip(profiles, stages):
            rows = [[float(x) for x in s[:10]] + [s[10], s[11]] for s in p["stages"]]
            if rows != ref:
                errors.append(f"profile '{p['name']}' stages differ from profiles.yaml:\n  {rows}\n  {ref}")
            for k in ("level", "about", "meat", "room", "prep", "done", "tip"):
                if not p.get(k):
                    errors.append(f"profile '{p['name']}' missing guide text '{k}'")
    return len(found)


def scenarios(entities):
    base = {e: "unavailable" for e in entities}
    num = {"teplota": "17.4", "vlhkost": "78", "vykon_ventilatoru": "35", "ventilator_1_otacky": "820",
           "ventilator_2_otacky": "0", "cilova_vlhkost": "80", "pasmo_regulace_vlhkosti": "8",
           "maximalni_teplota": "15", "minimalni_vykon": "15", "maximalni_vykon": "60", "rucni_vykon": "50",
           "nouzovy_vykon": "60", "program_delka": "26", "program_uplynulo": "7.3", "program_zbyva": "18.7",
           "do_dalsi_faze": "30.5", "program_pocet_vypadku": "2", "program_doba_vypadku": "0.4",
           "dostupnost": "99.87", "pocet_vypadku": "3", "celkova_doba_provozu": "530.2",
           "doba_behu_ventilatoru": "410", "celkova_doba_vypadku": "1.2", "posledni_vypadek_delka": "12",
           "wifi_signal": "-61"}
    run = dict(base)
    for e in entities:
        key = e.split(".", 1)[1].removeprefix("susicka_na_maso_")
        if key in num:
            run[e] = num[key]
        elif e.startswith("binary_sensor."):
            run[e] = "off"
    run.update({
        "select.susicka_na_maso_profil": "Pastırma", "select.susicka_na_maso_rezim": "Automaticky",
        "binary_sensor.susicka_na_maso_program_bezi": "on", "binary_sensor.susicka_na_maso_vyzadovan_zasah": "on",
        "binary_sensor.susicka_na_maso_ventilator_2_porucha": "on",
        "binary_sensor.susicka_na_maso_vlhkost_mimo_profil": "on",
        "sensor.susicka_na_maso_faze_profilu": "2/4 Sušení 20 °C", "sensor.susicka_na_maso_pozadovany_zasah": "Lisování",
        "sensor.susicka_na_maso_stav_regulace": "Automaticky",
        "sensor.susicka_na_maso_program_konec": "2026-11-20T08:00:00+00:00",
        "sensor.susicka_na_maso_posledni_vypadek": "2026-10-30T03:20:00+00:00",
        "sensor.susicka_na_maso_posledni_start": "2026-10-30T03:32:00+00:00",
        "sensor.susicka_na_maso_historie_vypadku": "30.10. 03:20 0h12m; 21.10. 14:02 1h05m",
    })
    idle = dict(run)
    idle.update({"select.susicka_na_maso_profil": "Vlastní", "binary_sensor.susicka_na_maso_program_bezi": "off",
                 "binary_sensor.susicka_na_maso_vyzadovan_zasah": "off", "sensor.susicka_na_maso_teplota": "40",
                 "sensor.susicka_na_maso_historie_vypadku": "–"})
    missing = {}  # device never added to HA
    return {"running": run, "idle": idle, "offline": base, "missing": missing}


NODE = r"""
const fs = require('fs');
const {templates, scenarios} = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
globalThis.dashTap = undefined;
let bad = 0;
for (const [sname, st] of Object.entries(scenarios)) {
  const states = Object.fromEntries(Object.entries(st).map(([k, v]) => [k, {entity_id: k, state: v, attributes: {}}]));
  for (const t of templates) {
    try {
      const fn = new Function('states', 'variables', 'entity', 'hass', 'user', t.code);
      const out = fn(states, t.variables, states[t.entity], {states}, {name: 'test'});
      if (typeof out !== 'string') throw new Error('returned ' + typeof out);
      if (/undefined|NaN|\[object/.test(out)) throw new Error('suspicious output: ' + out.slice(0, 200));
      if (process.env.SHOW && sname === process.env.SHOW) console.log(`--- ${t.path}\n${out}`);
    } catch (e) {
      bad++;
      console.log(`${sname} ${t.path}: ${e.message}`);
    }
  }
}
process.exit(bad ? 1 : 0);
"""


def card_context(dash, path):
    """Variables and entity of the button-card that owns the template at path."""
    node, ctx = dash, {"variables": {}, "entity": None}
    for part in re.findall(r"\.([^.\[]+)|\[(\d+)\]", path):
        if isinstance(node, dict) and node.get("type") == "custom:button-card":
            ctx = {"variables": node.get("variables", {}), "entity": node.get("entity")}
        node = node[part[0]] if part[0] else node[int(part[1])]
    return ctx


def check_templates(dash, entities, errors):
    templates = []
    for path, val in walk(dash):
        if isinstance(val, str) and val.strip().startswith("[[[") and val.strip().endswith("]]]"):
            ctx = card_context(dash, path)
            templates.append({"path": path, "code": val.strip()[3:-3], **ctx})
    with tempfile.TemporaryDirectory() as tmp:
        data = os.path.join(tmp, "data.json")
        script = os.path.join(tmp, "run.js")
        with open(data, "w", encoding="utf-8") as f:
            json.dump({"templates": templates, "scenarios": scenarios(entities)}, f, ensure_ascii=False)
        with open(script, "w") as f:
            f.write(NODE)
        r = subprocess.run(["node", script, data], capture_output=True, text=True)
        if r.returncode:
            errors.append("JS templates failed:\n" + (r.stdout + r.stderr).strip())
        elif r.stdout:
            print(r.stdout)
    return len(templates)


def main(files):
    known = package_entities()
    options, stages = esphome_profiles()
    failed = False
    for path in files:
        with open(path, encoding="utf-8") as f:
            dash = yaml.safe_load(f)
        errors = []
        used = sorted({m for _, v in walk(dash) if isinstance(v, str) for m in ENTITY_RE.findall(v)})
        for e in used:
            if e not in known:
                errors.append(f"unknown entity {e}")
        n_prof = check_profiles(dash, options, stages, errors)
        n_js = check_templates(dash, used, errors)
        rel = os.path.relpath(path, ROOT)
        if errors:
            failed = True
            print(f"FAIL {rel}")
            for e in errors:
                print("  " + e)
        else:
            print(f"OK   {rel}: {len(used)} entities, {n_prof} profile tables, {n_js} JS templates")
    return 1 if failed else 0


if __name__ == "__main__":
    args = sys.argv[1:] or sorted(glob.glob(os.path.join(ROOT, "homeassistant", "*.yaml")))
    missing = [a for a in args if not os.path.isfile(a)]
    if missing:
        sys.exit(f"file not found: {', '.join(missing)}")
    if not shutil.which("node"):
        sys.exit("node not found, needed to run the button-card templates")
    sys.exit(main(args))
