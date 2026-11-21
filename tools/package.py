#!/usr/bin/env python3
"""Package with the locked Microsoft vsce CLI and validate before replacing dist."""
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile

from validate import validate

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "extension"

def main():
    manifest = json.loads((SOURCE / "package.json").read_text(encoding="utf-8"))
    version = manifest["version"]
    cli = ROOT / "tools/node_modules/@vscode/vsce/vsce"
    if not cli.is_file():
        raise SystemExit("Install the release tools with npm ci --prefix tools --ignore-scripts.")
    version_file = ROOT / "tools/node_modules/@vscode/vsce/package.json"
    tools = json.loads((ROOT / "tools/package.json").read_text(encoding="utf-8"))
    if json.loads(version_file.read_text(encoding="utf-8"))["version"] != tools["devDependencies"]["@vscode/vsce"]:
        raise SystemExit("Run npm ci --prefix tools --ignore-scripts to install the pinned vsce version.")
    dist = ROOT / "dist"
    dist.mkdir(exist_ok=True)
    output = dist / f"cppstart-{version}.vsix"
    environment = dict(os.environ, TZ="UTC", LC_ALL="C", SOURCE_DATE_EPOCH="946684800")
    # Package a clean copy. VSIX stores Unix modes, so a Windows checkout
    # or an executable umask should not change the published artifact.
    with tempfile.TemporaryDirectory(prefix=".cppstart-", dir=dist) as tmp:
        stage = Path(tmp) / "extension"
        shutil.copytree(SOURCE, stage, symlinks=True)
        for file in stage.rglob("*"):
            if file.is_symlink():
                raise SystemExit(f"Unexpected link in extension source: {file.relative_to(stage)}")
            if file.is_file(): file.chmod(0o644)
        result = Path(tmp) / output.name
        args = ["node", str(cli), "package", "--no-dependencies", "--no-yarn", "--out", str(result)]
        if not manifest.get("repository"):
            args.append("--allow-missing-repository")
        # Documents link externally using HTTPS; ship their contents as authored.
        args.append("--no-rewrite-relative-links")
        subprocess.run(args, cwd=stage, env=environment, check=True)
        validate(result)
        result.replace(output)
    print(f"{hashlib.sha256(output.read_bytes()).hexdigest()}  {output.relative_to(ROOT)}")
if __name__ == "__main__":
    main()
