"""Dispara reflexão diária via agente Claude.

Lê pending-reflection.json (gerado pelo cron daily-reflection.py),
monta prompt com contexto dos projetos modificados e dispara
`claude -p` com Sonnet. Agente investiga commits/diffs e gera
entrada(s) nova(s) para evolution-log.json, depois marca o pending
como completed.

Reutiliza o padrão de job runner do security_resolve.
"""

from __future__ import annotations

import json
import shlex
import subprocess
import threading
import time
import uuid
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = ROOT / "data"
PENDING_FILE = DATA_DIR / "pending-reflection.json"
EVOLUTION_FILE = DATA_DIR / "evolution-log.json"
WORKSPACE = Path("/Users/pro15/Claude")
CLAUDE_BIN = Path.home() / ".local" / "bin" / "claude"

# Modelo: reflexão envolve interpretação de diffs e redação — Sonnet.
MODEL = "sonnet"
TIMEOUT_SECONDS = 600

# Tools: o agente precisa ler diffs/logs de múltiplos projetos + editar JSON
# de claude-hub + commitar. Não pode pushar nem rodar comandos destrutivos.
ALLOWED_TOOLS = [
    "Read", "Edit", "Write", "Glob", "Grep",
    "Bash(git log:*)",
    "Bash(git show:*)",
    "Bash(git diff:*)",
    "Bash(git status:*)",
    "Bash(git add:*)",
    "Bash(git commit:*)",
    "Bash(cat:*)",
    "Bash(ls:*)",
    "Bash(head:*)",
    "Bash(tail:*)",
    "Bash(wc:*)",
]


class ReflectionError(Exception):
    pass


def _render_stream_event(ev: dict[str, Any]) -> str:
    """Converte um evento stream-json em linha(s) de texto legível."""
    t = ev.get("type", "")
    if t == "system":
        subtype = ev.get("subtype", "")
        if subtype == "init":
            return f"[init] session {ev.get('session_id','?')[:8]}  model={ev.get('model','?')}\n"
        return ""
    if t == "assistant":
        msg = ev.get("message", {})
        lines: list[str] = []
        for block in msg.get("content", []):
            bt = block.get("type")
            if bt == "text":
                txt = block.get("text", "").strip()
                if txt:
                    lines.append(txt + "\n")
            elif bt == "tool_use":
                name = block.get("name", "?")
                inp = block.get("input", {})
                summary = _summarize_tool_input(name, inp)
                lines.append(f"→ {name}({summary})\n")
            elif bt == "thinking":
                # mostra apenas primeiras 120 chars de thinking como cinza
                thinking = block.get("thinking", "")
                if thinking:
                    snippet = thinking.strip().replace("\n", " ")[:120]
                    lines.append(f"  ∴ {snippet}…\n")
        return "".join(lines)
    if t == "user":
        # user message contém tool_results
        msg = ev.get("message", {})
        lines: list[str] = []
        for block in msg.get("content", []):
            if block.get("type") == "tool_result":
                content = block.get("content", "")
                if isinstance(content, list):
                    content = " ".join(c.get("text", "") for c in content if isinstance(c, dict))
                snippet = str(content).strip().replace("\n", " ")
                if len(snippet) > 140:
                    snippet = snippet[:140] + "…"
                if snippet:
                    lines.append(f"  ← {snippet}\n")
        return "".join(lines)
    if t == "result":
        dur = ev.get("duration_ms", 0) / 1000
        cost = ev.get("total_cost_usd")
        turns = ev.get("num_turns", "?")
        cost_str = f" cost=${cost:.4f}" if cost else ""
        return f"\n[result] {turns} turns in {dur:.1f}s{cost_str}\n"
    return ""


def _summarize_tool_input(tool: str, inp: dict[str, Any]) -> str:
    """Mostra um resumo curto do input de cada tool call."""
    if tool == "Bash":
        cmd = (inp.get("command") or "").replace("\n", " ")
        return cmd[:90] + ("…" if len(cmd) > 90 else "")
    if tool in {"Read", "Edit", "Write"}:
        fp = inp.get("file_path", "")
        if tool == "Edit":
            return f"{fp}"
        return fp
    if tool == "Grep":
        return f"'{inp.get('pattern','')}' in {inp.get('path','.')}"
    if tool == "Glob":
        return inp.get("pattern", "")
    # fallback
    keys = list(inp.keys())[:2]
    return ", ".join(f"{k}=…" for k in keys)


