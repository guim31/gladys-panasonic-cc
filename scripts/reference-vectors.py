# Run with aio-panasonic-comfort-cloud==2026.10.0 installed:
#   python3 scripts/reference-vectors.py > test/fixtures/reference-vectors.json
# Generates test vectors by running aio-panasonic-comfort-cloud itself.
import json, sys, copy, base64, hashlib
from aio_panasonic_comfort_cloud.panasonicrequestheader import PanasonicRequestHeader
from aio_panasonic_comfort_cloud.panasonicauthentication import _extract_guardian_config
from aio_panasonic_comfort_cloud.panasonicdevice import PanasonicDevice, PanasonicDeviceInfo
from aio_panasonic_comfort_cloud.changerequestbuilder import ChangeRequestBuilder
from aio_panasonic_comfort_cloud import constants
from aio_panasonic_comfort_cloud.testdata import return_data
from bs4 import BeautifulSoup

out = {}
# 1. API key
tokens = ["eyJhbGciOiJSUzI1NiJ9.eyJleHAiOjE4MDAwMDAwMDB9.c2ln", "token-two", "a" * 120]
stamps = ["2026-10-14 08:30:00", "2024-02-29 23:59:59", "2026-01-01 00:00:00"]
out["apiKey"] = [{"timestamp": s, "token": t, "key": PanasonicRequestHeader._get_api_key(s, t)} for s in stamps for t in tokens]
# 2. PKCE challenge (same expression as authenticate())
def challenge(v):
    return base64.urlsafe_b64encode(hashlib.sha256(v.encode('utf-8')).digest()).split('='.encode('utf-8'))[0].decode('utf-8')
verifiers = ["dBjftJeZ4CVPmB92K27uhbUJU1p1r_wW1gFWFOEjXk0"[:43], "A" * 43, "abcdefghijklmnopqrstuvwxyz0123456789ABCDEFG"]
out["pkce"] = [{"verifier": v, "challenge": challenge(v)} for v in verifiers]
# 3. Guardian config
guardian_html = '''<html><head><title>Panasonic Digital Platform - MFA Standard</title></head><body>
<script>
  window.__g_config = {
    // the hosted MFA widget
    postActionURL: "https://authglb.digital.panasonic.com/login/callback?state=abc\\u0026x=1",
    serviceUrl: "https://example-mfa.guardian.auth0.com",
    requestToken: "req.tok.en",
    stateCheckingMechanism: "polling",
    theme: { icon: "" }
  };
</script></body></html>'''
out["guardian"] = {"html": guardian_html, "config": _extract_guardian_config(guardian_html), "none": _extract_guardian_config("<html>nothing</html>")}
# 4. hidden inputs
form_html = '''<form method="post" name="hiddenform" action="https://authglb.digital.panasonic.com/login/callback">
<input type="hidden" name="wa" value="wsignin1.0">
<input type="hidden"
       name="wresult"
       value="eyJ0eXAi.eyJzdWIi.c2ln&amp;more">
<input name="wctx" type="hidden" value='{&#34;strategy&#34;:&#34;auth0&#34;,&#34;state&#34;:&#34;s1&#34;}'>
<input type="text" name="visible" value="no">
<noscript><p>Script is disabled. Click Submit to continue.</p><input type="submit" value="Submit"></noscript>
</form>'''
soup = BeautifulSoup(form_html, "html.parser")
out["hiddenInputs"] = {"html": form_html, "parameters": {i.get("name"): i.get("value") for i in soup.find_all("input", {"type": "hidden"})}}

# 5. Device parsing
def describe(dev, info):
    p = dev.parameters
    f = dev.features
    return {
        "power": p.power.value, "mode": p.mode.value, "fanSpeed": p.fan_speed.value,
        "targetTemperature": p.target_temperature, "insideTemperature": p.inside_temperature,
        "outsideTemperature": p.outside_temperature,
        "verticalSwing": p.vertical_swing_mode.value, "horizontalSwing": p.horizontal_swing_mode.value,
        "ecoMode": p.eco_mode.value, "nanoe": p.nanoe_mode.value, "ecoNavi": p.eco_navi_mode.value,
        "ecoFunction": p.eco_function_mode.value,
        "hasNanoe": dev.has_nanoe, "hasEcoNavi": dev.has_eco_navi, "hasEcoFunction": dev.has_eco_function,
        "hasHorizontalSwing": dev.has_horizontal_swing, "hasInside": dev.has_inside_temperature,
        "hasOutside": dev.has_outside_temperature,
        "features": {"auto": f.auto_mode, "cool": f.cool_mode, "heat": f.heat_mode, "dry": f.dry_mode, "fan": f.fan_mode,
                     "powerful": f.powerful_mode, "quiet": f.quiet_mode, "summerHouse": f.summer_house,
                     "autoSwingUD": f.auto_swing_ud},
    }

