"""pm2 wrapper — chamadas a `pm2 jlist` / start / stop / restart / logs.

Projetado para ser importado pelo `server.py` e exposto via HTTP em
`/api/processes/*`. Todas as chamadas usam `subprocess.run(shell=False)` com
argumentos como lista — sem risco de injeção.

Os nomes de processo aceitos são validados dinamicamente contra o que o
`pm2 jlist` retornar. O dashboard é local-only (127.0.0.1), então qualquer
processo que o usuário registrou no pm2 é controlável via UI.

O processo `claude-hub` é especial: é gerenciado pelo launchd (não pelo
pm2) porque ele é a própria UI — precisa estar sempre vivo. Por isso ações
destrutivas (stop/restart) sobre esse nome são rejeitadas para evitar o
paradoxo do "dashboard se desligando sozinho".
"""

from __future__ import annotations

import json
import os
import subprocess
from dataclasses import dataclass
from pathlib import Path
from typing import Any

PM2_BIN = "/usr/local/bin/pm2"  # explícito pra não depender do PATH do shell pai

# Gerenciado pelo launchd, não pelo pm2. Ações destrutivas são bloqueadas.
LAUNCHD_MANAGED: frozenset[str] = frozenset({"claude-hub"})


class ProcessError(Exception):
    """Erro operacional do pm2 (daemon morto, nome inválido, timeout, etc)."""


@dataclass(frozen=True)
class ProcessInfo:
    """Snapshot de um processo pm2 para resposta JSON."""

    id: int | None
    name: str
    status: str  # online | stopped | errored | launching | stopping | ...
    pid: int | None
    cpu: float
    memory: int  # bytes
    uptime_ms: int | None
    restarts: int
    port: int | None
    cwd: str
    managed_by: str  # "pm2" | "launchd"

    def to_dict(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "name": self.name,
            "status": self.status,
            "pid": self.pid,
            "cpu": self.cpu,
            "memory": self.memory,
            "uptimeMs": self.uptime_ms,
            "restarts": self.restarts,
            "port": self.port,
            "cwd": self.cwd,
            "managedBy": self.managed_by,
        }


# ---------------------------------------------------------------------------
# Low-level pm2 helpers
# ---------------------------------------------------------------------------


def _run_pm2(args: list[str], timeout: float = 8.0) -> subprocess.CompletedProcess[str]:
    """Executa `pm2 <args>` com argumentos como lista (sem shell)."""
    try:
        return subprocess.run(
            [PM2_BIN, *args],
            capture_output=True,
            text=True,
            timeout=timeout,
            check=False,
        )
    except FileNotFoundError as exc:
        raise ProcessError(f"pm2 não encontrado em {PM2_BIN}") from exc
    except subprocess.TimeoutExpired as exc:
        raise ProcessError(f"pm2 {' '.join(args)} timeout após {timeout}s") from exc


def _require_mutable(name: str) -> None:
    """Ações destrutivas só em processos pm2 — nunca no claude-hub (launchd)."""
    if name in LAUNCHD_MANAGED:
        raise ProcessError(
            f"{name} é gerenciado pelo launchd — reinicie via "
            f"'launchctl kickstart -k gui/$(id -u)/com.pro15.claude-hub'"
        )


def _parse_port_env(value: Any) -> int | None:
    """Extrai porta de uma variável de ambiente PORT (valor direto, não flag)."""
    if value is None:
        return None
    try:
        port = int(value)
    except (ValueError, TypeError):
        return None
    return port if 1024 <= port <= 65535 else None


_SHORT_P_COMMANDS: frozenset[str] = frozenset({
    "next", "nuxt", "vite", "streamlit", "uvicorn",
    "flask", "fastapi", "http-server", "serve", "webpack",
})
"""Comandos onde `-p <N>` significa porta. Evita falsos positivos com
`grep -p`, `mkdir -p`, `docker -p 3000:3000`, etc.
NB: gunicorn usa `-p` para --pid (pidfile), não porta — bind é via `-b`."""

_BIND_COMMANDS: frozenset[str] = frozenset({
    "gunicorn", "uvicorn", "hypercorn", "daphne",
})
"""Servidores WSGI/ASGI onde `-b`/`--bind` host:port define a porta de escuta."""


