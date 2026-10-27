"""Build deterministic Valenced packages from the working published Revenge bundles"""
import hashlib
import io
import json
from pathlib import Path
import zipfile

ROOT = Path(__file__).resolve().parents[1]
BASE = "https://raw.githubusercontent.com/FloralFlarya/revenge/main/valenced"


def build():
    runtime = (ROOT / "valenced/runtime.js").read_text()
    index = {"format": 1, "name": "Flarya Plugins", "description": "Blocklist, PingColor and Staff Tags for Valenced", "plugins": {}}
    for name in ("blocklist", "pingcolor", "stafftag"):
        old = json.loads((ROOT / name / "manifest.json").read_text())
        manifest = {
            "format": 1, "id": f"flarya.{name}", "name": old["name"],
            "description": old["description"], "author": "Flarya <435847641041993759>",
            "contributors": [f'{a["name"]} <{a["id"]}>' for a in old["authors"] if a["name"] != "Flarya"],
            "version": "1.0.0", "dependencies": {"valenced.api": {"version": ">=1 <2"}, "discord": {"version": "*"}},
            "dist": {"script": "index.js"},
        }
        legacy = (ROOT / name / "index.js").read_text().strip().rstrip(";")
        script = """(function () {
%s
let legacy;
let compatibility;
return { default: plugin({
    jsonStorage: { default: {} },
    async start(api) {
        await api.jsonStorage.get();
        const vendetta = compatibility = createCompatibility(api);
        legacy = (%s).default;
        api.cleanup(async () => {
            try { legacy.onUnload?.(); }
            finally { legacy = undefined; await compatibility.flush(); }
        });
        legacy.onLoad?.();
    },
    SettingsComponent() {
        return legacy?.settings ? valenced.react.React.createElement(legacy.settings) : null;
    },
}) };
})()
""" % (runtime, legacy)
        archive = io.BytesIO()
        with zipfile.ZipFile(archive, "w", compression=zipfile.ZIP_DEFLATED) as output:
            for filename, content in (("manifest.json", json.dumps(manifest, ensure_ascii=False, indent=2)), ("index.js", script)):
                info = zipfile.ZipInfo(filename, (2026, 1, 1, 0, 0, 0))
                info.compress_type = zipfile.ZIP_DEFLATED
                info.external_attr = 0o100644 << 16
                output.writestr(info, content.encode())
        data = archive.getvalue()
        filename = f'{manifest["id"]}-{manifest["version"]}.zip'
        (ROOT / "valenced" / filename).write_bytes(data)
        index["plugins"][manifest["id"]] = {
            **{key: manifest[key] for key in ("name", "description", "author", "contributors")},
            "channels": {"latest": manifest["version"]},
            "versions": {manifest["version"]: {"url": f"{BASE}/{filename}", "sha256": hashlib.sha256(data).hexdigest(), "size": len(data), "dependencies": manifest["dependencies"]}},
        }
    (ROOT / "valenced/index.json").write_text(json.dumps(index, ensure_ascii=False, indent=2) + "\n")
    print("Built 3 Valenced packages and valenced/index.json")


if __name__ == "__main__":
    build()
