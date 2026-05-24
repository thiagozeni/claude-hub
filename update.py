#!/usr/bin/env python3
"""
update.py — Atualiza os dados do Claude Hub antes de servir.

O que faz:
  - Percorre cada projeto em projects.json
  - Lê o mtime real dos arquivos no disco (ignora .git, node_modules, etc.)
  - Atualiza lastActivity se mudou
  - Detecta novos diretórios em /Users/pro15/Claude/ não cadastrados
  - Varre o estado git de todos os projetos em /Users/pro15/Claude/
  - Reescreve a seção <!-- GIT_STATE_START --> ... <!-- GIT_STATE_END --> no CLAUDE.md
"""

import json
import os
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

DASHBOARD_DIR = Path(__file__).parent
DATA_DIR = DASHBOARD_DIR / "data"
sys.path.insert(0, str(DASHBOARD_DIR / "scripts"))
CLAUDE_DIR = Path("/Users/pro15/Claude")
CLAUDE_MD = CLAUDE_DIR / "CLAUDE.md"

SKIP_DIRS = {".git", "node_modules", ".DS_Store", "__pycache__", ".cache",
             ".venv", "venv", "dist", "build", ".next"}

# Diretórios que NÃO são projetos individuais (containers ou infra do workspace)
# Subprojetos dentro de containers já estão registrados separadamente no projects.json.
NON_PROJECT_DIRS = {
    "3-contra-todos",   # container — sub: -game, -landing, -social já cadastrados
    "verifier-mvp",     # infra (hook pós-turn do Claude Code)
    "_archive",         # arquivo histórico
}

# Projetos cujo path é muito amplo: lista de arquivos específicos a verificar
SPECIFIC_FILES = {
    "/Users/pro15": [
        "/Users/pro15/ai-router.sh",
        "/Users/pro15/ai-classifier.py",
        "/Users/pro15/ai-code.sh",
        "/Users/pro15/ai-reason.sh",
        "/Users/pro15/gemini-cli.py",
    ]
}

GIT_STATE_START = "<!-- GIT_STATE_START -->"
GIT_STATE_END   = "<!-- GIT_STATE_END -->"


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _run(cmd: list[str]) -> str:
    """Run a subprocess command and return stdout stripped, or '' on error."""
    try:
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=10,
        )
        return result.stdout.strip()
    except Exception:
        return ""


# ---------------------------------------------------------------------------
# File-system mtime helpers (unchanged)
# ---------------------------------------------------------------------------

def latest_mtime(path: str) -> str | None:
    # Arquivos específicos (evita varrer home dir inteiro)
    if path in SPECIFIC_FILES:
        latest = 0.0
        for f in SPECIFIC_FILES[path]:
            try:
                mtime = os.stat(f).st_mtime
                if mtime > latest:
                    latest = mtime
            except FileNotFoundError:
                pass
        return datetime.fromtimestamp(latest).strftime("%Y-%m-%d") if latest else None

    if not os.path.isdir(path):
        return None

    latest = 0.0
    for root, dirs, files in os.walk(path):
        # Poda in-place: os.walk não desce em dirs removidos
        dirs[:] = [d for d in dirs if d not in SKIP_DIRS]
        for fname in files:
            try:
                mtime = os.stat(os.path.join(root, fname)).st_mtime
                if mtime > latest:
                    latest = mtime
            except OSError:
                pass

    return datetime.fromtimestamp(latest).strftime("%Y-%m-%d") if latest else None


# ---------------------------------------------------------------------------
# projects.json updater (unchanged)
# ---------------------------------------------------------------------------

def update_projects():
    projects_file = DATA_DIR / "projects.json"
    with open(projects_file, encoding="utf-8") as f:
        projects = json.load(f)

    known_ids = {p["id"] for p in projects}
    changed = False

    for project in projects:
        path = project.get("path")
        if not path:
            continue
        last = latest_mtime(path)
        if last and last != project.get("lastActivity"):
            print(f"  up {project['name']}: {project.get('lastActivity')} -> {last}")
            project["lastActivity"] = last
            changed = True

    # Detecta diretórios novos em /Users/pro15/Claude/ não cadastrados
    if CLAUDE_DIR.exists():
        for entry in sorted(CLAUDE_DIR.iterdir()):
            if (entry.is_dir()
                    and entry.name not in known_ids
                    and entry.name not in NON_PROJECT_DIRS
                    and not entry.name.startswith(".")):
                print(f"  [aviso] Novo diretório não cadastrado: {entry.name}")

    if changed:
        with open(projects_file, "w", encoding="utf-8") as f:
            json.dump(projects, f, indent=2, ensure_ascii=False)
        print("  ok projects.json salvo")
    else:
        print("  . projects.json sem alterações")


# ---------------------------------------------------------------------------
# Git state scanner
# ---------------------------------------------------------------------------

