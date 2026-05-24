/* ===================================================
   Claude Hub — app.js
   Sem frameworks. Sem build. Dados via fetch + fallback inline.
   =================================================== */

'use strict';

/* ─── Fallback data (usado quando fetch falha via file://) ─── */

const FALLBACK_SKILLS = [
  { id: "pdf", name: "pdf", origin: "document-skills", category: "Documentos", description: "Leitura, criação, mesclagem, divisão, rotação, watermark, OCR e manipulação de arquivos PDF.", trigger: "Mencione arquivo .pdf ou peça para criar/editar/unir PDFs" },
  { id: "docx", name: "docx", origin: "document-skills", category: "Documentos", description: "Cria, lê, edita e manipula documentos Word (.docx) com formatação rica, sumário, cabeçalhos, imagens e controle de alterações.", trigger: "Mencione 'Word doc', '.docx', 'relatório', 'memo' ou 'carta' como arquivo Word" },
  { id: "pptx", name: "pptx", origin: "document-skills", category: "Documentos", description: "Cria, lê, edita e manipula apresentações PowerPoint (.pptx) — slides, temas, notas, templates.", trigger: "Mencione 'deck', 'slides', 'apresentação' ou qualquer arquivo .pptx" },
  { id: "xlsx", name: "xlsx", origin: "document-skills", category: "Documentos", description: "Cria, lê, edita e corrige planilhas (.xlsx, .csv, .tsv) — fórmulas, gráficos, formatação, limpeza de dados.", trigger: "Mencione arquivo .xlsx/.csv ou peça para criar/manipular planilha" },
  { id: "doc-coauthoring", name: "doc-coauthoring", origin: "document-skills", category: "Documentos", description: "Workflow estruturado de co-autoria para documentação, propostas, specs técnicas e decisões.", trigger: "Mencione 'escrever documentação', 'criar proposta', 'redigir spec' ou similares" },
  { id: "frontend-design", name: "frontend-design", origin: "document-skills", category: "Design & Frontend", description: "Cria interfaces web de produção com alta qualidade visual — componentes, páginas, dashboards, React, HTML/CSS.", trigger: "Peça componente, página, landing page, dashboard ou qualquer interface web" },
  { id: "canvas-design", name: "canvas-design", origin: "document-skills", category: "Design & Frontend", description: "Cria arte visual em .png e .pdf usando princípios de design — posters, artes estáticas, peças gráficas.", trigger: "Peça um poster, arte, design ou peça gráfica estática" },
  { id: "algorithmic-art", name: "algorithmic-art", origin: "document-skills", category: "Design & Frontend", description: "Cria arte algorítmica com p5.js — randomness seeded, campos de fluxo, sistemas de partículas, generativo.", trigger: "Peça arte generativa, algorítmica, flow fields ou sistemas de partículas" },
  { id: "theme-factory", name: "theme-factory", origin: "document-skills", category: "Design & Frontend", description: "Aplica temas visuais (10 pré-definidos ou customizados) a artifacts — slides, docs, landing pages, HTML.", trigger: "Peça para aplicar tema ou estilizar um artifact existente" },
  { id: "web-artifacts-builder", name: "web-artifacts-builder", origin: "document-skills", category: "Design & Frontend", description: "Cria artifacts HTML multi-componentes com React, Tailwind CSS e shadcn/ui — para UIs complexas com estado e roteamento.", trigger: "Peça artifact web complexo com React, Tailwind ou shadcn/ui" },
  { id: "brand-guidelines", name: "brand-guidelines", origin: "document-skills", category: "Design & Frontend", description: "Aplica cores e tipografia oficiais da Anthropic a qualquer artifact.", trigger: "Peça algo no estilo visual da Anthropic ou com brand guidelines" },
  { id: "slack-gif-creator", name: "slack-gif-creator", origin: "document-skills", category: "Design & Frontend", description: "Cria GIFs animados otimizados para o Slack com constraints específicos de tamanho e formato.", trigger: "Peça 'GIF para Slack' ou GIF animado" },
  { id: "claude-api", name: "claude-api", origin: "document-skills", category: "Dev & Infra", description: "Constrói apps com a Claude API ou Anthropic SDK (Python/TypeScript) — inclui Agent SDK.", trigger: "Código importa 'anthropic' / '@anthropic-ai/sdk' / 'claude_agent_sdk'" },
  { id: "mcp-builder", name: "mcp-builder", origin: "document-skills", category: "Dev & Infra", description: "Cria servidores MCP de alta qualidade em Python (FastMCP) ou TypeScript para integrar APIs externas.", trigger: "Peça para criar um servidor MCP ou integrar API via MCP" },
  { id: "webapp-testing", name: "webapp-testing", origin: "document-skills", category: "Dev & Infra", description: "Testa e interage com apps web locais via Playwright — screenshots, logs de browser, debugging de UI.", trigger: "Peça para testar, verificar ou debugar uma web app local" },
  { id: "skill-creator", name: "skill-creator", origin: "document-skills", category: "Dev & Infra", description: "Cria, modifica, avalia e otimiza skills — inclui evals, benchmarks e análise de performance.", trigger: "Peça para criar, editar ou otimizar uma skill" },
  { id: "notebooklm", name: "notebooklm", origin: "built-in", category: "Automação", description: "API completa para Google NotebookLM — criar notebooks, adicionar fontes, gerar podcasts e artifacts, download em múltiplos formatos.", trigger: "Use /notebooklm ou diga 'criar podcast sobre X' ou qualquer tarefa NotebookLM" },
  { id: "yt-search", name: "yt-search", origin: "built-in", category: "Automação", description: "Busca no YouTube e retorna resultados estruturados com metadados dos vídeos.", trigger: "Peça para buscar vídeos no YouTube" },
  { id: "internal-comms", name: "internal-comms", origin: "document-skills", category: "Comunicação", description: "Redige comunicações internas em formatos corporativos — status reports, newsletters, FAQs, incident reports, updates de liderança.", trigger: "Peça comunicação interna, status report, newsletter ou update de projeto" },
  { id: "keybindings-help", name: "keybindings-help", origin: "built-in", category: "Utilitários", description: "Configura atalhos de teclado do Claude Code — rebind, chord shortcuts, ~/.claude/keybindings.json.", trigger: "Peça para customizar keybindings ou atalhos de teclado" },
  { id: "loop", name: "loop", origin: "built-in", category: "Utilitários", description: "Roda um prompt ou slash command em intervalo recorrente (ex: /loop 5m /foo, padrão 10m).", trigger: "Peça para repetir tarefa a cada N minutos ou verificar algo periodicamente" },
  { id: "simplify", name: "simplify", origin: "built-in", category: "Utilitários", description: "Revisa código alterado em busca de oportunidades de reuso, qualidade e eficiência, e corrige os problemas encontrados.", trigger: "Após implementar código, peça para simplificar ou revisar qualidade" }
];

const FALLBACK_AGENTS = [
  { id: "general-purpose", name: "general-purpose", description: "Agente de uso geral para pesquisa de questões complexas, busca em código e tarefas multi-etapa. Use quando precisar de busca ampla em codebase.", tools: ["*"], useCases: ["Pesquisa em codebase grande", "Busca de keywords em múltiplos arquivos", "Tarefas multi-etapa autônomas"], model: "inherit", modelNote: "Herda o modelo ativo na sessão" },
  { id: "explore", name: "Explore", description: "Agente rápido especializado em explorar codebases — busca por padrões de arquivo, palavras-chave ou perguntas sobre a estrutura do projeto.", tools: ["Glob", "Grep", "Read", "Bash", "WebSearch", "WebFetch"], useCases: ["Encontrar arquivos por padrão", "Buscar keyword em código", "Entender como funcionalidade foi implementada"], model: "inherit", modelNote: "Herda o modelo ativo na sessão" },
  { id: "plan", name: "Plan", description: "Arquiteto de software para desenhar planos de implementação — retorna planos passo-a-passo, arquivos críticos e trade-offs arquiteturais.", tools: ["Glob", "Grep", "Read", "Bash", "WebSearch", "WebFetch"], useCases: ["Planejar nova feature", "Definir arquitetura", "Avaliar abordagens antes de codar"], model: "inherit", modelNote: "Herda o modelo ativo na sessão" },
  { id: "claude-code-guide", name: "claude-code-guide", description: "Especialista em Claude Code CLI, Claude Agent SDK e Claude API — features, hooks, slash commands, MCP servers, settings, IDE integrations.", tools: ["Glob", "Grep", "Read", "WebFetch", "WebSearch"], useCases: ["Dúvidas sobre Claude Code CLI", "Como usar o Agent SDK", "Como usar a API Anthropic"], model: "inherit", modelNote: "Herda o modelo ativo na sessão" },
  { id: "code-reviewer", name: "code-reviewer", description: "Revisor de código e debugger — identifica bugs, investiga erros, analisa qualidade/segurança e sugere melhorias antes do commit.", tools: ["Read", "Grep", "Glob", "Bash"], useCases: ["Revisar código implementado", "Investigar testes falhando", "Análise de segurança", "Sugestões de melhoria"], model: "sonnet", modelNote: "claude-sonnet-4-6" },
  { id: "ux-designer", name: "ux-designer", description: "Especialista em design de interfaces, UX e acessibilidade — layouts, hierarquia visual, componentes, paletas, tipografia e fluxos de navegação.", tools: ["Read", "Grep", "Glob"], useCases: ["Revisar layout e hierarquia visual", "Propor melhorias de UX", "Acessibilidade", "Design system"], model: "sonnet", modelNote: "claude-sonnet-4-6" },
  { id: "git-assistant", name: "git-assistant", description: "Especialista em git — analisa diffs, prepara commits, organiza staging area, verifica histórico e prepara código para push.", tools: ["Bash", "Read", "Grep"], useCases: ["Redigir mensagens de commit", "Analisar diff antes do commit", "Organizar staging", "Verificar histórico"], model: "haiku", modelNote: "claude-haiku-4-5" },
  { id: "copywriter", name: "copywriter", description: "Redator especializado em conteúdo publicitário, jornalístico e digital — sites, produtos, posts, títulos, CTAs, descrições de vídeo, marketing.", tools: ["Read", "Write", "WebSearch"], useCases: ["Textos de site", "Descrições de produto", "Posts e títulos", "Descrições de vídeo YouTube"], model: "sonnet", modelNote: "claude-sonnet-4-6" },
  { id: "frontend-dev", name: "frontend-dev", description: "Desenvolvedor especializado em front-end — interfaces, componentes, CSS, JavaScript, integração com APIs no cliente, React e HTML semântico.", tools: ["Read", "Edit", "Write", "Grep", "Glob", "Bash"], useCases: ["Implementar interfaces e componentes", "Estilização CSS", "Integração de API no cliente", "React e HTML"], model: "sonnet", modelNote: "claude-sonnet-4-6" },
  { id: "planner", name: "planner", description: "Especialista em planejamento de apps, arquitetura e pesquisa web — planeja features, define arquitetura, escolhe tecnologias e levanta requisitos.", tools: ["Read", "Grep", "Glob", "WebSearch", "WebFetch"], useCases: ["Planejar nova funcionalidade", "Escolher tecnologia", "Pesquisar bibliotecas", "Levantar requisitos"], model: "opus", modelNote: "claude-opus-4-6" },
  { id: "backend-dev", name: "backend-dev", description: "Programador especializado em back-end, APIs, modelagem de banco de dados e arquitetura server-side.", tools: ["Read", "Edit", "Write", "Grep", "Glob", "Bash"], useCases: ["Implementar rotas e lógica de negócio", "Queries SQL", "Modelagem de dados", "Autenticação", "Integrações externas"], model: "sonnet", modelNote: "claude-sonnet-4-6" },
  { id: "statusline-setup", name: "statusline-setup", description: "Configura o status line do Claude Code — modifica ~/.claude/keybindings.json para personalizar a linha de status.", tools: ["Read", "Edit"], useCases: ["Configurar status line do Claude Code"], model: "inherit", modelNote: "Herda o modelo ativo na sessão" }
];

