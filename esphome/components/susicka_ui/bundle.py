"""Builds the script served as /0.js: profile guide data, stylesheet and app code."""

import json
from pathlib import Path

import yaml

HERE = Path(__file__).parent


def build(here: Path = HERE) -> str:
    guide = yaml.safe_load((here / "guide.yaml").read_text(encoding="utf-8"))
    css = (here / "app.css").read_text(encoding="utf-8")
    app = (here / "app.js").read_text(encoding="utf-8")

    def dump(v):
        return json.dumps(v, ensure_ascii=False, separators=(",", ":"))

    return f"const GUIDE={dump(guide)};\nconst UI_CSS={dump(css)};\n{app}"