base = return_data()
variants = {}
variants["real"] = (base, "3")
v = copy.deepcopy(base); v["parameters"].update({"operate": 0, "operationMode": 3, "fanAutoMode": 1, "airSwingUD": 4, "airSwingLR": 5, "ecoMode": 1, "outTemperature": 126, "insideTemperature": 19.5, "temperatureSet": 23}); variants["heat-fixed"] = (v, "3")
v = copy.deepcopy(base); v["nanoe"] = True; v["ecoNavi"] = True; v["ecoFunction"] = 1; v["parameters"].update({"nanoe": 2, "ecoNavi": 1, "ecoFunctionData": 2, "fanAutoMode": 2, "airSwingUD": 0, "airSwingLR": 0, "airDirection": 0, "operationMode": 2, "fanSpeed": 4}); variants["cool-nanoe"] = (v, "1")
v = copy.deepcopy(base); v["parameters"].update({"fanAutoMode": 3, "airSwingUD": 1, "airSwingLR": 1, "airDirection": 3}); variants["lr-auto-direction3"] = (v, "1")
v = copy.deepcopy(base); v["airSwingLR"] = False; v["parameters"].update({"airSwingLR": 6, "fanAutoMode": 1, "nanoe": 3}); v["nanoe"] = True; variants["no-lr"] = (v, "1")
v = copy.deepcopy(base); v["parameters"].update({"airSwingLR": 2, "airDirection": 0}); variants["ducted"] = (v, "5")
v = copy.deepcopy(base); v["autoSwingUD"] = True; v["parameters"].update({"fanAutoMode": 1, "airSwingUD": 5, "insideTemperature": 126}); variants["ud-swing5"] = (v, "1")
out["devices"] = {}
for name, (status, dtype) in variants.items():
    info = PanasonicDeviceInfo({"deviceGuid": "CS-TEST+0000000001", "deviceName": "Test", "deviceType": dtype, "parameters": {}})
    dev = PanasonicDevice(info, status)
    out["devices"][name] = {"deviceType": dtype, "status": status, "parsed": describe(dev, info)}

# 6. Change requests
def builder_for(status):
    info = PanasonicDeviceInfo({"deviceGuid": "CS-TEST+0000000001", "deviceType": "1", "parameters": {}})
    return ChangeRequestBuilder(PanasonicDevice(info, status))
cases = []
for name in ["real", "heat-fixed", "cool-nanoe", "lr-auto-direction3"]:
    status = out["devices"][name]["status"]
    for ud in constants.AirSwingUD:
        b = builder_for(status); b.set_vertical_swing(ud)
        cases.append({"device": name, "op": "vertical", "value": ud.value, "request": b.build()})
    for lr in constants.AirSwingLR:
        if lr == constants.AirSwingLR.Unavailable: continue
        b = builder_for(status); b.set_horizontal_swing(lr)
        cases.append({"device": name, "op": "horizontal", "value": lr.value, "request": b.build()})
    for m in constants.OperationMode:
        b = builder_for(status); b.set_hvac_mode(m)
        cases.append({"device": name, "op": "mode", "value": m.value, "request": b.build()})
    b = builder_for(status); b.set_target_temperature(21.5)
    cases.append({"device": name, "op": "temperature", "value": 21.5, "request": b.build()})
    for e in constants.EcoMode:
        b = builder_for(status); b.set_eco_mode(e)
        cases.append({"device": name, "op": "eco", "value": e.value, "request": b.build()})
out["changeRequests"] = cases
json.dump(out, sys.stdout, indent=1, ensure_ascii=False)
