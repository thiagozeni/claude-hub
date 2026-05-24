#!/usr/bin/env python3
"""
security_scan.py — Varredura leve de segurança do workspace.

Checagens (sem dependências externas, tudo via stdlib + git):
  1. Secrets em arquivos trackeados (regex)
  2. .gitignore sem padrões essenciais (.env, service_account.json, *.pem, etc.)
  3. Arquivos sensíveis trackeados por engano (.env, credentials.json, *.pem, *.key)
  4. Remotes HTTPS (preferência do workspace é SSH)
  5. Plaintext secrets em ~/.zshrc (débito conhecido do workspace)

Merge entre runs:
  - Findings com o mesmo `id` preservam `firstSeen` e `status`.
  - Findings que desaparecem em uma nova varredura somem do JSON (sem histórico).
"""

from __future__ import annotations

import hashlib
import json
import re
import subprocess
from datetime import datetime
from pathlib import Path
from typing import Iterable

WORKSPACE = Path("/Users/pro15/Claude")
HOME = Path("/Users/pro15")
ZSHRC = HOME / ".zshrc"

# Regex patterns para secrets em arquivos trackeados. Cada item:
# (nome_legível, regex_compilada, severidade)
SECRET_PATTERNS: list[tuple[str, re.Pattern[str], str]] = [
    ("OpenAI API key", re.compile(r"sk-[A-Za-z0-9]{32,}"), "critical"),
    ("Anthropic API key", re.compile(r"sk-ant-[A-Za-z0-9\-_]{20,}"), "critical"),
    ("Google API key", re.compile(r"\bAIza[0-9A-Za-z\-_]{35}\b"), "critical"),
    ("GitHub token", re.compile(r"\bgh[pousr]_[A-Za-z0-9]{36,}\b"), "critical"),
    ("AWS Access Key", re.compile(r"\b(?:AKIA|ASIA)[0-9A-Z]{16}\b"), "critical"),
    ("Private key block", re.compile(r"-----BEGIN (?:RSA |EC |OPENSSH |)PRIVATE KEY-----"), "critical"),
    ("OpenRouter key", re.compile(r"sk-or-[A-Za-z0-9\-]{20,}"), "critical"),
]

# Extensões que fazem sentido escanear por secrets inline.
TEXT_EXTENSIONS = {
    ".env", ".sh", ".zsh", ".bash", ".py", ".js", ".mjs", ".cjs", ".ts", ".tsx",
    ".jsx", ".json", ".yml", ".yaml", ".toml", ".md", ".txt", ".html", ".conf",
    ".ini", ".cfg", ".rb", ".go", ".rs", ".java", ".kt", ".swift", ".php",
}

# Arquivos que NUNCA deveriam estar trackeados
SENSITIVE_TRACKED = {
    ".env", ".env.local", ".env.production", ".env.development",
    "service_account.json", "credentials.json", "secrets.json",
}
SENSITIVE_EXTENSIONS = {".pem", ".key", ".p12", ".pfx"}

# Padrões mínimos que cada .gitignore deveria conter.
# Cada entrada: (label, lista de variantes aceitas como cobertura)
GITIGNORE_EXPECTED = [
    (".env", [".env", ".env.local", ".env.*", "*.env", "**/.env"]),
    ("service_account.json", ["service_account.json", "**/service_account.json"]),
    ("*.pem", ["*.pem", "**/*.pem"]),
    (".DS_Store", [".DS_Store", "**/.DS_Store", "*.DS_Store"]),
]


def _run(cmd: list[str], cwd: Path | None = None) -> str:
    try:
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=15,
            cwd=str(cwd) if cwd else None,
        )
        return result.stdout
    except Exception:
        return ""


def _make_id(*parts: str) -> str:
    joined = "|".join(parts)
    return hashlib.sha1(joined.encode("utf-8")).hexdigest()[:12]


def _today() -> str:
    return datetime.now().strftime("%Y-%m-%d")


def _iter_git_projects() -> Iterable[Path]:
    if not WORKSPACE.exists():
        return
    for entry in sorted(WORKSPACE.iterdir()):
        if entry.is_dir() and not entry.name.startswith(".") and (entry / ".git").exists():
            yield entry


