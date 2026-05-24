# Claude Hub

Central de informações sobre capacidades do Claude Code: skills, sub-agents, projetos, MCPs, cheatsheet e backlog pessoal.

## Como usar

```bash
cd /Users/pro15/Claude/claude-hub
./start.sh   # sobe server.py (estático + API) na porta 8090
```

Abrir: http://localhost:8090

> Porta **8090** para não colidir com o UniFi Network Controller (que usa 8080/8443/8880/6789).

> **Nota:** O dashboard requer um servidor HTTP local porque usa `fetch()` para carregar os arquivos JSON em `data/`. Abrir o `index.html` diretamente via `file://` aciona o fallback com dados embutidos no `app.js` — tudo funciona, mas edições nos JSONs não serão refletidas sem o servidor.

## Estrutura

```
claude-hub/
├── index.html        — Estrutura HTML e layout
├── style.css         — Design system completo (dark theme)
├── app.js            — Lógica de navegação e renderização
└── data/
    ├── skills.json   — Skills disponíveis
    ├── agents.json   — Sub-agents configurados
    ├── projects.json — Projetos desenvolvidos
    └── mcps.json     — MCP servers e ferramentas instaladas
```

## Seções

- **Skills** — Capacidades especializadas com filtro por categoria
- **Sub-Agents** — Agentes com notas de uso salvas no localStorage
- **Projetos** — Projetos com status, stack e links
- **MCPs & Ferramentas** — Servidores MCP conectados e ferramentas CLI
- **Cheatsheet** — Referência rápida em accordion
- **Backlog** — Kanban pessoal salvo no localStorage
