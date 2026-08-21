#!/usr/bin/env python3

import json
import re
import subprocess
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
POSTS_DIR = ROOT / "posts"
SNIPPETS_DIR = ROOT / "snippets"
ASSETS_DIR = ROOT / "assets"

LANG_EXTENSIONS = {
    "bash": "sh",
    "sh": "sh",
    "shell": "sh",
    "yaml": "yml",
    "yml": "yml",
    "dockerfile": "Dockerfile",
    "json": "json",
    "javascript": "js",
    "js": "js",
    "typescript": "ts",
    "ts": "ts",
    "css": "css",
    "html": "html",
    "xml": "xml",
    "java": "java",
    "sql": "sql",
    "nginx": "conf",
    "ini": "ini",
    "toml": "toml",
    "properties": "properties",
}


def slugify(value: str) -> str:
    value = value.lower().strip()
    value = value.replace("ä", "ae").replace("ö", "oe").replace("ü", "ue").replace("ß", "ss")
    value = re.sub(r"[^a-z0-9]+", "-", value)
    return value.strip("-") or "snippet"


def published_at_for(path: Path) -> str:
    rel = path.relative_to(ROOT).as_posix()
    try:
        output = subprocess.check_output(
            [
                "git",
                "log",
                "origin/main",
                "--first-parent",
                "--reverse",
                "--format=%cI",
                "--",
                rel,
            ],
            cwd=ROOT,
            text=True,
            stderr=subprocess.DEVNULL,
        ).strip().splitlines()
        if output:
            return output[0]
    except (subprocess.CalledProcessError, FileNotFoundError):
        pass
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def ensure_published_at(markdown: str, path: Path) -> str:
    if re.search(r"^published_at:\s*", markdown, flags=re.MULTILINE):
        return markdown

    published_at = published_at_for(path)
    match = re.search(r"^date:\s*.*$", markdown, flags=re.MULTILINE)
    if not match:
        return markdown

    return markdown[: match.end()] + f"\npublished_at: {published_at}" + markdown[match.end() :]


def migrate_code_blocks(markdown: str, post_path: Path):
    lines = markdown.splitlines(keepends=True)
    output = []
    current_heading = "Code"
    index = 0
    snippet_number = 0
    generated = []
    used_names = set()
    post_key = post_path.stem
    target_dir = SNIPPETS_DIR / post_key

    while index < len(lines):
        line = lines[index]
        heading_match = re.match(r"^(#{2,6})\s+(.+?)\s*$", line.rstrip("\r\n"))
        if heading_match:
            current_heading = heading_match.group(2).strip()

        fence_match = re.match(r"^```([A-Za-z0-9_-]+)\s*$", line.rstrip("\r\n"))
        if not fence_match:
            output.append(line)
            index += 1
            continue

        language = fence_match.group(1).lower()
        closing = index + 1
        while closing < len(lines) and not re.match(r"^```\s*$", lines[closing].rstrip("\r\n")):
            closing += 1

        if closing >= len(lines):
            output.append(line)
            index += 1
            continue

        code_lines = lines[index + 1 : closing]
        meaningful = [item for item in code_lines if item.strip()]
        if language not in LANG_EXTENSIONS or len(meaningful) < 2:
            output.extend(lines[index : closing + 1])
            index = closing + 1
            continue

        snippet_number += 1
        extension = LANG_EXTENSIONS[language]
        base_name = f"{snippet_number:02d}-{slugify(current_heading)}"
        file_name = f"{base_name}.{extension}" if extension != "Dockerfile" else f"{base_name}.Dockerfile"
        suffix = 2
        while file_name in used_names:
            file_name = f"{base_name}-{suffix}.{extension}" if extension != "Dockerfile" else f"{base_name}-{suffix}.Dockerfile"
            suffix += 1
        used_names.add(file_name)

        target_dir.mkdir(parents=True, exist_ok=True)
        code = "".join(code_lines)
        if code and not code.endswith("\n"):
            code += "\n"
        (target_dir / file_name).write_text(code, encoding="utf-8")

        rel = f"{post_key}/{file_name}"
        title = current_heading
        replacement = f'[{title}](/snippets/{rel} "snippet:{language}")\n'
        output.append(replacement)
        generated.append(
            {
                "title": title,
                "path": rel,
                "language": language,
                "post": post_key,
            }
        )
        index = closing + 1

    return "".join(output), generated


