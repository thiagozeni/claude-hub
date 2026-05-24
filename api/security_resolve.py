"""Resolve security findings via Claude Code headless.

Agrupa findings por (category, project), dispara `claude -p` como subprocess
com modelo adequado à complexidade, captura output em streaming e grava um
status in-memory que a UI consulta via polling.

Nunca faz `git push`. Commits locais são permitidos e usam o branch atual.
"""

from __future__ import annotations

import json
import shlex
import subprocess
import threading
import time
import uuid
from collections import defaultdict
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parent.parent
SECURITY_JSON = ROOT / "data" / "security.json"
WORKSPACE = Path("/Users/pro15/Claude")
CLAUDE_BIN = Path.home() / ".local" / "bin" / "claude"

# Modelo por categoria. Haiku: fix mecânico curto. Sonnet: moderado.
# Opus: decisão não-trivial (rotação de credencial, etc.).
MODEL_BY_CATEGORY: dict[str, str] = {
    "gitignore": "haiku",
    "remote-auth": "haiku",
    "secrets": "sonnet",          # zshrc plaintext (project=workspace)
    "tracked-sensitive": "opus",
    "secrets-in-code": "opus",    # secrets detectados em arquivo trackeado
}

# Autenticação via Claude Max OAuth — sem custo por token, consumo vai pela quota.
# Não usamos --max-budget-usd (esse flag é pra modo API key/PAYG).

# Timeout em segundos por job.
TIMEOUT_SECONDS = 300

# Tools permitidas — editáveis de arquivos + git local (sem push)
ALLOWED_TOOLS = [
    "Read", "Edit", "Write", "Glob", "Grep",
    "Bash(git add:*)",
    "Bash(git commit:*)",
    "Bash(git status:*)",
    "Bash(git diff:*)",
    "Bash(git log:*)",
    "Bash(git rm:*)",
    "Bash(git remote:*)",
    "Bash(printf:*)",
    "Bash(echo:*)",
    "Bash(cat:*)",
    "Bash(ls:*)",
    "Bash(chmod:*)",
    "Bash(touch:*)",
    "Bash(mkdir:*)",
]


class ResolveError(Exception):
    """Erro de resolução."""


# ---------------------------------------------------------------------------
# Carregamento e agrupamento
# ---------------------------------------------------------------------------

def _load_security() -> dict[str, Any]:
    if not SECURITY_JSON.exists():
        raise ResolveError("security.json ainda não gerado")
    return json.loads(SECURITY_JSON.read_text(encoding="utf-8"))


def _effective_category(finding: dict[str, Any]) -> str:
    """Categoria para fins de agrupamento e escolha de modelo."""
    cat = finding.get("category", "")
    project = finding.get("project", "")
    # secrets em arquivo de projeto é mais sério do que secrets no zshrc
    if cat == "secrets" and project != "workspace":
        return "secrets-in-code"
    return cat


def _group_key(finding: dict[str, Any]) -> tuple[str, str]:
    return (_effective_category(finding), finding.get("project", ""))


def list_groups() -> list[dict[str, Any]]:
    """Retorna findings agrupados por (categoria, projeto) com metadados."""
    payload = _load_security()
    grouped: dict[tuple[str, str], list[dict[str, Any]]] = defaultdict(list)
    for f in payload.get("findings", []):
        if f.get("status") != "open":
            continue
        grouped[_group_key(f)].append(f)

    result = []
    for (cat, project), items in grouped.items():
        result.append({
            "id": f"{cat}::{project}",
            "category": cat,
            "project": project,
            "count": len(items),
            "model": MODEL_BY_CATEGORY.get(cat, "sonnet"),
            "severityMax": _max_severity(items),
            "findingIds": [f["id"] for f in items],
            "findings": items,
        })
    # Ordenar: severidade crítica primeiro
    sev_order = {"critical": 0, "high": 1, "medium": 2, "low": 3}
    result.sort(key=lambda g: (sev_order.get(g["severityMax"], 9), g["category"], g["project"]))
    return result


def _max_severity(findings: list[dict[str, Any]]) -> str:
    order = ["critical", "high", "medium", "low"]
    for sev in order:
        if any(f.get("severity") == sev for f in findings):
            return sev
    return "low"


# ---------------------------------------------------------------------------
# Prompt builder
# ---------------------------------------------------------------------------

def _working_dir_for(group: dict[str, Any]) -> Path:
    """Diretório cwd do job."""
    project = group.get("project", "")
    if project == "workspace":
        return Path.home()
    return WORKSPACE / project


