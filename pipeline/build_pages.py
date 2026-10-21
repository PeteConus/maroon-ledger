"""Stamp out the static HTML shells. Content is rendered by assets/pages.js from assets/data.js.
Run: python3 build_pages.py
"""
from pathlib import Path

SITE = Path(__file__).parent.parent / "site"

HEAD = """<!doctype html>
<html lang="en-AU">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{title}</title>
<meta name="description" content="{desc}">
<link rel="icon" href="assets/icons/favicon.ico" sizes="16x16 32x32 48x48">
<link rel="icon" href="assets/icons/favicon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="assets/icons/apple-touch-icon.png">
<link rel="manifest" href="assets/icons/site.webmanifest">
<meta name="theme-color" content="#73182c">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Source+Serif+4:opsz,wght@8..60,400;8..60,600&display=swap">
<link rel="stylesheet" href="assets/style.css">
</head>
<body data-page="{page}">
<a class="skip" href="#content">Skip to content</a>
<header id="site-header"></header>
<div id="context-bar"{yearattr}></div>
<noscript><div class="noscript wrap">The Maroon Ledger needs JavaScript switched on to draw its tables and charts.</div></noscript>
<main id="content">
{main}
</main>
<footer id="site-footer"></footer>
<script src="assets/data.js"></script>
<script src="assets/app.js"></script>
<script src="assets/pages.js"></script>
<script src="assets/pages-more.js"></script>
<script src="assets/pages-portfolios.js"></script>
</body>
</html>
"""