_JOBS: dict[str, dict[str, Any]] = {}
_JOBS_LOCK = threading.Lock()


def _load_pending() -> dict[str, Any]:
    if not PENDING_FILE.exists():
        raise ReflectionError("pending-reflection.json não encontrado")
    return json.loads(PENDING_FILE.read_text(encoding="utf-8"))


def _build_prompt(pending: dict[str, Any]) -> str:
    today = pending.get("date", "")
    projects = pending.get("projectsModified", [])
    git_summary = pending.get("gitSummary", [])

    # Compacta o git summary pro prompt
    summary_lines = []
    for entry in git_summary:
        if entry.get("project") not in projects:
            continue
        p = entry["project"]
        commits = entry.get("messages", [])
        uncommitted = entry.get("uncommittedFiles", [])
        latest = entry.get("latestCommit", {}) or {}

        block = [f"### {p}"]
        if commits:
            block.append("Commits hoje:")
            for c in commits:
                block.append(f"  - {c}")
        if uncommitted:
            block.append(f"Uncommitted ({len(uncommitted)}):")
            for u in uncommitted[:10]:
                block.append(f"  - {u}")
        if latest and not commits:
            block.append(f"Último commit (não é de hoje): {latest.get('hash','')} {latest.get('message','')}")
        summary_lines.append("\n".join(block))

    git_block = "\n\n".join(summary_lines) if summary_lines else "(sem atividade relevante)"

    return f"""Você é responsável pelo diário de aprendizado do Claude Hub.

**Data:** {today}
**Projetos com atividade:** {', '.join(projects) or '—'}

**Git summary já coletado:**

{git_block}

**Tarefa:**

1. Leia `/Users/pro15/Claude/claude-hub/data/evolution-log.json`. Identifique o maior `id` (formato `log-NNN`) — as novas entradas continuam a sequência.

2. **Analise o padrão do dia no próprio git_summary acima**. Se há um tema recorrente (ex: vários `chore(security)` iguais em vários projetos = sessão de hardening), **consolide em 1 entrada**. Só fragmente por projeto quando os commits forem genuinamente distintos e substantivos.

3. Para **no máximo 2–3 projetos com trabalho substantivo** (não `chore`/merges triviais), invista em `git show <hash>` pra ver o diff e entender o ganho real. Para os outros, o título do commit no summary acima já é suficiente.

4. Gere **1 a 3 entradas** no schema abaixo — prefira UMA boa consolidada a várias pobres:
   ```json
   {{
     "id": "log-NNN",
     "date": "{today}",
     "project": "<nome-do-projeto>",
     "title": "<descrição concisa, até ~80 chars, sem pontuação final>",
     "learned": ["<aprendizado não-óbvio 1>", "<aprendizado 2>", "<aprendizado 3>"],
     "highlight": "<1–2 frases sintetizando o ganho real>",
     "commit": "<hash curto ou null>",
     "toolsUsed": [],
     "skillsUsed": [],
     "agentsUsed": []
   }}
   ```

5. Insira as novas entradas **no início** do array em `evolution-log.json` (Write sobrescrevendo o JSON completo).

6. Atualize `/Users/pro15/Claude/claude-hub/data/pending-reflection.json`:
   - `status`: "completed"
   - `completedAt`: ISO timestamp atual
   - `completedBy`: "agent"

7. Commit em claude-hub:
   ```
   git -C /Users/pro15/Claude/claude-hub add data/evolution-log.json data/pending-reflection.json
   git -C /Users/pro15/Claude/claude-hub commit -m "chore(reflection): entrada diária {today}"
   ```

**Regras:**
- **NÃO push.** Commit local apenas.
- `learned` deve ter bullets **não-óbvios** (padrão descoberto, trade-off resolvido, armadilha evitada). Zero "aprendi a usar X".
- Se o dia foi só `chore`/merge sem substância, marque pending como completed com `note: "Sem aprendizados substantivos"` e NÃO adicione entrada.
- Use `git log`/`git show` frugalmente — investigue só o essencial. Não leia arquivos grandes sem necessidade.
- Responda em português ao final: quantas entradas criou, títulos, hash do commit.
"""