def _build_prompt(group: dict[str, Any]) -> str:
    cat = group["category"]
    project = group["project"]
    findings = group["findings"]

    # Listagem comum de findings
    findings_block = "\n".join(
        f"- **{f['title']}** — `{f['path']}` ({f['severity']})\n  {f['detail']}"
        for f in findings
    )

    if cat == "gitignore":
        return _PROMPT_GITIGNORE.format(project=project, findings=findings_block)
    if cat == "remote-auth":
        return _PROMPT_REMOTE.format(project=project, findings=findings_block)
    if cat == "tracked-sensitive":
        return _PROMPT_TRACKED.format(project=project, findings=findings_block)
    if cat == "secrets-in-code":
        return _PROMPT_SECRETS_CODE.format(project=project, findings=findings_block)
    if cat == "secrets":
        return _PROMPT_ZSHRC.format(findings=findings_block)
    return _PROMPT_GENERIC.format(project=project, category=cat, findings=findings_block)


_COMMON_RULES = """
**Regras gerais:**
- Faça só os edits necessários para resolver os findings listados.
- NÃO rode `git push` em nenhum momento.
- Depois dos edits, rode `git add <files específicos>` e `git commit -m "chore(security): <resumo curto>"`.
- NÃO use `git add -A` ou `git add .` — seja específico.
- Responda em português ao final com um resumo do que foi feito.
"""

_PROMPT_GITIGNORE = """Você está no projeto `{project}`. Os findings abaixo indicam padrões faltantes no `.gitignore`.

{findings}

**Tarefa:**
1. Leia o `.gitignore` atual (se existir).
2. Adicione as linhas faltantes ao final do arquivo, preservando o conteúdo existente.
3. Use `git add .gitignore && git commit -m "chore(security): complementa .gitignore"`.

""" + _COMMON_RULES

_PROMPT_REMOTE = """Você está no projeto `{project}`. O remote `origin` usa HTTPS em vez de SSH.

{findings}

**Tarefa:**
1. Rode `git remote get-url origin` para confirmar o URL atual.
2. Extraia `<user>/<repo>` e rode `git remote set-url origin git@github.com:<user>/<repo>.git`.
3. Valide com `git remote -v`.
4. Essa mudança não gera arquivo versionado — NÃO precisa commitar.

""" + _COMMON_RULES

_PROMPT_TRACKED = """Você está no projeto `{project}`. Arquivos sensíveis estão trackeados no git.

{findings}

**Tarefa:**
1. Para cada arquivo listado:
   a. Verifique se ele contém credenciais literais (`grep -E 'KEY|TOKEN|SECRET|PASSWORD' <file>`).
   b. Se contém: **PARE** e adicione o nome dos arquivos a uma lista de "credenciais a rotacionar" no resumo final. NÃO remova do git ainda — o usuário precisa rotacionar primeiro.
   c. Se NÃO contém credencial literal: rode `git rm --cached <file>` e adicione ao `.gitignore`.
2. Commit só as mudanças seguras: `git add .gitignore && git commit -m "chore(security): untrack arquivos sensíveis"`.
3. No resumo final, liste claramente quais arquivos **o usuário precisa abrir manualmente** (tinham credenciais).

""" + _COMMON_RULES

_PROMPT_SECRETS_CODE = """Você está no projeto `{project}`. Credenciais foram detectadas em arquivos trackeados.

{findings}

**Tarefa CRÍTICA:**
1. **NÃO tente "ocultar" a credencial** — ela já vazou se está commitada. O usuário terá que rotacionar.
2. Para cada arquivo:
   a. Abra, localize a linha com a credencial literal.
   b. Substitua pelo equivalente via variável de ambiente:
      - Python: `os.environ["XXX_API_KEY"]`
      - Node: `process.env.XXX_API_KEY`
      - Shell: `"${{XXX_API_KEY}}"`
   c. Se houver `.env.example`, adicione `XXX_API_KEY=<fill-me>` lá.
3. Após edits, `git add` dos arquivos editados e commit: `chore(security): remove credencial literal, usa env var`.
4. No resumo final, liste **claramente**:
   - Quais credenciais precisam ser rotacionadas no provedor (OpenAI, Google, GitHub etc.).
   - URLs do dashboard de cada provedor pra agilizar.

""" + _COMMON_RULES

_PROMPT_ZSHRC = """Você está no `$HOME` do usuário. O `~/.zshrc` tem API keys em plaintext.

{findings}

**Tarefa:**
1. Crie `~/.secrets` se não existir (`touch ~/.secrets && chmod 600 ~/.secrets`).
2. Leia `~/.zshrc`, identifique as linhas `export XXX_KEY=...` com valor literal para as variáveis listadas nos findings.
3. Mova essas linhas pra `~/.secrets` (apenda lá).
4. No `~/.zshrc`, remova as linhas originais e adicione (se ainda não existir): `[ -f ~/.secrets ] && source ~/.secrets`.
5. NÃO commite nada — `~/.zshrc` e `~/.secrets` não são versionados.
6. Informe ao final que o usuário precisa rodar `source ~/.zshrc` em novos shells.

**Regras gerais:**
- Preserve TUDO que já está no `~/.zshrc` além das linhas movidas.
- Se tiver dúvida sobre formatação, prefira duplicar em `~/.secrets` e comentar (não apagar) em `~/.zshrc`.
- Responda em português ao final com um resumo.
"""

