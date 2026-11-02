#!/usr/bin/env python3
"""Development server for the on-device web UI (esphome/components/susicka_ui).

Serves the page like the device does, the script is rebuilt on every request.

  scripts/webui_dev.py --mock [running|idle]   fake device states, no hardware needed
  scripts/webui_dev.py --device HOST           live states from the device (auth from esphome/secrets.yaml);
                                               control requests are only logged unless --allow-control

Open http://localhost:8099/
"""

import argparse
import base64
import http.client
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
import os
import sys
import time

try:
    import yaml
except ImportError:
    sys.exit("PyYAML missing, run with ESPHome's python: $(head -1 $(command -v esphome) | cut -c3-) " + sys.argv[0])

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "esphome", "components", "susicka_ui"))
from bundle import build  # noqa: E402

# Same page as web_server build_index_html() with js_url: /0.js
INDEX = ("<!DOCTYPE html><html><head><meta charset=UTF-8><link rel=icon href=data:></head><body>"
         "<esp-app></esp-app><script src=\"/0.js\"></script></body></html>")


def mock_states(scenario):
    def n(name, v, lo, hi, step, uom):
        return ("number/" + name, {"value": str(v), "state": f"{v} {uom}", "min_value": str(lo),
                                   "max_value": str(hi), "step": str(step), "uom": uom})

    def sel(name, v, opts):
        return ("select/" + name, {"value": v, "state": v, "option": opts})

    def sen(name, v, uom=""):
        return ("sensor/" + name, {"value": v, "state": f"{v} {uom}".strip(), "uom": uom})

    def txt(name, v):
        return ("text_sensor/" + name, {"value": v, "state": v})

    def bs(name, v):
        return ("binary_sensor/" + name, {"value": v, "state": "ON" if v else "OFF"})

    def btn(name):
        return ("button/" + name, {})

    guide = yaml.safe_load(open(os.path.join(ROOT, "esphome", "components", "susicka_ui", "guide.yaml"), encoding="utf-8"))
    profiles = [p["name"] for p in guide["profiles"]]
    now = int(time.time())
    run = scenario == "running"
    items = [
        sen("Teplota", 14.6, "°C"), sen("Vlhkost", 78.4, "%"), sen("Výkon ventilátorů", 32, "%"),
        txt("Stav regulace", "Automaticky, odvlhčování"), sel("Režim", "Automaticky", ["Automaticky", "Ručně", "Vypnuto"]),
        n("Ruční výkon", 50, 0, 100, 1, "%"), n("Cílová vlhkost", 75, 30, 90, 1, "%"),
        n("Pásmo regulace vlhkosti", 8, 2, 40, 1, "%"), n("Maximální teplota", 15, 10, 45, 0.5, "°C"),
        n("Minimální výkon", 15, 0, 100, 1, "%"), n("Maximální výkon", 50, 0, 100, 1, "%"),
        n("Nouzový výkon", 60, 0, 100, 1, "%"), n("Program délka", 98 if run else 14, 0.5, 420, 0.5, "d"),
        sen("Ventilátor 1 otáčky", 812, "RPM"), bs("Ventilátor 1 porucha", False),
        sen("Ventilátor 2 otáčky", 798, "RPM"), bs("Ventilátor 2 porucha", False),
        sel("Profil", "Speck (kýta)" if run else "Vlastní", profiles),
        txt("Fáze profilu", "2/2 Zrání" if run else "Vlastní nastavení"),
        sen("Do další fáze", None, "h"),
        bs("Vyžadován zásah", run), txt("Požadovaný zásah", "Studené uzení (max. 20 °C)" if run else "–"),
        btn("Zásah proveden"), bs("Teplota mimo profil", False), bs("Vlhkost mimo profil", False),
        sel("Program odpočet", "Reálný čas", ["Reálný čas", "Jen doba provozu"]),
        sel("Program po dokončení", "Pokračovat", ["Pokračovat", "Vypnout ventilátory"]),
        btn("Program start"), btn("Program stop"), bs("Program běží", run), bs("Program dokončen", False),
        sen("Program uplynulo", 8.3 if run else 0, "d"), sen("Program zbývá", 89.7 if run else 0, "d"),
        sen("Program konec", now + int(89.7 * 86400) if run else None),
        sen("Program doba výpadků", 0.4, "h"), sen("Program počet výpadků", 1),
        sen("Celková doba provozu", 1240.5, "h"), sen("Doba běhu ventilátorů", 1180.2, "h"),
        sen("Celková doba výpadků", 1.6, "h"), sen("Počet výpadků", 3), sen("Dostupnost", 99.87, "%"),
        sen("Poslední výpadek", now - 5 * 86400), sen("Poslední výpadek délka", 24, "min"),
        sen("Poslední start", now - 5 * 86400 + 1440),
        txt("Historie výpadků", "27.10. 03:20 0h24m; 21.10. 14:02 1h05m; 02.10. 22:47 0h07m"),
        btn("Vynulovat statistiky"), sen("WiFi signál", -61, "dBm"), sen("Doba běhu", 431000, "s"), btn("Restart"),
    ]
    out = []
    for key, d in items:
        dom, name = key.split("/", 1)
        out.append({"name_id": key, "id": dom + "-x", "domain": dom, "name": name, **d})
    return out


