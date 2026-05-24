#!/usr/bin/env python3
"""
sync-skills.py — Sincroniza data/skills.json e data/agents.json com o disco.

O que faz:
  - Lê todas as skills em ~/.claude/skills/*/SKILL.md
  - Lê todos os agents em ~/.claude/agents/*.md
  - Compara com data/skills.json e data/agents.json (curados em PT-BR)
  - Adiciona entradas faltantes como STUB (description original, category heurística,
    flag `needsReview: true` para você revisar/traduzir depois)
  - NÃO sobrescreve entradas existentes
  - Reporta itens removidos do disco (mas não deleta — você decide)

Uso:
  python3 scripts/sync-skills.py            # dry-run, mostra diff
  python3 scripts/sync-skills.py --apply    # aplica mudanças
"""

import json
import os
import re
import sys
from pathlib import Path

ROOT = Path(__file__).parent.parent
DATA = ROOT / "data"
SKILLS_DIR = Path(os.path.expanduser("~/.claude/skills"))
AGENTS_DIR = Path(os.path.expanduser("~/.claude/agents"))

# Heurística de categoria por prefixo/keyword no id
CATEGORY_RULES = [
    (r"^ai-research", "AI Research"),
    (r"^mkt-|^kwp-|marketing|seo|copy|ads|email|content", "Marketing Digital"),
    (r"^cs-|^pm-|prd|roadmap|persona|user-stor|sprint|prioritiz", "Product Management"),
    (r"^n8n", "n8n & Automação"),
    (r"^superpowers|brainstorm|debugging|verification|tdd|test-driven", "Superpowers"),
    (r"security|compliance|phi|gdpr|owasp", "Segurança"),
    (r"frontend|design|figma|canvas|liquid-glass|swiftui|compose", "Design & Frontend"),
    (r"docx|pptx|xlsx|pdf|notebook|document", "Documentos"),
    (r"firecrawl|codex|exa|claude-api|mcp", "Firecrawl & Codex"),
    (r"build|deploy|docker|k8s|ci-cd|pipeline|gradle|cmake", "Dev & Infra"),
    (r"patterns|coding-standards|review|refactor", "Dev Patterns"),
    (r"research|analysis|swot|pestle|porters|market", "Análise & Estratégia"),
    (r"slack|gmail|comms|meeting|interview", "Comunicação"),
]

def guess_category(skill_id: str) -> str:
    sid = skill_id.lower()
    for pattern, cat in CATEGORY_RULES:
        if re.search(pattern, sid):
            return cat
    return "Utilitários"


def parse_frontmatter(md_path: Path) -> dict:
    """Extrai frontmatter YAML simples (name, description) de um .md."""
    try:
        text = md_path.read_text(encoding="utf-8", errors="ignore")
    except OSError:
        return {}
    if not text.startswith("---"):
        return {}
    end = text.find("\n---", 3)
    if end == -1:
        return {}
    fm = text[3:end]
    out = {}
    for line in fm.splitlines():
        m = re.match(r'^(\w+):\s*"?(.*?)"?\s*$', line)
        if m:
            out[m.group(1)] = m.group(2).strip()
    return out


def collect_skills() -> dict[str, dict]:
    """Retorna {id: {...}} varrendo recursivamente todos os SKILL.md sob ~/.claude/skills.
    O id usa o caminho relativo (ex: 'ai-research-15-rag/chroma') pra evitar colisão
    de nomes entre sub-skills de pilares diferentes.
    Segue symlinks (skills instaladas via ~/.agents/skills/ aparecem como links)."""
    out = {}
    if not SKILLS_DIR.exists():
        return out
    found = []
    for root, dirs, files in os.walk(SKILLS_DIR, followlinks=True):
        # Evita recursão infinita em loops de symlink
        dirs[:] = [d for d in dirs if not d.startswith("_archived")]
        if "SKILL.md" in files:
            found.append(Path(root) / "SKILL.md")
    for skill_md in sorted(found):
        try:
            rel = skill_md.parent.resolve().relative_to(SKILLS_DIR.resolve())
        except ValueError:
            # symlink target fora de SKILLS_DIR — usa o caminho via link
            rel = skill_md.parent.relative_to(SKILLS_DIR) if SKILLS_DIR in skill_md.parents else Path(skill_md.parent.name)
        sid = str(rel)
        fm = parse_frontmatter(skill_md)
        parts = rel.parts
        pillar = parts[0] if len(parts) > 1 else None
        out[sid] = {
            "id": sid,
            "name": fm.get("name") or rel.name,
            "description": fm.get("description", ""),
            "pillar": pillar,
        }
    return out


def collect_agents() -> dict[str, dict]:
    out = {}
    if not AGENTS_DIR.exists():
        return out
    for f in sorted(AGENTS_DIR.glob("*.md")):
        fm = parse_frontmatter(f)
        out[f.stem] = {
            "id": f.stem,
            "name": fm.get("name", f.stem),
            "description": fm.get("description", ""),
        }
    return out


def sync_file(json_path: Path, disk: dict, kind: str, apply: bool) -> tuple[int, int, list]:
    data = json.loads(json_path.read_text(encoding="utf-8"))
    existing_ids = {item["id"] for item in data}
    disk_ids = set(disk.keys())

    missing = sorted(disk_ids - existing_ids)
    removed = sorted(existing_ids - disk_ids)

    for sid in missing:
        info = disk[sid]
        entry = {
            "id": info["id"],
            "name": info["name"],
            "description": info["description"][:300],
            "needsReview": True,
        }
        if kind == "skill":
            entry["origin"] = info.get("pillar") or "auto-sync"
            entry["category"] = guess_category(info.get("pillar") or sid)
            entry["trigger"] = ""
        else:  # agent — campos obrigatórios pelo renderAgents()
            entry["tools"] = ["*"]
            entry["useCases"] = []
            entry["model"] = "inherit"
            entry["modelNote"] = "Auto-sync — revisar"
        data.append(entry)

    if apply and missing:
        data.sort(key=lambda x: x["id"])
        json_path.write_text(
            json.dumps(data, indent=2, ensure_ascii=False) + "\n",
            encoding="utf-8",
        )

    return len(missing), len(removed), removed


def main():
    apply = "--apply" in sys.argv

    print(f"{'APPLYING' if apply else 'DRY-RUN'} — sync-skills.py\n")

    skills_disk = collect_skills()
    agents_disk = collect_agents()

    print(f"Disco: {len(skills_disk)} skills, {len(agents_disk)} agents")

    sm, sr, sr_list = sync_file(DATA / "skills.json", skills_disk, "skill", apply)
    am, ar, ar_list = sync_file(DATA / "agents.json", agents_disk, "agent", apply)

    print(f"\nSkills: +{sm} novas, -{sr} no JSON mas não no disco")
    if sr_list:
        print("  removidas do disco:", ", ".join(sr_list[:10]))
    print(f"Agents: +{am} novos, -{ar} no JSON mas não no disco")
    if ar_list:
        print("  removidos do disco:", ", ".join(ar_list))

    if not apply and (sm or am):
        print("\nRode com --apply para gravar.")
    elif apply:
        print("\nOK. Entradas novas têm needsReview=true — revise e traduza.")


if __name__ == "__main__":
    main()