_PROMPT_GENERIC = """Você está no projeto `{project}`. Categoria de finding: `{category}`.

{findings}

**Tarefa:** Resolva os findings acima seguindo as instruções em cada `detail`.
""" + _COMMON_RULES


# ---------------------------------------------------------------------------
# Job runner
# ---------------------------------------------------------------------------

_JOBS: dict[str, dict[str, Any]] = {}
_JOBS_LOCK = threading.Lock()


def _now() -> float:
    return time.time()


def _new_job(group: dict[str, Any]) -> str:
    job_id = uuid.uuid4().hex[:12]
    with _JOBS_LOCK:
        _JOBS[job_id] = {
            "id": job_id,
            "groupId": group["id"],
            "category": group["category"],
            "project": group["project"],
            "model": group["model"],
            "findingCount": group["count"],
            "status": "running",
            "startedAt": _now(),
            "endedAt": None,
            "exitCode": None,
            "stdout": "",
            "stderr": "",
            "error": None,
        }
    return job_id


def _append_output(job_id: str, stream: str, chunk: str) -> None:
    with _JOBS_LOCK:
        if job_id in _JOBS:
            _JOBS[job_id][stream] += chunk


def _finalize(job_id: str, exit_code: int, error: str | None = None) -> None:
    with _JOBS_LOCK:
        if job_id in _JOBS:
            _JOBS[job_id]["status"] = "done" if exit_code == 0 else "failed"
            _JOBS[job_id]["endedAt"] = _now()
            _JOBS[job_id]["exitCode"] = exit_code
            if error:
                _JOBS[job_id]["error"] = error


def _run_claude(job_id: str, group: dict[str, Any]) -> None:
    """Executa `claude -p` e acumula stdout/stderr no job."""
    prompt = _build_prompt(group)
    cwd = _working_dir_for(group)

    cmd = [
        str(CLAUDE_BIN),
        "-p", prompt,
        "--model", group["model"],
        "--permission-mode", "acceptEdits",
        "--output-format", "text",
        "--add-dir", str(cwd),
        "--allowedTools", *ALLOWED_TOOLS,
    ]

    _append_output(job_id, "stdout", f"$ {shlex.join(cmd[:6])} … (prompt omitted)\n")
    _append_output(job_id, "stdout", f"[cwd] {cwd}\n")
    _append_output(job_id, "stdout", f"[model] {group['model']}  [auth] Claude Max (OAuth)\n\n")

    try:
        proc = subprocess.Popen(
            cmd,
            cwd=str(cwd),
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            bufsize=1,
        )
    except FileNotFoundError:
        _finalize(job_id, 127, error=f"claude CLI não encontrado em {CLAUDE_BIN}")
        return

    # Threads lendo stdout/stderr em paralelo
    def _pump(stream, label):
        for line in iter(stream.readline, ""):
            _append_output(job_id, label, line)
        stream.close()

    t_out = threading.Thread(target=_pump, args=(proc.stdout, "stdout"), daemon=True)
    t_err = threading.Thread(target=_pump, args=(proc.stderr, "stderr"), daemon=True)
    t_out.start()
    t_err.start()

    try:
        exit_code = proc.wait(timeout=TIMEOUT_SECONDS)
    except subprocess.TimeoutExpired:
        proc.kill()
        _append_output(job_id, "stderr", f"\n[timeout após {TIMEOUT_SECONDS}s]\n")
        _finalize(job_id, 124, error="timeout")
        return

    t_out.join(timeout=2)
    t_err.join(timeout=2)
    _finalize(job_id, exit_code)


def start_resolve(group_id: str) -> str:
    """Dispara a resolução de um grupo. Retorna o job_id."""
    groups = list_groups()
    group = next((g for g in groups if g["id"] == group_id), None)
    if not group:
        raise ResolveError(f"grupo não encontrado: {group_id}")

    job_id = _new_job(group)
    thread = threading.Thread(target=_run_claude, args=(job_id, group), daemon=True)
    thread.start()
    return job_id


def get_job(job_id: str) -> dict[str, Any]:
    with _JOBS_LOCK:
        job = _JOBS.get(job_id)
        if not job:
            raise ResolveError(f"job não encontrado: {job_id}")
        return dict(job)  # shallow copy pra evitar mutação externa
