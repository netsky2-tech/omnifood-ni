#!/usr/bin/env python3
# ==============================================================================
# OmniFood NI — NHILOS Branding Documentation Delivery Builder
# ==============================================================================
# Builds the shareable delivery of the branding document set for people who
# cannot use the repository (designers, agencies, external collaborators):
#
#   out/
#     sitio/                          navigable static site (open index.html)
#     nhilos-branding-completo.html   every document in one file
#     nhilos-branding.pdf             the same, rendered to PDF
#     LEEME.txt / README copy         what this is and where to start
#
# The document set uses relative markdown links with heading anchors. Those
# links are the whole point of the set, so this builder never emits a delivery
# with a broken link: it verifies every relative link and every anchor against
# the generated output and fails loudly if any does not resolve.
#
# Two decisions worth keeping:
#
#   1. Heading ids are derived from the RENDERED html, not from the markdown.
#      Re-deriving them from markdown source means reimplementing CommonMark
#      (indented ATX headings, setext headings, fences) and the two parsers
#      drift; the first version of this script produced 308 broken anchors that
#      way. Slugging the rendered heading text is self-consistent by
#      construction.
#   2. Documents the set cites but does not contain (the brand constitution and
#      the experience standards) are included as extra pages. Without them, 75
#      links in the set point at nothing.
#
# Dependency: python3 + markdown_it  (pip install markdown-it-py)
# PDF: optional, needs a Chromium binary; discovered from the Playwright cache
#      or CHROME_BIN. Without one the site and the single file are still built.
#
# Usage:
#   python3 scripts/build_branding_delivery.py [output-dir]
# ==============================================================================

import os
import re
import shutil
import subprocess
import sys
import unicodedata
import urllib.parse

try:
    from markdown_it import MarkdownIt
except ImportError:
    sys.exit("Missing dependency: markdown_it (pip install markdown-it-py)")

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(REPO, "docs/nhilos/branding")
NH = os.path.join(REPO, "docs/nhilos")
OUT = os.path.abspath(sys.argv[1] if len(sys.argv) > 1
                      else os.path.join(REPO, "..", "nhilos-branding-entrega", "sitio"))

# Curated reading order, not alphabetical: governance first, then identity,
# then the claim registry every published assertion must trace to, then the
# website content contracts, then product content and media evidence.
ORDER = [
    ("gobernanza/nhilos_branding_document_governance_v1.0.md", "Gobernanza del set"),
    ("gobernanza/branding_reality_audit_v0.1.md", "Auditoría de realidad"),
    ("identidad/nhilos_brand_identity_brief_v0.1.md", "Brief de identidad de marca"),
    ("identidad/nhilos_design_kickoff_handover_v0.1.md", "Paquete de inicio para diseño"),
    ("claims/product_claim_audit_od02_v1.3.md", "Registro de claims (OD-02)"),
    ("web/nhilos_website_product_marketing_brief_v1.0.md", "Brief de marketing"),
    ("web/nhilos_website_information_architecture_content_wireframe_v1.0.md",
     "Arquitectura de información"),
    ("web/nhilos_website_homepage_content_v1.1.md", "Contenido de homepage"),
    ("web/nhilos_website_non_functional_spec_v1.0.md", "Spec no funcional del sitio"),
    ("producto/nhilos_pos_product_page_content_v1.1.md", "Contenido de página de producto"),
    ("producto/nhilos_pos_media_inventory_v1.0.md", "Inventario de medios"),
]

# Cited by the set, lives outside it. Included so no link dangles.
EXTRA = [
    ("nhilos_brand_experience_principles_v1.0.md", "Constitución de marca"),
    ("nhilos_pos_experience_standard_v1.0.md", "Estándar de experiencia POS"),
    ("nhilos_backoffice_experience_standard_v1.0.md", "Estándar de experiencia backoffice"),
    ("nhilos_backoffice_module_audit_template_v2.1.md", "Plantilla de auditoría de módulo"),
]
EXTRA_HTML = {n.replace(".md", ".html") for n, _ in EXTRA}

MD = MarkdownIt("commonmark").enable(["table", "strikethrough"])
RE_MDLINK = re.compile(r"\]\(([^)]+?)\.md(#[^)]*)?\)")
RE_DIRLINK = re.compile(r"\[([^\]]+)\]\((?:\.\./)+(?:docs/nhilos/)?manuals/[^)]*\)")
RE_HEADING = re.compile(r"<h([1-6])>(.*?)</h\1>", re.S)


def slug(text):
    """GitHub-compatible heading slug: lowercase, drop punctuation, spaces to hyphens."""
    text = text.strip().lower()
    text = re.sub(r"[`*_]", "", text).replace("\\", "")
    return "".join(
        c for c in text
        if c in (" ", "-")
        or unicodedata.category(c)[0] in ("L", "N", "M")
        or unicodedata.category(c) == "Pc"
    ).replace(" ", "-")


def strip_tags(text):
    text = re.sub(r"<[^>]+>", "", text)
    for entity, char in (("&amp;", "&"), ("&lt;", "<"), ("&gt;", ">"),
                         ("&quot;", '"'), ("&#39;", "'"), ("&nbsp;", " ")):
        text = text.replace(entity, char)
    return text