def mock_history():
    """Synthetic 6 h of samples, injected into localStorage for screenshots."""
    import math
    now = int(time.time() * 1000)
    t, rh = [], []
    for i in range(360):
        ts = now - (360 - i) * 60000
        t.append([ts, round(14.2 + 0.5 * math.sin(i / 50), 2)])
        rh.append([ts, round(77 + 2.5 * math.sin(i / 23) + 0.8 * math.sin(i / 7), 2)])
    return {"t": t, "rh": rh}


class Handler(BaseHTTPRequestHandler):
    args = None

    def log_message(self, fmt, *a):
        if not self.path.startswith("/events"):
            sys.stderr.write("%s\n" % (fmt % a))

    def send(self, code, body=b"", ctype="text/plain"):
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        if self.path == "/":
            page = INDEX
            if self.args.mock:
                seed = json.dumps(mock_history())
                page = page.replace("<esp-app>", f"<script>localStorage.setItem('susicka-hist','{seed}')</script><esp-app>")
            return self.send(200, page.encode(), "text/html; charset=utf-8")
        if self.path == "/0.js":
            return self.send(200, build().encode(), "text/javascript; charset=utf-8")
        if self.args.mock:
            if self.path == "/events":
                return self.mock_events()
            return self.send(404)
        return self.proxy("GET")

    def do_POST(self):
        if self.args.mock or not self.args.allow_control:
            sys.stderr.write(f"control (not sent): POST {self.path}\n")
            return self.send(200)
        return self.proxy("POST")

    def mock_events(self):
        self.send_response(200)
        self.send_header("Content-Type", "text/event-stream")
        self.send_header("Cache-Control", "no-cache")
        self.end_headers()
        ev = [("ping", {"title": "Sušička na maso", "uptime": 431000})]
        ev += [("state", s) for s in mock_states(self.args.mock)]
        try:
            for name, data in ev:
                self.wfile.write(f"event: {name}\ndata: {json.dumps(data, ensure_ascii=False)}\n\n".encode())
            self.wfile.flush()
            while True:
                time.sleep(10)
                self.wfile.write(b"event: ping\ndata: {}\n\n")
                self.wfile.flush()
        except (BrokenPipeError, ConnectionResetError):
            pass

    def proxy(self, method):
        conn = http.client.HTTPConnection(self.args.device, 80, timeout=None if self.path == "/events" else 15)
        try:
            conn.request(method, self.path, headers={"Authorization": "Basic " + self.args.auth})
            r = conn.getresponse()
            self.send_response(r.status)
            for k, v in r.getheaders():
                if k.lower() in ("content-type", "content-encoding", "cache-control"):
                    self.send_header(k, v)
            self.end_headers()
            while chunk := r.read1(4096):
                self.wfile.write(chunk)
                self.wfile.flush()
        except (BrokenPipeError, ConnectionResetError):
            pass
        except OSError as e:
            self.send(502, str(e).encode())
        finally:
            conn.close()


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    g = ap.add_mutually_exclusive_group(required=True)
    g.add_argument("--mock", nargs="?", const="running", choices=["running", "idle"])
    g.add_argument("--device", help="device host, e.g. susicka-maso.local")
    ap.add_argument("--allow-control", action="store_true", help="forward POST requests to the device")
    ap.add_argument("--port", type=int, default=8099)
    args = ap.parse_args()
    if args.device:
        path = os.path.join(ROOT, "esphome", "secrets.yaml")
        if not os.path.isfile(path):
            sys.exit("esphome/secrets.yaml missing (web_username, web_password)")
        s = yaml.safe_load(open(path, encoding="utf-8"))
        args.auth = base64.b64encode(f"{s['web_username']}:{s['web_password']}".encode()).decode()
    build()  # fail early on a broken guide.yaml
    Handler.args = args
    print(f"http://localhost:{args.port}/  ({'mock ' + args.mock if args.mock else 'device ' + args.device})")
    ThreadingHTTPServer(("127.0.0.1", args.port), Handler).serve_forever()


if __name__ == "__main__":
    main()
