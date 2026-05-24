#!/usr/bin/env python3
"""sync_printed_clis.py — Scanner da library do Printing Press.

Varre ~/printing-press/library/*/ e popula claude-hub/data/printed-clis.json
com metadados de cada CLI gerado:
  - name
  - api (NOI quando disponível)
  - version (do .printing-press.json)
  - scorecard (tier1, tier2, total)
  - generated_at
  - commands (lista de top-level comandos)
  - binary_path
  - has_mcp (se cmd/<api>-mcp/main.go existe)

Roda em --apply (default) ou --dry-run. Idempotente.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parent.parent
DATA_FILE = ROOT / "data" / "printed-clis.json"
LIBRARY = Path.home() / "printing-press" / "library"
PRESS_BIN = Path.home() / "go" / "bin" / "printing-press"


def _press_version() -> str | None:
    """Lê versão do binário printing-press, se presente no PATH ou ~/go/bin/."""
    if not PRESS_BIN.exists():
        return None
    try:
        out = subprocess.run(
            [str(PRESS_BIN), "--version"],
            capture_output=True, text=True, timeout=5
        )
        return out.stdout.strip() or None
    except (OSError, subprocess.SubprocessError):
        return None


def _read_manifest(cli_dir: Path) -> dict[str, Any]:
    """Lê .printing-press.json (proveniência) da CLI."""
    manifest = cli_dir / ".printing-press.json"
    if not manifest.exists():
        return {}
    try:
        return json.loads(manifest.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return {}


def _read_scorecard(cli_dir: Path) -> dict[str, Any] | None:
    """Lê scorecard mais recente da CLI (em proofs/scorecard.json ou similar)."""
    candidates = [
        cli_dir / "proofs" / "scorecard.json",
        cli_dir / "scorecard.json",
    ]
    for candidate in candidates:
        if candidate.exists():
            try:
                return json.loads(candidate.read_text(encoding="utf-8"))
            except (OSError, json.JSONDecodeError):
                continue
    return None


def _list_commands(cli_dir: Path, name: str) -> list[str]:
    """Tenta extrair comandos top-level do binário gerado."""
    binary = cli_dir / name
    if not binary.exists() or not os.access(binary, os.X_OK):
        return []
    try:
        out = subprocess.run(
            [str(binary), "--help"],
            capture_output=True, text=True, timeout=5
        )
        text = out.stdout + "\n" + out.stderr
    except (OSError, subprocess.SubprocessError):
        return []

    # Procura bloco "Available Commands:" do Cobra
    match = re.search(r"Available Commands:\n((?:\s+\S+\s+.+\n?)+)", text)
    if not match:
        return []
    commands = []
    for line in match.group(1).strip().splitlines():
        parts = line.strip().split(None, 1)
        if parts and parts[0] not in {"help", "completion"}:
            commands.append(parts[0])
    return commands


def _has_mcp(cli_dir: Path) -> bool:
    """Detecta se a CLI tem MCP server companion."""
    for child in cli_dir.iterdir():
        if child.is_dir() and child.name.startswith("cmd"):
            for sub in child.iterdir():
                if sub.is_dir() and "mcp" in sub.name.lower():
                    return True
    # Fallback: procurar binário <name>-pp-mcp
    return any(p.name.endswith("-mcp") and os.access(p, os.X_OK)
               for p in cli_dir.iterdir() if p.is_file())


def scan_library() -> list[dict[str, Any]]:
    """Varre ~/printing-press/library e retorna lista de CLIs."""
    if not LIBRARY.exists():
        return []

    clis: list[dict[str, Any]] = []
    for entry in sorted(LIBRARY.iterdir()):
        if not entry.is_dir() or entry.name.startswith("."):
            continue

        manifest = _read_manifest(entry)
        scorecard = _read_scorecard(entry)
        cli_name = manifest.get("cli_name") or f"{entry.name}-pp-cli"

        clis.append({
            "name": entry.name,
            "cli_name": cli_name,
            "api": manifest.get("api_name") or entry.name,
            "noi": manifest.get("noi"),
            "version": manifest.get("version"),
            "generated_at": manifest.get("generated_at"),
            "press_version": manifest.get("press_version"),
            "spec_source": manifest.get("spec_source"),
            "auth_type": manifest.get("auth_type"),
            "scorecard": {
                "tier1": (scorecard or {}).get("tier1"),
                "tier2": (scorecard or {}).get("tier2"),
                "total": (scorecard or {}).get("total"),
                "grade": (scorecard or {}).get("grade"),
            } if scorecard else None,
            "commands": _list_commands(entry, cli_name),
            "has_mcp": _has_mcp(entry),
            "binary_path": str(entry / cli_name) if (entry / cli_name).exists() else None,
            "library_path": str(entry),
        })
    return clis


def write_payload(apply: bool) -> dict[str, Any]:
    payload = {
        "generated_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "library_path": str(LIBRARY),
        "press_version": _press_version(),
        "clis": scan_library(),
    }
    if apply:
        DATA_FILE.write_text(
            json.dumps(payload, indent=2, ensure_ascii=False) + "\n",
            encoding="utf-8",
        )
    return payload


def main() -> int:
    parser = argparse.ArgumentParser(description="Sync printed CLIs library to claude-hub.")
    parser.add_argument("--dry-run", action="store_true", help="não escreve, só imprime.")
    parser.add_argument("--apply", action="store_true", help="escreve em data/printed-clis.json (default).")
    args = parser.parse_args()

    apply = not args.dry_run  # apply é o default
    payload = write_payload(apply=apply)
    count = len(payload["clis"])
    where = "WROTE" if apply else "DRY-RUN"
    print(f"[printed-clis] {where} {count} CLIs (press={payload['press_version'] or 'not installed'})")
    return 0


if __name__ == "__main__":
    sys.exit(main())