_LAUNCHERS: frozenset[str] = frozenset({
    "npx", "bunx", "pnpx",
})
"""Wrappers que executam o próximo token como binário direto.
NB: yarn/pnpm não entram — `yarn dev` roda um script, não um binário."""

_PKG_MANAGERS: frozenset[str] = frozenset({
    "npm", "yarn", "pnpm", "bun",
})
"""Package managers que repassam flags após `--` para o dev server subjacente.
`npm run dev -- -p 3000` → `-p` é para o servidor, não para o npm."""

_PKG_MANAGER_SENTINEL = "__pkg_manager_passthrough__"
"""Valor retornado por _effective_command quando um package manager repassa
flags via `--`. Incluído em _SHORT_P_COMMANDS para habilitar `-p`."""


def _effective_command(tokens: list[str], exec_basename: str) -> str:
    """Identifica o comando servidor efetivo a partir do exec_path e dos args.

    Regras (em ordem de prioridade):
    1. Se exec_basename é um servidor conhecido, retorna ele.
    2. Se exec_basename é um launcher (npx, bunx), o comando é o próximo
       token nos args que não é flag.
    3. Se args contêm um launcher, o comando é o token seguinte.
    4. Se exec_basename é python/python3 e args contêm ``-m``, o comando
       é o token após ``-m``.
    """
    all_servers = _SHORT_P_COMMANDS | _BIND_COMMANDS

    # 1. exec_path é o próprio servidor
    if exec_basename in all_servers:
        return exec_basename

    # 2. exec_path é um launcher → próximo non-flag token nos args
    if exec_basename in _LAUNCHERS:
        for t in tokens:
            if not t.startswith("-"):
                return t.lower()

    # 3. Package manager (npm/yarn/pnpm/bun): args após `--` são repassados
    #    ao dev server. Procura servidor conhecido nos args após `--`, e se
    #    não encontrar, assume que scripts como "dev"/"start" rodam um
    #    servidor — trata `-p` como porta via flag especial no chamador.
    if exec_basename in _PKG_MANAGERS:
        # Procura servidor conhecido em qualquer posição dos args
        for t in tokens:
            if t.lower() in all_servers:
                return t.lower()
        # Se tem `--` nos args, flags após ele são do servidor
        if "--" in tokens:
            return _PKG_MANAGER_SENTINEL

    # 4. Scan dos args: launcher seguido de comando, ou python -m modulo
    for i, t in enumerate(tokens):
        tl = t.lower()
        # launcher nos args (ex: bash -c "npx next dev ...")
        if tl in _LAUNCHERS and i + 1 < len(tokens):
            for candidate in tokens[i + 1:]:
                if not candidate.startswith("-"):
                    return candidate.lower()
        # python -m <module>
        if tl == "-m" and i + 1 < len(tokens):
            return tokens[i + 1].lower().split(".")[-1]  # uvicorn de "uvicorn.main"

    return exec_basename