const FALLBACK_PROJECTS = [
  { id: "cachorradas-estudios", name: "Cachorradas Estudios", path: "/Users/pro15/Claude/cachorradas-estudios", url: "https://thiagozeni.github.io/cachorradas-estudios", repo: "https://github.com/thiagozeni/cachorradas-estudios", type: "Site Estático", status: "active", tech: ["HTML", "CSS", "JavaScript", "Python", "GitHub Actions", "YouTube Data API v3"], description: "Site do canal YouTube @CachorradasEstudios com atualização automática diária de stats e vídeos via GitHub Actions às 08h BRT.", highlights: ["GitHub Pages", "Auto-update diário 08h BRT", "Séries: GDV, Metallica Slayer, E SE???"], lastActivity: "2026-03-11" },
  { id: "eat-kitchen-concierge", name: "EAT Kitchen Concierge", path: "/Users/pro15/Claude/eat-kitchen-concierge", url: null, repo: null, type: "Fullstack", status: "active", tech: ["React 19", "Vite", "TypeScript", "Tailwind v4", "Express", "Gemini API", "lucide-react", "motion"], description: "Concierge gastronômico com IA para o restaurante EAT Kitchen — recomenda pratos com streaming de respostas e suporte a múltiplos idiomas.", highlights: ["SSE streaming", "8 idiomas", "Multi-step upselling flow"], lastActivity: "2026-03-11" },
  { id: "alugueis-bea", name: "Aluguéis Bea", path: "/Users/pro15/Claude/alugueis-bea", url: null, repo: null, type: "Scripts", status: "maintenance", tech: ["Python", "Google Sheets API", "Apps Script", "openpyxl"], description: "Controle de aluguéis com extração automática de PDFs protegidos por senha e preenchimento de planilha Google Sheets.", highlights: ["Extração de PDFs com senha", "Integração Google Sheets"], lastActivity: "2026-03-01" },
  { id: "claude-hub", name: "Claude Hub", path: "/Users/pro15/Claude/claude-hub", url: null, repo: "https://github.com/thiagozeni/claude-hub", type: "Site Estático", status: "active", tech: ["Python", "HTML", "CSS", "JavaScript vanilla", "launchd"], description: "Central de informações sobre capacidades do Claude Code: skills, sub-agents, projetos, MCPs, cheatsheet e backlog. Servido em localhost:8090 via LaunchAgent.", highlights: ["Uso interno", "LaunchAgent (com.pro15.claude-hub)", "API /api/processes (pm2 control)"], lastActivity: "2026-04-17" },
  { id: "magma", name: "Magma", path: "/Users/pro15/Claude/magma", url: null, repo: null, type: "Site Estático", status: "active", tech: ["HTML", "CSS", "JavaScript"], description: "Site histórico da banda Magma (Nova Hamburgo/RS, 2001–2025) — discografia, fotos, vídeos e memória da trajetória da banda.", highlights: ["Site comemorativo", "Sem dependências externas"], lastActivity: "2026-03-15" },
  { id: "thiago-zeni", name: "Thiago Zeni", path: "/Users/pro15/Claude/thiago-zeni", url: null, repo: null, type: "Site Estático", status: "active", tech: ["HTML", "CSS", "JavaScript"], description: "Site pessoal de Thiago Zeni — Marketing Digital & Liderança Executiva.", highlights: ["Site pessoal", "Sem dependências externas"], lastActivity: "2026-03-15" },
  { id: "3-contra-todos-game", name: "3 Contra Todos — Game", path: "/Users/pro15/Claude/3-contra-todos/game", url: "https://werdumfight.com", repo: "https://github.com/thiagozeni/3-contra-todos-game", type: "Game", status: "active", tech: ["TypeScript", "Vite", "Phaser 3", "Capacitor"], description: "Arena Beat'em Up inspirado em Streets of Rage e Final Fight, desenvolvido com Phaser 3. Web + iOS + Android.", highlights: ["Arena Beat'em Up", "Phaser 3", "App Store + Google Play"], lastActivity: "2026-04-26" },
  { id: "3-contra-todos-landing", name: "3 Contra Todos — Landing", path: "/Users/pro15/Claude/3-contra-todos/landing-page-promocional", url: "https://3contratodos.com", repo: null, type: "Landing", status: "active", tech: ["HTML", "CSS"], description: "Landing page promocional do jogo 3 Contra Todos.", highlights: [], lastActivity: "2026-04-26" },
  { id: "3-contra-todos-social", name: "3 Contra Todos — Social Media", path: "/Users/pro15/Claude/3-contra-todos/materiais-social-media", url: null, repo: null, type: "Assets", status: "active", tech: ["HTML", "CSS", "Bash"], description: "Templates de feed/stories e scripts de export para campanhas sociais (apenas local).", highlights: [], lastActivity: "2026-04-26" },
  { id: "ai-router", name: "AI Router", path: "/Users/pro15/Claude/ai-router", url: null, repo: null, type: "Scripts", status: "active", tech: ["Python", "zsh", "MLX", "OpenRouter", "Gemini API", "HuggingFace"], description: "Roteador de IAs com 9 categorias: MLX local (Gemma 4, DeepSeek-R1, Qwen2.5-Coder) + OpenRouter free/paid (Qwen 3.6, Qwen3 Coder, Nemotron, Qwen3.5-flash, o4-mini) + Gemini 2.5 Pro. Classifica prompts e despacha pro modelo adequado.", highlights: ["9 categorias (private/vision/bulk/hard_reasoning/review/coding/reasoning/research/general)", "MLX local + OpenRouter + Gemini", "Shell scripts (~/ai-*.sh) + Python CLI"], lastActivity: "2026-04-17" }
];

const FALLBACK_MCPS = {
  mcps: [
    { id: "canva", name: "Canva", icon: "🎨", status: "connected", description: "Criação e edição de designs no Canva — templates, brand kits, exportação, comentários e colaboração.", capabilities: ["Criar designs a partir de prompts", "Editar designs existentes", "Exportar em múltiplos formatos", "Gerenciar pastas e assets", "Brand kits", "Comentários e colaboração"], toolCount: 31 },
    { id: "gmail", name: "Gmail", icon: "✉️", status: "connected", description: "Acesso à caixa de entrada do Gmail — leitura, busca, criação de rascunhos e gerenciamento de labels.", capabilities: ["Buscar e ler emails", "Ler threads completas", "Criar rascunhos", "Listar e gerenciar labels", "Obter perfil da conta"], toolCount: 7 },
    { id: "google-calendar", name: "Google Calendar", icon: "📅", status: "connected", description: "Gerenciamento completo do Google Calendar — eventos, disponibilidade, agendamento inteligente.", capabilities: ["Listar e buscar eventos", "Criar e atualizar eventos", "Deletar eventos", "Verificar disponibilidade", "Encontrar horários livres", "Responder convites"], toolCount: 9 },
    { id: "supabase", name: "Supabase", icon: "🗄️", status: "connected", description: "Gerenciamento completo de projetos Supabase — banco de dados, edge functions, migrações, branches e logs.", capabilities: ["Executar SQL e gerenciar tabelas", "Criar e gerenciar projetos", "Aplicar e listar migrações", "Deploy de edge functions", "Gerenciar branches de banco", "Gerar tipos TypeScript", "Visualizar logs e advisors", "Pausar e restaurar projetos"], toolCount: 29 },
    { id: "figma", name: "Figma", icon: "✏️", status: "connected", description: "Leitura e geração de designs no Figma — contexto de design, screenshots, diagramas FigJam e Code Connect.", capabilities: ["Ler contexto e código de designs", "Capturar screenshots de frames", "Gerar diagramas no FigJam", "Criar designs via prompts", "Gerenciar Code Connect (mapeamento componentes)", "Obter variáveis e tokens de design", "Ler metadados de arquivos"], toolCount: 13 },
    { id: "vercel", name: "Vercel", icon: "▲", status: "connected", description: "Deploy e gerenciamento de projetos na Vercel — deployments, logs, domínios e toolbar de feedback.", capabilities: ["Deploy de projetos", "Listar deployments e projetos", "Ver logs de build e runtime", "Verificar disponibilidade de domínios", "Gerenciar threads de feedback (toolbar)", "Buscar documentação da Vercel", "Acessar URLs de preview"], toolCount: 18 },
    { id: "gemini-image", name: "Gemini Image", icon: "🖼️", status: "connected", description: "Geração e edição de imagens via Google Gemini — cria imagens a partir de prompts e edita imagens existentes.", capabilities: ["Gerar imagens a partir de descrições em linguagem natural", "Editar e modificar imagens existentes"], toolCount: 2 },
    { id: "zapier", name: "Zapier", icon: "⚡", status: "connected", description: "Integração com o ecossistema Zapier — acesso a automações e conexões com 7000+ apps via MCP.", capabilities: ["Configurar integração com Zapier", "Acionar automações (Zaps)", "Conectar com 7000+ apps externos"], toolCount: 1 },
    { id: "n8n", name: "n8n", icon: "🔄", status: "connected", description: "Plataforma de automação self-hosted — cria, gerencia e executa workflows com mais de 500 nodes de integração. Instância local em localhost:5678.", capabilities: ["Criar e editar workflows", "Executar e testar workflows", "Listar e gerenciar workflows existentes", "Buscar nodes e templates disponíveis", "Validar workflows antes do deploy", "Ver histórico de execuções", "Gerenciar datatables", "Deploy de templates prontos"], toolCount: 21 }
  ],
  skills: [
    { id: "firecrawl", name: "firecrawl", icon: "🕷️", type: "Plugin (Claude Code)", description: "Web scraping e crawling via Firecrawl — extrai conteúdo de páginas web em formato limpo (Markdown/JSON), rastreia sites inteiros e realiza buscas estruturadas.", install: "claude plugin install firecrawl + npm install -g firecrawl-cli", useCases: ["Scraping de páginas web", "Crawling de sites inteiros", "Extração de conteúdo limpo (Markdown)", "Busca estruturada na web", "Mapeamento de URLs de um domínio"] }
  ],
  tools: [
    { id: "yt-dlp", name: "yt-dlp", version: "2026.03.03", icon: "⬇️", type: "CLI", description: "Downloader de vídeos e áudios de YouTube e outros sites (suporte a 1000+ sites).", install: "via Python 3.14", useCases: ["Download de vídeos", "Extração de áudio", "Download de playlists", "Formatos customizados"] },
    { id: "notebooklm-py", name: "notebooklm-py", version: "0.3.3", icon: "📓", type: "CLI + Python API", description: "CLI e API Python para automação do Google NotebookLM — criar notebooks, adicionar fontes, gerar podcasts programaticamente.", install: "pip install notebooklm-py", useCases: ["Criar notebooks via CLI", "Adicionar fontes automaticamente", "Gerar podcasts", "Download de artifacts"] }
  ]
};

/* ─── Cheatsheet data (hardcoded) ─── */
const CHEATSHEET = [
  {
    number: "1",
    title: "Slash Commands",
    rows: [
      ["/clear", "Limpar contexto da conversa"],
      ["/compact", "Compactar histórico"],
      ["/memory", "Gerenciar memórias"],
      ["/help", "Ajuda do Claude Code"],
      ["/fast", "Ativar/desativar modo fast"],
      ["/model", "Trocar modelo"],
      ["/review-pr", "Revisar PR"]
    ]
  },
  {
    number: "2",
    title: "Invocar Skills",
    rows: [
      ["Mencione .pdf", "→ skill pdf"],
      ['"Crie uma landing page"', "→ skill frontend-design"],
      ["importa anthropic", "→ skill claude-api"],
      ['"Deck de slides"', "→ skill pptx"],
      ['"Planilha Excel"', "→ skill xlsx"],
      ['"Documento Word"', "→ skill docx"],
      ["/notebooklm", "→ skill notebooklm"]
    ]
  },
  {
    number: "3",
    title: "Usar Sub-Agents",
    rows: [
      ['"Use o agente backend-dev"', "Implementar lógica de negócio"],
      ['"Use o agente Explore"', "Busca ampla em codebase"],
      ['"Use o agente code-reviewer"', "Revisar código implementado"],
      ['"Use o agente Plan"', "Planejar antes de codar"],
      ['"Execute em paralelo X e Y"', "Delegação paralela de subtarefas"]
    ]
  },
  {
    number: "4",
    title: "Atalhos Claude Code CLI",
    rows: [
      ["Ctrl+C", "Interromper resposta"],
      ["Ctrl+R", "Buscar histórico de comandos"],
      ["↑ / ↓", "Navegar histórico"],
      ["Tab", "Autocomplete de paths"],
      ["/ no início", "Invocar skill"]
    ]
  },
  {
    number: "5",
    title: "Comandos de Memória",
    rows: [
      ['"Lembre-se que..."', "Salva memória permanente"],
      ['"Esqueça que..."', "Remove memória"],
      ['"Sua memória sobre X?"', "Consulta memória específica"],
      ["~/.claude/projects/.../memory/", "Localização dos arquivos de memória"]
    ]
  }
];

/* ─── Backlog defaults ─── */
const BACKLOG_DEFAULTS = [
  { id: "b1", title: "Configurar GitHub Pages para o dashboard", status: "todo", color: "#1E1E2E" },
  { id: "b2", title: "Adicionar skill de análise de imagens", status: "todo", color: "#1E1A2E" },
  { id: "b3", title: "Criar agente especializado em dados", status: "progress", color: "#1E1A2E" },
  { id: "b4", title: "Integrar Google Drive via MCP", status: "progress", color: "#1A2E1A" },
  { id: "b5", title: "Dashboard inicial publicado", status: "done", color: "#1A2E1A" }
];

const CARD_COLORS = [
  { value: "#1E1E2E", label: "Padrão" },
  { value: "#1A2E1A", label: "Verde" },
  { value: "#1E1A2E", label: "Roxo" },
  { value: "#2E1A1A", label: "Vermelho" },
  { value: "#2E261A", label: "Amarelo" }
];

/* ─── Helpers ─── */

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function categoryClass(cat) {
  const map = {
    'Documentos': 'cat-documentos',
    'Design & Frontend': 'cat-design',
    'Dev & Infra': 'cat-dev',
    'Automação': 'cat-automacao',
    'Comunicação': 'cat-comunicacao',
    'Utilitários': 'cat-utilitarios'
  };
  return map[cat] || 'cat-utilitarios';
}

function statusLabel(status) {
  const map = { active: 'Ativo', maintenance: 'Manutenção', archived: 'Arquivado' };
  return map[status] || status;
}

async function fetchJSON(url, fallback) {
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch {
    return fallback;
  }
}

function copyToClipboard(text, el) {
  navigator.clipboard.writeText(text).then(() => {
    const original = el.innerHTML;
    el.innerHTML = el.innerHTML.replace('Copiar', 'Copiado!');
    setTimeout(() => { el.innerHTML = original; }, 1500);
  }).catch(() => {});
}

/* ─── Navigation ─── */

const SECTIONS = ['skills', 'agents', 'processos', 'projects', 'mcps', 'printedclis', 'airouter', 'hooks', 'security', 'cheatsheet', 'backlog', 'evolucao'];
const SECTION_LABELS = {
  skills: 'Skills',
  agents: 'Sub-Agents',
  processos: 'Processos',
  projects: 'Projetos',
  mcps: 'MCPs / Tools',
  printedclis: 'Printed CLIs',
  airouter: 'AI Router',
  hooks: 'Hooks',
  security: 'Security',
  cheatsheet: 'Cheatsheet',
  backlog: 'Backlog',
  evolucao: 'Evolução'
};

let currentSection = 'skills';

function navigateTo(id) {
  if (!SECTIONS.includes(id)) return;

  SECTIONS.forEach(s => {
    const el = document.getElementById(s);
    if (el) el.classList.toggle('hidden', s !== id);
  });

  document.querySelectorAll('.nav-item').forEach(btn => {
    const isActive = btn.dataset.target === id;
    btn.classList.toggle('active', isActive);
    btn.setAttribute('aria-current', isActive ? 'page' : 'false');
  });

  const mobileTitle = document.getElementById('mobile-title');
  if (mobileTitle) mobileTitle.textContent = SECTION_LABELS[id] || id;

  currentSection = id;
  closeSidebar();
}

function openSidebar() {
  const sidebar = document.getElementById('sidebar');
  const overlay = document.getElementById('sidebar-overlay');
  const btn = document.getElementById('hamburger-btn');
  sidebar.classList.add('open');
  overlay.classList.add('visible');
  if (btn) btn.setAttribute('aria-expanded', 'true');
}

function closeSidebar() {
  const sidebar = document.getElementById('sidebar');
  const overlay = document.getElementById('sidebar-overlay');
  const btn = document.getElementById('hamburger-btn');
  sidebar.classList.remove('open');
  overlay.classList.remove('visible');
  if (btn) btn.setAttribute('aria-expanded', 'false');
}

/* ─── Skills ─── */

let allSkills = [];
let activeFilter = 'Todos';
let skillsQuery = '';
let skillsSearchBound = false;