def assign_ids(body, prefix, single):
    """Give every rendered heading a stable id and return the page table of contents."""
    seen, toc = {}, []

    def repl(match):
        level, inner = int(match.group(1)), match.group(2)
        title = re.sub(r"\s+", " ", strip_tags(inner)).strip()
        base = slug(title)
        count = seen.get(base, 0)
        seen[base] = count + 1
        if count:
            base = f"{base}-{count}"
        full = f"{prefix}--{base}" if single else base
        toc.append((level, title, full))
        return f'<h{level} id="{full}">{inner}</h{level}>'

    return RE_HEADING.sub(repl, body), toc


def prep(markdown):
    markdown = RE_MDLINK.sub(lambda m: f"]({m.group(1)}.html{m.group(2) or ''})", markdown)
    return RE_DIRLINK.sub(r"\1", markdown)


def render(markdown, prefix, single):
    body, toc = assign_ids(MD.render(prep(markdown)), prefix, single)
    if single:
        def href(match):
            target = match.group(1)
            if target.startswith(("http", "mailto:")):
                return match.group(0)
            if target.startswith("#"):
                return f'href="#{prefix}--{target[1:]}"'
            path, _, anchor = target.partition("#")
            key = os.path.basename(path).replace(".html", "")
            return f'href="#{key}--{anchor}"'
        body = re.sub(r'href="([^"]+)"', href, body)
    return body, toc


def to_root(body, up):
    """Repoint links to the extra documents at the delivery root."""
    def repl(match):
        target = match.group(1)
        path, _, anchor = target.partition("#")
        if os.path.basename(path) in EXTRA_HTML:
            return f'href="{up}{os.path.basename(path)}' + (f"#{anchor}" if anchor else "") + '"'
        return match.group(0)
    return re.sub(r'href="([^"]+)"', repl, body)


NAV_HEAD = '<div class="brand">NHILOS — Documentación de marca<span>Set de branding y sitio web</span></div>'
PAGE = """<!doctype html><html lang="es"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>{title} — NHILOS</title><link rel="stylesheet" href="{up}assets/style.css"></head>
<body><div class="wrap"><nav>{nav}</nav><main>{body}{toc}{pager}</main></div></body></html>"""


def nav_for(current, up):
    parts = [NAV_HEAD]
    for path, title in ORDER:
        on = ' class="on"' if path == current else ""
        parts.append(f'<a href="{up}{path.replace(".md", ".html")}"{on}>{title}</a>')
    parts.append('<div class="sec">Documentos referenciados</div>')
    for path, title in EXTRA:
        on = ' class="on"' if path == current else ""
        parts.append(f'<a href="{up}{path.replace(".md", ".html")}"{on}>{title}</a>')
    parts.append('<div class="sec">Índice</div>')
    parts.append(f'<a href="{up}index.html"{" class=\'on\'" if current == "index" else ""}>README del set</a>')
    return "".join(parts)


def build_site():
    if os.path.exists(OUT):
        shutil.rmtree(OUT)
    os.makedirs(os.path.join(OUT, "assets"))

    for rel, title in ORDER:
        up = "../" * rel.count("/")
        markdown = open(os.path.join(SRC, rel), encoding="utf-8").read()
        body, toc_items = render(markdown, rel.replace("/", "-").replace(".md", ""), single=False)
        body = to_root(body, up)
        toc = '<div class="toc"><p>En esta página</p>' + "".join(
            f'<a class="l{level}" href="#{anchor}">{text}</a>'
            for level, text, anchor in toc_items if level in (2, 3)) + "</div>"
        index = next(i for i, (p, _) in enumerate(ORDER) if p == rel)
        previous = ORDER[index - 1] if index else None
        following = ORDER[index + 1] if index < len(ORDER) - 1 else None
        pager = ('<div class="pager"><span>'
                 + (f'<a href="{up}{previous[0].replace(".md", ".html")}">← {previous[1]}</a>' if previous else "")
                 + "</span><span>"
                 + (f'<a href="{up}{following[0].replace(".md", ".html")}">{following[1]} →</a>' if following else "")
                 + "</span></div>")
        destination = os.path.join(OUT, rel.replace(".md", ".html"))
        os.makedirs(os.path.dirname(destination), exist_ok=True)
        open(destination, "w", encoding="utf-8").write(
            PAGE.format(title=title, up=up, nav=nav_for(rel, up), body=body, toc=toc, pager=pager))

    for name, title in EXTRA:
        markdown = prep(open(os.path.join(NH, name), encoding="utf-8").read())
        body, toc_items = assign_ids(MD.render(markdown), "", False)
        body = re.sub(r'href="([^"]+)"', lambda m: f'href="{os.path.basename(m.group(1))}"'
                      if m.group(1).endswith(".html") and not m.group(1).startswith(("http", "#"))
                      else m.group(0), body)
        toc = '<div class="toc"><p>En esta página</p>' + "".join(
            f'<a class="l{level}" href="#{anchor}">{text}</a>'
            for level, text, anchor in toc_items if level in (2, 3)) + "</div>"
        open(os.path.join(OUT, name.replace(".md", ".html")), "w", encoding="utf-8").write(
            PAGE.format(title=title, up="", nav=nav_for(name, ""), body=body, toc=toc, pager=""))

    readme = open(os.path.join(SRC, "README.md"), encoding="utf-8").read()
    body, _ = render(readme, "index", single=False)
    body = to_root(body, "")
    open(os.path.join(OUT, "index.html"), "w", encoding="utf-8").write(
        PAGE.format(title="Documentación de marca", up="", nav=nav_for("index", ""),
                    body=body, toc="", pager=""))
    shutil.copy(os.path.join(os.path.dirname(os.path.abspath(__file__)), "branding_delivery.css"),
                os.path.join(OUT, "assets", "style.css"))