def _parse_port_from_args(
    args: str | list[str] | None,
    exec_path: str | None = None,
) -> int | None:
    """Extrai porta de argumentos buscando flags --port/--server.port/=port.

    ``-p`` só é aceito quando o contexto contém um dev server conhecido
    (next, vite, streamlit …) — verificado tanto nos args quanto no
    ``exec_path`` (o binário que o pm2 lança). Isso cobre shapes como
    ``pm2 start next -- dev -p 3001`` onde o server não aparece nos args.
    """
    if not args:
        return None
    # Flatten: elementos da lista que contêm espaços são re-tokenizados
    if isinstance(args, list):
        flat: list[str] = []
        for item in args:
            if isinstance(item, str) and " " in item:
                flat.extend(item.split())
            elif isinstance(item, str):
                flat.append(item)
        tokens = flat
    else:
        tokens = args.split()

    exec_basename = ""
    if exec_path:
        import os
        exec_basename = os.path.basename(exec_path).lower()

    # Detecta o "comando efetivo" — via exec_path OU após launchers nos args.
    # NÃO varrer todos os tokens (evita falso positivo como `grep next -p 3000`).
    effective_cmd = _effective_command(tokens, exec_basename)
    is_pkg_manager = exec_basename in _PKG_MANAGERS
    is_pkg_passthrough = effective_cmd == _PKG_MANAGER_SENTINEL
    has_server_cmd = effective_cmd in _SHORT_P_COMMANDS or is_pkg_passthrough
    has_bind_cmd = effective_cmd in _BIND_COMMANDS

    # Package managers: short flags (-p, -b) só são confiáveis após `--`,
    # porque antes dele pertencem ao próprio npm/yarn/pnpm.
    separator_idx = tokens.index("--") if is_pkg_manager and "--" in tokens else -1

    for i, token in enumerate(tokens):
        # Checa se a flag é exatamente --port ou termina com .port/-port
        # (ex: --server.port, --listen-port) — rejeita --report, --transport
        flag_name = token.split("=", 1)[0].lower().lstrip("-")
        is_port_flag = flag_name == "port" or flag_name.endswith((".port", "-port"))

        # --port=3000 ou --server.port=8502
        if is_port_flag and "=" in token:
            val = token.split("=", 1)[1]
            if val.isdigit() and 1024 <= int(val) <= 65535:
                return int(val)
        # --port 3000 ou --server.port 8502 (flag longa — sempre confiável)
        if is_port_flag and i + 1 < len(tokens):
            nxt = tokens[i + 1]
            if nxt.isdigit() and 1024 <= int(nxt) <= 65535:
                return int(nxt)
        # -p 3000 — só quando um dev server conhecido está no contexto.
        # Para pkg managers, só aceitar após o separador `--`.
        after_separator = separator_idx < 0 or i > separator_idx
        if token == "-p" and has_server_cmd and after_separator and i + 1 < len(tokens):
            nxt = tokens[i + 1]
            if nxt.isdigit() and 1024 <= int(nxt) <= 65535:
                return int(nxt)
        # -b/--bind host:port — só em servidores WSGI/ASGI conhecidos
        if has_bind_cmd:
            if token.lower() in ("-b", "--bind") and i + 1 < len(tokens):
                port = _port_from_bind(tokens[i + 1])
                if port is not None:
                    return port
            if token.lower().startswith(("--bind=", "-b=")):
                port = _port_from_bind(token.split("=", 1)[1])
                if port is not None:
                    return port
    return None


def _port_from_bind(bind_str: str) -> int | None:
    """Extrai porta de um bind address como '0.0.0.0:8000', ':8000', ou '8000'."""
    # host:port ou [::]:port
    if ":" in bind_str:
        tail = bind_str.rsplit(":", 1)[-1]
    else:
        tail = bind_str
    if tail.isdigit() and 1024 <= int(tail) <= 65535:
        return int(tail)
    return None


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------


def list_processes() -> list[dict[str, Any]]:
    """Lista todos os processos pm2 + o claude-hub (launchd) no topo."""
    result = _run_pm2(["jlist"])
    if result.returncode != 0:
        raise ProcessError(f"pm2 jlist falhou: {result.stderr.strip()}")

    try:
        raw = json.loads(result.stdout or "[]")
    except json.JSONDecodeError as exc:
        raise ProcessError("pm2 jlist retornou JSON inválido") from exc

    out: list[ProcessInfo] = [_launchd_dashboard_info()]

    for item in raw:
        name = item.get("name", "")
        monit = item.get("monit") or {}
        pm2_env = item.get("pm2_env") or {}
        env = pm2_env.get("env") or {}
        out.append(
            ProcessInfo(
                id=item.get("pm_id"),
                name=name,
                status=pm2_env.get("status", "unknown"),
                pid=item.get("pid") if (item.get("pid") or 0) > 0 else None,
                cpu=float(monit.get("cpu", 0) or 0),
                memory=int(monit.get("memory", 0) or 0),
                uptime_ms=_compute_uptime_ms(pm2_env),
                restarts=int(pm2_env.get("restart_time", 0) or 0),
                port=_parse_port_env(env.get("PORT"))
                or _parse_port_from_args(
                    pm2_env.get("args"),
                    exec_path=pm2_env.get("pm_exec_path"),
                )
                or _parse_port_from_name(name),
                cwd=pm2_env.get("pm_cwd", ""),
                managed_by="pm2",
            )
        )

    out.sort(
        key=lambda p: (
            p.managed_by != "launchd",  # launchd primeiro
            p.status != "online",        # depois online
            p.name.lower(),
        )
    )
    return [p.to_dict() for p in out]