def migrate_posts():
    if SNIPPETS_DIR.exists():
        for child in SNIPPETS_DIR.iterdir():
            if child.name in {"index.html", "library.js", "library.css", "manifest.json"}:
                continue
            if child.is_dir():
                for nested in sorted(child.rglob("*"), reverse=True):
                    if nested.is_file():
                        nested.unlink()
                    elif nested.is_dir():
                        nested.rmdir()
                child.rmdir()

    manifest = []
    for post_path in sorted(POSTS_DIR.glob("*.md")):
        markdown = post_path.read_text(encoding="utf-8")
        markdown = ensure_published_at(markdown, post_path)
        markdown, generated = migrate_code_blocks(markdown, post_path)
        post_path.write_text(markdown, encoding="utf-8")
        manifest.extend(generated)

    return manifest


def update_server():
    path = ROOT / "server.js"
    text = path.read_text(encoding="utf-8")

    text = text.replace(
        "const MarkdownIt = require('markdown-it');\n",
        "const MarkdownIt = require('markdown-it');\nconst hljs = require('highlight.js/lib/common');\n",
    )
    text = text.replace(
        "'id', 'version', 'title', 'date', 'created_at', 'updated_at', 'author', 'reviewed_by', 'category', 'excerpt', 'tags'",
        "'id', 'version', 'title', 'date', 'published_at', 'created_at', 'updated_at', 'author', 'reviewed_by', 'category', 'excerpt', 'tags'",
    )
    text = text.replace(
        "const md = new MarkdownIt({\n  html: false,\n  linkify: true,\n  typographer: true\n});",
        "const md = new MarkdownIt({\n  html: false,\n  linkify: true,\n  typographer: true,\n  highlight(code, language) {\n    if (language && hljs.getLanguage(language)) {\n      return hljs.highlight(code, { language }).value;\n    }\n\n    return md.utils.escapeHtml(code);\n  }\n});",
    )
    text = text.replace(
        "      const category = recovered.data.category || 'IT';\n",
        "      const publishedAt = recovered.data.published_at || recovered.data.created_at || date;\n      const category = recovered.data.category || 'IT';\n",
    )
    text = text.replace(
        "        date,\n        category,",
        "        date,\n        publishedAt,\n        category,",
    )
    text = text.replace(
        "  posts.sort((a, b) => parseDate(b.date) - parseDate(a.date));",
        "  posts.sort((a, b) => {\n    const publishedDelta = parseDate(b.publishedAt) - parseDate(a.publishedAt);\n    if (publishedDelta !== 0) {\n      return publishedDelta;\n    }\n\n    return parseDate(b.date) - parseDate(a.date);\n  });",
    )
    text = text.replace(
        "      const dateDelta = parseDate(b.post.date) - parseDate(a.post.date);",
        "      const dateDelta = parseDate(b.post.publishedAt) - parseDate(a.post.publishedAt);",
    )
    text = text.replace(
        "        <a href=\"/#topics\">Themen</a>\n        <a href=\"/#about\">About</a>",
        "        <a href=\"/#topics\">Themen</a>\n        <a href=\"/snippets/\">Snippets</a>\n        <a href=\"/#about\">About</a>",
    )

    path.write_text(text, encoding="utf-8")


def update_new_post():
    path = ROOT / "scripts" / "new-post.js"
    text = path.read_text(encoding="utf-8")
    text = text.replace(
        "function renderPost({ id, title, date, category, tags, excerpt }) {",
        "function renderPost({ id, title, date, publishedAt, category, tags, excerpt }) {",
    )
    text = text.replace(
        "date: ${date}\\ncreated_at: ${date}",
        "date: ${date}\\npublished_at: ${publishedAt}\\ncreated_at: ${date}",
    )
    text = text.replace(
        "  const date = localDateString();\n  const id = `${date}-${slug}`;",
        "  const now = new Date();\n  const date = localDateString(now);\n  const publishedAt = now.toISOString();\n  const id = `${date}-${slug}`;",
    )
    text = text.replace(
        "    date,\n    category: options.category,",
        "    date,\n    publishedAt,\n    category: options.category,",
    )
    path.write_text(text, encoding="utf-8")


