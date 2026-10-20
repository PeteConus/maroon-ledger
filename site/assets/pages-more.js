/* The Maroon Ledger — page renderers, part 2 */
(function () {
  "use strict";
  var P = window.MLPages, ML = window.ML, D = ML.D;
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
  function col(k) { var o = {}; ML.years.forEach(function (y) { o[y] = D.series[y][k]; }); return o; }
  var BLUE = "#2f7fc4", MAROON = "#a3264e", GOLD = "#d88a10", INK = "#554a4d";

  /* ======================================================== WHAT CHANGED */
  P.changes = function () {
    var A = $("#fyA"), B = $("#fyB"), view = $("#view");
    var h = ML.hash();
    var b0 = h.b && ML.yearInfo[h.b] ? h.b : D.currentBudget, a0 = h.a && ML.yearInfo[h.a] ? h.a : ML.prevYear(b0);
    A.innerHTML = ML.yearOptions(a0); B.innerHTML = ML.yearOptions(b0);
    function charts() {
      ML.lineChart($("#c-revexp"), { label: "Revenue and expenses", series: [
        { name: "Revenue", color: BLUE, values: col("revenue") }, { name: "Expenses", color: MAROON, values: col("expenses") }], legendEl: $("#l-revexp") });
      ML.barChart($("#c-nob"), { label: "Net operating balance", name: "Net operating balance", values: col("nob"), color: function (v) { return v >= 0 ? BLUE : MAROON; } });
      $("#l-nob").innerHTML = '<span><i style="background:' + BLUE + ';height:10px"></i>Surplus</span><span><i style="background:' + MAROON + ';height:10px"></i>Deficit</span><span><i style="background:#fff;border:2px dashed ' + INK + ';height:10px"></i>Estimate, Budget or projection</span>';
    }
    function card(el, title, eyebrow, a, b, ta, tb, fya, fyb) {
      var rows = b.map(function (n) { var o = ML.find(a, n.id); return o ? { n: n, o: o, d: n.value - o.value } : null; }).filter(Boolean)
        .sort(function (x, y) { return Math.abs(y.d) - Math.abs(x.d); });
      var mx = Math.max.apply(null, rows.map(function (r) { return Math.abs(r.d); })) || 1;
      el.innerHTML = '<p class="eyebrow">' + eyebrow + "</p><h3>" + title + '</h3><p class="small muted" style="margin-top:6px">' + ML.yearLabel(fya) + " → " + ML.yearLabel(fyb) + "</p>" +
        '<p style="margin:8px 0 0">' + ML.bn(ta) + " → " + ML.bn(tb) + '</p><div class="total-chg">' + ML.bn(tb - ta, { sign: true }) + ' <span class="small muted">' + ML.pct(((tb - ta) / Math.abs(ta)) * 100, 1, true) + "</span></div>" +
        rows.map(function (r) {
          var w = (Math.abs(r.d) / mx) * 50;
          return '<div class="chg"><span class="n">' + ML.esc(r.n.name) + "<small>" + ML.bn(r.o.value) + " → " + ML.bn(r.n.value) + " · " + ML.pct((r.d / r.o.value) * 100, 1, true) +
            '</small></span><span class="bar"><span class="mid"></span><span class="b ' + (r.d >= 0 ? "up" : "down") + '" style="width:' + w + '%"></span></span><span class="d">' + ML.bn(r.d, { sign: true }) + "</span></div>";
        }).join("");
    }
    function compare() {
      var a = A.value, b = B.value; ML.setHash({ a: a, b: b, fy: null });
      card($("#cmp-rev"), "Total revenue", "Revenue · accrual", ML.tree("revenue", a), ML.tree("revenue", b), D.series[a].revenue, D.series[b].revenue, a, b);
      var v = segVal(view);
      card($("#cmp-exp"), "Total expenses", v === "purpose" ? "Expenses by purpose · accrual" : "Expenses by type · accrual", ML.tree(v, a), ML.tree(v, b), D.series[a].expenses, D.series[b].expenses, a, b);
    }
    A.addEventListener("change", compare); B.addEventListener("change", compare); segment(view, compare);
    charts(); compare();
    on("mlresize", charts);
  };

  /* ======================================================== FULL BUDGET (ledger) */
  P.budget = function () {
    var basisEl = $("#basis"), modeEl = $("#mode"), expEl = $("#expview"), q = $("#q");
    var open = {};
    $("#explain-basis").addEventListener("click", function () {
      ML.info("Accrual and cash", "<p><b>Accrual</b> figures record revenue when it is earned and expenses when they are incurred, whether or not cash has changed hands. They include non-cash costs such as depreciation. Queensland's headline measure, the net operating balance, is on this basis.</p><p><b>Cash</b> figures record money actually received and paid in the year. The cash surplus or deficit also subtracts cash spent on new assets.</p><p>The two can differ because, for example, a tax assessed in June may be paid in July, or a grant received this year may relate to work done next year.</p>");
    });
    function cell(v, fy, kind) {
      if (v === null || v === undefined) return "<td>–</td>";
      if (kind === "gsp") return "<td>" + ML.pct(ML.ofGSP(v, fy), 2) + "</td>";
      if (kind === "pp") return "<td>" + ML.dollars(ML.perPerson(v, fy)) + "</td>";
      return '<td class="' + (v < 0 ? "neg" : "") + '">' + ML.mn(v) + "</td>";
    }
    function build() {
      var fy = ML.getFY(), basis = segVal(basisEl), mode = segVal(modeEl), ev = segVal(expEl), term = q.value.trim().toLowerCase();
      var yrs = mode === "single" ? [fy] : ML.years;
      var head = mode === "single"
        ? "<th>Budget item</th><th>Amount ($m)</th><th>% of GSP</th><th>Per person ($)</th>"
        : "<th>Budget item ($m)</th>" + yrs.map(function (y) { return "<th>" + ML.disp(y) + "<br><span style='font-weight:400;text-transform:none;letter-spacing:0'>" + ML.yearInfo[y].label + "</span></th>"; }).join("");
      var body = "", rowId = 0;
      function vals(getter) {
        if (mode === "single") return cell(getter(fy), fy) + cell(getter(fy), fy, "gsp") + cell(getter(fy), fy, "pp");
        return yrs.map(function (y) { return cell(getter(y), y); }).join("");
      }
      function match(name) { return !term || name.toLowerCase().indexOf(term) >= 0; }
      function addNodes(kind, lvl, path, parentId) {
        // path: array of ids from root
        var base = ML.tree(kind, ML.years.indexOf(fy) >= 0 ? fy : ML.years[0]);
        var ref = path.length ? ML.find(base, path[path.length - 1]) : null;
        // union of node ids across shown years (children may exist only in actual years)
        var ids = [], names = {};
        yrs.forEach(function (y) {
          var t = ML.tree(kind, y), list = path.length ? (ML.find(t, path[path.length - 1]) || {}).children || [] : t;
          list.forEach(function (n) { if (ids.indexOf(n.id) < 0) { ids.push(n.id); names[n.id] = n.name; } });
        });
        var out = "", any = false;
        ids.forEach(function (id) {
          var hasKids = yrs.some(function (y) { var n = ML.find(ML.tree(kind, y), id); return n && n.children && n.children.length; });
          var inner = hasKids ? addNodes(kind, lvl + 1, path.concat([id]), id) : { html: "", any: false };
          var self = match(names[id]);
          if (term && !self && !inner.any) return;
          any = true;
          var isOpen = open[id] || (term && inner.any);
          out += '<tr class="lvl' + lvl + (parentId && !(open[parentId] || term) ? " hide" : "") + '" data-id="' + id + '"' + (parentId ? ' data-parent="' + parentId + '"' : "") + "><td>" +
            (hasKids ? '<button class="tog" type="button" aria-expanded="' + !!isOpen + '" data-tog="' + id + '">' + (isOpen ? "▾" : "▸") + "</button>" : '<span style="display:inline-block;width:18px"></span>') +
            (term && self ? ML.esc(names[id]).replace(new RegExp("(" + term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + ")", "i"), "<mark>$1</mark>") : ML.esc(names[id])) +
            ' <button class="info" type="button" data-info="' + kind + "|" + id + '" aria-label="About ' + ML.esc(names[id]) + '" style="width:20px;height:20px;font-size:0.7rem;margin-left:4px">i</button></td>' +
            vals(function (y) { var n = ML.find(ML.tree(kind, y), id); return n ? n.value : null; }) + "</tr>";
          out += inner.html;
        });
        return { html: out, any: any };
      }
      function section(title, cls) { body += '<tr class="group"><td colspan="' + (mode === "single" ? 4 : yrs.length + 1) + '">' + title + "</td></tr>"; }
      function line(name, getter, cls) {
        if (term && !match(name)) return;
        body += '<tr class="' + (cls || "sub") + '"><td>' + ML.esc(name) + "</td>" + vals(getter) + "</tr>";
      }
      if (basis === "accrual") {
        section("Revenue");
        body += addNodes("revenue", 0, [], null).html;
        line("Total revenue", function (y) { return D.series[y].revenue; }, "total");
        section("Expenses " + (ev === "purpose" ? "by purpose" : "by type"));
        body += addNodes(ev, 0, [], null).html;
        line("Total expenses", function (y) { return D.series[y].expenses; }, "total");
        section("Operating result and capital");
        line("Net operating balance", function (y) { return D.series[y].nob; }, "total");
        line("Purchases of non-financial assets (capital)", function (y) { return D.series[y].pnfa; });
        line("Fiscal balance", function (y) { return D.series[y].fiscal_balance; });
      } else {
        section("Cash received from operating activities");
        Object.keys(D.cashItems[fy]).length && Object.keys(D.cashItems[ML.years[0]].receipts).forEach(function (k) {
          line(k, function (y) { return D.cashItems[y].receipts[k]; }, "lvl1");
        });
        line("Total operating receipts", function (y) { return D.series[y].cash_receipts; }, "total");
        section("Cash paid for operating activities");
        Object.keys(D.cashItems[ML.years[0]].payments).forEach(function (k) {
          line(k, function (y) { return D.cashItems[y].payments[k]; }, "lvl1");
        });
        line("Total operating payments", function (y) { return D.series[y].cash_payments; }, "total");
        section("Cash result");
        line("Net cash from operating activities", function (y) { return D.series[y].cash_net_operating; });
        line("Cash surplus/(deficit) after net investment in non-financial assets", function (y) { return D.series[y].cash_surplus; }, "total");
      }
      section("Balance sheet at 30 June");
      line("General Government borrowing", function (y) { return D.series[y].ggs_borrowing; });
      line("General Government net debt", function (y) { return D.series[y].ggs_net_debt; });
      line("Non-financial Public Sector borrowing", function (y) { return D.series[y].nfps_borrowing; });
      line("Non-financial Public Sector net debt", function (y) { return D.series[y].nfps_net_debt; });
      $("#ledger").innerHTML = '<div class="tbl-wrap"><table class="ledger' + (basis === "accrual" ? "" : " revt") + '"><thead><tr>' + head + "</tr></thead><tbody>" +
        (body || '<tr><td colspan="4">No lines match “' + ML.esc(term) + "”.</td></tr>") + "</tbody></table></div>" +
        '<p class="chart-note">' + (mode === "single" ? ML.yearLabel(fy) + ". Source: " + ML.sourceLink(ML.yearInfo[fy].src) + "." : "Actual years from each year's Report on State Finances; 2025–26 onwards from the 2026–27 Budget.") +
        " A dash means the line is not published for that year. Sub-purpose detail for expenses is published only for actual years.</p>";
      document.querySelectorAll("[data-tog]").forEach(function (b) {
        b.addEventListener("click", function () { var id = b.getAttribute("data-tog"); open[id] = !open[id]; build(); });
      });
      document.querySelectorAll("[data-info]").forEach(function (b) {
        b.addEventListener("click", function () {
          var p = b.getAttribute("data-info").split("|"), y = mode === "single" ? fy : ML.getFY();
          var n = ML.find(ML.tree(p[0], y), p[1]) || ML.find(ML.tree(p[0], ML.years[0]), p[1]);
          ML.nodeInfo(n, y, p[0] === "revenue" ? D.series[y].revenue : D.series[y].expenses, p[0] === "revenue" ? "total revenue" : "total expenses");
        });
      });
      var c = D.context[fy];
      $("#context-card").innerHTML = '<h3>The figures behind % of GSP and per person, ' + ML.disp(fy) + '</h3><div class="grid-2" style="margin-top:14px"><div><p class="eyebrow">Nominal gross state product</p><p style="font-family:var(--serif);font-size:1.6rem">' + ML.bn(c.gsp) +
        '</p><p class="small muted">' + c.gsp_basis + ". " + ML.sourceLink("abs5220") + '.</p></div><div><p class="eyebrow">Queensland population</p><p style="font-family:var(--serif);font-size:1.6rem">' + Math.round(c.pop).toLocaleString("en-AU") +
        ' people</p><p class="small muted">At ' + ML.endOfYear(fy) + ". " + c.pop_basis + ". " + ML.sourceLink("abs3101") + '.</p></div></div><p class="small" style="margin-top:12px">Per person divides an amount by the population. It is a way to scale the numbers, not what any individual receives or pays.</p>';
    }
    [basisEl, modeEl, expEl].forEach(function (el) { segment(el, build); });
    var t; q.addEventListener("input", function () { clearTimeout(t); t = setTimeout(build, 120); });
    build();
    on("fychange", build);
  };

  /* ======================================================== BOTTOM LINE */
  P.bottomline = function () {
    var pub = $("#pub"), ry = $("#ryear");
    pub.innerHTML = D.reconciliations.map(function (r, i) { return '<option value="' + i + '">' + r.publication + " (from " + r.from + ")</option>"; }).join("");
    function years() {
      var r = D.reconciliations[+pub.value];
      ry.innerHTML = r.years.map(function (y, i) { return '<option value="' + i + '">' + ML.disp(y) + "</option>"; }).join("");
    }
    function draw() {
      var r = D.reconciliations[+pub.value], yi = +ry.value, src = D.sources[r.src];
      var dec = r.lines.filter(function (l) { return l.group === "decision"; }), par = r.lines.filter(function (l) { return l.group === "parameter"; });
      var sumBy = function (ls, i) { return ls.reduce(function (a, l) { return a + l.values[i]; }, 0); };
      var tdv = function (v) { return '<td class="' + (v < 0 ? "neg" : "") + '">' + ML.mn(v) + "</td>"; };
      var html = "<thead><tr><th>Reconciliation, grouped ($m)</th>" + r.years.map(function (y) { return "<th>" + ML.disp(y) + "</th>"; }).join("") + "</tr></thead><tbody>";
      html += '<tr class="sub"><td>' + r.from + " net operating balance</td>" + r.start.map(tdv).join("") + "</tr>";
      html += '<tr class="group"><td colspan="' + (r.years.length + 1) + '">Government decisions</td></tr>';
      dec.forEach(function (l) { html += '<tr class="lvl1"><td>' + l.name + "</td>" + l.values.map(tdv).join("") + "</tr>"; });
      html += '<tr class="sub"><td>Total decisions</td>' + r.years.map(function (_, i) { return tdv(sumBy(dec, i)); }).join("") + "</tr>";
      html += '<tr class="group"><td colspan="' + (r.years.length + 1) + '">Economy and other revisions</td></tr>';
      par.forEach(function (l) { html += '<tr class="lvl1"><td>' + l.name + "</td>" + l.values.map(tdv).join("") + "</tr>"; });
      html += '<tr class="sub"><td>Total revisions</td>' + r.years.map(function (_, i) { return tdv(sumBy(par, i)); }).join("") + "</tr>";
      html += '<tr class="total"><td>' + r.publication + " net operating balance</td>" + r.end.map(tdv).join("") + "</tr></tbody>";
      $("#recon").innerHTML = html;
      $("#recon-note").innerHTML = "Source: " + ML.sourceLink(r.src, r.ref) + ". Line items and values are as published; we have regrouped their order. Positive numbers improve the balance; negative numbers (in maroon) worsen it. Lines may not add exactly because of rounding in the published table. A “0” shown for a published “..” means less than $0.5 million.";
      // waterfall
      var y = r.years[yi];
      $("#wf-title").textContent = ML.disp(y) + ": " + r.from + " to " + r.publication;
      var steps = [{ name: r.from, v: r.start[yi], kind: "total" }]
        .concat(dec.map(function (l) { return { name: l.name, v: l.values[yi], kind: "decision" }; }))
        .concat(par.map(function (l) { return { name: l.name, v: l.values[yi], kind: "parameter" }; }))
        .concat([{ name: r.publication, v: r.end[yi], kind: "total" }]);
      waterfall($("#waterfall"), steps);
    }
    function waterfall(el, steps) {
      var W = 560, rowH = 34, m = { l: 210, r: 70, t: 8, b: 26 }, H = m.t + m.b + rowH * steps.length;
      var run = 0, pts = [];
      steps.forEach(function (s, i) {
        if (s.kind === "total") { pts.push([0, s.v]); run = s.v; }
        else { pts.push([run, run + s.v]); run += s.v; }
      });
      var all = [0].concat([].concat.apply([], pts)), lo = Math.min.apply(null, all), hi = Math.max.apply(null, all);
      var ticks = ML.niceTicks(lo, hi, 4); lo = Math.min(lo, ticks[0]); hi = Math.max(hi, ticks[ticks.length - 1]);
      var x = function (v) { return m.l + ((v - lo) * (W - m.l - m.r)) / (hi - lo || 1); };
      el.innerHTML = "";
      var S = ML.S, svg = S("svg", { viewBox: "0 0 " + W + " " + H, role: "img", "aria-label": "Waterfall of changes to the net operating balance" }, el);
      ticks.forEach(function (t) {
        S("line", { x1: x(t), x2: x(t), y1: m.t, y2: H - m.b, stroke: t === 0 ? INK : "#e6ddd7" }, svg);
        var tx = S("text", { x: x(t), y: H - 8, "text-anchor": "middle", class: "axis" }, svg); tx.textContent = ML.bn(t, { dp: 0 });
      });
      steps.forEach(function (s, i) {
        var a = pts[i][0], b = pts[i][1], y0 = m.t + i * rowH + 6, colr = s.kind === "total" ? INK : s.kind === "decision" ? "#8c1f3d" : BLUE;
        var lab = S("text", { x: m.l - 10, y: y0 + 15, "text-anchor": "end", "font-size": 12, fill: "#21181a" }, svg); lab.textContent = s.name.length > 32 ? s.name.slice(0, 31) + "…" : s.name;
        S("rect", { x: Math.min(x(a), x(b)), y: y0, width: Math.max(2, Math.abs(x(b) - x(a))), height: rowH - 12, rx: 3, fill: colr }, svg);
        var vt = S("text", { x: Math.max(x(a), x(b)) + 6, y: y0 + 15, "font-size": 12, fill: "#554a4d" }, svg);
        vt.textContent = s.kind === "total" ? ML.mn(s.v) : ML.mn(s.v, { sign: true });
        if (i < steps.length - 1) S("line", { x1: x(b), x2: x(b), y1: y0 + rowH - 12, y2: y0 + rowH + 6, stroke: "#85797c", "stroke-dasharray": "2 2" }, svg);
      });
    }
    pub.addEventListener("change", function () { years(); ry.value = 1; draw(); });
    ry.addEventListener("change", draw);
    years(); ry.value = 1; draw();
    on("mlresize", draw);
  };

  /* ======================================================== REGIONS */
  P.regions = function () {
    var metricEl = $("#metric"), ag = $("#agency"), R = D.regions, sel = ML.hash().r || (ML.hash()._ ? ML.hash()._.replace(/_/g, " ") : "Cairns");
    var agencies = {};
    R.items.forEach(function (r) { r.entities.forEach(function (e) { agencies[e.name] = (agencies[e.name] || 0) + e.value; }); });
    Object.keys(agencies).sort(function (a, b) { return agencies[b] - agencies[a]; }).forEach(function (a) {
      ag.insertAdjacentHTML("beforeend", '<option value="' + ML.esc(a) + '">' + ML.esc(a) + " (" + ML.bn(agencies[a]) + ")</option>");
    });
    function val(r) {
      var v = ag.value ? (r.entities.filter(function (e) { return e.name === ag.value; })[0] || { value: 0 }).value : r.total;
      return segVal(metricEl) === "pp" ? (v * 1e6) / r.pop : v;
    }
    function fmt(v) { return segVal(metricEl) === "pp" ? ML.dollars(v) : ML.money(v); }
    function draw() {
      var items = R.items.slice().sort(function (a, b) { return val(b) - val(a); });
      var mx = Math.max.apply(null, items.map(val)) || 1;
      var el = $("#reg-chart");
      el.innerHTML = items.map(function (r) {
        return '<div class="reg-row' + (r.greater_brisbane ? " gb" : "") + '" role="button" tabindex="0" aria-pressed="' + (r.name === sel) + '" data-r="' + ML.esc(r.name) + '"><span class="n">' + ML.esc(r.name) +
          '</span><span class="track"><span class="fill" style="display:block;width:' + (val(r) / mx) * 100 + '%"></span></span><span class="v">' + fmt(val(r)) + "</span></div>";
      }).join("");
      el.querySelectorAll(".reg-row").forEach(function (row) {
        var go = function () { sel = row.getAttribute("data-r"); ML.setHash({ r: sel }); draw(); };
        row.addEventListener("click", go);
        row.addEventListener("keydown", function (e) { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); go(); } });
      });
      detail();
    }
    function detail() {
      var r = R.items.filter(function (x) { return x.name === sel; })[0] || R.items[0];
      var rank = R.items.slice().sort(function (a, b) { return b.total / b.pop - a.total / a.pop; }).indexOf(r) + 1;
      var stateAvg = (R.total * 1e6) / R.items.reduce(function (a, x) { return a + x.pop; }, 0);
      $("#reg-detail").innerHTML = '<p class="eyebrow">' + (r.greater_brisbane ? "Greater Brisbane" : "Rest of Queensland") + " · " + ML.disp(R.fy) + " Budget</p><h2>" + ML.esc(r.name) + "</h2>" +
        '<div class="subfigs" style="grid-template-columns:1fr 1fr;margin:16px 0"><div><b class="tnum" style="font-size:1.6rem">' + ML.bn(r.total) + '</b>planned capital purchases</div><div><b class="tnum" style="font-size:1.6rem">' + ML.dollars((r.total * 1e6) / r.pop) +
        "</b>per resident (state average " + ML.dollars(stateAvg) + ")</div></div>" +
        '<p class="small">' + r.pop.toLocaleString("en-AU") + " residents at 30 June 2025 · rank " + rank + " of 19 per resident · " + ML.pct((r.total / R.total) * 100) + " of the state total</p>" +
        '<h3 style="margin-top:18px">By agency</h3><div class="rows exp" style="margin-top:8px">' + r.entities.slice(0, 8).map(function (e) {
          return '<div class="rowi" style="grid-template-columns:1fr auto"><span class="n">' + ML.esc(e.name) + '</span><span class="v">' + ML.money(e.value) + "<small>" + ML.pct((e.value / r.total) * 100) + " of region</small></span></div>";
        }).join("") + "</div>" + (r.entities.length > 8 ? '<p class="small muted">' + (r.entities.length - 8) + " smaller agencies not shown.</p>" : "") +
        (ML.hhsForRegion && ML.hhsForRegion(r.name).length ? '<p class="small" style="margin-top:14px"><b>Health service:</b> ' + ML.hhsForRegion(r.name).map(function (h) { return '<a href="portfolios.html#' + h.id + '">' + ML.esc(h.name) + "</a> (" + ML.bn(h.expenses[2]) + " in 2026–27)"; }).join("; ") + ". Hospital and Health Service boundaries differ from ABS regions.</p>" : "") +
        '<p class="small" style="margin-top:12px">Source: ' + ML.sourceLink("bp3", "Appendix C") + "; population " + ML.sourceLink("abs3218") + ".</p>";
    }
    segment(metricEl, draw); ag.addEventListener("change", draw);
    draw();
  };

  /* ======================================================== TRACK RECORD */
  P.track = function () {
    var mEl = $("#measure");
    var NAMES = { nob: "Net operating balance", revenue: "Revenue", expenses: "Expenses", ggs_net_debt: "General Government net debt at 30 June" };
    function draw() {
      var k = segVal(mEl), T = D.track;
      $("#tr-title").textContent = NAMES[k] + ": Budget estimate and outcome";
      // grouped bars
      var W = 600, H = 300, m = { t: 14, r: 10, b: 40, l: 56 }, el = $("#tr-chart"), S = ML.S;
      var all = [0]; T.forEach(function (t) { all.push(t.budget[k], t.outcome[k]); });
      var ticks = ML.niceTicks(Math.min.apply(null, all), Math.max.apply(null, all), 5), lo = ticks[0], hi = ticks[ticks.length - 1];
      var yv = function (v) { return m.t + ((hi - v) * (H - m.t - m.b)) / (hi - lo || 1); }, gw = (W - m.l - m.r) / T.length;
      el.innerHTML = ""; var svg = S("svg", { viewBox: "0 0 " + W + " " + H, role: "img", "aria-label": NAMES[k] + " budget versus outcome" }, el);
      ticks.forEach(function (t) { S("line", { x1: m.l, x2: W - m.r, y1: yv(t), y2: yv(t), stroke: t === 0 ? INK : "#e6ddd7" }, svg); var tx = S("text", { x: m.l - 8, y: yv(t) + 4, "text-anchor": "end", class: "axis" }, svg); tx.textContent = (t / 1000).toLocaleString("en-AU") + "bn"; });
      T.forEach(function (t, i) {
        var x0 = m.l + i * gw + gw * 0.14, bw = gw * 0.34;
        [[t.budget[k], "#d6c6c0", false], [t.outcome[k], "#73182c", t.outcome_status !== "actual"]].forEach(function (b, j) {
          var v = b[0], y1 = yv(Math.max(0, v)), h = Math.max(1, Math.abs(yv(v) - yv(0)));
          S("rect", { x: x0 + j * (bw + 4), y: y1, width: bw, height: h, rx: 3, fill: b[2] ? "#fff" : b[1], stroke: b[2] ? "#73182c" : "none", "stroke-width": 2, "stroke-dasharray": b[2] ? "5 3" : "" }, svg);
        });
        var tx = S("text", { x: x0 + bw + 2, y: H - m.b + 18, "text-anchor": "middle", class: "axis" }, svg); tx.textContent = ML.disp(t.fy);
        var hit = S("rect", { x: m.l + i * gw, y: m.t, width: gw, height: H - m.t - m.b, fill: "transparent" }, svg);
        hit.addEventListener("mousemove", function (e) { ML.tip.show("<b>" + ML.disp(t.fy) + "</b><br>Budget: " + ML.bn(t.budget[k]) + "<br>" + (t.outcome_status === "actual" ? "Outcome" : "Estimated actual") + ": " + ML.bn(t.outcome[k]) + "<br>Difference: " + ML.bn(t.outcome[k] - t.budget[k], { sign: true }), e.clientX, e.clientY); });
        hit.addEventListener("mouseleave", ML.tip.hide);
      });
      var tv = function (v, sign) { return '<td class="' + (v < 0 ? "neg" : "") + '">' + ML.bn(v, { sign: sign }) + "</td>"; };
      $("#tr-table").innerHTML = "<thead><tr><th>Year</th><th>Budget</th><th>Outcome</th><th>Difference</th></tr></thead><tbody>" + T.map(function (t) {
        return "<tr><td>" + ML.disp(t.fy) + (t.outcome_status !== "actual" ? ' <span class="pill estimate">Est. actual</span>' : "") + "</td>" + tv(t.budget[k]) + tv(t.outcome[k]) + tv(t.outcome[k] - t.budget[k], true) + "</tr>";
      }).join("") + "</tbody>";
      $("#tr-note").innerHTML = "Budget figures are the Budget-year column of each June Budget (" + T.map(function (t) { return '<a href="' + D.sources[t.src_budget].url + '" target="_blank" rel="noopener">' + ML.disp(t.fy) + "</a>"; }).join(", ") +
        "). Outcomes are from each year's Report on State Finances. 2025–26 is the estimated actual in the 2026–27 Budget; the 2025–26 Report on State Finances is usually tabled in late October.";
      vintages(k);
    }
    function vintages(k) {
      var V = D.vintages, yrs = ML.years, W = 900, H = 340, m = { t: 14, r: 120, b: 34, l: 56 }, el = $("#vint-chart"), S = ML.S;
      var all = [0]; Object.keys(V).forEach(function (b) { Object.keys(V[b]).forEach(function (y) { var v = V[b][y][k]; if (v !== null && v !== undefined) all.push(v); }); });
      yrs.forEach(function (y) { if (ML.isActual(y)) all.push(D.series[y][k]); });
      var ticks = ML.niceTicks(Math.min.apply(null, all), Math.max.apply(null, all), 5), lo = ticks[0], hi = ticks[ticks.length - 1];
      var x = function (i) { return m.l + (i * (W - m.l - m.r)) / (yrs.length - 1); }, yv = function (v) { return m.t + ((hi - v) * (H - m.t - m.b)) / (hi - lo || 1); };
      el.innerHTML = ""; var svg = S("svg", { viewBox: "0 0 " + W + " " + H, role: "img", "aria-label": "Forecast vintages" }, el);
      ticks.forEach(function (t) { S("line", { x1: m.l, x2: W - m.r, y1: yv(t), y2: yv(t), stroke: t === 0 ? INK : "#e6ddd7" }, svg); var tx = S("text", { x: m.l - 8, y: yv(t) + 4, "text-anchor": "end", class: "axis" }, svg); tx.textContent = (t / 1000).toLocaleString("en-AU") + "bn"; });
      yrs.forEach(function (y, i) { var tx = S("text", { x: x(i), y: H - 12, "text-anchor": "middle", class: "axis" }, svg); tx.textContent = ML.disp(y); });
      var keys = Object.keys(V).sort();
      keys.forEach(function (b, bi) {
        var pts = yrs.map(function (y, i) { var o = V[b][y]; return o && o[k] !== null && o[k] !== undefined ? [x(i), yv(o[k]), y, o[k]] : null; }).filter(Boolean);
        if (!pts.length) return;
        var latest = b === D.currentBudget, colr = latest ? GOLD : "#b9aaa5";
        S("path", { d: pts.map(function (p, i) { return (i ? "L" : "M") + p[0] + "," + p[1]; }).join(""), fill: "none", stroke: colr, "stroke-width": latest ? 2.5 : 1.75, "stroke-dasharray": "5 3" }, svg);
        pts.forEach(function (p) {
          var c = S("circle", { cx: p[0], cy: p[1], r: 4, fill: "#fff", stroke: colr, "stroke-width": 2 }, svg);
          c.addEventListener("mousemove", function (e) { ML.tip.show("<b>" + ML.disp(b) + " Budget</b><br>forecast for " + ML.disp(p[2]) + ": " + ML.bn(p[3]), e.clientX, e.clientY); });
          c.addEventListener("mouseleave", ML.tip.hide);
        });
        if (latest) { var lp = pts[pts.length - 1], lt = S("text", { x: lp[0] + 8, y: lp[1] + 4, "font-size": 11, fill: "#8a5a05" }, svg); lt.textContent = ML.disp(b) + " Budget"; }
      });
      var act = yrs.map(function (y, i) { return ML.yearInfo[y].status === "actual" || y === "2025-26" ? [x(i), yv(D.series[y][k]), y] : null; }).filter(Boolean);
      S("path", { d: act.map(function (p, i) { return (i ? "L" : "M") + p[0] + "," + p[1]; }).join(""), fill: "none", stroke: "#73182c", "stroke-width": 3 }, svg);
      act.forEach(function (p) { S("circle", { cx: p[0], cy: p[1], r: 5, fill: p[2] === "2025-26" ? "#fff" : "#73182c", stroke: "#73182c", "stroke-width": 2 }, svg); });
      var la = act[act.length - 1], t2 = S("text", { x: la[0] + 8, y: la[1] - 8, "font-size": 12, "font-weight": 600, fill: "#73182c" }, svg); t2.textContent = "Outcome";
      $("#vint-legend").innerHTML = '<span><i style="background:#73182c"></i>Outcome (hollow: 2025–26 estimated actual)</span><span><i class="dash" style="color:#b9aaa5"></i>Earlier Budgets</span><span><i class="dash" style="color:' + GOLD + '"></i>2026–27 Budget</span>';
    }
    segment(mEl, draw);
    draw();
    on("mlresize", draw);
  };

  /* ======================================================== SOURCES */
  P.sources = function () {
    var S = D.sources, keys = Object.keys(S);
    var flags = D.flags;
    var tbl = "<thead><tr><th>$ million</th>" + ML.years.map(function (y) { return "<th>" + ML.disp(y) + "<br><span style='font-weight:400;text-transform:none;letter-spacing:0'>" + ML.yearInfo[y].label + "</span></th>"; }).join("") + "</tr></thead><tbody>" +
      [["Revenue", "revenue"], ["Expenses", "expenses"], ["Net operating balance", "nob"], ["Purchases of non-financial assets", "pnfa"], ["Fiscal balance", "fiscal_balance"], ["Cash surplus/(deficit)", "cash_surplus"],
       ["GGS borrowing", "ggs_borrowing"], ["GGS net debt", "ggs_net_debt"], ["NFPS borrowing", "nfps_borrowing"], ["NFPS net debt", "nfps_net_debt"]].map(function (r) {
        return "<tr><td>" + r[0] + "</td>" + ML.years.map(function (y) { var v = D.series[y][r[1]]; return '<td class="' + (v < 0 ? "neg" : "") + '">' + ML.mn(v) + "</td>"; }).join("") + "</tr>";
      }).join("") + "</tbody>";
    $("#sources-body").innerHTML =
      '<div class="grid-2" style="align-items:start"><div><h2>Where each year comes from</h2><div class="rows" style="margin-top:14px">' +
      ML.years.map(function (y) { return '<div class="rowi" style="grid-template-columns:120px 1fr"><span class="n">' + ML.disp(y) + " " + ML.pill(y) + '</span><span class="small">' + ML.sourceLink(ML.yearInfo[y].src) + "</span></div>"; }).join("") +
      '</div></div><div><h2>All sources</h2><ul class="small" style="padding-left:18px;margin-top:14px">' +
      keys.map(function (k) { return "<li style='margin-bottom:8px'>" + ML.sourceLink(k) + " <span class='muted'>(" + S[k].publisher + ", " + S[k].date + ")</span></li>"; }).join("") + "</ul></div></div>" +

      '<h2 style="margin-top:40px">Definitions</h2><div class="grid-2 small" style="margin-top:12px">' +
      [["General Government Sector (GGS)", "Departments and agencies that provide services funded mainly by taxes and grants. This is the sector the Budget is framed around and the default on this site."],
       ["Non-financial Public Sector (NFPS)", "The GGS plus government-owned corporations that sell goods and services, such as the energy, water, port and rail businesses. Used here for borrowing and net debt only."],
       ["Net operating balance", "Revenue from transactions less expenses from transactions. Queensland's headline Budget measure. It is on an accrual basis and includes depreciation."],
       ["Fiscal balance", "The net operating balance less net spending on new assets (capital purchases less sales and depreciation, plus other adjustments). In Government Finance Statistics terms it is the government's net lending (if positive) or net borrowing (if negative)."],
       ["Cash surplus/(deficit)", "Net cash from operating activities less net cash spent on non-financial assets."],
       ["Net debt", "Borrowing, advances received and deposits held, less cash, deposits, advances paid and investments, loans and placements."],
       ["Actual", "Audited outcome published in the Report on State Finances after the year ends."],
       ["Estimated actual", "Treasury's estimate for a year that has ended or is ending, published in the next Budget before the audited outcome is available. 2025–26 is shown on this basis until the 2025–26 Report on State Finances is published."],
       ["Budget and projections", "The Budget year and the three following projection (forward estimate) years in the current Budget."],
       ["Expenses by purpose", "The ABS Government Purpose Classification, used by all Australian governments under the Uniform Presentation Framework. Sub-purposes are published only in the Report on State Finances, so only for actual years."]].map(function (d) {
        return "<div><b>" + d[0] + "</b><p>" + d[1] + "</p></div>";
      }).join("") + "</div>" +

      '<h2 style="margin-top:40px">Calculations</h2><div class="prose small"><ul style="padding-left:18px">' +
      "<li>All amounts are nominal dollars, not adjusted for inflation, in $ million in the source and shown in $ billion to one decimal place.</li>" +
      "<li><b>% of GSP</b> divides an amount by Queensland's nominal gross state product for the same financial year. Actual years use ABS State Accounts. From 2025–26 onwards, GSP is 2024–25 nominal GSP grown at the nominal GSP growth rates published in Budget Paper 2, Table 1.1 notes. These derived levels are ours, not Treasury's.</li>" +
      "<li><b>Per person</b> divides an amount by Queensland's estimated resident population at 30 June at the end of the financial year. Actual years use ABS ERP. From 2025–26, the 30 June 2025 ERP is grown at the Budget's population growth forecasts. Also derived by us.</li>" +
      "<li><b>Other taxes</b>, <b>fines and other revenue</b> are calculated as the published total less the named lines, so every breakdown adds to its published total.</li>" +
      "<li>Revenue sub-categories for actual years follow the Report on State Finances (UPF tables); for 2025–26 onwards they follow Budget Paper 2 Tables 3.2 to 3.4. The two documents classify a few small items differently (for example, about $30 million of insurance-related tax), so sub-category movements across 2024–25 to 2025–26 should be read with care. Category totals are identical in both.</li>" +
      "<li>Royalties are split by commodity only from 2024–25, the earliest actual year in Budget Paper 2 Table 3.4. Earlier years show royalties and land rents.</li></ul></div>" +

      '<h2 style="margin-top:40px">Checks and known gaps</h2><div class="prose small"><p>The build script runs a set of reconciliation checks each time it is run: every breakdown against its total, revenue less expenses against the published operating balance, the 2024–25 outcome in the Report on State Finances against the same figure in the 2026–27 Budget, each reconciliation table from start to finish, and the regional table against its total. ' +
      (flags.length ? "Checks where the published figures themselves do not add up are listed here rather than adjusted:</p><ul style='padding-left:18px'>" + flags.map(function (f) { return "<li>" + ML.esc(f.check) + ": " + f.a + " against " + f.b + " (difference " + f.diff + ")</li>"; }).join("") + "</ul>" : "All checks pass.</p>") +
      "<p><b>Portfolios.</b> Departmental detail comes from the 2026–27 Service Delivery Statements: each department's budget summary, staffing, capital outlays, income statement and service standards, plus the 16 Hospital and Health Services. The build checks that service areas, staff and expense lines add to each statement's totals, that every service standard's three published values appear together on one line of the source, and that every footnote marker on a service standard is matched to its note under the table. Those notes are shown with each measure. Three measures in the Housing and Public Works statement and one staffing row in the Premier and Cabinet statement are laid out in a way the parser cannot read, and were transcribed by hand from the source page; the site labels those measures. Met or missed is shown only where a target states a direction (such as “&gt;95%” or “≤1.0”). Statutory bodies other than the Hospital and Health Services, and commercialised business units such as QBuild and RoadTek, are not yet included. The Queensland Corrective Services financial statements are published as images and could not be read.</p>" +
      "<p>Known gaps: the 2025–26 Report on State Finances had not been published when this data was built. Regional figures cover only the current Budget year. Departmental figures cover only the three years each Service Delivery Statement shows.</p></div>" +

      '<h2 style="margin-top:40px">Headline figures, all years</h2><p class="small muted">The same figures the charts use, as a table.</p><div class="tbl-wrap" style="margin-top:12px"><table class="ledger">' + tbl + "</table></div>" +
      (ML.LOCAL ? '<p style="margin-top:14px"><button class="btn-link" type="button" id="dl">Download these figures (CSV)</button></p>' : "");
    if (ML.LOCAL) $("#dl").addEventListener("click", function () {
      var keysS = Object.keys(D.series[ML.years[0]]);
      var rows = [["fy", "status"].concat(keysS).concat(["gsp", "population"])];
      ML.years.forEach(function (y) { rows.push([y, ML.yearInfo[y].label].concat(keysS.map(function (k) { return D.series[y][k]; })).concat([D.context[y].gsp, D.context[y].pop])); });
      var blob = new Blob([rows.map(function (r) { return r.join(","); }).join("\n")], { type: "text/csv" });
      var a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "maroon-ledger-headline.csv"; a.click();
    });
  };

  P.about = function () {};
})();