def _launchd_dashboard_info() -> ProcessInfo:
    """Snapshot do claude-hub lendo do próprio processo Python atual."""
    import time

    from server import PORT  # lazy: evita import circular (server importa este módulo)

    pid = os.getpid()
    mem = _rss_bytes(pid)

    return ProcessInfo(
        id=None,
        name="claude-hub",
        status="online",  # se este código roda, o dashboard está online
        pid=pid,
        cpu=0.0,
        memory=mem,
        uptime_ms=int((time.time() - _START_TIME) * 1000),
        restarts=0,
        port=PORT,
        cwd=str(Path(__file__).parent.parent),
        managed_by="launchd",
    )


def _rss_bytes(pid: int) -> int:
    """Lê RSS em bytes via `ps -o rss= -p <pid>` (KB → bytes)."""
    try:
        result = subprocess.run(
            ["/bin/ps", "-o", "rss=", "-p", str(pid)],
            capture_output=True,
            text=True,
            timeout=2,
            check=False,
        )
        return int(result.stdout.strip()) * 1024
    except (ValueError, subprocess.SubprocessError):
        return 0


def _parse_port_from_name(name: str) -> int | None:
    """Heurística: se o nome termina em -NNNN e NNNN é porta válida, extrai."""
    tail = name.rsplit("-", 1)[-1]
    if tail.isdigit() and 1024 <= int(tail) <= 65535:
        return int(tail)
    return None


import time as _time

_START_TIME: float = _time.time()


def _compute_uptime_ms(pm2_env: dict[str, Any]) -> int | None:
    if pm2_env.get("status") != "online":
        return None
    started = pm2_env.get("pm_uptime")
    if not started:
        return None
    import time

    return int(time.time() * 1000) - int(started)


def start(name: str) -> dict[str, Any]:
    _require_mutable(name)
    result = _run_pm2(["start", name])
    if result.returncode != 0:
        raise ProcessError(f"pm2 start falhou: {result.stderr.strip()}")
    return _find_by_name(name)


def stop(name: str) -> dict[str, Any]:
    _require_mutable(name)
    result = _run_pm2(["stop", name])
    if result.returncode != 0:
        raise ProcessError(f"pm2 stop falhou: {result.stderr.strip()}")
    return _find_by_name(name)


def restart(name: str) -> dict[str, Any]:
    _require_mutable(name)
    result = _run_pm2(["restart", name])
    if result.returncode != 0:
        raise ProcessError(f"pm2 restart falhou: {result.stderr.strip()}")
    return _find_by_name(name)


def logs(name: str, lines: int = 30) -> dict[str, str]:
    """Retorna as últimas N linhas de stdout/stderr do processo."""
    if name in LAUNCHD_MANAGED:
        # O plist aponta StandardOut/ErrorPath para logs/server.log
        log_file = Path(__file__).parent.parent / "logs" / "server.log"
        content = _tail_file(log_file, lines)
        return {"stdout": content, "stderr": ""}

    # pm2 guarda logs em ~/.pm2/logs/<name>-out.log e <name>-error.log
    pm2_home = Path(os.environ.get("PM2_HOME", str(Path.home() / ".pm2")))
    out_file = pm2_home / "logs" / f"{name}-out.log"
    err_file = pm2_home / "logs" / f"{name}-error.log"
    return {
        "stdout": _tail_file(out_file, lines),
        "stderr": _tail_file(err_file, lines),
    }


def _tail_file(path: Path, lines: int) -> str:
    if not path.exists():
        return ""
    try:
        with path.open("r", encoding="utf-8", errors="replace") as fh:
            content = fh.readlines()
        return "".join(content[-lines:])
    except OSError:
        return ""


def _find_by_name(name: str) -> dict[str, Any]:
    for item in list_processes():
        if item["name"] == name:
            return item
    raise ProcessError(f"processo não encontrado após ação: {name}")