def update_versioning():
    (ROOT / "VERSION").write_text("1.1.0\n", encoding="utf-8")

    dockerfile = ROOT / "Dockerfile"
    text = dockerfile.read_text(encoding="utf-8")
    text = text.replace(
        "COPY package.json package-lock.json* ./",
        "COPY package.json package-lock.json* VERSION ./",
    )
    text = text.replace(
        "RUN PACKAGE_VERSION=\"$(node -p \"require('./package.json').version\")\" && \\\n\t\tVERSION=\"${BUILD_VERSION:-$PACKAGE_VERSION}\" && \\",
        "RUN FILE_VERSION=\"$(tr -d '[:space:]' < VERSION)\" && \\\n\t\tVERSION=\"${BUILD_VERSION:-$FILE_VERSION}\" && \\",
    )
    text = text.replace("COPY posts ./posts\n", "COPY posts ./posts\nCOPY snippets ./snippets\n")
    dockerfile.write_text(text, encoding="utf-8")

    workflow = ROOT / ".github" / "workflows" / "cd.yml"
    text = workflow.read_text(encoding="utf-8")
    old = """          BASE_VERSION=$(node -p \"require('./package.json').version\")\n          VERSION_PREFIX=\"${BASE_VERSION%.*}\"\n          BLOG_VERSION=\"${VERSION_PREFIX}.${GITHUB_RUN_NUMBER}\"\n"""
    new = """          BLOG_VERSION=$(tr -d '[:space:]' < VERSION)\n          if ! printf '%s' \"$BLOG_VERSION\" | grep -Eq '^[0-9]+\\.[0-9]+\\.[0-9]+$'; then\n            echo \"Invalid VERSION: $BLOG_VERSION\"\n            exit 1\n          fi\n"""
    if old not in text:
        raise RuntimeError("Could not find CD version block")
    text = text.replace(old, new)
    workflow.write_text(text, encoding="utf-8")

    index = ROOT / "index.html"
    text = index.read_text(encoding="utf-8")
    text = text.replace('<a href="#topics">Themen</a>\n        <a href="#about">About</a>', '<a href="#topics">Themen</a>\n        <a href="/snippets/">Snippets</a>\n        <a href="#about">About</a>')
    text = text.replace('· v1.0.0 · Letztes Release: lokal', '· v1.1.0 · Letztes Release: lokal')
    text = text.replace(
        "new Intl.DateTimeFormat('de-DE', {\n                dateStyle: 'medium',\n                timeStyle: 'short'\n              }).format(releaseDate)",
        "new Intl.DateTimeFormat('de-DE', {\n                dateStyle: 'medium'\n              }).format(releaseDate)",
    )
    index.write_text(text, encoding="utf-8")