def git_state_for_project(path: str) -> dict:
    """
    Collect git state for a single project directory.

    Returns a dict with keys:
      name, has_git, last_commit_msg, last_commit_date,
      uncommitted, stale, stale_days, remote_url
    """
    p = Path(path)
    name = p.name

    if not (p / ".git").exists():
        return {
            "name": name,
            "has_git": False,
            "last_commit_msg": "",
            "last_commit_date": "",
            "uncommitted": [],
            "stale": False,
            "stale_days": 0,
            "remote_url": "",
        }

    # Uncommitted files
    status_out = _run(["git", "-C", path, "status", "--short"])
    uncommitted = [line for line in status_out.splitlines() if line.strip()]

    # Last commit message
    last_msg = _run(["git", "-C", path, "log", "--oneline", "-1", "--format=%s"])

    # Last commit ISO date (full, e.g. "2026-03-28 14:32:01 +0000")
    last_date_raw = _run(["git", "-C", path, "log", "--oneline", "-1", "--format=%ci"])
    # Normalise to YYYY-MM-DD
    last_date = last_date_raw[:10] if last_date_raw else ""

    # Staleness: any commits in the last 7 days?
    recent_out = _run(["git", "-C", path, "log", "--since=7 days ago", "--oneline"])
    stale = len(recent_out.strip()) == 0 if last_date else False

    # Approximate days since last commit
    stale_days = 0
    if last_date:
        try:
            last_dt = datetime.strptime(last_date, "%Y-%m-%d")
            today = datetime.now()
            stale_days = (today - last_dt).days
        except ValueError:
            stale_days = 0

    # Remote URL
    remote_url = _run(["git", "-C", path, "remote", "get-url", "origin"])

    return {
        "name": name,
        "has_git": True,
        "last_commit_msg": last_msg,
        "last_commit_date": last_date,
        "uncommitted": uncommitted,
        "stale": stale,
        "stale_days": stale_days,
        "remote_url": remote_url,
    }


# ---------------------------------------------------------------------------
# CLAUDE.md git-state section rewriter
# ---------------------------------------------------------------------------

def update_claude_md_git_state(states: list[dict]):
    """
    Read CLAUDE.md, find the GIT_STATE_START / GIT_STATE_END markers,
    and replace everything between them with freshly generated markdown.
    """
    if not CLAUDE_MD.exists():
        print(f"  [aviso] {CLAUDE_MD} não encontrado — pulando atualização do git state")
        return

    content = CLAUDE_MD.read_text(encoding="utf-8")

    if GIT_STATE_START not in content or GIT_STATE_END not in content:
        print(f"  [aviso] Marcadores GIT_STATE_START/END não encontrados em {CLAUDE_MD} — pulando")
        return

    today = datetime.now().strftime("%Y-%m-%d")

    lines = [f"## Estado dos repositórios git ({today})", ""]

    for state in states:
        if not state["has_git"]:
            lines.append(f"### `{state['name']}` — sem repositório git")
            lines.append("")
            continue

        # Build label badges
        badges = []
        if state["uncommitted"]:
            badges.append("tem alterações pendentes")
        if state["stale"]:
            badges.append(f"stale — {state['stale_days']} dias")

        badge_str = ("  [" + "] [".join(badges) + "]") if badges else ""
        lines.append(f"### `{state['name']}`{badge_str}")

        # Last commit
        commit_info = f"`{state['last_commit_msg']}`" if state["last_commit_msg"] else "—"
        lines.append(f"- Último commit: {commit_info} ({state['last_commit_date']})")

        # Remote
        if state["remote_url"]:
            lines.append(f"- Remote: {state['remote_url']}")

        # Uncommitted files
        if state["uncommitted"]:
            lines.append("- Arquivos pendentes:")
            for uf in state["uncommitted"]:
                lines.append(f"  - `{uf}`")
        else:
            lines.append("- Limpo")

        lines.append("")

    new_section = "\n".join(lines)

    # Replace content between the markers (markers themselves are kept)
    start_idx = content.index(GIT_STATE_START) + len(GIT_STATE_START)
    end_idx   = content.index(GIT_STATE_END)

    new_content = (
        content[:start_idx]
        + "\n"
        + new_section
        + "\n"
        + content[end_idx:]
    )

    CLAUDE_MD.write_text(new_content, encoding="utf-8")
    print(f"  ok CLAUDE.md — seção git state atualizada ({len(states)} projetos)")


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def update_security():
    """Run security scan and persist findings to data/security.json."""
    try:
        import security_scan  # type: ignore
    except ImportError as exc:
        print(f"  [aviso] security_scan não importou: {exc}")
        return

    output = DATA_DIR / "security.json"
    result = security_scan.run_scan(output)
    s = result["summary"]
    total = sum(s.values())
    print(
        f"  ok security.json — {total} findings "
        f"(crit {s['critical']} · high {s['high']} · med {s['medium']} · low {s['low']})"
    )


def update_skills_and_agents():
    """Sincroniza skills.json e agents.json com ~/.claude/skills e ~/.claude/agents."""
    try:
        result = subprocess.run(
            ["python3", str(DASHBOARD_DIR / "scripts" / "sync-skills.py"), "--apply"],
            capture_output=True, text=True, timeout=30,
        )
        last = [l for l in result.stdout.splitlines() if l.strip()]
        for line in last[-3:]:
            print(f"  {line}")
    except Exception as exc:
        print(f"  [aviso] sync-skills falhou: {exc}")


def update_printed_clis():
    """Sincroniza printed-clis.json com ~/printing-press/library/*/."""
    try:
        result = subprocess.run(
            ["python3", str(DASHBOARD_DIR / "scripts" / "sync_printed_clis.py")],
            capture_output=True, text=True, timeout=30,
        )
        last = [l for l in result.stdout.splitlines() if l.strip()]
        for line in last[-2:]:
            print(f"  {line}")
    except Exception as exc:
        print(f"  [aviso] sync_printed_clis falhou: {exc}")


def main():
    print("Claude Hub — atualizando dados...")
    update_projects()
    update_skills_and_agents()
    update_printed_clis()
    update_security()

    # Scan all project subdirectories (skip hidden dirs and plain files)
    project_dirs = sorted(
        str(entry)
        for entry in CLAUDE_DIR.iterdir()
        if entry.is_dir() and not entry.name.startswith(".")
    )

    states = [git_state_for_project(d) for d in project_dirs]
    update_claude_md_git_state(states)

    print("Pronto.\n")


if __name__ == "__main__":
    main()
