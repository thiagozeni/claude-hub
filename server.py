"""claude-hub backend HTTP server.

Serve arquivos estáticos (HTML/CSS/JS/JSON) e expõe uma API REST em
`/api/processes/*` que orquestra o daemon do pm2 via `api.processes`.

Segurança: bind em 127.0.0.1 apenas. Nunca expor em 0.0.0.0.
"""

from __future__ import annotations

import json
from http import HTTPStatus
from http.server import HTTPServer, SimpleHTTPRequestHandler
from pathlib import Path
from typing import Any
from urllib.parse import parse_qs, urlparse

from api import processes, security, security_resolve, reflection, printed_clis

ROOT = Path(__file__).parent
HOST = "127.0.0.1"
# 8090: evita conflito com o UniFi Network Controller, que usa 8080 (device
# inform) junto de 8443/8880/6789. Fonte única da porta — processes.py lê daqui.
PORT = 8090

ALLOWED_ACTIONS: frozenset[str] = frozenset({"start", "stop", "restart"})


class DashboardHandler(SimpleHTTPRequestHandler):
    """Handler combinado: estático + /api/processes/*."""

    def __init__(self, *args: Any, **kwargs: Any) -> None:
        super().__init__(*args, directory=str(ROOT), **kwargs)

    # ------------------------------------------------------------------ GET
    def do_GET(self) -> None:
        parsed = urlparse(self.path)
        if parsed.path.startswith("/api/"):
            self._route_api_get(parsed.path, parse_qs(parsed.query))
            return
        super().do_GET()

    # ----------------------------------------------------------------- POST
    def do_POST(self) -> None:
        parsed = urlparse(self.path)
        if parsed.path.startswith("/api/"):
            self._route_api_post(parsed.path)
            return
        # Mantém comportamento legado: aceita POSTs quietos em outras rotas
        length = int(self.headers.get("Content-Length", 0))
        if length:
            self.rfile.read(length)
        self._send_json({"ok": True}, HTTPStatus.OK)

    # ------------------------------------------------------------------ log
    def log_message(self, format: str, *args: Any) -> None:  # noqa: A002
        # Silencia ruído dos polls do dashboard
        msg = format % args
        if "/api/processes" in msg and " 200 " in msg:
            return
        super().log_message(format, *args)

    # -------------------------------------------------------------- helpers
    def _send_json(self, payload: Any, status: HTTPStatus = HTTPStatus.OK) -> None:
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def _send_error_json(self, message: str, status: HTTPStatus) -> None:
        self._send_json({"error": message}, status)

    # ------------------------------------------------------------- routing
    def _route_api_get(self, path: str, query: dict[str, list[str]]) -> None:
        # GET /api/processes
        if path == "/api/processes":
            try:
                self._send_json({"processes": processes.list_processes()})
            except processes.ProcessError as exc:
                self._send_error_json(str(exc), HTTPStatus.BAD_GATEWAY)
            return

        # GET /api/processes/<name>/logs
        parts = path.strip("/").split("/")
        if len(parts) == 4 and parts[0] == "api" and parts[1] == "processes" and parts[3] == "logs":
            name = parts[2]
            lines = int(query.get("lines", ["30"])[0])
            try:
                self._send_json(processes.logs(name, lines=lines))
            except processes.ProcessError as exc:
                self._send_error_json(str(exc), HTTPStatus.BAD_REQUEST)
            return

        # GET /api/security/suggestion?id=<finding-id>
        if path == "/api/security/suggestion":
            finding_id = (query.get("id", [""])[0] or "").strip()
            if not finding_id:
                self._send_error_json("id é obrigatório", HTTPStatus.BAD_REQUEST)
                return
            try:
                self._send_json(security.suggestion_for(finding_id))
            except security.SecurityError as exc:
                self._send_error_json(str(exc), HTTPStatus.BAD_REQUEST)
            return

        # GET /api/security/groups
        if path == "/api/security/groups":
            try:
                self._send_json({"groups": security_resolve.list_groups()})
            except security_resolve.ResolveError as exc:
                self._send_error_json(str(exc), HTTPStatus.BAD_REQUEST)
            return

        # GET /api/security/jobs/<jobId>
        parts = path.strip("/").split("/")
        if len(parts) == 4 and parts[:3] == ["api", "security", "jobs"]:
            try:
                self._send_json(security_resolve.get_job(parts[3]))
            except security_resolve.ResolveError as exc:
                self._send_error_json(str(exc), HTTPStatus.NOT_FOUND)
            return

        # GET /api/reflection/jobs/<jobId>
        if len(parts) == 4 and parts[:3] == ["api", "reflection", "jobs"]:
            try:
                self._send_json(reflection.get_job(parts[3]))
            except reflection.ReflectionError as exc:
                self._send_error_json(str(exc), HTTPStatus.NOT_FOUND)
            return

        # GET /api/printed-clis
        if path == "/api/printed-clis":
            try:
                self._send_json(printed_clis.list_clis())
            except printed_clis.PrintedClisError as exc:
                self._send_error_json(str(exc), HTTPStatus.INTERNAL_SERVER_ERROR)
            return

        # GET /api/printed-clis/<name>
        if len(parts) == 3 and parts[0] == "api" and parts[1] == "printed-clis":
            cli = printed_clis.get_cli(parts[2])
            if cli is None:
                self._send_error_json("CLI não encontrada", HTTPStatus.NOT_FOUND)
                return
            self._send_json(cli)
            return

        self._send_error_json("rota não encontrada", HTTPStatus.NOT_FOUND)

    def _route_api_post(self, path: str) -> None:
        parts = path.strip("/").split("/")

        # POST /api/reflection/run — dispara reflexão diária via agente
        if path == "/api/reflection/run":
            # body pode ser vazio; consume se existir
            length = int(self.headers.get("Content-Length", 0))
            if length:
                self.rfile.read(length)
            try:
                job_id = reflection.start_reflection()
                self._send_json({"ok": True, "jobId": job_id})
            except reflection.ReflectionError as exc:
                self._send_error_json(str(exc), HTTPStatus.BAD_REQUEST)
            return

        # POST /api/security/rescan — re-executa o scan e regrava security.json
        if path == "/api/security/rescan":
            try:
                import sys as _sys
                _scripts = str(ROOT / "scripts")
                if _scripts not in _sys.path:
                    _sys.path.insert(0, _scripts)
                import security_scan  # type: ignore
                payload = security_scan.run_scan(ROOT / "data" / "security.json")
                self._send_json({"ok": True, "summary": payload["summary"], "total": sum(payload["summary"].values())})
            except Exception as exc:  # noqa: BLE001
                self._send_error_json(f"rescan falhou: {exc}", HTTPStatus.INTERNAL_SERVER_ERROR)
            return

        # POST /api/security/resolve  (body: {groupId})
        if path == "/api/security/resolve":
            length = int(self.headers.get("Content-Length", 0))
            if length <= 0 or length > 4096:
                self._send_error_json("body inválido", HTTPStatus.BAD_REQUEST)
                return
            try:
                body = json.loads(self.rfile.read(length).decode("utf-8"))
            except (json.JSONDecodeError, UnicodeDecodeError):
                self._send_error_json("JSON inválido", HTTPStatus.BAD_REQUEST)
                return
            group_id = (body.get("groupId") or "").strip()
            if not group_id:
                self._send_error_json("groupId é obrigatório", HTTPStatus.BAD_REQUEST)
                return
            try:
                job_id = security_resolve.start_resolve(group_id)
                self._send_json({"ok": True, "jobId": job_id})
            except security_resolve.ResolveError as exc:
                self._send_error_json(str(exc), HTTPStatus.BAD_REQUEST)
            return

        # POST /api/security/status  (body: {id, status})
        if path == "/api/security/status":
            length = int(self.headers.get("Content-Length", 0))
            if length <= 0 or length > 4096:
                self._send_error_json("body inválido", HTTPStatus.BAD_REQUEST)
                return
            try:
                body = json.loads(self.rfile.read(length).decode("utf-8"))
            except (json.JSONDecodeError, UnicodeDecodeError):
                self._send_error_json("JSON inválido", HTTPStatus.BAD_REQUEST)
                return
            finding_id = (body.get("id") or "").strip()
            new_status = (body.get("status") or "").strip()
            if not finding_id or not new_status:
                self._send_error_json("id e status são obrigatórios", HTTPStatus.BAD_REQUEST)
                return
            try:
                updated = security.update_status(finding_id, new_status)
                self._send_json({"ok": True, "finding": updated})
            except security.SecurityError as exc:
                self._send_error_json(str(exc), HTTPStatus.BAD_REQUEST)
            return

        # POST /api/processes/<name>/<action>
        if len(parts) != 4 or parts[0] != "api" or parts[1] != "processes":
            self._send_error_json("rota não encontrada", HTTPStatus.NOT_FOUND)
            return

        name, action = parts[2], parts[3]
        if action not in ALLOWED_ACTIONS:
            self._send_error_json(f"ação inválida: {action}", HTTPStatus.BAD_REQUEST)
            return

        handler = getattr(processes, action)
        try:
            result = handler(name)
            self._send_json({"ok": True, "process": result})
        except processes.ProcessError as exc:
            self._send_error_json(str(exc), HTTPStatus.BAD_REQUEST)


def main() -> None:
    server = HTTPServer((HOST, PORT), DashboardHandler)
    print(f"Serving claude-hub on http://{HOST}:{PORT}")
    print(f"API:    http://{HOST}:{PORT}/api/processes")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nShutting down.")
        server.server_close()


if __name__ == "__main__":
    main()
