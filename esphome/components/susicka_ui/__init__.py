"""Custom web UI for the meat dryer, replaces the stock ESPHome web server page.

The bundled script is served by web_server as /0.js; web_server must load it with
js_url: /0.js (packages/webui.yaml). Works without internet and Home Assistant.
"""

import esphome.codegen as cg
from esphome.components.web_server import add_resource_as_progmem
import esphome.config_validation as cv
from esphome.const import CONF_JS_INCLUDE, CONF_JS_URL
import esphome.final_validate as fv

from .bundle import build

DEPENDENCIES = ["web_server"]

CONFIG_SCHEMA = cv.Schema({})


def _final_validate(config):
    web = fv.full_config.get().get("web_server", {})
    if web.get(CONF_JS_URL) != "/0.js" or CONF_JS_INCLUDE in web:
        raise cv.Invalid("susicka_ui needs web_server with js_url: /0.js and without js_include")
    return config


FINAL_VALIDATE_SCHEMA = _final_validate


async def to_code(config):
    add_resource_as_progmem("JS_INCLUDE", build())
    cg.add_define("USE_WEBSERVER_JS_INCLUDE")