def _tracked_files(project: Path) -> list[str]:
    out = _run(["git", "-C", str(project), "ls-files"])
    return [line for line in out.splitlines() if line.strip()]


def scan_secrets_in_tracked(project: Path) -> list[dict]:
    findings: list[dict] = []
    files = _tracked_files(project)
    for rel in files:
        fpath = project / rel
        if not fpath.is_file():
            continue
        # Só escaneia extensões de texto conhecidas ou arquivos sem extensão
        ext = fpath.suffix.lower()
        if ext and ext not in TEXT_EXTENSIONS:
            continue
        try:
            # Limite de 2MB por arquivo — evita binários grandes
            if fpath.stat().st_size > 2 * 1024 * 1024:
                continue
            content = fpath.read_text(encoding="utf-8", errors="ignore")
        except OSError:
            continue

        for name, pattern, severity in SECRET_PATTERNS:
            if pattern.search(content):
                findings.append({
                    "id": _make_id("secret", project.name, rel, name),
                    "severity": severity,
                    "category": "secrets",
                    "project": project.name,
                    "title": f"{name} detectado em arquivo trackeado",
                    "path": rel,
                    "detail": (
                        f"Padrão `{name}` encontrado em `{rel}` do projeto `{project.name}`. "
                        f"Remover, rotacionar a credencial e mover para variável de ambiente."
                    ),
                })
    return findings


def scan_sensitive_tracked(project: Path) -> list[dict]:
    findings: list[dict] = []
    for rel in _tracked_files(project):
        base = Path(rel).name
        ext = Path(rel).suffix.lower()
        if base in SENSITIVE_TRACKED or ext in SENSITIVE_EXTENSIONS:
            findings.append({
                "id": _make_id("sensitive-tracked", project.name, rel),
                "severity": "critical",
                "category": "tracked-sensitive",
                "project": project.name,
                "title": f"Arquivo sensível trackeado no git: {base}",
                "path": rel,
                "detail": (
                    f"Arquivo `{rel}` está commitado no repo `{project.name}`. "
                    f"Remover do git (`git rm --cached`), adicionar ao .gitignore e "
                    f"rotacionar qualquer credencial contida nele."
                ),
            })
    return findings


def scan_gitignore_coverage(project: Path) -> list[dict]:
    findings: list[dict] = []
    gitignore = project / ".gitignore"
    if not gitignore.exists():
        findings.append({
            "id": _make_id("gitignore-missing", project.name),
            "severity": "medium",
            "category": "gitignore",
            "project": project.name,
            "title": ".gitignore ausente",
            "path": ".gitignore",
            "detail": (
                f"Projeto `{project.name}` não tem `.gitignore`. Criar um com pelo "
                f"menos `.env*`, `service_account.json`, `*.pem`, `.DS_Store`."
            ),
        })
        return findings

    try:
        content = gitignore.read_text(encoding="utf-8", errors="ignore")
    except OSError:
        return findings

    lines = {ln.strip() for ln in content.splitlines() if ln.strip() and not ln.strip().startswith("#")}
    for label, accepted in GITIGNORE_EXPECTED:
        if not any(pat in lines for pat in accepted):
            findings.append({
                "id": _make_id("gitignore-miss", project.name, label),
                "severity": "medium",
                "category": "gitignore",
                "project": project.name,
                "title": f".gitignore sem padrão `{label}`",
                "path": ".gitignore",
                "detail": (
                    f"O `.gitignore` de `{project.name}` não cobre `{label}`. "
                    f"Adicionar uma das variantes aceitas: {', '.join(accepted)}."
                ),
            })
    return findings


def scan_remote_auth(project: Path) -> list[dict]:
    remote = _run(["git", "-C", str(project), "remote", "get-url", "origin"]).strip()
    if not remote:
        return []
    if remote.startswith("https://"):
        return [{
            "id": _make_id("remote-https", project.name),
            "severity": "low",
            "category": "remote-auth",
            "project": project.name,
            "title": "Remote `origin` usa HTTPS em vez de SSH",
            "path": ".git/config",
            "detail": (
                f"Remote de `{project.name}` é `{remote}`. Preferência do workspace "
                f"(CLAUDE.md global) é SSH — trocar com "
                f"`git remote set-url origin git@github.com:<user>/<repo>.git`."
            ),
        }]
    return []