PAGES = {
    "index.html": ("overview", "The Maroon Ledger: Queensland Budget, made clear",
                   "Where Queensland's money comes from, where it goes, and how the pieces fit, from official Budget figures.", True,
                   """
<section class="hero"><div class="wrap">
  <div>
    <p class="eyebrow" id="hero-eyebrow"></p>
    <h1>Queensland's priorities.<br><em>One ledger.</em></h1>
    <p class="lede" style="margin-top:14px">What the State expects to collect, what it plans to spend, and how the pieces fit together. Built from Queensland Treasury's own published figures.</p>
  </div>
  <div class="summary" id="summary"></div>
</div></section>

<section class="section"><div class="wrap">
  <div class="section-head"><div><p class="eyebrow" id="ftm-eyebrow"></p><h2>Follow the money.</h2>
  <p>Select a tile marked ↘ to see what is inside it. Select ⓘ for an explanation and the source.</p></div></div>
  <div class="grid-2">
    <div class="rev" id="rev-panel"></div>
    <div class="exp" id="exp-panel"></div>
  </div>
  <p class="tm-note">Each graphic shows shares of its own total. Revenue and expenses are on an accrual basis, as Queensland reports them: income earned and costs incurred in the year, not cash received and paid.</p>
</div></section>

<section class="section"><div class="wrap">
  <div class="section-head"><div><p class="eyebrow">The year-end position</p><h2>Borrowing and debt.</h2>
  <p>The operating statement shows a year's income and costs. These figures show what the State owes at the end of it.</p></div></div>
  <p class="small" id="debt-asat" style="font-weight:600"></p>
  <div class="debt-grid" id="debt"></div>
  <details class="more"><summary>What's the difference between borrowing and net debt?</summary>
    <div class="prose"><p><b>Borrowing</b> is the total the government owes: mostly loans from Queensland Treasury Corporation, plus leases and similar arrangements.</p>
    <p><b>Net debt</b> subtracts the cash, deposits, investments and advances the government holds. Queensland holds large investments (much of it set aside for public servants' superannuation), so net debt is well below borrowing.</p>
    <p>The <b>General Government Sector</b> is the core of government: departments and agencies funded mainly by taxes and grants. The <b>Non-financial Public Sector</b> adds government-owned businesses such as the energy, water and port corporations, whose borrowing pays for their own assets.</p></div></details>
  <details class="more" id="debt-chart-wrap"><summary>See debt over time</summary><div class="chart" id="debt-chart"></div><div class="legend" id="debt-legend"></div>
  <p class="chart-note">$ billion at 30 June. Solid lines are actual outcomes; dashed lines are estimates and projections. Not adjusted for inflation.</p></details>
</div></section>

<section class="section"><div class="wrap">
  <div class="section-head"><div><p class="eyebrow">Questions</p><h2>A few useful answers.</h2></div><a class="arrow-link" href="questions.html">See all questions</a></div>
  <div class="grid-3" id="qcards"></div>
</div></section>

<section class="section"><div class="wrap">
  <div class="grid-2">
    <div><p class="eyebrow">What changed?</p><h2>The biggest move.</h2><div id="changed" style="margin-top:16px"></div>
    <a class="arrow-link" href="changes.html">See how revenue and spending changed</a></div>
    <div><p class="eyebrow">Regions</p><h2>Where the capital goes.</h2><div id="region-teaser" style="margin-top:16px"></div>
    <a class="arrow-link" href="regions.html">Find your region</a></div>
  </div>
</div></section>
"""),
    "questions.html": ("questions", "Questions: The Maroon Ledger", "Plain answers to common questions about the Queensland Budget, with the figures behind them.", True,
                       """
<section class="section"><div class="wrap">
  <h1>Good questions deserve figures.</h1>
  <p class="lede" style="margin:12px 0 28px">Twelve ways into the Queensland Budget. Choose a question and a financial year to see the published figures.</p>
  <div class="q-layout"><div class="q-list" id="qlist" role="group" aria-label="Questions"></div><div class="answer" id="answer" aria-live="polite"></div></div>
</div></section>
"""),
    "changes.html": ("changes", "What changed? The Maroon Ledger", "How Queensland's revenue, spending and operating balance have moved over time.", False,
                     """
<section class="section"><div class="wrap">
  <h1>What changed?</h1>
  <p class="lede" style="margin:12px 0 28px">Compare published revenue and spending across financial years. A change in a figure does not, on its own, explain why it changed.</p>
  <div class="grid-2">
    <div class="card"><h3>Revenue and expenses over time</h3><p class="small muted">General Government Sector, accrual, $ billion</p><div class="chart" id="c-revexp"></div><div class="legend" id="l-revexp"></div></div>
    <div class="card"><h3>Net operating balance over time</h3><p class="small muted">Revenue less expenses, $ billion. Above zero is a surplus.</p><div class="chart" id="c-nob"></div><div class="legend" id="l-nob"></div></div>
  </div>
  <p class="chart-note">Solid: actual outcomes. Dashed: 2025–26 estimated actual, the 2026–27 Budget and projections. Amounts are nominal, not adjusted for inflation.</p>
</div></section>
<section class="section"><div class="wrap">
  <div class="compare-bar"><span class="w">Compare</span><select id="fyA" aria-label="First year"></select><span class="w">with</span><select id="fyB" aria-label="Second year"></select>
  <span class="seg" id="view" role="group" aria-label="Expense view"><button type="button" aria-pressed="true" data-v="purpose">By purpose</button><button type="button" aria-pressed="false" data-v="type">By type</button></span></div>
  <div class="grid-2"><div class="card" id="cmp-rev"></div><div class="card" id="cmp-exp"></div></div>
  <p class="chart-note">Ranked by dollar movement. Nominal amounts. Categories are compared only where the published definitions match; sub-categories within revenue are not shown here because some are classified differently between the Report on State Finances and the Budget papers.</p>
</div></section>
"""),
    "budget.html": ("budget", "Full Budget: The Maroon Ledger", "Search every published line of the Queensland General Government Sector budget, with % of GSP and per-person figures.", True,
                    """
<section class="section"><div class="wrap">
  <h1>Full Budget.</h1>
  <p class="lede" style="margin:12px 0 4px">Every published line in one ledger. Open a line for its detail and source.</p>
  <div class="controls">
    <label class="ctl">Basis<span class="seg" id="basis"><button type="button" aria-pressed="true" data-v="accrual">Accrual</button><button type="button" aria-pressed="false" data-v="cash">Cash</button></span></label>
    <label class="ctl">Years<span class="seg" id="mode"><button type="button" aria-pressed="true" data-v="single">Single year</button><button type="button" aria-pressed="false" data-v="all">All years</button></span></label>
    <label class="ctl">Expenses shown<span class="seg" id="expview"><button type="button" aria-pressed="true" data-v="purpose">By purpose</button><button type="button" aria-pressed="false" data-v="type">By type</button></span></label>
    <label class="ctl grow">Search<input type="search" id="q" placeholder="Try payroll tax, hospitals or coal"></label>
  </div>
  <p class="small"><button class="btn-link" id="explain-basis" type="button">What do accrual and cash mean?</button></p>
  <div id="ledger"></div>
  <div class="card" style="margin-top:28px" id="context-card"></div>
</div></section>
"""),
    "portfolios.html": ("portfolios", "Portfolios: The Maroon Ledger", "Each Queensland department's 2026-27 Service Delivery Statement: spending by service area, staff and service standards, plus the 16 Hospital and Health Services.", False,
                        """
<section class="section"><div class="wrap">
  <h1>Portfolios.</h1>
  <p class="lede" style="margin:12px 0 18px">Each department's own Budget statement: what it spends on each service, how many people it employs, and how it measured up against the targets it set.</p>
  <div class="pf-kpis" id="pf-summary"></div>
  <div class="card tint small" style="margin:18px 0 24px"><b>Why these don't add up to the Budget total.</b> Departmental figures come from each portfolio's Service Delivery Statement. They include payments between agencies and exclude amounts a department administers on behalf of the State, so adding them up does not give the $105.8bn of General Government expenses. Read them department by department. Every statement shows three columns: the 2025–26 Budget, the 2025–26 estimated actual and the 2026–27 Budget; there are no projections beyond 2026–27.</div>
  <div class="pf-grid">
    <div>
      <div class="controls" style="margin:0 0 12px"><label class="ctl">Sort<select id="pf-sort"><option value="exp">2026–27 expenses</option><option value="chg">Change on 2025–26</option><option value="fte">Staff (FTEs)</option><option value="name">Name</option></select></label>
      <label class="ctl grow">Find<input type="search" id="pf-q" placeholder="Department or service, e.g. hospitals"></label></div>
      <div id="pf-list" class="pf-list"></div>
    </div>
    <div id="pf-detail" class="pf-detail" aria-live="polite"></div>
  </div>
</div></section>
"""),
    "bottom-line.html": ("bottomline", "Bottom line: The Maroon Ledger", "Why Queensland's operating balance forecast moved between updates: government decisions versus the economy and other revisions.", False,
                         """
<section class="section"><div class="wrap">
  <h1>What moved the bottom line?</h1>
  <div class="prose" style="margin:14px 0 26px">
  <p class="lede">Each Budget update reconciles the new forecast for the net operating balance against the last one, line by line.</p>
  <p>Some lines are the government's own decisions: new spending and revenue measures. Others come from outside its direct control: tax receipts running ahead or behind, coal prices moving royalties, the GST pool being shared differently, Commonwealth disaster funding arriving in a different year. Reading the two together is a fairer way to judge a Budget than looking at the surplus or deficit alone, whoever is in government.</p></div>
  <div class="controls"><label class="ctl">Publication<select id="pub"></select></label><label class="ctl">Year<select id="ryear"></select></label></div>
  <div class="grid-2" style="align-items:start">
    <div><div class="tbl-wrap"><table class="ledger" id="recon"></table></div>
    <p class="chart-note" id="recon-note"></p></div>
    <div class="card"><h3 id="wf-title"></h3><p class="small muted">$ million. Positive values improve the balance.</p><div class="chart" id="waterfall"></div>
    <div class="legend"><span><i style="background:#8c1f3d"></i>Government decisions</span><span><i style="background:#2f7fc4"></i>Economy and other revisions</span><span><i style="background:#554a4d"></i>Opening and closing balance</span></div></div>
  </div>
  <div class="card tint" style="margin-top:28px"><h3>How we group the lines</h3><p class="small">The line items and figures are exactly as published. The grouping into “government decisions” and “economy and other revisions” is ours. We count revenue measures, expense measures and the additional enterprise bargaining provision as decisions; everything else, including “other parameter adjustments”, as revisions. Treasury notes that other parameter adjustments include Commonwealth funding revisions, flows from government-owned corporations, interest, depreciation, lapses and deferrals, so a small part of that line may reflect earlier decisions.</p></div>
</div></section>
"""),
    "regions.html": ("regions", "Regions: The Maroon Ledger", "Queensland's 2026-27 capital program by region, in total and per resident.", False,
                     """
<section class="section"><div class="wrap">
  <h1>Where the capital goes.</h1>
  <p class="lede" style="margin:12px 0 4px">Planned 2026–27 capital purchases across Queensland's 19 statistical regions, from the Budget Capital Statement.</p>
  <div class="controls"><label class="ctl">Show<span class="seg" id="metric"><button type="button" aria-pressed="false" data-v="total">Total $</button><button type="button" aria-pressed="true" data-v="pp">Per resident</button></span></label>
  <label class="ctl">Agency<select id="agency"><option value="">All agencies</option></select></label></div>
  <div class="grid-2 reg-grid" style="align-items:start">
    <div><div id="reg-chart"></div><div class="legend"><span><i style="background:#2f7fc4"></i>Greater Brisbane</span><span><i style="background:#a3264e"></i>Rest of Queensland</span></div></div>
    <div class="reg-detail card" id="reg-detail"></div>
  </div>
  <div class="prose" style="margin-top:28px"><h3>Reading this page</h3>
  <p class="small">These are capital purchases (buildings, roads, equipment and other non-financial assets) planned for 2026–27 by Queensland Government entities, including government-owned corporations. They are not operating spending, and they do not include capital grants paid to councils and others. The “Queensland Treasury” line includes the government-owned energy, water and port businesses, which is why regions hosting large energy projects rank high. Treasury spreads its contingency reserve across regions in proportion to each region's capital spend. Per-resident figures divide by the ABS estimated resident population at 30 June 2025. Regions follow the ABS Statistical Area Level 4 boundaries: “Cairns” is the Cairns SA4, which takes in Cairns, the Cassowary Coast, Port Douglas and the Daintree, and the eastern Tablelands; Cape York, the Torres Strait and the Gulf sit in “Queensland – Outback”.</p></div>
</div></section>
"""),
    "track-record.html": ("track", "Track record: The Maroon Ledger", "How Queensland Budget forecasts compared with what actually happened.", False,
                          """
<section class="section"><div class="wrap">
  <h1>Budget versus outcome.</h1>
  <p class="lede" style="margin:12px 0 28px">For each year, what the Budget said in June, and what the Report on State Finances recorded after the year closed.</p>
  <div class="controls"><label class="ctl">Measure<span class="seg" id="measure"><button type="button" aria-pressed="true" data-v="nob">Operating balance</button><button type="button" aria-pressed="false" data-v="revenue">Revenue</button><button type="button" aria-pressed="false" data-v="expenses">Expenses</button><button type="button" aria-pressed="false" data-v="ggs_net_debt">Net debt</button></span></label></div>
  <div class="grid-2" style="align-items:start">
    <div class="card"><h3 id="tr-title"></h3><div class="chart" id="tr-chart"></div><div class="legend"><span><i style="background:#d6c6c0;height:10px"></i>Budget estimate</span><span><i style="background:#73182c;height:10px"></i>Outcome</span><span><i style="background:#fff;border:2px dashed #73182c;height:10px"></i>Estimated actual (not final)</span></div></div>
    <div><div class="tbl-wrap"><table class="ledger" id="tr-table"></table></div><p class="chart-note" id="tr-note"></p></div>
  </div>
</div></section>
<section class="section"><div class="wrap">
  <h2>How the forecast moved.</h2>
  <p class="lede" style="margin:10px 0 18px">Each line is one Budget's path for the measure. The maroon line is what happened.</p>
  <div class="card"><div class="chart" id="vint-chart"></div><div class="legend" id="vint-legend"></div>
  <p class="chart-note">Each Budget publishes four years: the Budget year and three projection years. The gold line is the current 2026–27 Budget. Comparing forecasts with outcomes says nothing on its own about whether a forecast was reasonable when it was made.</p></div>
</div></section>
"""),
    "sources.html": ("sources", "Sources and method: The Maroon Ledger", "The official sources, definitions, calculations and limitations behind The Maroon Ledger.", False,
                     """
<section class="section"><div class="wrap">
  <h1>Official figures. Traceable sources.</h1>
  <p class="lede" style="margin:12px 0 24px">Every number on this site is read from a Queensland Treasury publication, the Queensland Government open data portal or the Australian Bureau of Statistics by a script that can be re-run and audited.</p>
  <div id="sources-body"></div>
</div></section>
"""),
    "about.html": ("about", "About: The Maroon Ledger", "About The Maroon Ledger, an independent guide to the Queensland State Budget.", False,
                   """
<section class="section"><div class="wrap prose">
  <h1>About The Maroon Ledger.</h1>
  <p class="lede" style="margin-top:14px">A state Budget says a lot about a state's priorities. Understanding it shouldn't take an economics degree, or a weekend with a stack of Budget papers.</p>
  <p>The Maroon Ledger brings Queensland's published Budget figures together in a form you can follow: where the money comes from, where it goes, what has changed, how forecasts have tracked against outcomes, and where the State plans to build.</p>
  <h2 style="margin-top:28px">Independent, with the sources in view</h2>
  <p>This is an independent project. It is not a Queensland Government publication and is not affiliated with any political party. We use official published sources and link back to them. We explain what the figures mean and leave readers to form their own views about the choices behind them.</p>
  <p>Some distinctions matter, so we keep them visible. Revenue and expenses are not the same as cash received and paid. An estimate is not an outcome. A change in a number does not, by itself, say why it changed. Where the published information doesn't support a deeper answer, we say so.</p>
  <h2 style="margin-top:28px" id="corrections">Corrections</h2>
  <p>If you spot an error or something that is unclear, please tell us which page, financial year and line you mean, so we can check it against the source.</p>
  <p>Email: <b style="user-select:all">pete@conus.com.au</b></p>
  <h2 style="margin-top:28px">Who made it</h2>
  <p>The Maroon Ledger was created by Conus Business Consultancy Services, Far North Queensland.</p>
  <h2 style="margin-top:28px" id="privacy">Privacy</h2>
  <p>The Maroon Ledger has no accounts, advertising, analytics or tracking cookies, and asks for no personal information.</p>
  <p>The site is hosted on GitHub Pages. Like any web host, GitHub logs technical information when pages are requested, including your IP address, for security purposes; see <a href="https://docs.github.com/en/site-policy/privacy-policies/github-general-privacy-statement" target="_blank" rel="noopener">GitHub's privacy statement</a>. The site's fonts are loaded from Google Fonts, which also receives your IP address.</p>
  <p>Your browser remembers the financial year you last chose, in its local storage on your own device. Nothing is sent back to us.</p>
  <p>If you email us, we use your message only to reply or to correct the site. If you run a downloaded copy from your own computer, it sends nothing anywhere apart from the font request.</p>
</div></section>
"""),
}

for fn, (page, title, desc, year, main) in PAGES.items():
    (SITE / fn).write_text(HEAD.format(title=title, desc=desc, page=page, main=main.strip(),
                                       yearattr=' data-year' if year else ""))
print("wrote", len(PAGES), "pages")
