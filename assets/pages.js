/* The Maroon Ledger — page renderers. Each reads window.ML_DATA via ML. */
(function () {
  "use strict";
  var P = (window.MLPages = {});
  var ML = window.ML, D = ML.D;
  function $(s, r) { return (r || document).querySelector(s); }
  function on(ev, fn) { document.addEventListener(ev, fn); }
  function segment(el, fn) {
    el.querySelectorAll("button").forEach(function (b) {
      b.addEventListener("click", function () {
        el.querySelectorAll("button").forEach(function (x) { x.setAttribute("aria-pressed", x === b ? "true" : "false"); });
        fn(b.getAttribute("data-v"));
      });
    });
  }
  function segVal(el) { return el.querySelector('[aria-pressed="true"]').getAttribute("data-v"); }
  var BLUE = "#2f7fc4", MAROON = "#a3264e", GOLD = "#d88a10", INK = "#554a4d";

  /* ======================================================== OVERVIEW */
  function moneyPanel(el, kind, fy) {
    var isRev = kind === "revenue";
    var nodes = ML.tree(isRev ? "revenue" : "purpose", fy);
    var total = isRev ? D.series[fy].revenue : D.series[fy].expenses;
    var totalName = isRev ? "total revenue" : "total expenses";
    var stack = [];
    function render() {
      var cur = stack.length ? stack[stack.length - 1] : null;
      var list = cur ? cur.children : nodes;
      var listTotal = cur ? cur.value : total;
      el.innerHTML =
        '<p class="eyebrow">' + (isRev ? "Revenue · accrual" : "Expenses by purpose · accrual") + "</p>" +
        '<div class="tm-head"><h3>' + (cur ? ML.esc(cur.name) : isRev ? "Total revenue" : "Total expenses") + '</h3><span style="display:flex;gap:10px;align-items:center"><span class="fig">' + ML.bn(listTotal) +
        '</span><button class="info" type="button" aria-label="About this total">i</button></span></div>' +
        '<div class="crumbs">' + (cur ? '<button type="button" data-up>← Back to ' + (stack.length > 1 ? ML.esc(stack[stack.length - 2].name) : isRev ? "total revenue" : "total expenses") + "</button>" : "&nbsp;") + "</div>" +
        '<div class="treemap ' + (isRev ? "rev" : "exp") + '"></div>' +
        '<p class="tm-note">Share of ' + (cur ? ML.esc(cur.name).toLowerCase() : totalName) + "</p>" +
        '<div class="rows ' + (isRev ? "rev" : "exp") + '"></div>' +
        '<p class="small" style="margin-top:12px"><a href="budget.html#fy=' + fy + '" class="arrow-link">Read this in the Full Budget</a></p>';
      var tm = $(".treemap", el);
      ML.treemap(tm, list, { total: listTotal, totalName: cur ? cur.name : totalName, onDrill: function (n) { stack.push(n); render(); } });
      var rows = $(".rows", el);
      list.slice().sort(function (a, b) { return b.value - a.value; }).forEach(function (n) {
        var r = document.createElement("div");
        r.className = "rowi";
        r.innerHTML = '<span class="n">' + (n.children ? '<button type="button">' + ML.esc(n.name) + "</button>" : ML.esc(n.name)) + "</span>" +
          '<span class="v">' + ML.bn(n.value) + "<small>" + ML.pct((n.value / listTotal) * 100) + " of " + (cur ? ML.esc(cur.name).toLowerCase() : totalName) + "</small></span>" +
          '<button class="info" type="button" aria-label="About ' + ML.esc(n.name) + '">i</button>';
        if (n.children) $(".n button", r).addEventListener("click", function () { stack.push(n); render(); });
        $(".info", r).addEventListener("click", function () { ML.nodeInfo(n, fy, listTotal, cur ? cur.name : totalName); });
        rows.appendChild(r);
      });
      var up = $("[data-up]", el);
      if (up) up.addEventListener("click", function () { stack.pop(); render(); });
      $(".tm-head .info", el).addEventListener("click", function () {
        ML.info(isRev ? "Total revenue" : "Total expenses",
          "<p>" + (isRev ? "All revenue from transactions of the General Government Sector: taxes, Commonwealth grants, royalties, fees and charges, interest and dividends. It excludes revaluations and other economic flows."
            : "All expenses from transactions of the General Government Sector, grouped by the purpose they serve (the ABS Government Purpose Classification). It includes depreciation, a non-cash cost, and excludes capital purchases, which appear in the capital program.") + "</p>" +
          "<dl><dt>Amount</dt><dd>" + ML.bn(listTotal) + "</dd><dt>Year</dt><dd>" + ML.yearLabel(fy) + "</dd><dt>Source</dt><dd>" + ML.sourceLink(ML.yearInfo[fy].src, fy === "2025-26" || !ML.isActual(fy) ? "Table 8.1" : "Outcomes Report, Operating Statement by Sector") + "</dd></dl>" +
          (!isRev && !ML.isActual(fy) ? '<p class="small muted">Sub-purpose detail (for example, hospitals within Health) is published only for actual years, in the Report on State Finances.</p>' : ""));
      });
    }
    render();
    return render;
  }

  P.overview = function () {
    function draw() {
      var fy = ML.getFY(), s = D.series[fy], y = ML.yearInfo[fy];
      $("#hero-eyebrow").innerHTML = ML.disp(fy) + " " + ML.pill(fy);
      var mx = Math.max(s.revenue, s.expenses);
      $("#summary").innerHTML =
        '<div class="row"><div><div class="lab">Revenue</div><div class="fig">' + ML.bn(s.revenue) + '</div><div class="lab">Money earned</div></div>' +
        '<div><div class="inout"><div class="in" style="height:' + (s.revenue / mx) * 92 + 'px"></div><div class="out" style="height:' + (s.expenses / mx) * 92 + 'px"></div></div><div class="inout-lab"><span>In</span><span>Out</span></div></div>' +
        '<div class="right"><div class="lab">Expenses</div><div class="fig">' + ML.bn(s.expenses) + '</div><div class="lab">Costs incurred</div></div></div>' +
        '<div class="balance-line"><span><b>Net operating ' + ML.balanceWord(s.nob) + '</b><br><span class="small muted">Revenue less expenses, the State\'s headline measure</span></span><span class="fig double tnum">' + ML.bn(s.nob) + "</span></div>" +
        '<div class="subfigs"><div><b class="tnum">' + ML.bn(s.pnfa) + "</b>Spent on new assets (capital purchases)</div><div><b class=\"tnum\">" + ML.bn(s.fiscal_balance) + "</b>Fiscal balance, after capital spending</div></div>" +
        '<p class="small muted" style="margin-top:12px">' + ML.yearLabel(fy) + " · General Government Sector · <a href=\"sources.html\">Sources and exact figures</a></p>";
      $("#ftm-eyebrow").innerHTML = "Budget breakdown · " + ML.yearLabel(fy);
      moneyPanel($("#rev-panel"), "revenue", fy);
      moneyPanel($("#exp-panel"), "expenses", fy);

      // debt
      $("#debt-asat").textContent = "At " + ML.endOfYear(fy) + " · " + y.label;
      var cells = [
        ["General Government borrowing", s.ggs_borrowing, "Loans from Queensland Treasury Corporation, leases and similar arrangements, for the core of government."],
        ["General Government net debt", s.ggs_net_debt, "Borrowing and advances received, less cash, deposits, investments and advances paid."],
        ["Total public sector borrowing", s.nfps_borrowing, "Adds the borrowing of government-owned energy, water, port and rail businesses (Non-financial Public Sector)."],
      ];
      $("#debt").innerHTML = cells.map(function (c) {
        return '<div><h3>' + c[0] + '</h3><div class="fig" style="margin-top:10px">' + ML.bn(c[1]) + '</div><p class="small" style="margin:6px 0 10px"><b>' + ML.pct(ML.ofGSP(c[1], fy)) +
          " of gross state product</b> · " + ML.dollars(ML.perPerson(c[1], fy)) + ' per Queenslander</p><p class="small muted">' + c[2] + "</p></div>";
      }).join("");
      ML.lineChart($("#debt-chart"), {
        label: "Debt over time", highlight: fy,
        series: [
          { name: "Total public sector borrowing", color: GOLD, values: map("nfps_borrowing") },
          { name: "General Government borrowing", color: MAROON, values: map("ggs_borrowing") },
          { name: "General Government net debt", color: BLUE, values: map("ggs_net_debt") },
        ], legendEl: $("#debt-legend"),
      });

      // answer cards
      var hea = ML.find(ML.tree("purpose", fy), "fn.hea"), roy = ML.find(ML.tree("revenue", fy), "royalties"), gr = ML.find(ML.tree("revenue", fy), "grants");
      var cards = [
        ["What does health cost?", hea.value, ML.pct((hea.value / s.expenses) * 100) + " of total expenses · " + ML.dollars(ML.perPerson(hea.value, fy)) + " per person", "health"],
        ["How much comes from Canberra?", gr.value, ML.pct((gr.value / s.revenue) * 100) + " of revenue is Commonwealth grants and GST", "canberra"],
        ["How big are royalties?", roy.value, ML.pct((roy.value / s.revenue) * 100) + " of revenue, and the most volatile line in the Budget", "royalties"],
      ];
      $("#qcards").innerHTML = cards.map(function (c) {
        return '<a class="qcard" href="questions.html#' + c[3] + '"><span class="q">' + c[0] + '</span><span class="a">' + ML.bn(c[1]) + '</span><span class="small muted">' + c[2] + '</span><span class="small arrow-link">See the answer</span></a>';
      }).join("");

      // biggest change
      var prev = ML.prevYear(fy);
      if (prev) {
        var a = ML.tree("purpose", prev), b = ML.tree("purpose", fy), best = null;
        b.forEach(function (n) { var o = ML.find(a, n.id); if (o) { var d = n.value - o.value; if (!best || Math.abs(d) > Math.abs(best.d)) best = { n: n, o: o, d: d }; } });
        $("#changed").innerHTML = '<p class="small muted">' + ML.yearLabel(prev) + " → " + ML.yearLabel(fy) + '</p><h3 style="margin-top:8px">' + ML.esc(best.n.name) +
          '</h3><div class="total-chg">' + ML.bn(best.d, { sign: true }) + '</div><p class="small">' + ML.bn(best.o.value) + " → " + ML.bn(best.n.value) + " (" + ML.pct((best.d / best.o.value) * 100, 1, true) +
          '). The largest dollar change among spending purposes. Not adjusted for inflation.</p>';
      } else {
        $("#changed").innerHTML = '<p class="small muted">' + ML.yearLabel(fy) + " is the first year shown, so there is no earlier year to compare it with.</p>";
      }
    }
    function map(k) { var o = {}; ML.years.forEach(function (y) { o[y] = D.series[y][k]; }); return o; }
    // region teaser (2026-27 only)
    var R = D.regions.items.slice().sort(function (a, b) { return b.total / b.pop - a.total / a.pop; });
    var cairns = D.regions.items.filter(function (r) { return r.name === "Cairns"; })[0];
    var gb = D.regions.items.filter(function (r) { return r.greater_brisbane; });
    var gbT = gb.reduce(function (a, r) { return a + r.total; }, 0);
    $("#region-teaser").innerHTML = '<p class="small muted">' + ML.disp(D.regions.fy) + ' Budget · capital purchases</p><div class="total-chg">' + ML.pct(((D.regions.total - gbT) / D.regions.total) * 100) +
      '</div><p class="small">of planned capital purchases sit outside Greater Brisbane (the ABS area, which includes Moreton Bay; Treasury quotes 69.3% on a narrower area that also counts capital grants). Highest per resident: <b>' + ML.esc(R[0].name) + "</b> (" + ML.dollars((R[0].total * 1e6) / R[0].pop) +
      "). Cairns region: " + ML.bn(cairns.total) + ", or " + ML.dollars((cairns.total * 1e6) / cairns.pop) + " per resident.</p>";
    draw();
    on("fychange", draw);
    on("mlresize", draw);
  };

  /* ======================================================== QUESTIONS */
  var QUESTIONS = [
    { id: "go", q: "Where does the money go?", kind: "purpose" },
    { id: "come", q: "Where does the money come from?", kind: "revenue" },
    { id: "canberra", q: "How much comes from Canberra?", node: "grants", kind: "revenue", trend: "grants" },
    { id: "royalties", q: "How big are royalties, and how much do they swing?", node: "royalties", kind: "revenue", trend: "royalties" },
    { id: "taxes", q: "Which state taxes raise the most?", node: "tax", kind: "revenue", trend: "rev_tax" },
    { id: "health", q: "What does health cost?", node: "fn.hea", kind: "purpose", trend: "fn.hea" },
    { id: "education", q: "What does education spending cover?", node: "fn.edu", kind: "purpose", trend: "fn.edu" },
    { id: "safety", q: "How much goes on police, courts and prisons?", node: "fn.pos", kind: "purpose", trend: "fn.pos" },
    { id: "transport", q: "What is spent on transport?", node: "fn.tra", kind: "purpose", trend: "fn.tra", capital: "cx.tra" },
    { id: "wages", q: "How much of spending is wages?", node: "ty.emp", kind: "type", trend: "exp_employee" },
    { id: "interest", q: "How much goes on interest?", node: "ty.int", kind: "type", trend: "exp_interest" },
    { id: "capital", q: "How much is spent building things?", kind: "capital", trend: "pnfa" },
  ];

  function trendValues(key) {
    var o = {};
    ML.years.forEach(function (y) {
      if (D.series[y][key] !== undefined) o[y] = D.series[y][key];
      else {
        var n = ML.find(ML.tree(key.indexOf("fn.") === 0 ? "purpose" : "revenue", y), key);
        o[y] = n ? n.value : null;
      }
    });
    return o;
  }

  P.questions = function () {
    var list = $("#qlist"), ans = $("#answer");
    var cur = ML.hash().q || ML.hash()._ || "go";
    list.innerHTML = QUESTIONS.map(function (q) { return '<button type="button" data-q="' + q.id + '" aria-pressed="' + (q.id === cur) + '">' + q.q + "</button>"; }).join("");
    list.querySelectorAll("button").forEach(function (b) {
      b.addEventListener("click", function () {
        cur = b.getAttribute("data-q"); ML.setHash({ q: cur });
        list.querySelectorAll("button").forEach(function (x) { x.setAttribute("aria-pressed", x === b ? "true" : "false"); });
        draw(); if (window.innerWidth < 960) ans.scrollIntoView({ behavior: "smooth" });
      });
    });
    function draw() {
      var fy = ML.getFY(), s = D.series[fy], Q = QUESTIONS.filter(function (q) { return q.id === cur; })[0] || QUESTIONS[0];
      var html = '<p class="eyebrow">Answer · ' + ML.yearLabel(fy) + "</p><h2>" + Q.q + "</h2>";
      var nodes = ML.tree(Q.kind, fy), node = Q.node ? ML.find(nodes, Q.node) : null, sentence = "", sub = null, subTotal = 0, subName = "";
      var top = nodes.slice().sort(function (a, b) { return b.value - a.value; });
      switch (Q.id) {
        case "go":
          sentence = "<b>" + top[0].name + "</b> is the largest purpose: <b>" + ML.bn(top[0].value) + "</b>, " + ML.pct((top[0].value / s.expenses) * 100) + " of total expenses of " + ML.bn(s.expenses) + ". Health and education together account for " + ML.pct(((ML.find(nodes, "fn.hea").value + ML.find(nodes, "fn.edu").value) / s.expenses) * 100) + ".";
          sub = nodes; subTotal = s.expenses; subName = "total expenses"; break;
        case "come":
          sentence = "<b>" + top[0].name + "</b> is the largest source: <b>" + ML.bn(top[0].value) + "</b>, " + ML.pct((top[0].value / s.revenue) * 100) + " of total revenue of " + ML.bn(s.revenue) + ". The State's own taxes provide " + ML.pct((s.rev_tax / s.revenue) * 100) + ".";
          sub = nodes; subTotal = s.revenue; subName = "total revenue"; break;
        case "canberra":
          var gst = ML.find(nodes, "grants.gst");
          sentence = "Commonwealth grants and GST come to <b>" + ML.bn(node.value) + "</b>, " + ML.pct((node.value / s.revenue) * 100) + " of total revenue. GST alone is " + ML.bn(gst.value) + " (" + ML.pct((gst.value / s.revenue) * 100) + ").";
          sub = node.children; subTotal = node.value; subName = "grants"; break;
        case "royalties":
          var vals = trendValues("royalties"), act = ML.years.filter(ML.isActual), mx = act.reduce(function (a, y) { return vals[y] > vals[a] ? y : a; }), mn = act.reduce(function (a, y) { return vals[y] < vals[a] ? y : a; });
          sentence = "Royalties and land rents are <b>" + ML.bn(node.value) + "</b> in " + ML.disp(fy) + ", " + ML.pct((node.value / s.revenue) * 100) + " of revenue. Across the actual years shown they ranged from " + ML.bn(vals[mn]) + " (" + ML.disp(mn) + ") to " + ML.bn(vals[mx]) + " (" + ML.disp(mx) + "), mostly reflecting world coal prices.";
          sub = node.children; subTotal = node.value; subName = "royalties and land rents"; break;
        case "taxes":
          var t = node.children.slice().sort(function (a, b) { return b.value - a.value; });
          sentence = "<b>" + t[0].name + "</b> raises the most: <b>" + ML.bn(t[0].value) + "</b>, " + ML.pct((t[0].value / node.value) * 100) + " of State taxation of " + ML.bn(node.value) + ". Next is " + t[1].name.toLowerCase() + " at " + ML.bn(t[1].value) + ".";
          sub = node.children; subTotal = node.value; subName = "taxation"; break;
        case "wages":
          var sup = ML.find(nodes, "ty.sup");
          sentence = "Employee expenses are <b>" + ML.bn(node.value) + "</b>, " + ML.pct((node.value / s.expenses) * 100) + " of total expenses. Add superannuation and it is " + ML.pct(((node.value + sup.value) / s.expenses) * 100) + ".";
          sub = nodes; subTotal = s.expenses; subName = "total expenses"; break;
        case "interest":
          sentence = "Interest on borrowings is <b>" + ML.bn(node.value) + "</b>, " + ML.pct((node.value / s.expenses) * 100) + " of total expenses, or " + ML.dollars(ML.perPerson(node.value, fy)) + " per Queenslander. General Government borrowing at " + ML.endOfYear(fy) + " is " + ML.bn(s.ggs_borrowing) + ".";
          break;
        case "capital":
          var cx = nodes.slice().sort(function (a, b) { return b.value - a.value; });
          sentence = "Capital purchases (new roads, hospitals, schools and other assets) are <b>" + ML.bn(s.pnfa) + "</b>. <b>" + cx[0].name + "</b> takes the most, " + ML.bn(cx[0].value) + " or " + ML.pct((cx[0].value / s.pnfa) * 100) + ".";
          sub = nodes; subTotal = s.pnfa; subName = "capital purchases"; break;
        default:
          sentence = "<b>" + node.name + "</b> expenses are <b>" + ML.bn(node.value) + "</b>, " + ML.pct((node.value / s.expenses) * 100) + " of total expenses, or " + ML.dollars(ML.perPerson(node.value, fy)) + " per Queenslander.";
          if (Q.capital) { var c = ML.find(ML.tree("capital", fy), Q.capital); sentence += " On top of that, " + ML.bn(c.value) + " is planned for new transport assets, " + ML.pct((c.value / s.pnfa) * 100) + " of all General Government capital purchases."; }
          if (Q.id === "health") sentence += ' <a href="portfolios.html#queensland-health">See Queensland Health and the 16 Hospital and Health Services</a>.';
          if (node.children) { sub = node.children; subTotal = node.value; subName = node.name.toLowerCase(); }
          else sentence += ' <span class="muted">A breakdown within this purpose is published only for actual years (2021–22 to 2024–25), in the Report on State Finances.</span>';
      }
      html += '<p class="big">' + sentence + "</p>";
      if (sub) {
        html += '<div class="' + (Q.kind === "revenue" ? "rev" : "exp") + '" style="margin-top:22px"><div class="treemap" style="aspect-ratio:16/8"></div><div class="rows" style="margin-top:12px"></div></div>';
      }
      if (Q.trend) html += '<div class="card" style="margin-top:24px"><h3>Over time</h3><div class="chart" id="qtrend"></div></div>';
      html += '<p class="small" style="margin-top:16px">Source: ' + ML.sourceLink(ML.yearInfo[fy].src) + '. <a href="budget.html#fy=' + fy + '">Continue in the Full Budget</a>.</p>';
      ans.innerHTML = html;
      if (sub) {
        ML.treemap($(".treemap", ans), sub, { total: subTotal, totalName: subName });
        var rows = $(".rows", ans);
        sub.slice().sort(function (a, b) { return b.value - a.value; }).forEach(function (n) {
          var r = document.createElement("div"); r.className = "rowi";
          r.innerHTML = '<span class="n">' + ML.esc(n.name) + '</span><span class="v">' + ML.bn(n.value) + "<small>" + ML.pct((n.value / subTotal) * 100) + " of " + ML.esc(subName) + '</small></span><button class="info" type="button" aria-label="About">i</button>';
          $(".info", r).addEventListener("click", function () { ML.nodeInfo(n, fy, subTotal, subName); });
          rows.appendChild(r);
        });
      }
      if (Q.trend) ML.barChart($("#qtrend"), { values: trendValues(Q.trend), color: Q.kind === "revenue" ? BLUE : MAROON, highlight: fy, name: Q.q.replace("?", "") });
    }
    draw();
    on("fychange", draw);
    on("mlresize", draw);
  };
})();
