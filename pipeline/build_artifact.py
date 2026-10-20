"""Build a self-contained copy of the site for publishing as a claude.ai Artifact.

Each page gets the CSS and all JavaScript (including data.js) inlined, because Artifact pages
should not depend on separately loaded scripts. The Overview page is written without
doctype/html/head/body tags, since the Artifact publisher wraps the root page itself.
Run after build_data.py and build_pages.py:  python3 build_artifact.py
Output: ../artifact/
"""
import re
from pathlib import Path

ROOT = Path(__file__).parent.parent
SITE, OUT = ROOT / "site", ROOT / "artifact"
OUT.mkdir(exist_ok=True)
A = SITE / "assets"
css = (A / "style.css").read_text()
js = "\n".join((A / f).read_text().replace("</script", "<\\/script")
               for f in ["data.js", "app.js", "pages.js", "pages-more.js", "pages-portfolios.js"])
FONTS = '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Source+Serif+4:opsz,wght@8..60,400;8..60,600&display=swap">'

for page in sorted(SITE.glob("*.html")):
    h = page.read_text()
    h = h.replace('<link rel="stylesheet" href="assets/style.css">', f"<style>\n{css}\n</style>")
    h = re.sub(r'<script src="assets/[^"]+"></script>\n?', "", h)
    h = re.sub(r'<link rel="(icon|apple-touch-icon|manifest)"[^>]*>\n', "", h)
    h = h.replace("</body>", f"<script>\n{js}\n</script>\n</body>")
    if page.name == "index.html":
        title = "<title>The Maroon Ledger</title>"
        desc = re.search(r'<meta name="description"[^>]*>', h).group(0)
        style = re.search(r"<style>.*?</style>", h, re.S).group(0)
        body = re.search(r'<body data-page="overview">\n(.*)</body>', h, re.S).group(1)
        h = "\n".join([title, desc, '<link rel="preconnect" href="https://fonts.googleapis.com">', FONTS, style,
                       '<div data-page="overview" hidden></div>', body])
    (OUT / page.name).write_text(h)
    print(page.name, len(h) // 1024, "KB")
