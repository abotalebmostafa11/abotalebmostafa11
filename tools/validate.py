#!/usr/bin/env python3
"""Validate manifest, all assets, extension bytes and no undeclared payload."""
import json
from pathlib import Path, PurePosixPath
import sys
from xml.etree import ElementTree as ET
from zipfile import ZipFile

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "extension"
EXCLUDED = {".vscodeignore", ".gitignore", ".gitattributes", ".npmignore", ".DS_Store"}
NS = "{http://schemas.microsoft.com/developer/vsx-schema/2011}"
CT = "{http://schemas.openxmlformats.org/package/2006/content-types}"

def require(condition, message):
    if not condition:
        raise ValueError(message)

def validate(package):
    with ZipFile(package) as vsix:
        names = vsix.namelist()
        require(len(names) == len(set(names)), "Duplicate names in archive")
        unique = set(names)
        require(vsix.testzip() is None, "ZIP integrity failure")
        for name in names:
            path = PurePosixPath(name)
            require(not path.is_absolute() and ".." not in path.parts and "\\" not in name and
                    (name.startswith("extension/") or name in ("extension.vsixmanifest","[Content_Types].xml")), f"Invalid VSIX path {name}")
        manifest=ET.fromstring(vsix.read("extension.vsixmanifest"))
        meta=manifest.find(NS+"Metadata")
        identity=meta.find(NS+"Identity")
        ext=json.loads(vsix.read("extension/package.json"))
        require(ext["publisher"]=="cppstart" and ext["name"]=="cppstart-run", "Wrong extension identity")
        for attr,key in (("Publisher","publisher"),("Id","name"),("Version","version")):
            require(identity.get(attr)==ext[key], f"Identity mismatch in {attr}")
        require(not ext.get("dependencies") and not ext.get("optionalDependencies"), "Extension unexpectedly declares runtime npm packages")
        require(meta.findtext(NS+"DisplayName")==ext["displayName"], "Extension display name mismatch")
        assets={asset.get("Type"):asset.get("Path") for asset in manifest.findall(NS+"Assets/"+NS+"Asset")}
        for value in assets.values(): require(value in unique, f"Missing declared VSIX asset {value}")
        for kind in ("Microsoft.VisualStudio.Code.Manifest","Microsoft.VisualStudio.Services.Icons.Default",
                     "Microsoft.VisualStudio.Services.Content.Details","Microsoft.VisualStudio.Services.Content.License"):
            require(kind in assets, f"Missing package metadata {kind}")
        require(assets["Microsoft.VisualStudio.Services.Icons.Default"]=="extension/"+ext["icon"], "Wrong Marketplace icon")
        require("extension/"+ext["main"].removeprefix("./") in unique, "Missing extension entry point")
        required = {"extension/bootstrap.js", "extension/runtime/windows/setup.ps1",
                    "extension/runtime/windows/vscode-run.ps1", "extension/runtime/windows/program-utf8.res",
                    "extension/runtime/macos/vscode-run.sh", "extension/fonts/NotoSansBengali.ttf",
                    "extension/fonts/OFL.txt", "extension/fonts/Bengali-Regular.ttf",
                    "extension/runtime/windows/font.ps1", "extension/editorFont.js"}
        require(required <= unique, "Missing compiler, runner, or font assets: "+str(required-unique))
        types=ET.fromstring(vsix.read("[Content_Types].xml"))
        defaults={n.get("Extension").lstrip(".").lower() for n in types.findall(CT+"Default")}
        overrides={n.get("PartName").lstrip("/") for n in types.findall(CT+"Override")}
        originals={}
        for path in SOURCE.rglob("*"):
            if not path.is_file() or path.name in EXCLUDED: continue
            rel=path.relative_to(SOURCE).as_posix()
            originals[("extension/"+rel).lower()]=path
        for name in unique:
            if name=="[Content_Types].xml": continue
            require(PurePosixPath(name).suffix.lstrip(".").lower() in defaults or name in overrides, f"Undeclared content type {name}")
            if not name.startswith("extension/"): continue
            path=originals.pop(name.lower(),None)
            require(path is not None, f"Unexpected packaged extension file {name}")
            packed=vsix.read(name)
            require(path.read_bytes()==packed, f"Packaged source mismatch {name}")
        require(not originals,"Source files missing in the VSIX: "+", ".join(originals))
    print(f"Verified {ext['publisher']}.{ext['name']}@{ext['version']}, {len(names)} package records and all source bytes.")

if __name__=="__main__":
    paths=sys.argv[1:]
    if len(paths)!=1: raise SystemExit("Usage: python3 tools/validate.py dist/cppstart-VERSION.vsix")
    validate(Path(paths[0]))