def scan_zshrc_plaintext() -> list[dict]:
    if not ZSHRC.exists():
        return []
    try:
        content = ZSHRC.read_text(encoding="utf-8", errors="ignore")
    except OSError:
        return []

    # Variáveis consideradas "secrets" quando exportadas com valor literal
    suspect = [
        "GEMINI_API_KEY", "OPENAI_API_KEY", "ANTHROPIC_API_KEY",
        "OPENROUTER_API_KEY", "FIRECRAWL_API_KEY", "GITHUB_TOKEN",
        "AWS_SECRET_ACCESS_KEY", "HF_TOKEN",
    ]
    findings: list[dict] = []
    exposed: list[str] = []
    for var in suspect:
        # Procura `export VAR="...valor real..."` (valor não-vazio que não seja $…)
        pattern = re.compile(
            rf'^\s*export\s+{re.escape(var)}\s*=\s*["\']?([^\s"\'\$][^\s"\']*)',
            re.MULTILINE,
        )
        if pattern.search(content):
            exposed.append(var)

    if exposed:
        findings.append({
            "id": _make_id("zshrc-plaintext"),
            "severity": "high",
            "category": "secrets",
            "project": "workspace",
            "title": "API keys em plaintext no ~/.zshrc",
            "path": "~/.zshrc",
            "detail": (
                f"Variáveis com valor literal em `~/.zshrc`: {', '.join(exposed)}. "
                f"Mover para `~/.secrets` (chmod 600, fora do versionamento) e "
                f"adicionar `source ~/.secrets` no `.zshrc`."
            ),
        })
    return findings


def _collect_all() -> list[dict]:
    findings: list[dict] = []
    for project in _iter_git_projects():
        findings.extend(scan_secrets_in_tracked(project))
        findings.extend(scan_sensitive_tracked(project))
        findings.extend(scan_gitignore_coverage(project))
        findings.extend(scan_remote_auth(project))
    findings.extend(scan_zshrc_plaintext())
    return findings


def _merge_with_previous(new: list[dict], previous: dict) -> list[dict]:
    """Preserva `firstSeen` e `status` de findings com mesmo `id`. Novos recebem
    defaults. Findings que não aparecem em `new` são descartados."""
    prev_by_id = {f["id"]: f for f in previous.get("findings", [])}
    today = _today()
    merged: list[dict] = []
    for item in new:
        prev = prev_by_id.get(item["id"])
        merged.append({
            **item,
            "firstSeen": prev["firstSeen"] if prev else today,
            "lastSeen": today,
            "status": prev["status"] if prev and prev.get("status") in {"open", "acknowledged", "resolved", "ignored"} else "open",
        })
    return merged


def _summarize(findings: list[dict]) -> dict:
    counts = {"critical": 0, "high": 0, "medium": 0, "low": 0}
    for f in findings:
        sev = f.get("severity", "low")
        if sev in counts:
            counts[sev] += 1
    return counts


def run_scan(output_path: Path) -> dict:
    """Run all scans, merge with previous, write JSON. Returns the payload."""
    previous: dict = {}
    if output_path.exists():
        try:
            previous = json.loads(output_path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            previous = {}

    findings = _merge_with_previous(_collect_all(), previous)
    # Ordenação estável: severidade crítica primeiro, depois por projeto, path
    sev_order = {"critical": 0, "high": 1, "medium": 2, "low": 3}
    findings.sort(key=lambda f: (sev_order.get(f["severity"], 9), f.get("project", ""), f.get("path", "")))

    payload = {
        "scannedAt": datetime.now().isoformat(timespec="seconds"),
        "summary": _summarize(findings),
        "findings": findings,
    }

    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(
        json.dumps(payload, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )
    return payload


if __name__ == "__main__":
    out = Path(__file__).resolve().parent.parent / "data" / "security.json"
    result = run_scan(out)
    s = result["summary"]
    total = sum(s.values())
    print(
        f"  ok security.json — {total} findings "
        f"(crit {s['critical']} · high {s['high']} · med {s['medium']} · low {s['low']})"
    )
