"""API helpers para a aba Printed CLIs do claude-hub.

Operações:
  - list_clis(): lê data/printed-clis.json (gerado por scripts/sync_printed_clis.py).
  - get_cli(name): retorna detalhes de uma CLI específica.

Não toca no filesystem da library em runtime — só lê o JSON estático.
O sync vive em scripts/sync_printed_clis.py e roda no update.py.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parent.parent
PRINTED_JSON = ROOT / "data" / "printed-clis.json"


class PrintedClisError(Exception):
    """Erro de leitura de printed-clis.json."""


def _load() -> dict[str, Any]:
    if not PRINTED_JSON.exists():
        return {"generated_at": None, "library_path": "~/printing-press/library",
                "press_version": None, "clis": []}
    try:
        return json.loads(PRINTED_JSON.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise PrintedClisError(f"printed-clis.json inválido: {exc}") from exc


def list_clis() -> dict[str, Any]:
    """Retorna o payload completo: metadados + lista de CLIs."""
    return _load()


def get_cli(name: str) -> dict[str, Any] | None:
    """Retorna uma CLI por nome, ou None se não encontrada."""
    payload = _load()
    for cli in payload.get("clis", []):
        if cli.get("name") == name:
            return cli
    return None
