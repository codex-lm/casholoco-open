"""Local export precheck; optionally run a supplied LOB7 static recipe too."""
from __future__ import annotations

import argparse
import importlib.util
import json
from pathlib import Path
import re


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("directory", nargs="?", default="dist")
    parser.add_argument("--recipe", type=Path, help="Path to the current LOB7 static_game.py validator")
    parser.add_argument("--edition", choices=("solo", "peer"), default="solo")
    args = parser.parse_args()
    root = Path(args.directory).resolve()
    files = sorted(p for p in root.rglob("*") if p.is_file())
    assert root.is_dir() and files, "Export is missing or empty; run npm run build and npm run export:lob7"
    assert len(files) <= 500, "More than 500 files"
    assert sum(p.stat().st_size for p in files) <= 256 * 1024 * 1024, "Export exceeds 256 MiB"
    assert all(not p.is_symlink() and p.stat().st_size <= 64 * 1024 * 1024 for p in files)
    manifest = json.loads((root / "LOB7-GAME.json").read_text(encoding="utf-8"))
    assert manifest["entrypoint"] == "index.html"
    assert (root / "LICENSE").stat().st_size > 0
    html = (root / "index.html").read_text(encoding="utf-8")
    assert not re.search(r"<(?:form|iframe|object|embed|base)\b", html, re.I)
    scripts = [p for p in files if p.suffix in {".js", ".mjs"}]
    for script in scripts:
        text = script.read_text(encoding="utf-8")
        if args.edition == "solo":
            assert not re.search(r"\bRTCPeerConnection\b|CASHOLOCO-PEER-1|casholoco-peer/1", text), "Peer networking leaked into the solo export"
        for expression in [r"\bWebSocket\b", r"\bEventSource\b", r"\bserviceWorker\b", r"(?<![\w$.])import\s*\(", r"\beval\s*\(", r"new\s+Function\b"]:
            assert not re.search(expression, text), f"Unsupported browser feature {expression} in {script.name}"
    report = {"edition": args.edition, "files": len(files), "bytes": sum(p.stat().st_size for p in files), "basicPrecheck": "passed", "lob7Recipe": "not-run"}
    if args.recipe:
        spec = importlib.util.spec_from_file_location("lob7_static_recipe", args.recipe.resolve())
        assert spec and spec.loader
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        result = module.validate_game(root)
        report["lob7Recipe"] = "passed"
        report["servedFiles"] = len(result["web_files"])
    print(json.dumps(report, ensure_ascii=False))


if __name__ == "__main__":
    main()
