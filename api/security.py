"""API helpers para a aba Security do claude-hub.

Expõe duas operações:
  - update_status(finding_id, status): muta data/security.json in-place
  - suggestion_for(finding_id): retorna snippet/comando sugerido por categoria
"""

from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parent.parent
SECURITY_JSON = ROOT / "data" / "security.json"

VALID_STATUSES: frozenset[str] = frozenset({"open", "acknowledged", "resolved", "ignored"})


class SecurityError(Exception):
    """Erro de operação sobre security.json."""


def _load() -> dict[str, Any]:
    if not SECURITY_JSON.exists():
        raise SecurityError("security.json ainda não gerado — rode `python3 update.py`")
    try:
        return json.loads(SECURITY_JSON.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise SecurityError(f"security.json inválido: {exc}") from exc


def _save(payload: dict[str, Any]) -> None:
    SECURITY_JSON.write_text(
        json.dumps(payload, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )


def update_status(finding_id: str, status: str) -> dict[str, Any]:
    """Atualiza o campo `status` de um finding. Retorna o finding atualizado."""
    if status not in VALID_STATUSES:
        raise SecurityError(f"status inválido: {status}")

    payload = _load()
    for f in payload.get("findings", []):
        if f.get("id") == finding_id:
            f["status"] = status
            _save(payload)
            return f
    raise SecurityError(f"finding não encontrado: {finding_id}")


# ---------------------------------------------------------------------------
# Suggestions por categoria
# ---------------------------------------------------------------------------

def _suggestion_gitignore(finding: dict[str, Any]) -> dict[str, Any]:
    """Sugere linhas a adicionar no .gitignore do projeto."""
    # Derivar o padrão faltante do título: ".gitignore sem padrão `X`"
    title = finding.get("title", "")
    match = re.search(r"`([^`]+)`", title)
    missing = match.group(1) if match else None

    # Mapa do expected set (espelha security_scan.py)
    expected = {
        ".env": [".env", ".env.local", ".env.*"],
        "service_account.json": ["service_account.json"],
        "*.pem": ["*.pem", "*.key"],
        ".DS_Store": [".DS_Store"],
    }

    if missing and missing in expected:
        lines_to_add = expected[missing]
    else:
        # Fallback: gitignore ausente → sugerir starter set
        lines_to_add = [".env", ".env.local", ".env.*", "service_account.json", "*.pem", "*.key", ".DS_Store", "node_modules/", "__pycache__/", "dist/", "build/"]

    project = finding.get("project", "")
    return {
        "kind": "append-file",
        "title": "Adicionar padrões ao .gitignore",
        "explanation": (
            f"Anexe as linhas abaixo ao `.gitignore` do projeto `{project}`. "
            f"Garante que arquivos sensíveis não sejam commitados acidentalmente."
        ),
        "targetPath": f"{project}/.gitignore",
        "snippet": "\n".join(lines_to_add),
        "command": f"cd /Users/pro15/Claude/{project} && printf '%s\\n' {' '.join(repr(l) for l in lines_to_add)} >> .gitignore",
    }


def _suggestion_remote_auth(finding: dict[str, Any]) -> dict[str, Any]:
    """Converte remote HTTPS → SSH mantendo user/repo."""
    project = finding.get("project", "")
    # detail contém o URL atual entre crases
    m = re.search(r"`(https://github\.com/[^`]+)`", finding.get("detail", ""))
    if not m:
        return {
            "kind": "info",
            "title": "Trocar remote para SSH",
            "explanation": "Não foi possível extrair o URL atual. Rode `git remote -v` no projeto.",
            "command": f"cd /Users/pro15/Claude/{project} && git remote -v",
        }

    https_url = m.group(1).rstrip("/")
    # https://github.com/user/repo(.git)? → git@github.com:user/repo.git
    path = https_url.replace("https://github.com/", "").removesuffix(".git")
    ssh_url = f"git@github.com:{path}.git"

    return {
        "kind": "run-command",
        "title": "Trocar remote para SSH",
        "explanation": (
            f"Substitui o remote `origin` do projeto `{project}` de HTTPS para SSH. "
            f"Preferência do workspace (CLAUDE.md global)."
        ),
        "targetPath": f"{project}/.git/config",
        "snippet": ssh_url,
        "command": f"cd /Users/pro15/Claude/{project} && git remote set-url origin {ssh_url}",
    }


def _suggestion_tracked_sensitive(finding: dict[str, Any]) -> dict[str, Any]:
    project = finding.get("project", "")
    path = finding.get("path", "")
    return {
        "kind": "multi-step",
        "title": "Remover arquivo sensível do git (requer atenção)",
        "explanation": (
            "**⚠️ Este fix não é automatizável.** Se o arquivo tem credenciais, "
            "considere que elas já vazaram e precisam ser **rotacionadas** "
            "(no provedor — Google, OpenAI, etc.) antes de qualquer outra coisa. "
            "Só depois rode os comandos abaixo."
        ),
        "targetPath": f"{project}/{path}",
        "command": (
            f"# 1. ROTACIONE a credencial no provedor primeiro\n"
            f"# 2. Remover do tracking (mantém o arquivo local):\n"
            f"cd /Users/pro15/Claude/{project} && git rm --cached {path!r}\n"
            f"# 3. Adicionar ao .gitignore:\n"
            f"echo {path!r} >> .gitignore\n"
            f"# 4. Commit:\n"
            f"git add .gitignore && git commit -m 'chore(security): untrack {path}'\n"
            f"# 5. Se quiser limpar do histórico inteiro (reescreve refs — cuidado):\n"
            f"# git filter-repo --path {path} --invert-paths"
        ),
    }


def _suggestion_secrets_tracked(finding: dict[str, Any]) -> dict[str, Any]:
    project = finding.get("project", "")
    path = finding.get("path", "")
    return {
        "kind": "multi-step",
        "title": "Secret em arquivo trackeado — ação manual",
        "explanation": (
            "**⚠️ Credencial detectada em arquivo versionado.** "
            "Assumir que já vazou. Passos:\n\n"
            "1. **Rotacionar** a credencial no provedor (OpenAI, Anthropic, Google, GitHub, AWS).\n"
            "2. Remover o valor do arquivo e substituir por referência a variável de ambiente.\n"
            "3. Commitar a limpeza.\n"
            "4. Opcional: reescrever histórico se o valor já foi pushado."
        ),
        "targetPath": f"{project}/{path}",
        "command": (
            f"# 1. ROTACIONE a credencial primeiro\n"
            f"# 2. Abra o arquivo e remova o valor literal:\n"
            f"code /Users/pro15/Claude/{project}/{path}\n"
            f"# 3. Use variável de ambiente no código e documente em .env.example\n"
            f"# 4. Verifique se o arquivo está ignorado adequadamente:\n"
            f"grep -E '\\.env|\\.key|\\.pem' /Users/pro15/Claude/{project}/.gitignore"
        ),
    }


def _suggestion_zshrc(finding: dict[str, Any]) -> dict[str, Any]:
    detail = finding.get("detail", "")
    # extrair lista "GEMINI_API_KEY, OPENROUTER_API_KEY, ..."
    m = re.search(r"`~/\.zshrc`:\s*([^.]+)\.", detail)
    vars_list = m.group(1).strip() if m else "as variáveis exportadas"

    template = (
        "# ~/.secrets  (chmod 600, fora do versionamento)\n"
        "export GEMINI_API_KEY=\"...\"\n"
        "export OPENROUTER_API_KEY=\"...\"\n"
        "export FIRECRAWL_API_KEY=\"...\"\n"
    )
    return {
        "kind": "multi-step",
        "title": "Mover secrets do ~/.zshrc para ~/.secrets",
        "explanation": (
            f"Mover {vars_list} de `~/.zshrc` (potencialmente versionado ou compartilhado) "
            "para `~/.secrets` (600, fora de qualquer repo). "
            "`.zshrc` passa a só fazer `source ~/.secrets`."
        ),
        "targetPath": "~/.secrets",
        "snippet": template,
        "command": (
            "# 1. Criar arquivo com os exports (ver snippet):\n"
            "touch ~/.secrets && chmod 600 ~/.secrets\n"
            "# 2. Mover as linhas `export XXX_KEY=...` do ~/.zshrc para ~/.secrets\n"
            "# 3. Adicionar no ~/.zshrc:\n"
            "echo '[ -f ~/.secrets ] && source ~/.secrets' >> ~/.zshrc\n"
            "# 4. Recarregar:\n"
            "source ~/.zshrc"
        ),
    }


_SUGGESTION_BY_CATEGORY = {
    "gitignore": _suggestion_gitignore,
    "remote-auth": _suggestion_remote_auth,
    "tracked-sensitive": _suggestion_tracked_sensitive,
    "secrets": _suggestion_secrets_tracked,  # default para secrets em trackeds
}


def suggestion_for(finding_id: str) -> dict[str, Any]:
    payload = _load()
    finding = next((f for f in payload.get("findings", []) if f.get("id") == finding_id), None)
    if not finding:
        raise SecurityError(f"finding não encontrado: {finding_id}")

    category = finding.get("category", "")
    project = finding.get("project", "")

    # Caso especial: secrets no ~/.zshrc vs em arquivo de projeto
    if category == "secrets" and project == "workspace":
        fn = _suggestion_zshrc
    else:
        fn = _SUGGESTION_BY_CATEGORY.get(category)

    if fn is None:
        return {
            "kind": "info",
            "title": "Sem sugestão automatizada",
            "explanation": f"Categoria `{category}` ainda não tem sugestão codificada. Veja o `detail` do finding.",
            "command": "",
        }

    result = fn(finding)
    # Anexa contexto pra UI
    result["findingId"] = finding_id
    result["category"] = category
    return result