def write_snippet_assets(manifest):
    SNIPPETS_DIR.mkdir(parents=True, exist_ok=True)
    (SNIPPETS_DIR / "manifest.json").write_text(
        json.dumps(sorted(manifest, key=lambda item: (item["post"], item["path"])), ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )

    (ASSETS_DIR / "snippets.css").write_text(
        """.code-snippet { margin: 1.5rem 0; overflow: hidden; border: 1px solid rgba(120, 145, 160, .28); border-radius: 14px; background: #0d1117; box-shadow: 0 8px 24px rgba(0, 0, 0, .16); }\n.code-snippet__header, .code-snippet__footer { display: flex; align-items: center; justify-content: space-between; gap: .75rem; padding: .65rem .9rem; background: #161b22; }\n.code-snippet__header { border-bottom: 1px solid #30363d; }\n.code-snippet__footer { border-top: 1px solid #30363d; }\n.code-snippet__title { margin: 0; color: #e6edf3; font: 600 .92rem/1.3 system-ui, sans-serif; }\n.code-snippet__meta { color: #8b949e; font: .78rem/1.2 ui-monospace, SFMono-Regular, Menlo, monospace; }\n.code-snippet__actions { display: flex; align-items: center; gap: .55rem; }\n.code-snippet__copy { appearance: none; border: 1px solid #30363d; border-radius: 7px; background: #21262d; color: #e6edf3; padding: .35rem .65rem; cursor: pointer; font: 600 .76rem/1.2 system-ui, sans-serif; }\n.code-snippet__copy:hover { border-color: #8b949e; }\n.code-snippet pre { margin: 0; max-height: 34rem; overflow: auto; border-radius: 0; }\n.code-snippet code { display: block; padding: 1rem; font-size: .86rem; line-height: 1.55; }\n.code-snippet__footer a { color: #79c0ff; font-size: .82rem; text-decoration: none; }\n.code-snippet__footer a:hover { text-decoration: underline; }\n.snippet-library { width: min(1180px, calc(100% - 2rem)); margin: 0 auto; padding: 2rem 0 4rem; }\n.snippet-library__toolbar { display: flex; gap: .75rem; align-items: center; margin: 1.25rem 0; }\n.snippet-library__search { flex: 1; min-width: 0; padding: .7rem .85rem; border-radius: 9px; border: 1px solid #30363d; background: #0d1117; color: #e6edf3; }\n.snippet-library__grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: .8rem; }\n.snippet-library__item { display: block; border: 1px solid #30363d; border-radius: 10px; background: #161b22; padding: .9rem; color: #e6edf3; text-decoration: none; }\n.snippet-library__item:hover { border-color: #8b949e; transform: translateY(-1px); }\n.snippet-library__item strong { display: block; margin-bottom: .35rem; }\n.snippet-library__item span { color: #8b949e; font: .78rem/1.35 ui-monospace, SFMono-Regular, Menlo, monospace; word-break: break-word; }\n.snippet-library__viewer { margin-top: 1.25rem; }\n@media (max-width: 640px) { .code-snippet__header { align-items: flex-start; } .code-snippet__header, .code-snippet__footer { flex-wrap: wrap; } .code-snippet code { font-size: .78rem; } }\n""",
        encoding="utf-8",
    )

    (SNIPPETS_DIR / "index.html").write_text(
        """<!doctype html>\n<html lang=\"de\">\n<head>\n  <meta charset=\"UTF-8\" />\n  <meta name=\"viewport\" content=\"width=device-width, initial-scale=1.0\" />\n  <title>Code Snippets | Kernel Notes</title>\n  <link rel=\"icon\" href=\"/assets/favicon.svg\" type=\"image/svg+xml\" />\n  <link rel=\"stylesheet\" href=\"/styles.css\" />\n  <link rel=\"stylesheet\" href=\"/assets/typewriter.css\" />\n  <link rel=\"stylesheet\" href=\"/assets/snippets.css\" />\n  <link rel=\"stylesheet\" href=\"https://cdn.jsdelivr.net/gh/highlightjs/cdn-release@11.11.1/build/styles/github-dark.min.css\" />\n</head>\n<body>\n  <div class=\"bg-grid\" aria-hidden=\"true\"></div>\n  <header class=\"site-header\">\n    <a class=\"logo\" href=\"/\">Kernel Notes</a>\n    <nav class=\"main-nav\" aria-label=\"Hauptnavigation\">\n      <a href=\"/#posts\">Artikel</a>\n      <a href=\"/#topics\">Themen</a>\n      <a href=\"/snippets/\" aria-current=\"page\">Snippets</a>\n      <a href=\"/#about\">About</a>\n    </nav>\n  </header>\n  <main class=\"snippet-library\">\n    <p class=\"eyebrow\">CODE LIBRARY</p>\n    <h1>Code Snippets</h1>\n    <p>Code aus den Artikeln separat versioniert, vollständig lesbar und direkt kopierbar.</p>\n    <div id=\"snippet-root\"></div>\n  </main>\n  <script src=\"https://cdn.jsdelivr.net/gh/highlightjs/cdn-release@11.11.1/build/highlight.min.js\"></script>\n  <script src=\"/snippets/library.js\"></script>\n</body>\n</html>\n""",
        encoding="utf-8",
    )

    (SNIPPETS_DIR / "library.js").write_text(
        """/* global document, fetch, window, navigator, hljs */\n\nconst root = document.getElementById('snippet-root');\n\nfunction selectedPath() {\n  return decodeURIComponent(window.location.hash.replace(/^#\/?/, ''));\n}\n\nfunction highlight(code, language) {\n  if (language && hljs.getLanguage(language)) {\n    return hljs.highlight(code, { language }).value;\n  }\n  return hljs.highlightAuto(code).value;\n}\n\nfunction renderList(items) {\n  root.innerHTML = `\n    <div class=\"snippet-library__toolbar\">\n      <input class=\"snippet-library__search\" type=\"search\" placeholder=\"Snippet suchen …\" aria-label=\"Snippet suchen\" />\n      <span>${items.length} Snippets</span>\n    </div>\n    <div class=\"snippet-library__grid\"></div>`;\n\n  const grid = root.querySelector('.snippet-library__grid');\n  const input = root.querySelector('.snippet-library__search');\n\n  const draw = () => {\n    const query = input.value.trim().toLowerCase();\n    const filtered = items.filter((item) => `${item.title} ${item.path} ${item.language}`.toLowerCase().includes(query));\n    grid.innerHTML = filtered.map((item) => `\n      <a class=\"snippet-library__item\" href=\"#/${encodeURIComponent(item.path)}\">\n        <strong>${item.title}</strong>\n        <span>${item.language} · ${item.path}</span>\n      </a>`).join('');\n  };\n\n  input.addEventListener('input', draw);\n  draw();\n}\n\nasync function renderViewer(item) {\n  const response = await fetch(`/snippets/${item.path}`);\n  if (!response.ok) throw new Error('Snippet konnte nicht geladen werden');\n  const source = await response.text();\n  root.innerHTML = `\n    <p><a href=\"/snippets/\">← Alle Snippets</a></p>\n    <section class=\"code-snippet snippet-library__viewer\">\n      <header class=\"code-snippet__header\">\n        <div><p class=\"code-snippet__title\">${item.title}</p><span class=\"code-snippet__meta\">${item.language} · ${item.path}</span></div>\n        <button class=\"code-snippet__copy\" type=\"button\">Kopieren</button>\n      </header>\n      <pre><code class=\"hljs language-${item.language}\">${highlight(source, item.language)}</code></pre>\n      <footer class=\"code-snippet__footer\"><a href=\"/snippets/${item.path}\">Raw öffnen</a></footer>\n    </section>`;\n  root.querySelector('.code-snippet__copy').addEventListener('click', async (event) => {\n    await navigator.clipboard.writeText(source);\n    event.currentTarget.textContent = 'Kopiert';\n    window.setTimeout(() => { event.currentTarget.textContent = 'Kopieren'; }, 1200);\n  });\n}\n\nasync function boot() {\n  const response = await fetch('/snippets/manifest.json', { cache: 'no-store' });\n  const items = await response.json();\n  const path = selectedPath();\n  if (!path) {\n    renderList(items);\n    return;\n  }\n  const item = items.find((candidate) => candidate.path === path);\n  if (!item) {\n    root.innerHTML = '<p>Snippet nicht gefunden. <a href=\"/snippets/\">Zur Übersicht</a></p>';\n    return;\n  }\n  await renderViewer(item);\n}\n\nwindow.addEventListener('hashchange', () => boot().catch(console.error));\nboot().catch((error) => { root.textContent = error.message; });\n""",
        encoding="utf-8",
    )


def update_script_js():
    path = ROOT / "script.js"
    text = path.read_text(encoding="utf-8")
    if "setupSnippetEmbeds" in text:
        return

    addition = r'''

const SNIPPET_HIGHLIGHT_VERSION = '11.11.1';

function ensureSnippetStyles() {
  if (!document.querySelector('link[data-snippet-styles]')) {
    const localStyles = document.createElement('link');
    localStyles.rel = 'stylesheet';
    localStyles.href = '/assets/snippets.css';
    localStyles.dataset.snippetStyles = '';
    document.head.append(localStyles);
  }

  if (!document.querySelector('link[data-highlight-styles]')) {
    const highlightStyles = document.createElement('link');
    highlightStyles.rel = 'stylesheet';
    highlightStyles.href = `https://cdn.jsdelivr.net/gh/highlightjs/cdn-release@${SNIPPET_HIGHLIGHT_VERSION}/build/styles/github-dark.min.css`;
    highlightStyles.dataset.highlightStyles = '';
    document.head.append(highlightStyles);
  }
}

function ensureHighlightJs() {
  if (window.hljs) {
    return Promise.resolve(window.hljs);
  }

  const existing = document.querySelector('script[data-highlight-js]');
  if (existing) {
    return new Promise((resolve, reject) => {
      existing.addEventListener('load', () => resolve(window.hljs), { once: true });
      existing.addEventListener('error', reject, { once: true });
    });
  }

  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = `https://cdn.jsdelivr.net/gh/highlightjs/cdn-release@${SNIPPET_HIGHLIGHT_VERSION}/build/highlight.min.js`;
    script.dataset.highlightJs = '';
    script.addEventListener('load', () => resolve(window.hljs), { once: true });
    script.addEventListener('error', reject, { once: true });
    document.head.append(script);
  });
}

function parseSnippetReference(link) {
  const title = link.getAttribute('title') || '';
  if (!title.startsWith('snippet:')) {
    return null;
  }

  const [, language = '', range = ''] = title.split(':');
  const href = link.getAttribute('href') || '';
  if (!href.startsWith('/snippets/') || href.includes('..')) {
    return null;
  }

  return {
    title: link.textContent?.trim() || href.split('/').pop(),
    language,
    range,
    href
  };
}

function sliceSnippet(source, range) {
  const match = String(range || '').match(/^(\d+)-(\d+)$/);
  if (!match) {
    return source;
  }

  const start = Math.max(1, Number.parseInt(match[1], 10));
  const end = Math.max(start, Number.parseInt(match[2], 10));
  return source.split(/\r?\n/).slice(start - 1, end).join('\n');
}

async function renderSnippetEmbed(link, reference, highlighter) {
  const response = await fetch(reference.href);
  if (!response.ok) {
    throw new Error(`Snippet ${reference.href} konnte nicht geladen werden`);
  }

  const fullSource = await response.text();
  const source = sliceSnippet(fullSource, reference.range);
  const highlighted = reference.language && highlighter.getLanguage(reference.language)
    ? highlighter.highlight(source, { language: reference.language }).value
    : highlighter.highlightAuto(source).value;

  const figure = document.createElement('figure');
  figure.className = 'code-snippet';

  const header = document.createElement('header');
  header.className = 'code-snippet__header';

  const titleBox = document.createElement('div');
  const title = document.createElement('p');
  title.className = 'code-snippet__title';
  title.textContent = reference.title;
  const meta = document.createElement('span');
  meta.className = 'code-snippet__meta';
  meta.textContent = [reference.language, reference.range ? `Zeilen ${reference.range}` : ''].filter(Boolean).join(' · ');
  titleBox.append(title, meta);

  const actions = document.createElement('div');
  actions.className = 'code-snippet__actions';
  const copy = document.createElement('button');
  copy.className = 'code-snippet__copy';
  copy.type = 'button';
  copy.textContent = 'Kopieren';
  copy.addEventListener('click', async () => {
    await navigator.clipboard.writeText(source);
    copy.textContent = 'Kopiert';
    window.setTimeout(() => { copy.textContent = 'Kopieren'; }, 1200);
  });
  actions.append(copy);
  header.append(titleBox, actions);

  const pre = document.createElement('pre');
  const code = document.createElement('code');
  code.className = `hljs${reference.language ? ` language-${reference.language}` : ''}`;
  code.innerHTML = highlighted;
  pre.append(code);

  const footer = document.createElement('footer');
  footer.className = 'code-snippet__footer';
  const full = document.createElement('a');
  full.href = `/snippets/#/${encodeURIComponent(reference.href.replace(/^\/snippets\//, ''))}`;
  full.textContent = 'Vollständigen Code anzeigen';
  footer.append(full);

  figure.append(header, pre, footer);
  const paragraph = link.parentElement?.tagName === 'P' && link.parentElement.children.length === 1
    ? link.parentElement
    : null;
  (paragraph || link).replaceWith(figure);
}

async function setupSnippetEmbeds() {
  const links = [...document.querySelectorAll('.terminal-content a[title^="snippet:"]')];
  if (!links.length) {
    return;
  }

  ensureSnippetStyles();
  const highlighter = await ensureHighlightJs();
  await Promise.all(links.map(async (link) => {
    const reference = parseSnippetReference(link);
    if (!reference) {
      return;
    }

    try {
      await renderSnippetEmbed(link, reference, highlighter);
    } catch (error) {
      console.error(error);
    }
  }));
}

setupSnippetEmbeds();
'''
    path.write_text(text + addition, encoding="utf-8")


def update_readme():
    path = ROOT / "README.md"
    text = path.read_text(encoding="utf-8")
    if "## Snippet Library" not in text:
        text += """\n\n## Snippet Library\n\nGroessere Codebeispiele liegen unter `snippets/` und werden im Markdown nur referenziert:\n\n```markdown\n[Proofread Workflow](/snippets/2026-08-21-rechtschreib-pipeline/proofread.yml \"snippet:yaml\")\n```\n\nOptional kann ein Ausschnitt mit `snippet:yaml:10-40` angegeben werden. Die Vollansicht liegt unter `/snippets/`.\n\nDie sichtbare Blog-Version liegt in `VERSION`. Reine Content-Aenderungen unter `posts/` erhoehen diese Version nicht. Neue Features/Fixes werden nach SemVer versioniert.\n"""
    path.write_text(text, encoding="utf-8")


def main():
    manifest = migrate_posts()
    update_server()
    update_new_post()
    update_versioning()
    write_snippet_assets(manifest)
    update_script_js()
    update_readme()
    print(f"Migrated {len(manifest)} code snippets")


if __name__ == "__main__":
    main()