def build_single_and_pdf(css):
    everything = ORDER + list(EXTRA)
    parts = ['<!doctype html><html lang="es"><head><meta charset="utf-8">',
             '<meta name="viewport" content="width=device-width,initial-scale=1">',
             '<title>NHILOS — Documentación de marca</title><style>' + css + "</style></head>",
             '<body><main style="max-width:1000px;margin:0 auto;padding:44px 56px 90px">',
             '<h1 id="top">NHILOS — Documentación de marca</h1>',
             '<div class="toc"><p>Documentos incluidos</p>']
    for rel, title in everything:
        parts.append(f'<a href="#{os.path.basename(rel).replace(".md", "")}--top">{title}</a>')
    parts.append("</div><hr>")
    for rel, title in everything:
        source = os.path.join(NH, rel) if rel in {n for n, _ in EXTRA} else os.path.join(SRC, rel)
        body, _ = render(open(source, encoding="utf-8").read(),
                         os.path.basename(rel).replace(".md", ""), single=True)
        parts.append('<div style="page-break-before:always"></div>'
                     f'<h1 id="{os.path.basename(rel).replace(".md", "")}--top" style="margin-top:70px">{title}</h1>')
        parts.append(body)
        parts.append("<hr>")
    parts.append("</main></body></html>")
    single = os.path.join(OUT, "nhilos-branding-completo.html")
    open(single, "w", encoding="utf-8").write("\n".join(parts))

    chrome = os.environ.get("CHROME_BIN") or find_chrome()
    if not chrome:
        print("  PDF: skipped (no Chromium found; set CHROME_BIN to enable)")
        return
    subprocess.run([chrome, "--headless", "--disable-gpu", "--no-sandbox", "--no-pdf-header-footer",
                    f"--print-to-pdf={os.path.join(OUT, 'nhilos-branding.pdf')}", f"file://{single}"],
                   capture_output=True)
    print("  PDF: built")


def find_chrome():
    import glob
    for pattern in ("~/.cache/ms-playwright/chromium-*/chrome-linux64/chrome",
                    "~/.cache/ms-playwright/chromium-*/chrome-linux/chrome"):
        found = sorted(glob.glob(os.path.expanduser(pattern)))
        if found:
            return found[-1]
    for name in ("chromium", "chromium-browser", "google-chrome", "chrome"):
        path = shutil.which(name)
        if path:
            return path
    return None


def verify():
    """Every relative link and every anchor must resolve inside the delivery."""
    broken_files, broken_anchors, anchors = [], [], 0
    for directory, _, filenames in os.walk(OUT):
        if "assets" in directory:
            continue
        for filename in filenames:
            if not filename.endswith(".html"):
                continue
            page = os.path.join(directory, filename)
            html = open(page, encoding="utf-8").read()
            local_ids = set(re.findall(r'id="([^"]+)"', html))
            for match in re.finditer(r'href="([^"]+)"', html):
                href = match.group(1)
                if href.startswith(("http", "mailto:")) or href == "":
                    continue
                path, _, anchor = href.partition("#")
                if path:
                    target = os.path.normpath(os.path.join(directory, path))
                    if not os.path.exists(target):
                        broken_files.append(f"{os.path.relpath(page, OUT)} -> {href}")
                        continue
                    target_ids = (set(re.findall(r'id="([^"]+)"', open(target, encoding="utf-8").read()))
                                  if anchor else None)
                else:
                    target_ids = local_ids
                if anchor and target_ids is not None:
                    anchors += 1
                    if urllib.parse.unquote(anchor) not in target_ids:
                        broken_anchors.append(f"{os.path.relpath(page, OUT)} -> #{anchor}")
    return broken_files, broken_anchors, anchors


def main():
    css = open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "branding_delivery.css"),
               encoding="utf-8").read()
    build_site()
    build_single_and_pdf(css)
    broken_files, broken_anchors, anchors = verify()
    print(f"  pages: {len(ORDER)} + {len(EXTRA)} referenced + index")
    print(f"  anchors verified: {anchors} | broken links: {len(broken_files)} | broken anchors: {len(broken_anchors)}")
    for entry in (broken_files + broken_anchors)[:20]:
        print(f"    {entry}")
    if broken_files or broken_anchors:
        sys.exit("Delivery checks failed: a generated link does not resolve.")


if __name__ == "__main__":
    main()