function renderSkills(skills) {
  const categories = ['Todos', ...new Set(skills.map(s => s.category))];
  const filterBar = document.getElementById('skills-filter');
  filterBar.innerHTML = '';

  categories.forEach(cat => {
    const btn = document.createElement('button');
    btn.className = 'filter-btn' + (cat === activeFilter ? ' active' : '');
    btn.textContent = cat;
    btn.setAttribute('aria-pressed', cat === activeFilter ? 'true' : 'false');
    btn.addEventListener('click', () => {
      activeFilter = cat;
      renderSkills(allSkills);
    });
    filterBar.appendChild(btn);
  });

  const searchInput = document.getElementById('skills-search');
  if (searchInput && !skillsSearchBound) {
    searchInput.value = skillsQuery;
    searchInput.addEventListener('input', (e) => {
      skillsQuery = e.target.value.trim().toLowerCase();
      renderSkills(allSkills);
    });
    skillsSearchBound = true;
  }

  let filtered = activeFilter === 'Todos' ? skills : skills.filter(s => s.category === activeFilter);
  if (skillsQuery) {
    filtered = filtered.filter(s =>
      (s.name || '').toLowerCase().includes(skillsQuery) ||
      (s.description || '').toLowerCase().includes(skillsQuery) ||
      (s.trigger || '').toLowerCase().includes(skillsQuery) ||
      (s.category || '').toLowerCase().includes(skillsQuery)
    );
  }
  const grid = document.getElementById('skills-grid');
  grid.innerHTML = '';

  filtered.forEach(skill => {
    const card = document.createElement('article');
    card.className = 'card';
    card.setAttribute('aria-label', `Skill: ${skill.name}`);
    card.innerHTML = `
      <div class="card-header">
        <span class="card-name">${escapeHtml(skill.name)}</span>
        <span class="category-badge ${categoryClass(skill.category)}">${escapeHtml(skill.category)}</span>
      </div>
      <p class="card-description">${escapeHtml(skill.description)}</p>
      <div class="card-trigger" title="Trigger de ativação">
        <span class="trigger-icon" aria-hidden="true">⚡</span>
        <span>${escapeHtml(skill.trigger)}</span>
      </div>
    `;
    grid.appendChild(card);
  });
}

/* ─── Agents ─── */

function renderAgents(agents) {
  const grid = document.getElementById('agents-grid');
  grid.innerHTML = '';

  agents.forEach(agent => {
    const savedNotes = localStorage.getItem(`agent-notes-${agent.id}`) || '';
    const toolsAll = agent.tools[0] === '*' ? ['Todos os tools'] : agent.tools;

    const card = document.createElement('article');
    card.className = 'card';
    card.setAttribute('aria-label', `Agente: ${agent.name}`);

    const useCasesHTML = agent.useCases.map(uc =>
      `<li class="use-case-item">${escapeHtml(uc)}</li>`
    ).join('');

    const toolChipsHTML = toolsAll.map(t =>
      `<span class="chip tool-chip">${escapeHtml(t)}</span>`
    ).join('');

    card.innerHTML = `
      <div class="card-header">
        <span class="card-name">${escapeHtml(agent.name)}</span>
        <span class="model-badge model-${escapeHtml(agent.model)}" title="${escapeHtml(agent.modelNote || agent.model)}">${escapeHtml(agent.model)}</span>
      </div>
      <p class="card-description">${escapeHtml(agent.description)}</p>
      <div class="chips-row" aria-label="Ferramentas disponíveis">${toolChipsHTML}</div>
      <ul class="use-cases-list" aria-label="Casos de uso">${useCasesHTML}</ul>
      <div>
        <div class="notes-label">Notas de uso</div>
        <textarea
          class="agent-notes"
          placeholder="Adicione suas notas de uso aqui..."
          aria-label="Notas para o agente ${escapeHtml(agent.name)}"
          data-agent-id="${escapeHtml(agent.id)}"
        >${escapeHtml(savedNotes)}</textarea>
      </div>
    `;

    const textarea = card.querySelector('.agent-notes');
    textarea.addEventListener('input', () => {
      localStorage.setItem(`agent-notes-${agent.id}`, textarea.value);
    });

    grid.appendChild(card);
  });
}

/* ─── Projects ─── */

function renderProjects(projects) {
  const grid = document.getElementById('projects-grid');
  grid.innerHTML = '';

  const sorted = [...projects].sort((a, b) => {
    const da = a.lastActivity || '';
    const db = b.lastActivity || '';
    return db.localeCompare(da);
  });

  sorted.forEach(project => {
    const card = document.createElement('article');
    card.className = 'card';
    card.setAttribute('aria-label', `Projeto: ${project.name}`);

    const techChips = project.tech.map(t =>
      `<span class="chip">${escapeHtml(t)}</span>`
    ).join('');

    const highlightsHTML = project.highlights.map(h =>
      `<li class="project-highlight-item">${escapeHtml(h)}</li>`
    ).join('');

    const linksHTML = [];
    if (project.url) {
      linksHTML.push(`<a href="${escapeHtml(project.url)}" target="_blank" rel="noopener noreferrer" class="project-link" aria-label="Abrir site de ${escapeHtml(project.name)}">
        <svg viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" aria-hidden="true">
          <path d="M1 6C1 3.239 3.239 1 6 1s5 2.239 5 5-2.239 5-5 5-5-2.239-5-5Z"/>
          <path d="M1 6h10M6 1c-1 1.5-1.667 3-1.667 5S5 9.5 6 11c1-1.5 1.667-3 1.667-5S7 2.5 6 1Z"/>
        </svg>
        Site
      </a>`);
    }
    if (project.repo) {
      linksHTML.push(`<a href="${escapeHtml(project.repo)}" target="_blank" rel="noopener noreferrer" class="project-link" aria-label="Ver repositório de ${escapeHtml(project.name)}">
        <svg viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" aria-hidden="true">
          <circle cx="3" cy="3" r="1.5"/>
          <circle cx="9" cy="3" r="1.5"/>
          <circle cx="6" cy="9" r="1.5"/>
          <path d="M3 4.5V6c0 .828.672 1.5 1.5 1.5h3c.828 0 1.5-.672 1.5-1.5V4.5M6 7.5v0"/>
        </svg>
        Repositório
      </a>`);
    }

    const lastDate = new Date(project.lastActivity + 'T00:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' });

    card.innerHTML = `
      <div class="project-card-meta">
        <span class="status-badge status-${project.status}">${statusLabel(project.status)}</span>
        <span class="project-type-badge">${escapeHtml(project.type)}</span>
      </div>
      <div class="card-header" style="margin-bottom:0">
        <span class="card-name" style="font-size:14px;font-family:var(--font-ui);font-weight:600">${escapeHtml(project.name)}</span>
      </div>
      <p class="card-description">${escapeHtml(project.description)}</p>
      <div class="chips-row" aria-label="Stack de tecnologias">${techChips}</div>
      <ul class="project-highlights" aria-label="Destaques do projeto">${highlightsHTML}</ul>
      ${linksHTML.length ? `<div class="project-links">${linksHTML.join('')}</div>` : ''}
      <div
        class="path-display"
        role="button"
        tabindex="0"
        title="Clique para copiar o caminho"
        data-path="${escapeHtml(project.path)}"
        aria-label="Caminho do projeto: ${escapeHtml(project.path)}"
      >${escapeHtml(project.path)}<span class="copy-hint">Copiar</span></div>
      <div style="font-size:11px;color:var(--text-muted);font-family:var(--font-mono)">Última atividade: ${lastDate}</div>
    `;

    const pathEl = card.querySelector('.path-display');
    pathEl.addEventListener('click', () => copyToClipboard(project.path, pathEl));
    pathEl.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        copyToClipboard(project.path, pathEl);
      }
    });

    grid.appendChild(card);
  });
}

/* ─── Processos (pm2 + launchd) ─── */

const PROCESS_POLL_ACTIVE_MS = 3000;
const PROCESS_POLL_IDLE_MS = 15000;
let processPollTimer = null;
let processBusy = new Set();