def _now() -> float:
    return time.time()


def _new_job(pending: dict[str, Any]) -> str:
    job_id = uuid.uuid4().hex[:12]
    with _JOBS_LOCK:
        _JOBS[job_id] = {
            "id": job_id,
            "kind": "reflection",
            "date": pending.get("date"),
            "projects": pending.get("projectsModified", []),
            "model": MODEL,
            "status": "running",
            "startedAt": _now(),
            "endedAt": None,
            "exitCode": None,
            "stdout": "",
            "stderr": "",
            "error": None,
        }
    return job_id


def _append(job_id: str, stream: str, chunk: str) -> None:
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


def _run_claude(job_id: str, pending: dict[str, Any]) -> None:
    prompt = _build_prompt(pending)
    cwd = WORKSPACE  # agente precisa navegar entre projetos

    cmd = [
        str(CLAUDE_BIN),
        "-p", prompt,
        "--model", MODEL,
        "--permission-mode", "acceptEdits",
        "--output-format", "stream-json",
        "--verbose",
        "--add-dir", str(cwd),
        "--allowedTools", *ALLOWED_TOOLS,
    ]

    _append(job_id, "stdout", f"$ claude -p … --model {MODEL}\n")
    _append(job_id, "stdout", f"[cwd] {cwd}\n")
    _append(job_id, "stdout", f"[auth] Claude Max (OAuth)\n")
    _append(job_id, "stdout", f"[date] {pending.get('date')}  [projects] {', '.join(pending.get('projectsModified', []))}\n\n")

    try:
        proc = subprocess.Popen(
            cmd, cwd=str(cwd),
            stdout=subprocess.PIPE, stderr=subprocess.PIPE,
            text=True, bufsize=1,
        )
    except FileNotFoundError:
        _finalize(job_id, 127, error=f"claude CLI não encontrado em {CLAUDE_BIN}")
        return

    def _pump_stdout(stream):
        """stream-json: cada linha é um evento JSON. Converte em texto legível."""
        for line in iter(stream.readline, ""):
            line = line.rstrip("\n")
            if not line.strip():
                continue
            try:
                ev = json.loads(line)
            except json.JSONDecodeError:
                _append(job_id, "stdout", line + "\n")
                continue
            rendered = _render_stream_event(ev)
            if rendered:
                _append(job_id, "stdout", rendered)
        stream.close()

    def _pump(stream, label):
        for line in iter(stream.readline, ""):
            _append(job_id, label, line)
        stream.close()

    t_out = threading.Thread(target=_pump_stdout, args=(proc.stdout,), daemon=True)
    t_err = threading.Thread(target=_pump, args=(proc.stderr, "stderr"), daemon=True)
    t_out.start()
    t_err.start()

    try:
        code = proc.wait(timeout=TIMEOUT_SECONDS)
    except subprocess.TimeoutExpired:
        proc.kill()
        _append(job_id, "stderr", f"\n[timeout após {TIMEOUT_SECONDS}s]\n")
        _finalize(job_id, 124, error="timeout")
        return

    t_out.join(timeout=2)
    t_err.join(timeout=2)
    _finalize(job_id, code)


def start_reflection() -> str:
    """Dispara a reflexão diária. Retorna job_id."""
    pending = _load_pending()
    if pending.get("status") != "pending":
        raise ReflectionError(
            f"sem reflexão pendente (status atual: {pending.get('status')})"
        )
    job_id = _new_job(pending)
    threading.Thread(target=_run_claude, args=(job_id, pending), daemon=True).start()
    return job_id


def get_job(job_id: str) -> dict[str, Any]:
    with _JOBS_LOCK:
        job = _JOBS.get(job_id)
        if not job:
            raise ReflectionError(f"job não encontrado: {job_id}")
        return dict(job)
