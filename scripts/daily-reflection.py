#!/usr/bin/env python3
"""
daily-reflection.py — Reflexão diária automática do Claude Hub

Executa às 22h via cron. Varre git logs dos projetos ativos do dia,
cria data/pending-reflection.json com dados pré-preenchidos e exibe
banner de notificação no dashboard na próxima sessão.
"""

import json
import subprocess
import os
import time
from datetime import date, datetime

NOISE_PATTERNS = ['.DS_Store', '_info/', '_old/', 'node_modules/', '.vercelignore']

def is_noise(path):
    return any(p in path for p in NOISE_PATTERNS)

PROJECTS = [
    "/Users/pro15/Claude/cachorradas-estudios",
    "/Users/pro15/Claude/eat-kitchen-concierge",
    "/Users/pro15/Claude/alugueis-bea",
    "/Users/pro15/Claude/claude-hub",
    "/Users/pro15/Claude/magma",
    "/Users/pro15/Claude/thiago-zeni",
    "/Users/pro15/Claude/3-contra-todos/game",
    "/Users/pro15/Claude/3-contra-todos/landing-page-promocional",
    "/Users/pro15/Claude/3-contra-todos/materiais-social-media",
]

DASHBOARD_DIR = "/Users/pro15/Claude/claude-hub"
PENDING_FILE = os.path.join(DASHBOARD_DIR, "data", "pending-reflection.json")


def get_today_commits(project_path):
    """Retorna commits de hoje para um projeto."""
    if not os.path.isdir(os.path.join(project_path, ".git")):
        return []
    today = date.today().strftime("%Y-%m-%d")
    try:
        result = subprocess.run(
            ["git", "log", "--oneline",
             f"--after={today} 00:00:00",
             f"--before={today} 23:59:59"],
            capture_output=True, text=True, cwd=project_path, timeout=5
        )
        lines = [l.strip() for l in result.stdout.splitlines() if l.strip()]
        return lines
    except Exception:
        return []


def get_latest_commit(project_path):
    """Retorna o hash curto e mensagem do commit mais recente."""
    if not os.path.isdir(os.path.join(project_path, ".git")):
        return None
    try:
        result = subprocess.run(
            ["git", "log", "--oneline", "-1"],
            capture_output=True, text=True, cwd=project_path, timeout=5
        )
        line = result.stdout.strip()
        if not line:
            return None
        parts = line.split(" ", 1)
        return {"hash": parts[0], "message": parts[1] if len(parts) > 1 else ""}
    except Exception:
        return None


def get_uncommitted_changes(project_path):
    """Retorna arquivos com mudanças não commitadas (staged + unstaged), sem ruído."""
    if not os.path.isdir(os.path.join(project_path, ".git")):
        return []
    try:
        result = subprocess.run(
            ["git", "status", "--short"],
            capture_output=True, text=True, cwd=project_path, timeout=5
        )
        lines = [l.strip() for l in result.stdout.splitlines()
                 if l.strip() and not is_noise(l)]
        return lines
    except Exception:
        return []


def get_recent_files(project_path):
    """Para projetos sem git: detecta arquivos modificados hoje."""
    today_start = time.mktime(date.today().timetuple())
    recent = []
    skip_dirs = {'node_modules', '.git', '__pycache__', 'dist', '.vite'}
    try:
        for root, dirs, files in os.walk(project_path):
            dirs[:] = [d for d in dirs if d not in skip_dirs]
            for f in files:
                if is_noise(f):
                    continue
                fp = os.path.join(root, f)
                try:
                    if os.path.getmtime(fp) >= today_start:
                        rel = os.path.relpath(fp, project_path)
                        recent.append(rel)
                except OSError:
                    pass
    except Exception:
        pass
    return recent[:15]


def main():
    today = date.today().isoformat()

    # Verificar se já existe reflexão pendente do dia de hoje
    if os.path.exists(PENDING_FILE):
        try:
            with open(PENDING_FILE) as f:
                existing = json.load(f)
            if existing.get("status") == "pending" and existing.get("date") == today:
                print(f"Reflexão já pendente para {today}. Mantendo.")
                return
        except Exception:
            pass

    git_summary = []
    projects_modified = []

    for project_path in PROJECTS:
        project_name = os.path.basename(project_path)
        has_git = os.path.isdir(os.path.join(project_path, ".git"))

        if has_git:
            commits = get_today_commits(project_path)
            uncommitted = get_uncommitted_changes(project_path)
            recent_files = []
            latest_commit = get_latest_commit(project_path)
        else:
            commits = []
            uncommitted = []
            recent_files = get_recent_files(project_path)
            latest_commit = None

        has_activity = bool(commits or uncommitted or recent_files)
        entry = {
            "project": project_name,
            "hasGit": has_git,
            "commits": len(commits),
            "messages": commits,
            "uncommitted": len(uncommitted),
            "uncommittedFiles": uncommitted,
            "recentFiles": recent_files,
            "latestCommit": latest_commit
        }
        git_summary.append(entry)
        if has_activity:
            projects_modified.append(project_name)

    # Só cria pending se houver atividade
    if not projects_modified:
        pending = {
            "date": today,
            "status": "completed",
            "note": f"Nenhuma atividade de git registrada em {today}.",
            "generatedAt": datetime.now().astimezone().isoformat()
        }
        with open(PENDING_FILE, "w") as f:
            json.dump(pending, f, ensure_ascii=False, indent=2)
        print(f"Sem atividade em {today}. Reflexão marcada como concluída.")
        return

    pending = {
        "date": today,
        "status": "pending",
        "generatedAt": datetime.now().astimezone().isoformat(),
        "projectsModified": projects_modified,

        "gitSummary": git_summary,
        "suggestedTitle": f"Trabalho em {', '.join(projects_modified)}",
        "note": "Abra o dashboard > Evolução > Diário para completar a reflexão."
    }

    with open(PENDING_FILE, "w") as f:
        json.dump(pending, f, ensure_ascii=False, indent=2)

    print(f"[{datetime.now().strftime('%H:%M')}] Reflexão pendente criada para {today}.")
    print(f"Projetos com atividade: {', '.join(projects_modified)}")


if __name__ == "__main__":
    main()