function formatUptime(ms) {
  if (ms == null) return '—';
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ${m % 60}m`;
  const d = Math.floor(h / 24);
  return `${d}d ${h % 24}h`;
}

function formatMemory(bytes) {
  if (!bytes) return '—';
  const mb = bytes / 1024 / 1024;
  if (mb < 1024) return `${mb.toFixed(1)} MB`;
  return `${(mb / 1024).toFixed(2)} GB`;
}

function statusTone(status) {
  if (status === 'online') return 'high';
  if (status === 'launching' || status === 'stopping') return 'mid';
  if (status === 'errored' || status === 'stopped') return 'low';
  return 'low';
}

async function fetchProcesses() {
  try {
    const res = await fetch('/api/processes');
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    return data.processes || [];
  } catch (err) {
    return { error: err.message || String(err) };
  }
}

async function callProcessAction(name, action) {
  try {
    const res = await fetch(`/api/processes/${encodeURIComponent(name)}/${action}`, { method: 'POST' });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    return data;
  } catch (err) {
    return { error: err.message || String(err) };
  }
}

async function fetchProcessLogs(name) {
  try {
    const res = await fetch(`/api/processes/${encodeURIComponent(name)}/logs?lines=40`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    return data;
  } catch (err) {
    return { error: err.message || String(err) };
  }
}

function renderProcesses(processes) {
  const grid = document.getElementById('processes-grid');
  const alert = document.getElementById('processes-alert');
  if (!grid || !alert) return;

  if (processes && processes.error) {
    grid.innerHTML = '';
    alert.classList.remove('hidden');
    alert.className = 'process-alert';
    alert.innerHTML = `<strong>API indisponível.</strong> ${escapeHtml(processes.error)}`;
    return;
  }
  alert.classList.add('hidden');
  alert.innerHTML = '';

  grid.innerHTML = '';
  processes.forEach(proc => {
    const tone = statusTone(proc.status);
    const isLaunchd = proc.managedBy === 'launchd';
    const isOnline = proc.status === 'online';
    const busy = processBusy.has(proc.name);

    const card = document.createElement('article');
    card.className = `card process-card ${tone}`;
    card.dataset.name = proc.name;

    const portHtml = proc.port
      ? `<a class="process-port" href="http://127.0.0.1:${proc.port}" target="_blank" rel="noopener">:${proc.port} ↗</a>`
      : '';

    const managedBadge = isLaunchd
      ? '<span class="chip chip-launchd">launchd</span>'
      : '<span class="chip chip-pm2">pm2</span>';

    const actionsHtml = isLaunchd
      ? '<span class="process-hint">gerenciado pelo launchd</span>'
      : `
        <button class="process-btn start" data-action="start" ${isOnline || busy ? 'disabled' : ''} title="Iniciar">▶</button>
        <button class="process-btn stop" data-action="stop" ${!isOnline || busy ? 'disabled' : ''} title="Parar">⏹</button>
        <button class="process-btn restart" data-action="restart" ${!isOnline || busy ? 'disabled' : ''} title="Reiniciar">↻</button>
      `;

    card.innerHTML = `
      <div class="process-header">
        <div class="process-title">
          <span class="status-dot status-${proc.status}"></span>
          <span class="process-name">${escapeHtml(proc.name)}</span>
        </div>
        <div class="process-meta-chips">
          ${managedBadge}
          ${portHtml}
        </div>
      </div>
      <div class="process-metrics">
        <div><span class="metric-label">Status</span><span class="metric-value">${escapeHtml(proc.status)}</span></div>
        <div><span class="metric-label">PID</span><span class="metric-value">${proc.pid ?? '—'}</span></div>
        <div><span class="metric-label">Uptime</span><span class="metric-value">${formatUptime(proc.uptimeMs)}</span></div>
        <div><span class="metric-label">CPU</span><span class="metric-value">${proc.cpu.toFixed(1)}%</span></div>
        <div><span class="metric-label">RAM</span><span class="metric-value">${formatMemory(proc.memory)}</span></div>
        <div><span class="metric-label">Restarts</span><span class="metric-value">${proc.restarts}</span></div>
      </div>
      <div class="process-actions">
        ${actionsHtml}
        <button class="process-btn logs" data-action="logs" title="Ver logs">Logs</button>
      </div>
    `;

    card.querySelectorAll('.process-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const action = btn.dataset.action;
        if (action === 'logs') {
          openProcessLogs(proc.name);
          return;
        }
        processBusy.add(proc.name);
        btn.disabled = true;
        btn.textContent = '…';
        const result = await callProcessAction(proc.name, action);
        processBusy.delete(proc.name);
        if (result.error) {
          alert.classList.remove('hidden');
          alert.className = 'process-alert';
          alert.innerHTML = `<strong>${escapeHtml(action)} falhou:</strong> ${escapeHtml(result.error)}`;
        }
        await refreshProcesses();
      });
    });

    grid.appendChild(card);
  });
}

async function refreshProcesses() {
  const processes = await fetchProcesses();
  renderProcesses(processes);
}

function startProcessPolling() {
  stopProcessPolling();
  const tick = async () => {
    await refreshProcesses();
    const delay = currentSection === 'processos' ? PROCESS_POLL_ACTIVE_MS : PROCESS_POLL_IDLE_MS;
    processPollTimer = setTimeout(tick, delay);
  };
  tick();
}

function stopProcessPolling() {
  if (processPollTimer) {
    clearTimeout(processPollTimer);
    processPollTimer = null;
  }
}

async function openProcessLogs(name) {
  const data = await fetchProcessLogs(name);
  const overlay = document.createElement('div');
  overlay.className = 'process-logs-overlay visible';
  const content = data.error
    ? `<pre class="logs-error">${escapeHtml(data.error)}</pre>`
    : `
      <div class="logs-section">
        <div class="logs-label">stdout</div>
        <pre class="logs-pre">${escapeHtml(data.stdout || '(vazio)')}</pre>
      </div>
      <div class="logs-section">
        <div class="logs-label">stderr</div>
        <pre class="logs-pre">${escapeHtml(data.stderr || '(vazio)')}</pre>
      </div>
    `;
  overlay.innerHTML = `
    <div class="process-logs-drawer">
      <div class="logs-header">
        <span class="logs-title">${escapeHtml(name)} — últimas 40 linhas</span>
        <button class="logs-close" aria-label="Fechar">×</button>
      </div>
      <div class="logs-body">${content}</div>
    </div>
  `;
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay || e.target.classList.contains('logs-close')) {
      overlay.remove();
    }
  });
  document.body.appendChild(overlay);
}

/* ─── MCPs ─── */

function renderMCPs(data) {
  const container = document.getElementById('mcps-content');
  container.innerHTML = '';

  /* MCPs */
  const mcpTitle = document.createElement('div');
  mcpTitle.className = 'section-sub-title';
  mcpTitle.textContent = 'MCP Servers';
  container.appendChild(mcpTitle);

  const mcpGrid = document.createElement('div');
  mcpGrid.className = 'cards-grid';
  container.appendChild(mcpGrid);

  data.mcps.forEach(mcp => {
    const card = document.createElement('article');
    card.className = 'card';
    card.setAttribute('aria-label', `MCP: ${mcp.name}`);

    const capabilitiesHTML = mcp.capabilities.map(c =>
      `<li class="capability-item">${escapeHtml(c)}</li>`
    ).join('');

    card.innerHTML = `
      <div class="mcp-header">
        <div class="mcp-card-icon" aria-hidden="true">${mcp.icon}</div>
        <div class="mcp-title-group">
          <div class="mcp-name">${escapeHtml(mcp.name)}</div>
          <div class="tool-count">${mcp.toolCount} tools</div>
        </div>
        <span class="status-badge status-connected">Conectado</span>
      </div>
      <p class="card-description">${escapeHtml(mcp.description)}</p>
      <ul class="capabilities-list" aria-label="Capacidades">${capabilitiesHTML}</ul>
    `;

    mcpGrid.appendChild(card);
  });

  /* Plugins / Skills */
  if (data.skills && data.skills.length > 0) {
    const skillsTitle = document.createElement('div');
    skillsTitle.className = 'section-sub-title';
    skillsTitle.textContent = 'Plugins Instalados';
    container.appendChild(skillsTitle);

    const skillsGrid = document.createElement('div');
    skillsGrid.className = 'cards-grid';
    container.appendChild(skillsGrid);

    data.skills.forEach(skill => {
      const card = document.createElement('article');
      card.className = 'card tool-card';
      card.setAttribute('aria-label', `Plugin: ${skill.name}`);

      const useCasesHTML = skill.useCases.map(uc =>
        `<li class="use-case-item">${escapeHtml(uc)}</li>`
      ).join('');

      card.innerHTML = `
        <div class="tool-header">
          <div class="tool-icon" aria-hidden="true">${skill.icon}</div>
          <div class="tool-name-group">
            <div class="tool-name">${escapeHtml(skill.name)}</div>
            <div class="tool-version">${escapeHtml(skill.install)}</div>
          </div>
          <span class="tool-type-badge">${escapeHtml(skill.type)}</span>
        </div>
        <p class="card-description">${escapeHtml(skill.description)}</p>
        <ul class="use-cases-list" aria-label="Casos de uso">${useCasesHTML}</ul>
      `;

      skillsGrid.appendChild(card);
    });
  }

  /* Ferramentas */
  const toolsTitle = document.createElement('div');
  toolsTitle.className = 'section-sub-title';
  toolsTitle.textContent = 'Ferramentas Instaladas';
  container.appendChild(toolsTitle);

  const toolsGrid = document.createElement('div');
  toolsGrid.className = 'cards-grid';
  container.appendChild(toolsGrid);

  data.tools.forEach(tool => {
    const card = document.createElement('article');
    card.className = 'card tool-card';
    card.setAttribute('aria-label', `Ferramenta: ${tool.name}`);

    const useCasesHTML = tool.useCases.map(uc =>
      `<li class="use-case-item">${escapeHtml(uc)}</li>`
    ).join('');

    card.innerHTML = `
      <div class="tool-header">
        <div class="tool-icon" aria-hidden="true">${tool.icon}</div>
        <div class="tool-name-group">
          <div class="tool-name">${escapeHtml(tool.name)}</div>
          <div class="tool-version">v${escapeHtml(tool.version)}</div>
        </div>
        <span class="tool-type-badge">${escapeHtml(tool.type)}</span>
      </div>
      <p class="card-description">${escapeHtml(tool.description)}</p>
      <ul class="use-cases-list" aria-label="Casos de uso">${useCasesHTML}</ul>
    `;

    toolsGrid.appendChild(card);
  });
}

/* ─── Hooks ─── */

const FALLBACK_HOOKS = [];

let allHooks = [];
let currentHookFilter = 'all';

function eventChipClass(event) {
  const map = {
    'PreToolUse': 'event-pre',
    'PostToolUse': 'event-post',
    'Stop': 'event-stop'
  };
  return map[event] || 'event-other';
}

function categoryLabel(cat) {
  const map = {
    'type-check': 'Type-check',
    'cache-clear': 'Cache',
    'telemetry': 'Telemetria',
    'review': 'Review',
    'security': 'Security'
  };
  return map[cat] || cat;
}

function renderHooksFilter(hooks) {
  const bar = document.getElementById('hooks-filter');
  if (!bar) return;
  bar.innerHTML = '';

  const events = Array.from(new Set(hooks.map(h => h.event))).sort();
  const all = ['all', ...events];

  all.forEach(ev => {
    const btn = document.createElement('button');
    btn.className = 'filter-btn' + (currentHookFilter === ev ? ' active' : '');
    btn.textContent = ev === 'all' ? `Todos (${hooks.length})` : `${ev} (${hooks.filter(h => h.event === ev).length})`;
    btn.addEventListener('click', () => {
      currentHookFilter = ev;
      renderHooks(allHooks);
    });
    bar.appendChild(btn);
  });
}

function renderHooks(hooks) {
  allHooks = hooks;
  renderHooksFilter(hooks);

  const grid = document.getElementById('hooks-grid');
  if (!grid) return;
  grid.innerHTML = '';

  const filtered = currentHookFilter === 'all'
    ? hooks
    : hooks.filter(h => h.event === currentHookFilter);

  filtered.forEach(hook => {
    const card = document.createElement('article');
    card.className = 'card';
    card.setAttribute('aria-label', `Hook: ${hook.name}`);

    const triggersHTML = (hook.triggers || []).map(t =>
      `<li class="use-case-item">${escapeHtml(t)}</li>`
    ).join('');

    const controlsHTML = (hook.controls || []).map(c => `
      <tr>
        <td class="hook-control-label">${escapeHtml(c.label)}</td>
        <td class="hook-control-value"><code>${escapeHtml(c.value)}</code></td>
      </tr>
    `).join('');

    const projectsHTML = hook.projects && hook.projects.length
      ? `<div class="hook-projects"><span class="hook-section-label">Projetos com hook ativo:</span> ${hook.projects.map(p => `<span class="chip">${escapeHtml(p)}</span>`).join('')}</div>`
      : '';

    const costHTML = hook.cost
      ? `<div class="hook-cost">💰 ${escapeHtml(hook.cost)}</div>`
      : '';

    const addedAtHTML = hook.addedAt
      ? `<span class="hook-added-at">adicionado ${escapeHtml(hook.addedAt)}</span>`
      : '';

    card.innerHTML = `
      <div class="card-header">
        <span class="card-name">${escapeHtml(hook.name)}</span>
        <span class="event-chip ${eventChipClass(hook.event)}">${escapeHtml(hook.event)}</span>
      </div>
      <div class="hook-meta">
        <span class="chip">matcher: <code>${escapeHtml(hook.matcher || '(any)')}</code></span>
        <span class="chip">${escapeHtml(categoryLabel(hook.category))}</span>
        <span class="chip">${escapeHtml(hook.scope || 'global')}</span>
        ${addedAtHTML}
      </div>
      <p class="card-description">${escapeHtml(hook.description)}</p>
      ${hook.scriptPath ? `<div class="hook-script-path"><span class="hook-section-label">Script:</span> <code>${escapeHtml(hook.scriptPath)}</code></div>` : ''}
      ${triggersHTML ? `<div><span class="hook-section-label">Quando dispara:</span><ul class="use-cases-list">${triggersHTML}</ul></div>` : ''}
      ${controlsHTML ? `<div><span class="hook-section-label">Controles / debug:</span><table class="hook-controls-table">${controlsHTML}</table></div>` : ''}
      ${projectsHTML}
      ${costHTML}
    `;

    grid.appendChild(card);
  });

  if (filtered.length === 0) {
    grid.innerHTML = '<p class="empty-state">Nenhum hook neste filtro.</p>';
  }
}

/* ─── Printed CLIs ─── */

function renderPrintedClis(payload) {
  const toolbar = document.getElementById('printedclis-toolbar');
  const grid = document.getElementById('printedclis-grid');
  if (!toolbar || !grid) return;

  const clis = (payload && payload.clis) || [];
  const press = (payload && payload.press_version) || null;
  const generatedAt = (payload && payload.generated_at) || null;
  const libraryPath = (payload && payload.library_path) || '~/printing-press/library';

  toolbar.innerHTML = `
    <div class="printed-clis-meta">
      <span class="meta-pill ${press ? 'meta-pill-ok' : 'meta-pill-warn'}">${press ? 'press ' + escapeHtml(press) : 'binary não detectado'}</span>
      <span class="meta-pill">${clis.length} CLI${clis.length === 1 ? '' : 's'}</span>
      ${generatedAt ? `<span class="meta-pill meta-pill-mono">sync: ${escapeHtml(generatedAt)}</span>` : ''}
      <span class="meta-pill meta-pill-mono">${escapeHtml(libraryPath)}</span>
    </div>
  `;

  grid.innerHTML = '';

  if (clis.length === 0) {
    grid.innerHTML = `
      <div class="empty-state-card">
        <h3>Nenhuma CLI impressa ainda</h3>
        <p>Para imprimir a primeira CLI, rode no Claude Code:</p>
        <pre><code>/printing-press &lt;app-name&gt;</code></pre>
        <p class="empty-state-hint">A library será populada em <code>${escapeHtml(libraryPath)}</code> e refletida aqui após <code>./start.sh</code> (que roda <code>sync_printed_clis.py</code>).</p>
      </div>
    `;
    return;
  }

  clis.forEach(cli => {
    const card = document.createElement('div');
    card.className = 'card';

    const scorecard = cli.scorecard || {};
    const scoreBadge = scorecard.total != null
      ? `<span class="score-badge score-${(scorecard.grade || '').toLowerCase()}">${scorecard.total}/100 ${scorecard.grade ? '· ' + scorecard.grade : ''}</span>`
      : '';

    const mcpBadge = cli.has_mcp ? '<span class="badge badge-info">MCP server</span>' : '';
    const authBadge = cli.auth_type ? `<span class="badge badge-neutral">${escapeHtml(cli.auth_type)}</span>` : '';

    const commandsHTML = (cli.commands || []).length > 0
      ? `<div class="card-section">
           <span class="card-section-label">Comandos:</span>
           <div class="cmd-chips">${cli.commands.map(c => `<code class="cmd-chip">${escapeHtml(c)}</code>`).join('')}</div>
         </div>`
      : '';

    const noiHTML = cli.noi
      ? `<div class="card-section noi-block"><em>${escapeHtml(cli.noi)}</em></div>`
      : '';

    card.innerHTML = `
      <div class="card-header">
        <h3 class="card-title">${escapeHtml(cli.cli_name || cli.name)}</h3>
        ${scoreBadge}
      </div>
      <p class="card-description">API: <strong>${escapeHtml(cli.api || cli.name)}</strong>${cli.version ? ' · v' + escapeHtml(cli.version) : ''}</p>
      ${noiHTML}
      ${commandsHTML}
      <div class="card-footer">
        ${mcpBadge}
        ${authBadge}
        ${cli.spec_source ? `<span class="badge badge-neutral">${escapeHtml(cli.spec_source)}</span>` : ''}
      </div>
    `;
    grid.appendChild(card);
  });
}

/* ─── Cheatsheet ─── */

function renderCheatsheet() {
  const accordion = document.getElementById('cheatsheet-accordion');
  accordion.innerHTML = '';

  CHEATSHEET.forEach((section, idx) => {
    const item = document.createElement('div');
    item.className = 'accordion-item' + (idx === 0 ? ' open' : '');

    const rowsHTML = section.rows.map(([cmd, desc]) =>
      `<tr>
        <td>${escapeHtml(cmd)}</td>
        <td>${escapeHtml(desc)}</td>
      </tr>`
    ).join('');

    item.innerHTML = `
      <button class="accordion-trigger" aria-expanded="${idx === 0 ? 'true' : 'false'}" aria-controls="accordion-body-${idx}">
        <div class="accordion-trigger-left">
          <span class="accordion-number">${escapeHtml(section.number)}</span>
          ${escapeHtml(section.title)}
        </div>
        <svg class="accordion-chevron" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">
          <path d="M4 6l4 4 4-4"/>
        </svg>
      </button>
      <div class="accordion-body" id="accordion-body-${idx}" role="region">
        <table class="cheatsheet-table" aria-label="${escapeHtml(section.title)}">
          <tbody>${rowsHTML}</tbody>
        </table>
      </div>
    `;

    const trigger = item.querySelector('.accordion-trigger');
    trigger.addEventListener('click', () => {
      const isOpen = item.classList.contains('open');
      item.classList.toggle('open', !isOpen);
      trigger.setAttribute('aria-expanded', (!isOpen).toString());
    });

    accordion.appendChild(item);
  });
}

/* ─── Backlog / Kanban ─── */

const COLUMNS = [
  { id: 'todo', label: 'To Do', dotClass: 'todo' },
  { id: 'progress', label: 'Em Progresso', dotClass: 'progress' },
  { id: 'done', label: 'Feito', dotClass: 'done' }
];

function loadBacklog() {
  try {
    const raw = localStorage.getItem('backlog-data');
    if (raw) return JSON.parse(raw);
  } catch {}
  return JSON.parse(JSON.stringify(BACKLOG_DEFAULTS));
}

function saveBacklog(data) {
  localStorage.setItem('backlog-data', JSON.stringify(data));
}

function generateId() {
  return 'bk-' + Math.random().toString(36).slice(2, 9);
}

function renderBacklog() {
  const board = document.getElementById('kanban-board');
  board.innerHTML = '';
  const backlogData = loadBacklog();

  COLUMNS.forEach(col => {
    const colItems = backlogData.filter(c => c.status === col.id);

    const column = document.createElement('div');
    column.className = 'kanban-column';
    column.setAttribute('data-col', col.id);
    column.setAttribute('aria-label', `Coluna ${col.label}`);

    column.innerHTML = `
      <div class="kanban-column-header">
        <div class="kanban-column-title">
          <span class="col-dot ${col.dotClass}" aria-hidden="true"></span>
          ${escapeHtml(col.label)}
          <span class="kanban-count" aria-label="${colItems.length} cards">${colItems.length}</span>
        </div>
        <button class="kanban-add-btn" data-col="${col.id}" aria-label="Adicionar card em ${col.label}" title="Adicionar card">+</button>
      </div>
      <div class="kanban-cards" data-col="${col.id}" aria-label="Cards de ${col.label}"></div>
    `;

    const cardsContainer = column.querySelector('.kanban-cards');
    colItems.forEach(item => {
      cardsContainer.appendChild(buildKanbanCard(item));
    });

    const addBtn = column.querySelector('.kanban-add-btn');
    addBtn.addEventListener('click', () => showNewCardForm(col.id, column));

    board.appendChild(column);
  });
}

function buildKanbanCard(item) {
  const colIndex = COLUMNS.findIndex(c => c.id === item.status);
  const isLast = colIndex === COLUMNS.length - 1;

  const card = document.createElement('div');
  card.className = 'kanban-card';
  card.style.background = item.color || '#1E1E2E';
  card.dataset.id = item.id;

  const colorDotsHTML = CARD_COLORS.map(c =>
    `<span
      class="color-dot${item.color === c.value ? ' active' : ''}"
      style="background:${c.value};border-color:${item.color === c.value ? '#F2F2F2' : 'transparent'}"
      data-color="${c.value}"
      title="${c.label}"
      role="radio"
      aria-checked="${item.color === c.value ? 'true' : 'false'}"
      tabindex="0"
      aria-label="Cor ${c.label}"
    ></span>`
  ).join('');

  card.innerHTML = `
    <div
      class="kanban-card-title"
      contenteditable="true"
      data-placeholder="Título do card"
      aria-label="Título editável"
    >${escapeHtml(item.title)}</div>
    <div class="color-picker-row" role="radiogroup" aria-label="Cor do card">${colorDotsHTML}</div>
    <div class="kanban-card-actions">
      ${!isLast ? `<button class="kanban-action-btn move-btn" title="Mover para próxima coluna" aria-label="Mover card para próxima coluna">→</button>` : ''}
      <button class="kanban-action-btn delete-btn" title="Deletar card" aria-label="Deletar card">×</button>
    </div>
  `;

  const titleEl = card.querySelector('.kanban-card-title');
  titleEl.addEventListener('blur', () => {
    const data = loadBacklog();
    const idx = data.findIndex(d => d.id === item.id);
    if (idx !== -1) {
      data[idx].title = titleEl.textContent.trim() || item.title;
      saveBacklog(data);
    }
  });

  card.querySelectorAll('.color-dot').forEach(dot => {
    const applyColor = () => {
      const color = dot.dataset.color;
      card.style.background = color;
      card.querySelectorAll('.color-dot').forEach(d => {
        const isActive = d.dataset.color === color;
        d.classList.toggle('active', isActive);
        d.style.borderColor = isActive ? '#F2F2F2' : 'transparent';
        d.setAttribute('aria-checked', isActive.toString());
      });
      const data = loadBacklog();
      const idx = data.findIndex(d => d.id === item.id);
      if (idx !== -1) { data[idx].color = color; saveBacklog(data); }
    };
    dot.addEventListener('click', applyColor);
    dot.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); applyColor(); }
    });
  });

  const moveBtn = card.querySelector('.move-btn');
  if (moveBtn) {
    moveBtn.addEventListener('click', () => {
      const data = loadBacklog();
      const idx = data.findIndex(d => d.id === item.id);
      if (idx !== -1) {
        const nextColIndex = colIndex + 1;
        if (nextColIndex < COLUMNS.length) {
          data[idx].status = COLUMNS[nextColIndex].id;
          saveBacklog(data);
          renderBacklog();
        }
      }
    });
  }

  card.querySelector('.delete-btn').addEventListener('click', () => {
    const data = loadBacklog();
    const updated = data.filter(d => d.id !== item.id);
    saveBacklog(updated);
    renderBacklog();
  });

  return card;
}

function showNewCardForm(colId, columnEl) {
  const existing = columnEl.querySelector('.kanban-new-card');
  if (existing) { existing.remove(); return; }

  const form = document.createElement('div');
  form.className = 'kanban-new-card';
  form.setAttribute('role', 'form');
  form.setAttribute('aria-label', 'Novo card');
  form.innerHTML = `
    <textarea class="kanban-new-input" placeholder="Título do card..." rows="2" aria-label="Título do novo card"></textarea>
    <div class="kanban-new-actions">
      <button class="btn-primary" aria-label="Adicionar card">Adicionar</button>
      <button class="btn-ghost" aria-label="Cancelar">Cancelar</button>
    </div>
  `;

  const textarea = form.querySelector('.kanban-new-input');
  const addBtn = form.querySelector('.btn-primary');
  const cancelBtn = form.querySelector('.btn-ghost');

  addBtn.addEventListener('click', () => {
    const title = textarea.value.trim();
    if (!title) { textarea.focus(); return; }
    const data = loadBacklog();
    data.push({ id: generateId(), title, status: colId, color: '#1E1E2E' });
    saveBacklog(data);
    renderBacklog();
  });

  cancelBtn.addEventListener('click', () => { form.remove(); });

  textarea.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); addBtn.click(); }
    if (e.key === 'Escape') form.remove();
  });

  columnEl.appendChild(form);
  textarea.focus();
}

/* ─── Evolução — Fallbacks ─── */

const FALLBACK_EVOLUTION_LOG = [
  { id: "log-001", date: "2026-03-17", project: "claude-dashboard", title: "Seção Evolução implementada", learned: ["Sub-navegação por tabs em JS vanilla", "Estrutura de dados para tracking de habilidades 1–5", "Padrão de sugestão de depreciação baseado em uso real", "Cron job para reflexão diária com git logs"], toolsUsed: ["Read", "Edit", "Write", "Bash"], skillsUsed: [], agentsUsed: [], highlight: "Bootstrap do sistema de auto-aprimoramento." }
];

const FALLBACK_SKILL_LEVELS = [];
const FALLBACK_IMPROVEMENT_PLAN = [];
const FALLBACK_PENDING = { date: null, status: "completed", note: "" };

/* ─── Evolução — State ─── */

let allSkillLevels = [];
let activeSkillFilter = 'Todos';

/* ─── Evolução — Helpers ─── */

function renderLevelDots(level) {
  let html = '';
  for (let i = 1; i <= 5; i++) {
    html += `<span class="level-dot${i <= level ? ' filled' : ''}"></span>`;
  }
  return `<span class="level-dots" title="Nível ${level}/5" aria-label="Nível ${level} de 5">${html}</span>`;
}

function getFrequencyBadge(freq) {
  const map = { 'alta': ['freq-alta', 'Alta'], 'média': ['freq-media', 'Média'], 'baixa': ['freq-baixa', 'Baixa'] };
  const [cls, label] = map[freq] || ['freq-baixa', freq];
  return `<span class="freq-badge ${cls}">${escapeHtml(label)}</span>`;
}

function getTypeBadge(type) {
  const map = { 'native': ['type-native', 'Nativa'], 'skill': ['type-skill', 'Skill'], 'agent': ['type-agent', 'Agent'], 'mcp': ['type-mcp', 'MCP'], 'cli': ['type-cli', 'CLI'] };
  const [cls, label] = map[type] || ['type-skill', type];
  return `<span class="type-badge ${cls}">${escapeHtml(label)}</span>`;
}

function getPlanTypeBadge(type) {
  const map = { 'nova-skill': ['pt-nova-skill', 'Nova Skill'], 'novo-mcp': ['pt-novo-mcp', 'Novo MCP'], 'desenvolvimento': ['pt-dev', 'Desenvolvimento'], 'aprimoramento': ['pt-melhoria', 'Aprimoramento'], 'deprecacao': ['pt-dep', 'Depreciação'] };
  const [cls, label] = map[type] || ['pt-melhoria', type];
  return `<span class="plan-type-badge ${cls}">${escapeHtml(label)}</span>`;
}

function getImpactBadge(impact) {
  const map = { 'alta': ['ib-alta', '↑ impacto alto'], 'média': ['ib-media', '→ impacto médio'], 'baixa': ['ib-baixa', '↓ impacto baixo'] };
  const [cls, label] = map[impact] || ['ib-baixa', impact];
  return `<span class="impact-badge ${cls}">${escapeHtml(label)}</span>`;
}

function getEffortBadge(effort) {
  const map = { 'alta': ['ef-alta', 'esforço alto'], 'média': ['ef-media', 'esforço médio'], 'baixa': ['ef-baixa', 'esforço baixo'] };
  const [cls, label] = map[effort] || ['ef-baixa', effort];
  return `<span class="effort-badge ${cls}">${escapeHtml(label)}</span>`;
}

function formatDateBR(isoDate) {
  if (!isoDate) return '—';
  return new Date(isoDate + 'T00:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' });
}

/* ─── Evolução — Renderização do Diário ─── */

function renderLearningLog(data, pending) {
  const container = document.getElementById('subtab-diario');
  container.innerHTML = '';

  // Banner de reflexão pendente
  if (pending && pending.status === 'pending') {
    const projects = (pending.projectsModified || []).join(', ');
    const banner = document.createElement('div');
    banner.className = 'pending-banner';
    banner.setAttribute('role', 'alert');
    banner.innerHTML = `
      <div class="pending-banner-icon" aria-hidden="true">⏳</div>
      <div class="pending-banner-text">
        <strong>Reflexão pendente — ${escapeHtml(pending.date || '')}</strong>
        <span>Projetos com atividade: ${escapeHtml(projects || 'nenhum identificado')}</span>
      </div>
      <button class="pending-banner-btn" id="reflection-run-btn" type="button">
        Fazer reflexão agora
        <span class="pending-banner-model-pill">
          <span class="security-model-dot model-sonnet"></span>
          sonnet
        </span>
      </button>
    `;
    container.appendChild(banner);
    banner.querySelector('#reflection-run-btn').addEventListener('click', _onReflectionRun);
  }

  if (!data || data.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    empty.textContent = 'Nenhuma entrada no diário ainda.';
    container.appendChild(empty);
    return;
  }

  const sorted = [...data].sort((a, b) => b.date.localeCompare(a.date));

  sorted.forEach(entry => {
    const el = document.createElement('article');
    el.className = 'log-entry';

    const learnedHTML = (entry.learned || []).map(l =>
      `<li class="log-learned-item">${escapeHtml(l)}</li>`
    ).join('');

    const toolsHTML = [...(entry.toolsUsed || []), ...(entry.skillsUsed || []).map(s => `skill:${s}`), ...(entry.agentsUsed || []).map(a => `agent:${a}`)].map(t =>
      `<span class="chip log-tool-chip">${escapeHtml(t)}</span>`
    ).join('');

    const refParts = [];
    if (entry.commit) refParts.push(`<code class="log-commit">${escapeHtml(entry.commit)}</code>`);
    if (entry.version) refParts.push(`<span class="log-version">${escapeHtml(entry.version)}</span>`);
    const refHTML = refParts.length > 0 ? `<div class="log-ref-row">${refParts.join('')}</div>` : '';

    el.innerHTML = `
      <div class="log-entry-header">
        <span class="log-date">${escapeHtml(formatDateBR(entry.date))}</span>
        ${entry.project ? `<span class="log-project-tag">${escapeHtml(entry.project)}</span>` : ''}
      </div>
      <div class="log-entry-title">${escapeHtml(entry.title)}</div>
      ${refHTML}
      ${learnedHTML ? `<ul class="log-learned-list">${learnedHTML}</ul>` : ''}
      ${entry.highlight ? `<div class="log-highlight">${escapeHtml(entry.highlight)}</div>` : ''}
      ${toolsHTML ? `<div class="log-tools-row chips-row">${toolsHTML}</div>` : ''}
    `;

    container.appendChild(el);
  });
}

/* ─── Evolução — Mapa de Habilidades ─── */

function renderSkillMap(data) {
  allSkillLevels = data;
  const container = document.getElementById('subtab-habilidades');
  container.innerHTML = '';

  // Alerta de candidatos a depreciação
  const deprecated = data.filter(s => s.status === 'deprecation-candidate');
  if (deprecated.length > 0) {
    const alertSection = document.createElement('div');
    alertSection.className = 'deprecation-alert';
    alertSection.setAttribute('role', 'alert');

    const itemsHTML = deprecated.map(s => `
      <div class="dep-alert-item">
        <span class="dep-alert-name">${escapeHtml(s.name)}</span>
        ${getTypeBadge(s.type)}
        <span class="dep-alert-reason">${escapeHtml(s.deprecationReason || s.notes || '')}</span>
      </div>
    `).join('');

    alertSection.innerHTML = `
      <div class="dep-alert-header">
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" aria-hidden="true"><path d="M8 2L14 13H2L8 2Z"/><path d="M8 6v4M8 11.5v.5"/></svg>
        <strong>${deprecated.length} candidato${deprecated.length > 1 ? 's' : ''} a desativação</strong>
      </div>
      <div class="dep-alert-items">${itemsHTML}</div>
    `;
    container.appendChild(alertSection);
  }

  // Barra de filtro
  const filterLabels = ['Todos', 'Nativas', 'Skills', 'Sub-Agents', 'MCPs', 'CLI'];
  const typeMap = { 'Nativas': 'native', 'Skills': 'skill', 'Sub-Agents': 'agent', 'MCPs': 'mcp', 'CLI': 'cli' };

  const filterBar = document.createElement('div');
  filterBar.className = 'filter-bar';
  filterBar.setAttribute('role', 'group');
  filterBar.setAttribute('aria-label', 'Filtrar por tipo');

  filterLabels.forEach(label => {
    const btn = document.createElement('button');
    btn.className = 'filter-btn' + (label === activeSkillFilter ? ' active' : '');
    btn.textContent = label;
    btn.setAttribute('aria-pressed', label === activeSkillFilter ? 'true' : 'false');
    btn.addEventListener('click', () => {
      activeSkillFilter = label;
      renderSkillMap(allSkillLevels);
    });
    filterBar.appendChild(btn);
  });
  container.appendChild(filterBar);

  // Grid de cards
  const filtered = activeSkillFilter === 'Todos'
    ? data
    : data.filter(s => s.type === typeMap[activeSkillFilter]);

  const grid = document.createElement('div');
  grid.className = 'cards-grid skill-map-grid';
  grid.setAttribute('aria-live', 'polite');

  filtered.forEach(item => {
    const card = document.createElement('article');
    card.className = `card skill-level-card${item.status === 'deprecation-candidate' ? ' card-dep' : item.status === 'watch' ? ' card-watch' : ''}`;
    card.setAttribute('aria-label', `Habilidade: ${item.name}`);

    const lastUsedText = item.lastUsed ? formatDateBR(item.lastUsed) : 'Nunca';
    const statusBadge = item.status === 'deprecation-candidate'
      ? `<span class="skill-status-badge badge-dep" title="${escapeHtml(item.deprecationReason || '')}">Depreciação sugerida</span>`
      : item.status === 'watch'
      ? `<span class="skill-status-badge badge-watch">Em observação</span>`
      : '';

    card.innerHTML = `
      <div class="card-header">
        <span class="card-name">${escapeHtml(item.name)}</span>
        ${getTypeBadge(item.type)}
      </div>
      <div class="skill-level-row">
        ${renderLevelDots(item.level)}
        <span class="skill-level-num">${item.level}/5</span>
        ${getFrequencyBadge(item.usageFrequency)}
      </div>
      <p class="card-description">${escapeHtml(item.notes || '')}</p>
      <div class="skill-meta-row">
        <span class="skill-last-used">Último uso: ${escapeHtml(lastUsedText)}</span>
        ${statusBadge}
      </div>
    `;

    grid.appendChild(card);
  });

  container.appendChild(grid);

  if (filtered.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    empty.textContent = 'Nenhuma habilidade nesta categoria.';
    grid.appendChild(empty);
  }
}

/* ─── Evolução — Plano de Aprimoramento ─── */

function loadIgnoredPlans() {
  try {
    const raw = localStorage.getItem('plan-ignored');
    if (raw) return new Set(JSON.parse(raw));
  } catch {}
  return new Set();
}

function saveIgnoredPlans(set) {
  localStorage.setItem('plan-ignored', JSON.stringify([...set]));
}

function renderImprovementPlan(data) {
  const container = document.getElementById('subtab-plano');
  container.innerHTML = '';

  const ignored = loadIgnoredPlans();
  const IMPACT_ORDER = { alta: 0, média: 1, baixa: 2 };

  function buildCard(item, isIgnored, canIgnore = false) {
    const card = document.createElement('article');
    card.className = `card plan-card${item.type === 'deprecacao' ? ' plan-card-dep' : ''}${isIgnored ? ' plan-card-ignored' : ''}`;
    card.setAttribute('aria-label', `Plano: ${item.title}`);

    const showBtn = isIgnored || canIgnore;
    const actionBtn = !showBtn ? '' : isIgnored
      ? `<button class="plan-restore-btn" data-id="${escapeHtml(item.id)}" title="Restaurar sugestão" aria-label="Restaurar">↩ restaurar</button>`
      : `<button class="plan-ignore-btn" data-id="${escapeHtml(item.id)}" title="Ignorar sugestão" aria-label="Ignorar">ignorar</button>`;

    card.innerHTML = `
      <div class="plan-card-header">
        ${getPlanTypeBadge(item.type)}
        <span class="plan-date">${escapeHtml(formatDateBR(item.date))}</span>
        ${actionBtn}
      </div>
      <div class="plan-card-title">${escapeHtml(item.title)}</div>
      <p class="card-description">${escapeHtml(item.description)}</p>
      <div class="plan-card-badges">
        ${getImpactBadge(item.impact)}
        ${getEffortBadge(item.effort)}
        <span class="plan-suggested-by">por ${escapeHtml(item.suggestedBy)}</span>
      </div>
    `;

    const btn = card.querySelector('[data-id]');
    if (btn) {
      btn.addEventListener('click', () => {
        const set = loadIgnoredPlans();
        if (isIgnored) set.delete(item.id); else set.add(item.id);
        saveIgnoredPlans(set);
        renderImprovementPlan(data);
      });
    }

    return card;
  }

  const groups = [
    { key: 'em-andamento', label: 'Em Andamento', dot: 'progress' },
    { key: 'sugestao',     label: 'Sugestões de Claude', dot: 'todo' },
    { key: 'backlog',      label: 'Backlog', dot: 'todo' },
    { key: 'concluido',    label: 'Concluído / Descartado', dot: 'done' }
  ];

  groups.forEach(group => {
    let items = data
      .filter(i => i.status === group.key || (group.key === 'concluido' && i.status === 'descartado'))
      .sort((a, b) => (IMPACT_ORDER[a.impact] ?? 9) - (IMPACT_ORDER[b.impact] ?? 9));

    if (group.key === 'sugestao') items = items.filter(i => !ignored.has(i.id));
    if (items.length === 0) return;

    const section = document.createElement('div');
    section.className = 'plan-group';

    const titleEl = document.createElement('div');
    titleEl.className = 'plan-group-title';
    titleEl.innerHTML = `<span class="col-dot ${group.dot}" aria-hidden="true"></span>${escapeHtml(group.label)}<span class="kanban-count">${items.length}</span>`;
    section.appendChild(titleEl);

    const grid = document.createElement('div');
    grid.className = 'plan-cards-grid';

    const canIgnore = group.key === 'sugestao';
    items.forEach(item => grid.appendChild(buildCard(item, false, canIgnore)));

    section.appendChild(grid);
    container.appendChild(section);
  });

  // Grupo de ignoradas
  const ignoredItems = data
    .filter(i => i.status === 'sugestao' && ignored.has(i.id))
    .sort((a, b) => (IMPACT_ORDER[a.impact] ?? 9) - (IMPACT_ORDER[b.impact] ?? 9));

  if (ignoredItems.length > 0) {
    const section = document.createElement('div');
    section.className = 'plan-group plan-group-ignored';

    const titleEl = document.createElement('div');
    titleEl.className = 'plan-group-title';
    titleEl.innerHTML = `<span class="col-dot done" aria-hidden="true"></span>Ignoradas<span class="kanban-count">${ignoredItems.length}</span>`;
    section.appendChild(titleEl);

    const grid = document.createElement('div');
    grid.className = 'plan-cards-grid';
    ignoredItems.forEach(item => grid.appendChild(buildCard(item, true)));

    section.appendChild(grid);
    container.appendChild(section);
  }

  if (data.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    empty.textContent = 'Nenhum item no plano ainda.';
    container.appendChild(empty);
  }
}

/* ─── Evolução — Orquestração ─── */

function renderEvolution(evolutionLog, skillLevels, improvementPlan, pending) {
  // Listeners dos sub-tabs
  document.querySelectorAll('#evolucao-tabs .subtab').forEach(btn => {
    btn.addEventListener('click', () => {
      const tab = btn.dataset.subtab;
      document.querySelectorAll('#evolucao-tabs .subtab').forEach(b => {
        b.classList.toggle('active', b.dataset.subtab === tab);
        b.setAttribute('aria-selected', b.dataset.subtab === tab ? 'true' : 'false');
      });
      document.querySelectorAll('.subtab-content').forEach(el => {
        el.classList.toggle('hidden', el.id !== `subtab-${tab}`);
      });
    });
  });

  renderLearningLog(evolutionLog, pending);
  renderSkillMap(skillLevels);
  renderImprovementPlan(improvementPlan);
}

/* ─── AI Router ─── */

const FALLBACK_AIROUTER = {
  stats: { totalCalls: 0, byRoute: { coding: 0, reasoning: 0, research: 0, general: 0 }, lastUsed: null },
  incidents: []
};

function renderAIHub(data) {
  const container = document.getElementById('airouter-content');
  if (!container) return;
  container.innerHTML = '';

  // ── Diagrama ──
  const diagramSection = document.createElement('div');
  diagramSection.className = 'airouter-diagram-section';
  diagramSection.setAttribute('aria-label', 'Diagrama de arquitetura do AI Router');

  const svgNS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(svgNS, 'svg');
  svg.setAttribute('viewBox', '0 0 760 390');
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', 'Fluxo: Prompt → ai-router.sh → ai-classifier.py → 4 rotas → modelos');
  svg.style.width = '100%';
  svg.style.maxWidth = '760px';
  svg.style.display = 'block';
  svg.style.margin = '0 auto';

  function svgEl(tag, attrs, text) {
    const el = document.createElementNS(svgNS, tag);
    Object.entries(attrs).forEach(([k, v]) => el.setAttribute(k, v));
    if (text !== undefined) el.textContent = text;
    return el;
  }

  // defs: arrowhead marker
  const defs = svgEl('defs', {});
  const marker = svgEl('marker', { id: 'arrow', markerWidth: '8', markerHeight: '8', refX: '6', refY: '3', orient: 'auto' });
  marker.appendChild(svgEl('path', { d: 'M0,0 L0,6 L8,3 z', fill: '#4B5563' }));
  defs.appendChild(marker);
  svg.appendChild(defs);

  // helpers
  function node(x, y, w, h, label, sublabel, accent) {
    const g = svgEl('g', {});
    g.appendChild(svgEl('rect', {
      x: x - w / 2, y: y - h / 2, width: w, height: h, rx: '8',
      fill: accent ? 'rgba(124,58,237,0.12)' : '#111111',
      stroke: accent ? '#7C3AED' : '#242424',
      'stroke-width': accent ? '1.5' : '1'
    }));
    const textY = sublabel ? y - 5 : y + 4;
    g.appendChild(svgEl('text', { x, y: textY, 'text-anchor': 'middle', fill: accent ? '#C4B5FD' : '#F2F2F2', 'font-family': 'JetBrains Mono, monospace', 'font-size': '11', 'font-weight': '500' }, label));
    if (sublabel) {
      g.appendChild(svgEl('text', { x, y: y + 11, 'text-anchor': 'middle', fill: '#4B5563', 'font-family': 'Inter, sans-serif', 'font-size': '9' }, sublabel));
    }
    return g;
  }

  function pill(x, y, label, color, textColor) {
    const g = svgEl('g', {});
    const w = 76, h = 22;
    g.appendChild(svgEl('rect', { x: x - w / 2, y: y - h / 2, width: w, height: h, rx: '11', fill: color }));
    g.appendChild(svgEl('text', { x, y: y + 4, 'text-anchor': 'middle', fill: textColor || '#F2F2F2', 'font-family': 'Inter, sans-serif', 'font-size': '9', 'font-weight': '600' }, label));
    return g;
  }

  function line(x1, y1, x2, y2) {
    return svgEl('line', { x1, y1, x2, y2, stroke: '#2A2A2A', 'stroke-width': '1.5', 'marker-end': 'url(#arrow)' });
  }

  function vline(x, y1, y2) {
    return svgEl('line', { x1: x, y1, x2: x, y2, stroke: '#2A2A2A', 'stroke-width': '1.5', 'marker-end': 'url(#arrow)' });
  }

  // branch x positions
  const branches = [
    { x: 95,  route: 'coding',    label: 'coding',    color: '#1A2E1A', badge: '#10B981' },
    { x: 275, route: 'reasoning', label: 'reasoning', color: '#1A1A2E', badge: '#7C3AED' },
    { x: 465, route: 'research',  label: 'research',  color: '#1E1A2A', badge: '#9D5CFF' },
    { x: 645, route: 'general',   label: 'general',   color: '#2E1E1A', badge: '#F59E0B' }
  ];

  const models = [
    { x: 95,  label: 'Qwen2.5-Coder-7B', sub: 'MLX · local' },
    { x: 275, label: 'DeepSeek-R1 14B',  sub: 'MLX · local' },
    { x: 465, label: 'Gemini 2.5 Pro',   sub: 'Google API' },
    { x: 645, label: 'qwen2.5-coder',    sub: 'Ollama · local' }
  ];

  // vertical spine
  svg.appendChild(vline(380, 32, 62));
  svg.appendChild(vline(380, 82, 112));
  svg.appendChild(vline(380, 132, 170));

  // horizontal splitter line from classifier bottom to branches
  svg.appendChild(svgEl('line', { x1: '95', y1: '190', x2: '645', y2: '190', stroke: '#2A2A2A', 'stroke-width': '1.5' }));

  // vertical drops to branch boxes
  branches.forEach(b => {
    svg.appendChild(vline(b.x, 190, 228));
  });

  // branch to model lines
  branches.forEach((b, i) => {
    svg.appendChild(vline(b.x, 258, 298));
  });

  // input node
  svg.appendChild(svgEl('rect', { x: '340', y: '5', width: '80', height: '24', rx: '12', fill: '#1A1A1A', stroke: '#333', 'stroke-width': '1' }));
  svg.appendChild(svgEl('text', { x: '380', y: '21', 'text-anchor': 'middle', fill: '#9CA3AF', 'font-family': 'Inter, sans-serif', 'font-size': '10', 'font-weight': '500' }, 'PROMPT'));

  // router node
  svg.appendChild(node(380, 77, 160, 36, 'ai-router.sh', null, true));

  // classifier node
  svg.appendChild(node(380, 152, 180, 36, 'ai-classifier.py', 'keyword matching', false));

  // branch boxes
  branches.forEach(b => {
    const g = svgEl('g', {});
    g.appendChild(svgEl('rect', { x: b.x - 70, y: 232, width: 140, height: 34, rx: '6', fill: b.color, stroke: '#333', 'stroke-width': '1' }));
    g.appendChild(svgEl('text', { x: b.x, y: 253, 'text-anchor': 'middle', fill: '#D1D5DB', 'font-family': 'JetBrains Mono, monospace', 'font-size': '10.5', 'font-weight': '500' }, b.label));
    svg.appendChild(g);
  });

  // model nodes
  models.forEach(m => {
    svg.appendChild(node(m.x, 320, 150, 38, m.label, m.sub, false));
  });

  // usage count overlays on branch boxes
  const stats = data.stats || {};
  const byRoute = stats.byRoute || {};
  branches.forEach(b => {
    const count = byRoute[b.route] || 0;
    if (count > 0) {
      svg.appendChild(svgEl('circle', { cx: b.x + 60, cy: 232, r: '9', fill: b.badge }));
      svg.appendChild(svgEl('text', { x: b.x + 60, y: 236, 'text-anchor': 'middle', fill: '#fff', 'font-family': 'Inter, sans-serif', 'font-size': '9', 'font-weight': '700' }, count));
    }
  });

  diagramSection.appendChild(svg);
  container.appendChild(diagramSection);

  // ── Stats ──
  const bottomRow = document.createElement('div');
  bottomRow.className = 'airouter-bottom-row';

  const statsPanel = document.createElement('div');
  statsPanel.className = 'airouter-panel';

  const totalCalls = stats.totalCalls || 0;
  const lastUsed = stats.lastUsed ? formatDateBR(stats.lastUsed) : 'Nunca';

  const routeRows = [
    { key: 'coding',    label: 'coding →',    model: 'Qwen2.5-Coder-7B',   bar: '#10B981' },
    { key: 'reasoning', label: 'reasoning →', model: 'DeepSeek-R1 14B',    bar: '#7C3AED' },
    { key: 'research',  label: 'research →',  model: 'Gemini 2.5 Pro',     bar: '#9D5CFF' },
    { key: 'general',   label: 'general →',   model: 'Ollama qwen2.5',     bar: '#F59E0B' }
  ];

  const maxVal = Math.max(1, ...routeRows.map(r => byRoute[r.key] || 0));

  const routeBarsHTML = routeRows.map(r => {
    const val = byRoute[r.key] || 0;
    const pct = Math.round((val / maxVal) * 100);
    return `
      <div class="airouter-route-row">
        <span class="airouter-route-label">${escapeHtml(r.label)}</span>
        <span class="airouter-route-model">${escapeHtml(r.model)}</span>
        <div class="airouter-bar-wrap">
          <div class="airouter-bar" style="width:${pct}%;background:${r.bar}"></div>
        </div>
        <span class="airouter-route-count">${val}</span>
      </div>
    `;
  }).join('');

  statsPanel.innerHTML = `
    <div class="airouter-panel-header">
      <span class="airouter-panel-title">Uso por rota</span>
      <span class="airouter-total-badge">${totalCalls} total</span>
    </div>
    <div class="airouter-stats-meta">Último uso: <strong>${escapeHtml(lastUsed)}</strong></div>
    <div class="airouter-route-list">${routeBarsHTML}</div>
  `;

  // ── Incidents ──
  const incidentsPanel = document.createElement('div');
  incidentsPanel.className = 'airouter-panel';

  const incidents = data.incidents || [];
  const openCount = incidents.filter(i => !i.resolved).length;

  const severityConfig = {
    low:    { cls: 'sev-low',    label: 'baixa' },
    medium: { cls: 'sev-medium', label: 'média' },
    high:   { cls: 'sev-high',   label: 'alta' }
  };
  const typeLabels = {
    'model-load':        'Carregamento',
    'misclassification': 'Classificação',
    'api-error':         'API Error',
    'no-output':         'Saída truncada'
  };

  const incHTML = incidents.length === 0
    ? '<div class="empty-state" style="padding:1.5rem 0">Nenhum contratempo registrado.</div>'
    : incidents.map(inc => {
        const sev = severityConfig[inc.severity] || { cls: 'sev-low', label: inc.severity };
        const typeLabel = typeLabels[inc.type] || inc.type;
        const statusIcon = inc.resolved
          ? `<span class="inc-resolved" title="Resolvido">✓</span>`
          : `<span class="inc-open" title="Aberto">●</span>`;
        return `
          <div class="inc-item${inc.resolved ? '' : ' inc-open-item'}">
            <div class="inc-item-header">
              ${statusIcon}
              <span class="inc-type-badge">${escapeHtml(typeLabel)}</span>
              <span class="inc-route-tag">${escapeHtml(inc.route)}</span>
              <span class="sev-badge ${sev.cls}">${sev.label}</span>
              <span class="inc-date">${escapeHtml(formatDateBR(inc.date))}</span>
            </div>
            <p class="inc-description">${escapeHtml(inc.description)}</p>
            ${inc.resolution ? `<p class="inc-resolution"><span class="inc-res-label">→</span> ${escapeHtml(inc.resolution)}</p>` : ''}
          </div>
        `;
      }).join('');

  incidentsPanel.innerHTML = `
    <div class="airouter-panel-header">
      <span class="airouter-panel-title">Contratempos</span>
      ${openCount > 0 ? `<span class="airouter-open-badge">${openCount} aberto${openCount > 1 ? 's' : ''}</span>` : '<span class="airouter-all-clear">tudo ok</span>'}
    </div>
    <div class="inc-list">${incHTML}</div>
  `;

  bottomRow.appendChild(statsPanel);
  bottomRow.appendChild(incidentsPanel);
  container.appendChild(bottomRow);
}

/* ─── Security ─── */

const FALLBACK_SECURITY = {
  scannedAt: null,
  summary: { critical: 0, high: 0, medium: 0, low: 0 },
  findings: []
};

const SECURITY_SEVERITY_ORDER = ['critical', 'high', 'medium', 'low'];
const SECURITY_SEVERITY_LABELS = {
  critical: 'Crítico',
  high: 'Alto',
  medium: 'Médio',
  low: 'Baixo'
};
const SECURITY_STATUS_LABELS = {
  open: 'Aberto',
  acknowledged: 'Reconhecido',
  resolved: 'Resolvido',
  ignored: 'Ignorado'
};

let _securityData = FALLBACK_SECURITY;
let _securityFilter = 'open';  // default: só mostrar abertos

function _formatScannedAt(iso) {
  if (!iso) return '—';
  try {
    const dt = new Date(iso);
    return dt.toLocaleString('pt-BR', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit'
    });
  } catch {
    return iso;
  }
}

function renderSecurity(data) {
  _securityData = data || FALLBACK_SECURITY;
  const summaryEl = document.getElementById('security-summary');
  const filterEl = document.getElementById('security-filter');
  const listEl = document.getElementById('security-findings');
  if (!summaryEl || !filterEl || !listEl) return;

  const findings = _securityData.findings || [];
  const summary = _securityData.summary || { critical: 0, high: 0, medium: 0, low: 0 };
  const openCount = findings.filter(f => f.status === 'open').length;
  const ackCount = findings.filter(f => f.status === 'acknowledged').length;
  const ignoredCount = findings.filter(f => f.status === 'ignored').length;

  const hasAny = findings.length > 0;
  const allClear = openCount === 0 && ackCount === 0;

  summaryEl.innerHTML = `
    <div class="security-summary-row">
      <div class="security-summary-headline ${allClear ? 'is-clear' : ''}">
        ${allClear
          ? '<span class="security-clear-badge">Nenhum item aberto ou reconhecido</span>'
          : `<span class="security-open-count">${openCount}</span>
             <span class="security-open-label">aberto${openCount === 1 ? '' : 's'}</span>
             ${ackCount > 0 ? `<span class="security-ack-count">+${ackCount} reconhecido${ackCount === 1 ? '' : 's'}</span>` : ''}`
        }
      </div>
      <div class="security-severity-counts">
        ${SECURITY_SEVERITY_ORDER.map(sev => `
          <span class="security-sev-pill severity-${sev}" title="${SECURITY_SEVERITY_LABELS[sev]}">
            <span class="security-sev-dot"></span>
            <span class="security-sev-label">${SECURITY_SEVERITY_LABELS[sev]}</span>
            <span class="security-sev-num">${summary[sev] || 0}</span>
          </span>
        `).join('')}
      </div>
      <div class="security-scanned-at">
        Varredura: <strong>${_formatScannedAt(_securityData.scannedAt)}</strong>
      </div>
    </div>
  `;

  const filters = [
    { id: 'open',         label: `Abertos (${openCount})` },
    { id: 'acknowledged', label: `Reconhecidos (${ackCount})` },
    { id: 'ignored',      label: `Ignorados (${ignoredCount})` },
    { id: 'all',          label: `Todos (${findings.length})` }
  ];
  filterEl.innerHTML = filters.map(f => `
    <button class="filter-btn ${_securityFilter === f.id ? 'active' : ''}" data-security-filter="${f.id}">
      ${escapeHtml(f.label)}
    </button>
  `).join('');
  filterEl.querySelectorAll('[data-security-filter]').forEach(btn => {
    btn.addEventListener('click', () => {
      _securityFilter = btn.dataset.securityFilter;
      renderSecurity(_securityData);
    });
  });

  if (!hasAny) {
    listEl.innerHTML = `<p class="security-empty">Sem achados. Rode <code>python3 update.py</code> para atualizar.</p>`;
    return;
  }

  const visible = findings.filter(f => _securityFilter === 'all' ? true : f.status === _securityFilter);
  if (visible.length === 0) {
    listEl.innerHTML = `<p class="security-empty">Nenhum item com este filtro.</p>`;
    return;
  }

  // Quando filtro = 'open', agrupar por (category, project) e mostrar botão "Resolver N"
  if (_securityFilter === 'open') {
    const groups = _groupFindings(visible);
    listEl.innerHTML = groups.map(g => _renderSecurityGroup(g)).join('');
    listEl.querySelectorAll('[data-resolve-group]').forEach(btn => {
      btn.addEventListener('click', _onSecurityResolveGroup);
    });
  } else {
    listEl.innerHTML = visible.map(f => _renderSecurityCard(f)).join('');
  }
  // Bind listeners nos botões recém-criados (status + suggest)
  listEl.querySelectorAll('[data-security-action]').forEach(btn => {
    btn.addEventListener('click', _onSecurityAction);
  });
  listEl.querySelectorAll('[data-security-suggest]').forEach(btn => {
    btn.addEventListener('click', _onSecuritySuggest);
  });
}

/* Agrupar findings por (category, project) e anexar metadata de modelo. */
const SECURITY_MODEL_BY_CATEGORY = {
  gitignore: 'haiku',
  'remote-auth': 'haiku',
  secrets: 'sonnet',
  'tracked-sensitive': 'opus'
};

function _effectiveCategory(f) {
  if (f.category === 'secrets' && f.project !== 'workspace') return 'secrets-in-code';
  return f.category;
}

function _groupFindings(findings) {
  const groups = new Map();
  for (const f of findings) {
    const cat = _effectiveCategory(f);
    const key = `${cat}::${f.project}`;
    if (!groups.has(key)) {
      groups.set(key, {
        id: key,
        category: cat,
        project: f.project,
        items: [],
        model: cat === 'secrets-in-code' ? 'opus' : (SECURITY_MODEL_BY_CATEGORY[cat] || 'sonnet')
      });
    }
    groups.get(key).items.push(f);
  }
  // Ordenar por severidade max descendente, depois categoria, projeto
  const sevOrder = { critical: 0, high: 1, medium: 2, low: 3 };
  const maxSev = g => g.items.reduce((m, f) => Math.min(m, sevOrder[f.severity] ?? 9), 9);
  return [...groups.values()].sort((a, b) => maxSev(a) - maxSev(b) || a.category.localeCompare(b.category));
}

function _renderSecurityGroup(g) {
  const cardsHtml = g.items.map(f => _renderSecurityCard(f)).join('');
  const categoryLabel = {
    gitignore: '.gitignore incompleto',
    'remote-auth': 'Remote HTTPS',
    secrets: 'Secrets em plaintext',
    'secrets-in-code': 'Secret em código trackeado',
    'tracked-sensitive': 'Arquivo sensível trackeado'
  }[g.category] || g.category;

  return `
    <section class="security-group" data-group-id="${escapeHtml(g.id)}">
      <header class="security-group-header">
        <div class="security-group-title">
          <span class="security-group-category">${escapeHtml(categoryLabel)}</span>
          <span class="security-group-project">${escapeHtml(g.project)}</span>
          <span class="security-group-count">${g.items.length} ${g.items.length === 1 ? 'item' : 'itens'}</span>
        </div>
        <div class="security-group-actions">
          <span class="security-group-model" title="Modelo que será usado pelo agente">
            <span class="security-model-dot model-${escapeHtml(g.model)}"></span>
            ${escapeHtml(g.model)}
          </span>
          <button class="security-resolve-btn" data-resolve-group="${escapeHtml(g.id)}">
            Resolver ${g.items.length} ${g.items.length === 1 ? 'item' : 'itens'}
          </button>
        </div>
      </header>
      <div class="security-group-cards">${cardsHtml}</div>
    </section>
  `;
}

function _renderSecurityCard(f) {
  const status = f.status || 'open';
  // Ações disponíveis por status atual
  const actions = [];
  if (status !== 'acknowledged') actions.push({ a: 'acknowledged', label: 'Reconhecer' });
  if (status !== 'resolved')     actions.push({ a: 'resolved',     label: 'Resolver' });
  if (status !== 'ignored')      actions.push({ a: 'ignored',      label: 'Ignorar' });
  if (status !== 'open')         actions.push({ a: 'open',         label: 'Reabrir' });

  const actionsHtml = actions.map(({ a, label }) => `
    <button class="security-action-btn" data-security-action="${escapeHtml(a)}" data-finding-id="${escapeHtml(f.id)}">
      ${escapeHtml(label)}
    </button>
  `).join('');

  return `
    <article class="security-card severity-${escapeHtml(f.severity)}" data-status="${escapeHtml(status)}" data-finding-id="${escapeHtml(f.id)}">
      <header class="security-card-header">
        <span class="security-severity-badge severity-${escapeHtml(f.severity)}">${SECURITY_SEVERITY_LABELS[f.severity] || f.severity}</span>
        <span class="security-status-badge status-${escapeHtml(status)}">${SECURITY_STATUS_LABELS[status] || status}</span>
        <span class="security-project-chip">${escapeHtml(f.project)}</span>
        <span class="security-category-chip">${escapeHtml(f.category)}</span>
      </header>
      <h3 class="security-card-title">${escapeHtml(f.title)}</h3>
      <p class="security-card-path"><code>${escapeHtml(f.path)}</code></p>
      <p class="security-card-detail">${escapeHtml(f.detail)}</p>
      <div class="security-card-actions">
        <button class="security-suggest-btn" data-security-suggest data-finding-id="${escapeHtml(f.id)}">
          Ver sugestão de fix
        </button>
        ${actionsHtml}
      </div>
      <footer class="security-card-footer">
        <span>Primeiro: <strong>${escapeHtml(f.firstSeen || '—')}</strong></span>
        <span>Último: <strong>${escapeHtml(f.lastSeen || '—')}</strong></span>
        <span class="security-id">id: <code>${escapeHtml(f.id)}</code></span>
      </footer>
    </article>
  `;
}

async function _onSecurityAction(evt) {
  const btn = evt.currentTarget;
  const id = btn.dataset.findingId;
  const newStatus = btn.dataset.securityAction;
  btn.disabled = true;
  btn.textContent = '…';
  try {
    const res = await fetch('/api/security/status', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, status: newStatus })
    });
    const data = await res.json();
    if (!res.ok || !data.ok) throw new Error(data.error || `HTTP ${res.status}`);
    // Atualizar o finding local e re-render
    const f = _securityData.findings.find(x => x.id === id);
    if (f) f.status = newStatus;
    renderSecurity(_securityData);
  } catch (err) {
    alert(`Erro ao atualizar status: ${err.message}`);
    btn.disabled = false;
    btn.textContent = SECURITY_STATUS_LABELS[newStatus] || newStatus;
  }
}

async function _onSecuritySuggest(evt) {
  const btn = evt.currentTarget;
  const id = btn.dataset.findingId;
  btn.disabled = true;
  const original = btn.textContent;
  btn.textContent = 'Buscando…';
  try {
    const res = await fetch(`/api/security/suggestion?id=${encodeURIComponent(id)}`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    _showSuggestionModal(data);
  } catch (err) {
    alert(`Erro ao buscar sugestão: ${err.message}`);
  } finally {
    btn.disabled = false;
    btn.textContent = original;
  }
}

function _showSuggestionModal(s) {
  // Remover modal anterior se existir
  document.getElementById('security-modal')?.remove();

  const modal = document.createElement('div');
  modal.id = 'security-modal';
  modal.className = 'security-modal-backdrop';
  modal.innerHTML = `
    <div class="security-modal" role="dialog" aria-modal="true" aria-labelledby="security-modal-title">
      <header class="security-modal-header">
        <div>
          <span class="security-modal-kind">${escapeHtml(s.kind || 'info')}</span>
          <h2 id="security-modal-title">${escapeHtml(s.title || 'Sugestão')}</h2>
        </div>
        <button class="security-modal-close" aria-label="Fechar">×</button>
      </header>
      <div class="security-modal-body">
        <div class="security-modal-explanation">${_mdlite(s.explanation || '')}</div>
        ${s.targetPath ? `<p class="security-modal-target">Arquivo: <code>${escapeHtml(s.targetPath)}</code></p>` : ''}
        ${s.snippet ? `
          <div class="security-modal-block">
            <div class="security-modal-block-header">
              <span>Snippet</span>
              <button class="security-copy-btn" data-copy-text>Copiar</button>
            </div>
            <pre class="security-modal-code"><code>${escapeHtml(s.snippet)}</code></pre>
          </div>
        ` : ''}
        ${s.command ? `
          <div class="security-modal-block">
            <div class="security-modal-block-header">
              <span>Comando</span>
              <button class="security-copy-btn" data-copy-text>Copiar</button>
            </div>
            <pre class="security-modal-code"><code>${escapeHtml(s.command)}</code></pre>
          </div>
        ` : ''}
      </div>
    </div>
  `;
  document.body.appendChild(modal);

  const close = () => modal.remove();
  modal.querySelector('.security-modal-close').addEventListener('click', close);
  modal.addEventListener('click', (e) => { if (e.target === modal) close(); });
  document.addEventListener('keydown', function esc(e) {
    if (e.key === 'Escape') { close(); document.removeEventListener('keydown', esc); }
  });

  // Copiar snippet/comando (pega o <pre> adjacente)
  modal.querySelectorAll('[data-copy-text]').forEach(btn => {
    btn.addEventListener('click', () => {
      const block = btn.closest('.security-modal-block');
      const code = block.querySelector('pre code')?.textContent || '';
      navigator.clipboard.writeText(code).then(() => {
        const orig = btn.textContent;
        btn.textContent = 'Copiado!';
        setTimeout(() => { btn.textContent = orig; }, 1500);
      }).catch(() => alert('Falha ao copiar'));
    });
  });
}

/* Resolve group via agent — dispara job e abre painel de streaming. */

async function _onSecurityResolveGroup(evt) {
  const btn = evt.currentTarget;
  const groupId = btn.dataset.resolveGroup;
  const original = btn.textContent;
  btn.disabled = true;
  btn.textContent = 'Iniciando…';

  try {
    const res = await fetch('/api/security/resolve', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ groupId })
    });
    const data = await res.json();
    if (!res.ok || !data.ok) throw new Error(data.error || `HTTP ${res.status}`);
    _openJobPanel(data.jobId, groupId);
  } catch (err) {
    alert(`Erro ao disparar: ${err.message}`);
    btn.disabled = false;
    btn.textContent = original;
  }
}

function _openJobPanel(jobId, groupId) {
  document.getElementById('security-job-panel')?.remove();

  const panel = document.createElement('div');
  panel.id = 'security-job-panel';
  panel.className = 'security-modal-backdrop';
  panel.innerHTML = `
    <div class="security-modal security-job-modal" role="dialog" aria-modal="true">
      <header class="security-modal-header">
        <div>
          <span class="security-modal-kind" id="job-status-kind">executando</span>
          <h2 id="security-job-title">Resolvendo <code>${escapeHtml(groupId)}</code></h2>
          <p class="security-job-meta" id="job-meta">job <code>${escapeHtml(jobId)}</code> · iniciando…</p>
        </div>
        <button class="security-modal-close" aria-label="Fechar">×</button>
      </header>
      <div class="security-modal-body">
        <pre class="security-modal-code security-job-output" id="job-output">aguardando primeira linha…</pre>
        <div class="security-job-footer" id="job-footer"></div>
      </div>
    </div>
  `;
  document.body.appendChild(panel);

  const close = () => {
    if (panel._poll) clearInterval(panel._poll);
    panel.remove();
  };
  panel.querySelector('.security-modal-close').addEventListener('click', close);
  // click fora não fecha — evita acidente durante job longo

  const outputEl = panel.querySelector('#job-output');
  const metaEl = panel.querySelector('#job-meta');
  const kindEl = panel.querySelector('#job-status-kind');
  const footerEl = panel.querySelector('#job-footer');

  const pollOnce = async () => {
    try {
      const res = await fetch(`/api/security/jobs/${encodeURIComponent(jobId)}`);
      const job = await res.json();
      if (!res.ok) throw new Error(job.error || `HTTP ${res.status}`);

      const combined = (job.stdout || '') + (job.stderr ? `\n--- stderr ---\n${job.stderr}` : '');
      outputEl.textContent = combined || '(sem output ainda)';
      outputEl.scrollTop = outputEl.scrollHeight;

      const elapsed = job.startedAt ? Math.round(Date.now() / 1000 - job.startedAt) : 0;
      metaEl.innerHTML = `
        job <code>${escapeHtml(jobId)}</code> ·
        status <strong>${escapeHtml(job.status)}</strong> ·
        ${job.findingCount} itens ·
        modelo <strong>${escapeHtml(job.model)}</strong> ·
        ${elapsed}s
      `;
      kindEl.textContent = job.status;

      if (job.status === 'done' || job.status === 'failed') {
        clearInterval(panel._poll);
        const okMsg = job.status === 'done'
          ? '<span class="security-job-done">Concluído. Rodando nova varredura…</span>'
          : `<span class="security-job-fail">Falhou (exit ${job.exitCode}${job.error ? `: ${escapeHtml(job.error)}` : ''})</span>`;
        footerEl.innerHTML = okMsg;
        // Rescan e refresh
        setTimeout(() => _refreshSecurityAfterJob(), 1500);
      }
    } catch (err) {
      // Silencia — volta a tentar no próximo tick
      console.warn('poll job err:', err);
    }
  };

  panel._poll = setInterval(pollOnce, 1500);
  pollOnce();
}

/* Reflexão diária — dispara agente e mostra output streamado. */

async function _onReflectionRun(evt) {
  const btn = evt.currentTarget;
  const original = btn.innerHTML;
  btn.disabled = true;
  btn.textContent = 'Iniciando…';
  try {
    const res = await fetch('/api/reflection/run', { method: 'POST' });
    const data = await res.json();
    if (!res.ok || !data.ok) throw new Error(data.error || `HTTP ${res.status}`);
    _openReflectionJobPanel(data.jobId);
  } catch (err) {
    alert(`Erro ao disparar reflexão: ${err.message}`);
    btn.disabled = false;
    btn.innerHTML = original;
  }
}

function _openReflectionJobPanel(jobId) {
  document.getElementById('security-job-panel')?.remove();

  const panel = document.createElement('div');
  panel.id = 'security-job-panel';
  panel.className = 'security-modal-backdrop';
  panel.innerHTML = `
    <div class="security-modal security-job-modal" role="dialog" aria-modal="true">
      <header class="security-modal-header">
        <div>
          <span class="security-modal-kind" id="refl-job-kind">executando</span>
          <h2>Reflexão diária</h2>
          <p class="security-job-meta" id="refl-job-meta">job <code>${escapeHtml(jobId)}</code> · iniciando…</p>
        </div>
        <button class="security-modal-close" aria-label="Fechar">×</button>
      </header>
      <div class="security-modal-body">
        <pre class="security-modal-code security-job-output" id="refl-job-output">aguardando primeira linha…</pre>
        <div class="security-job-footer" id="refl-job-footer"></div>
      </div>
    </div>
  `;
  document.body.appendChild(panel);

  const close = () => {
    if (panel._poll) clearInterval(panel._poll);
    panel.remove();
  };
  panel.querySelector('.security-modal-close').addEventListener('click', close);

  const outputEl = panel.querySelector('#refl-job-output');
  const metaEl = panel.querySelector('#refl-job-meta');
  const kindEl = panel.querySelector('#refl-job-kind');
  const footerEl = panel.querySelector('#refl-job-footer');

  const pollOnce = async () => {
    try {
      const res = await fetch(`/api/reflection/jobs/${encodeURIComponent(jobId)}`);
      const job = await res.json();
      if (!res.ok) throw new Error(job.error || `HTTP ${res.status}`);

      const combined = (job.stdout || '') + (job.stderr ? `\n--- stderr ---\n${job.stderr}` : '');
      outputEl.textContent = combined || '(sem output ainda)';
      outputEl.scrollTop = outputEl.scrollHeight;

      const elapsed = job.startedAt ? Math.round(Date.now() / 1000 - job.startedAt) : 0;
      metaEl.innerHTML = `
        job <code>${escapeHtml(jobId)}</code> ·
        status <strong>${escapeHtml(job.status)}</strong> ·
        modelo <strong>${escapeHtml(job.model)}</strong> ·
        ${elapsed}s
      `;
      kindEl.textContent = job.status;

      if (job.status === 'done' || job.status === 'failed') {
        clearInterval(panel._poll);
        const msg = job.status === 'done'
          ? '<span class="security-job-done">Concluído. Recarregando Evolução…</span>'
          : `<span class="security-job-fail">Falhou (exit ${job.exitCode}${job.error ? `: ${escapeHtml(job.error)}` : ''})</span>`;
        footerEl.innerHTML = msg;
        setTimeout(() => _refreshEvolutionAfterJob(), 1500);
      }
    } catch (err) {
      console.warn('poll reflection err:', err);
    }
  };

  panel._poll = setInterval(pollOnce, 1500);
  pollOnce();
}

async function _refreshEvolutionAfterJob() {
  const cacheBust = '?t=' + Date.now();
  const [evolutionLog, skillLevels, improvementPlan, pending] = await Promise.all([
    fetchJSON('./data/evolution-log.json' + cacheBust, FALLBACK_EVOLUTION_LOG),
    fetchJSON('./data/skill-levels.json' + cacheBust, FALLBACK_SKILL_LEVELS),
    fetchJSON('./data/improvement-plan.json' + cacheBust, FALLBACK_IMPROVEMENT_PLAN),
    fetchJSON('./data/pending-reflection.json' + cacheBust, FALLBACK_PENDING)
  ]);
  renderEvolution(evolutionLog, skillLevels, improvementPlan, pending);
  // Atualizar badge de notificação do nav
  const evolucaoBtn = document.querySelector('[data-target="evolucao"]');
  if (evolucaoBtn) {
    if (pending && pending.status === 'pending') {
      evolucaoBtn.classList.add('has-notification');
    } else {
      evolucaoBtn.classList.remove('has-notification');
    }
  }
}

async function _refreshSecurityAfterJob() {
  // Dispara rescan server-side e recarrega o JSON em seguida.
  try {
    await fetch('/api/security/rescan', { method: 'POST' });
  } catch {}
  try {
    const data = await fetchJSON('./data/security.json?t=' + Date.now(), FALLBACK_SECURITY);
    renderSecurity(data);
  } catch {}
}

// Markdown muito leve: negrito (**x**) e quebra de parágrafo.
function _mdlite(text) {
  const safe = escapeHtml(text);
  return safe
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\n\n/g, '</p><p>')
    .replace(/\n/g, '<br>')
    .replace(/^/, '<p>')
    .replace(/$/, '</p>');
}

/* ─── Sidebar date ─── */

function renderDate() {
  const el = document.getElementById('sidebar-date');
  if (!el) return;
  const now = new Date();
  el.textContent = now.toLocaleDateString('pt-BR', {
    weekday: 'short', day: '2-digit', month: 'short', year: 'numeric'
  });
}

/* ─── Init ─── */

async function init() {
  renderDate();

  /* Nav listeners */
  document.querySelectorAll('.nav-item').forEach(btn => {
    btn.addEventListener('click', () => navigateTo(btn.dataset.target));
  });

  /* Mobile sidebar */
  const hamburger = document.getElementById('hamburger-btn');
  const overlay = document.getElementById('sidebar-overlay');
  if (hamburger) hamburger.addEventListener('click', openSidebar);
  if (overlay) overlay.addEventListener('click', closeSidebar);

  /* Load data in parallel */
  const FALLBACK_PRINTED_CLIS = { generated_at: null, library_path: "~/printing-press/library", press_version: null, clis: [] };
  const [skills, agents, projects, mcps, evolutionLog, skillLevels, improvementPlan, pending, aiHub, security, hooks, printedClis] = await Promise.all([
    fetchJSON('./data/skills.json', FALLBACK_SKILLS),
    fetchJSON('./data/agents.json', FALLBACK_AGENTS),
    fetchJSON('./data/projects.json', FALLBACK_PROJECTS),
    fetchJSON('./data/mcps.json', FALLBACK_MCPS),
    fetchJSON('./data/evolution-log.json', FALLBACK_EVOLUTION_LOG),
    fetchJSON('./data/skill-levels.json', FALLBACK_SKILL_LEVELS),
    fetchJSON('./data/improvement-plan.json', FALLBACK_IMPROVEMENT_PLAN),
    fetchJSON('./data/pending-reflection.json', FALLBACK_PENDING),
    fetchJSON('./data/ai-router.json', FALLBACK_AIROUTER),
    fetchJSON('./data/security.json', FALLBACK_SECURITY),
    fetchJSON('./data/hooks.json', FALLBACK_HOOKS),
    fetchJSON('./data/printed-clis.json', FALLBACK_PRINTED_CLIS)
  ]);

  allSkills = skills;

  renderSkills(allSkills);
  renderAgents(agents);
  renderProjects(projects);
  renderMCPs(mcps);
  renderCheatsheet();
  renderBacklog();
  renderEvolution(evolutionLog, skillLevels, improvementPlan, pending);
  renderAIHub(aiHub);
  renderSecurity(security);
  renderHooks(hooks);
  renderPrintedClis(printedClis);

  /* Badge de notificação no nav de Security se há abertos */
  const openSecurity = (security.findings || []).filter(f => f.status === 'open').length;
  if (openSecurity > 0) {
    const btn = document.querySelector('[data-target="security"]');
    if (btn) btn.classList.add('has-notification');
  }

  /* Processos — polling contínuo (mais rápido quando a aba está ativa) */
  startProcessPolling();

  /* Badge de notificação no nav de Evolução */
  if (pending && pending.status === 'pending') {
    const evolucaoBtn = document.querySelector('[data-target="evolucao"]');
    if (evolucaoBtn) evolucaoBtn.classList.add('has-notification');
  }

  /* Ensure skills is active on load */
  navigateTo('skills');
}

document.addEventListener('DOMContentLoaded', init);
