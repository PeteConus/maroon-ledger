/* The Maroon Ledger — Portfolios page (Service Delivery Statements) */
(function () {
  "use strict";
  var P = window.MLPages, ML = window.ML, D = ML.D;
  function $(s, r) { return (r || document).querySelector(s); }
  var COLS = ["25–26 Budget", "25–26 est. actual", "26–27 Budget"];
  var BY_ID = {};
  (D.portfolios || []).forEach(function (p) { BY_ID[p.id] = p; });
  ML.portfolio = function (id) { return BY_ID[id]; };
  ML.hhsForRegion = function (region) {
    return (D.portfolios || []).filter(function (p) { return p.kind === "hhs" && (p.regions || []).indexOf(region) >= 0; });
  };

  /* ---------- measure status ---------- */
  function parseVal(v) {
    var s = String(v).replace(/,/g, "").trim();
    var rng = s.match(/^\$?(-?\d[\d.]*)\s*%?\s*[-–]\s*\$?(-?\d[\d.]*)/);
    if (rng) return { range: [parseFloat(rng[1]), parseFloat(rng[2])] };
    var m = s.match(/^([<>≤≥]=?)?\s*\$?(-?\d[\d.]*)/);
    if (!m) return null;
    return { op: m[1] || "", v: parseFloat(m[2]) };
  }
  function status(ms) {
    if (/new measure/i.test(ms.t) || /new measure/i.test(ms.ea)) return { k: "new", t: "New measure" };
    if (/discontinued/i.test(ms.t2)) return { k: "na", t: "Discontinued" };
    if (ms.assess === "met") return { k: "met", t: "Met target" };
    if (ms.assess === "not met") return { k: "miss", t: "Missed target" };
    var t = parseVal(ms.t), a = parseVal(ms.ea);
    if (!t || !a || a.range || a.v === undefined) return { k: "na", t: "No comparison" };
    if (t.range) {
      if (a.v < t.range[0]) return { k: "below", t: "Below range" };
      if (a.v > t.range[1]) return { k: "above", t: "Above range" };
      return { k: "in", t: "Within range" };
    }
    if (Math.abs(a.v - t.v) < 1e-9) return { k: "in", t: "On target" };
    return a.v > t.v ? { k: "above", t: "Above target" } : { k: "below", t: "Below target" };
  }
  ML.measureStatus = status;

  function chg(a, b) { return a ? ((b - a) / Math.abs(a)) * 100 : null; }
  function cells(v, f) { return v.map(function (x) { return "<td>" + (x === null || x === undefined ? "–" : f(x)) + "</td>"; }).join(""); }
  var money = function (x) { return ML.money(x); };
  var fte = function (x) { return Math.round(x).toLocaleString("en-AU"); };

  P.portfolios = function () {
    var list = $("#pf-list"), detail = $("#pf-detail"), sortEl = $("#pf-sort"), q = $("#pf-q");
    var depts = D.portfolios.filter(function (p) { return p.kind === "department"; });
    var health = D.portfolios.filter(function (p) { return p.kind !== "department"; });
    var h = ML.hash();
    var sel = BY_ID[h._] ? h._ : BY_ID[h.p] ? h.p : "department-of-education";
    var showHHS = BY_ID[sel] && BY_ID[sel].kind !== "department";
    var mfilter = "all";

    function sorted() {
      var k = sortEl.value, arr = depts.slice();
      var key = {
        exp: function (p) { return -(p.expenses ? p.expenses[2] : 0); },
        fte: function (p) { return -(p.fte ? p.fte.total[2] : 0); },
        chg: function (p) { return -(p.expenses ? chg(p.expenses[1], p.expenses[2]) || 0 : 0); },
        name: function (p) { return p.short; },
      }[k];
      return arr.sort(function (a, b) { var x = key(a), y = key(b); return x < y ? -1 : x > y ? 1 : 0; });
    }
    function rowHtml(p, mx, sub) {
      var e = p.expenses ? p.expenses[2] : 0, c = p.expenses ? chg(p.expenses[1], p.expenses[2]) : null;
      var hit = !q.value || (p.name + " " + (p.service_areas || []).map(function (s) { return s.name; }).join(" ")).toLowerCase().indexOf(q.value.toLowerCase()) >= 0;
      if (!hit) return "";
      return '<button type="button" class="pf-row' + (sub ? " sub" : "") + '" aria-pressed="' + (p.id === sel) + '" data-id="' + p.id + '"><span class="n">' + ML.esc(p.short) +
        '</span><span class="track"><span class="fill" style="width:' + Math.max(0.6, (e / mx) * 100) + '%"></span></span><span class="v">' + ML.bn(e) +
        '<small>' + (c === null ? "" : ML.pct(c, 1, true) + " on 2025–26") + "</small></span></button>";
    }
    function drawList() {
      var arr = sorted(), mx = Math.max.apply(null, depts.map(function (p) { return p.expenses ? p.expenses[2] : 0; }));
      var html = arr.map(function (p) {
        var r = rowHtml(p, mx);
        if (p.name === "Queensland Health") {
          r += '<div class="pf-sub"><button type="button" class="btn-link small" id="pf-hhs-tog" aria-expanded="' + showHHS + '">' + (showHHS ? "Hide" : "Show") + " the Department of Health, Ambulance Service and 16 Hospital and Health Services</button>" +
            (showHHS ? health.slice().sort(function (a, b) { return (b.expenses ? b.expenses[2] : 0) - (a.expenses ? a.expenses[2] : 0); }).map(function (x) { return rowHtml(x, mx, true); }).join("") : "") + "</div>";
        }
        return r;
      }).join("");
      list.innerHTML = html || '<p class="small muted">No portfolio matches that search.</p>';
      list.querySelectorAll(".pf-row").forEach(function (b) {
        b.addEventListener("click", function () { select(b.getAttribute("data-id"), true); });
      });
      var tg = $("#pf-hhs-tog");
      if (tg) tg.addEventListener("click", function () { showHHS = !showHHS; drawList(); });
    }
    function select(id, scroll) {
      sel = id;
      ML.setHash({ p: null, _: null });
      history.replaceState(null, "", "#" + id);
      list.querySelectorAll(".pf-row").forEach(function (b) { b.setAttribute("aria-pressed", b.getAttribute("data-id") === id ? "true" : "false"); });
      drawDetail();
      if (scroll && window.innerWidth < 960) detail.scrollIntoView({ behavior: "smooth" });
    }

    function table(title, rows, f, totalRow, note) {
      if (!rows || !rows.length) return "";
      var mx = Math.max.apply(null, rows.map(function (r) { return Math.abs(r.v[2] || 0); })) || 1;
      return '<h3 class="pf-h">' + title + '</h3><div class="tbl-wrap"><table class="ledger pf-tbl"><thead><tr><th>' + "</th>" + COLS.map(function (c) { return "<th>" + c + "</th>"; }).join("") + "<th>Change</th></tr></thead><tbody>" +
        rows.map(function (r) {
          var c = chg(r.v[1], r.v[2]);
          return "<tr><td>" + ML.esc(r.name) + '<span class="minibar" style="width:' + (Math.abs(r.v[2] || 0) / mx) * 100 + '%"></span></td>' + cells(r.v, f) +
            '<td class="' + (c !== null && c < -0.05 ? "neg" : "") + '">' + (c === null ? "–" : ML.pct(c, 1, true)) + "</td></tr>";
        }).join("") +
        (totalRow ? '<tr class="total"><td>' + totalRow.name + "</td>" + cells(totalRow.v, f) + "<td>" + (chg(totalRow.v[1], totalRow.v[2]) === null ? "–" : ML.pct(chg(totalRow.v[1], totalRow.v[2]), 1, true)) + "</td></tr>" : "") +
        "</tbody></table></div>" + (note ? '<p class="chart-note">' + note + "</p>" : "");
    }

    function measures(p) {
      var ms = p.measures || [];
      if (!ms.length) return '<h3 class="pf-h">Service standards</h3><p class="small muted">This statement publishes no service standards for this entity.</p>';
      var st = ms.map(status), cnt = {};
      st.forEach(function (s) { cnt[s.k] = (cnt[s.k] || 0) + 1; });
      var withDir = (cnt.met || 0) + (cnt.miss || 0);
      var html = '<h3 class="pf-h">Service standards</h3><p class="small">' + ms.length + " measures. " +
        (withDir ? "<b>" + withDir + "</b> state a direction in their target (for example “&gt;95%”); of those, <b>" + (cnt.met || 0) + "</b> met and <b>" + (cnt.miss || 0) + "</b> missed the 2025–26 target on the estimated actual. " : "") +
        (withDir ? "For the rest, the target has no stated direction, so we show whether the result was above or below it without judging which is better." : "None of these targets states a direction, so we show whether each result was above or below its target without judging which is better.") + "</p>" +
        '<div class="seg pf-mf" role="group" aria-label="Filter measures">' +
        (withDir ? [["all", "All"], ["miss", "Missed (" + (cnt.miss || 0) + ")"], ["met", "Met (" + (cnt.met || 0) + ")"], ["other", "No stated direction"]] : [["all", "All"]]).map(function (b) {
          return '<button type="button" data-f="' + b[0] + '" aria-pressed="' + (mfilter === b[0]) + '">' + b[1] + "</button>";
        }).join("") + "</div>";
      var areas = [], byArea = {};
      ms.forEach(function (m, i) {
        var keep = mfilter === "all" || (mfilter === "other" ? ["met", "miss"].indexOf(st[i].k) < 0 : st[i].k === mfilter);
        if (!keep) return;
        var a = m.area || "Service standards";
        if (!byArea[a]) { byArea[a] = []; areas.push(a); }
        byArea[a].push([m, st[i]]);
      });
      html += '<div class="tbl-wrap" style="margin-top:12px"><table class="ledger pf-meas"><thead><tr><th>Measure</th><th>25–26 target</th><th>25–26 est. actual</th><th>26–27 target</th><th>Result</th></tr></thead><tbody>' +
        (areas.length ? areas.map(function (a) {
          return '<tr class="group"><td colspan="5">' + ML.esc(a) + "</td></tr>" + byArea[a].map(function (x) {
            var m = x[0], s = x[1];
            return "<tr><td>" + ML.esc(m.name) + (m.type ? ' <span class="mtype">' + m.type + "</span>" : "") + (m.manual ? ' <span class="mtype" title="Read off the source page by hand because the PDF layout defeats the parser">checked by hand</span>' : "") +
              (m.notes && m.notes.length ? '<details class="mnotes"><summary>' + (m.notes.length === 1 ? "Source note" : m.notes.length + " source notes") + "</summary><ol>" +
                m.notes.map(function (n) { return "<li" + (n.n ? ' value="' + n.n + '"' : ' class="gen"') + ">" + ML.esc(n.text) + "</li>"; }).join("") + "</ol></details>" : "") +
              "</td><td>" + ML.esc(m.t) + "</td><td><b>" + ML.esc(m.ea) + "</b></td><td>" + ML.esc(m.t2) + '</td><td><span class="st st-' + s.k + '">' + s.t + "</span></td></tr>";
          }).join("");
        }).join("") : '<tr><td colspan="5">No measures in this filter.</td></tr>') + "</tbody></table></div>" +
        '<p class="chart-note">Source notes are the footnotes printed under each table in the Service Delivery Statement, numbered as in the source. “..” means not available or not set. Estimated actuals are Treasury\'s mid-year estimates, often for part of the year only; the source notes explain each one. Read the <a href="' + p.url + '" target="_blank" rel="noopener">full statement</a> for definitions and notes.</p>';
      return html;
    }

    function drawDetail() {
      var p = BY_ID[sel];
      if (!p) { detail.innerHTML = ""; return; }
      var e = p.expenses, c = e ? chg(e[1], e[2]) : null;
      var kind = p.kind === "hhs" ? "Hospital and Health Service" : p.kind === "health_part" ? "Part of Queensland Health" : "Department or agency";
      var html = '<p class="eyebrow">' + kind + ' · <a href="' + p.url + '" target="_blank" rel="noopener">Service Delivery Statement</a></p><h2>' + ML.esc(p.name) + "</h2>";
      html += '<div class="pf-kpis">' +
        (e ? '<div><b class="tnum">' + ML.bn(e[2]) + '</b>2026–27 expenses<small>' + (c === null ? "" : ML.pct(c, 1, true) + " on 2025–26 est. actual") + "</small></div>" : "") +
        (p.fte ? '<div><b class="tnum">' + fte(p.fte.total[2]) + '</b>full-time equivalent staff<small>at 30 June 2027' + (p.fte.controlled ? " (all, including administered)" : "") + "</small></div>" : "") +
        (p.capital && p.capital.totalcapitaloutlays ? '<div><b class="tnum">' + ML.money(p.capital.totalcapitaloutlays[2]) + "</b>capital outlays<small>" + (p.capital.capitalpurchases ? "purchases " + ML.money(p.capital.capitalpurchases[2]) + (p.capital.capitalgrants ? ", grants " + ML.money(p.capital.capitalgrants[2]) : "") : "2026–27") + "</small></div>" : "") +
        (p.administered ? '<div><b class="tnum">' + ML.money(p.administered[2]) + "</b>administered on behalf of the State<small>not in the department's own expenses</small></div>" : "") +
        "</div>";
      if (p.fte_bp2 && p.fte && Math.round(p.fte_bp2) !== Math.round(p.fte.total[2])) {
        html += '<p class="small muted">Budget Paper 2 (Table 4.2) counts ' + fte(p.fte_bp2) + " funded controlled FTEs for this department. The difference comes from what each table includes, such as commercialised business units, statutory bodies or administered staff.</p>";
      }
      if (p.name === "Department of Health") html += '<p class="small card tint">The Department of Health buys hospital services from the 16 Hospital and Health Services, so its expenses include money the HHSs then spend. Add it to the HHSs and you count the same dollars twice; Queensland Health\'s consolidated total is the right whole-of-health figure.</p>';
      if (p.kind === "hhs" && (p.regions || []).length) html += '<p class="small">Area served roughly corresponds to: ' + p.regions.map(function (r) { return '<a href="regions.html#' + encodeURIComponent(r.replace(/ /g, "_")) + '">' + ML.esc(r) + "</a>"; }).join(", ") + ". HHS and ABS region boundaries differ.</p>";
      html += table("Spending by service area", p.service_areas, money, e ? { name: "Total expenses", v: e } : null);
      if (p.name === "Queensland Health") {
        var hs = health.filter(function (x) { return x.kind === "hhs"; }).sort(function (a, b) { return b.expenses[2] - a.expenses[2]; });
        html += table("Hospital and Health Services", hs.map(function (x) { return { name: x.short, v: x.expenses }; }), money, null,
          "Each HHS's own expenses from its income statement. Select an HHS in the list for its staff and service standards. HHS figures overlap with the Department of Health's purchasing, so they are not added up here.");
      }
      html += table("Spending by type", p.expense_types, money, null, p.service_areas ? "From the controlled income statement." : null);
      if (p.fte && p.fte.rows.length) html += table("Staff by service area (FTEs at 30 June)", p.fte.rows, fte, { name: "Total FTEs", v: p.fte.total });
      if (p.name === "Queensland Corrective Services") html += '<p class="small muted">The financial statements in this SDS are published as images, so spending by type is not available here.</p>';
      html += measures(p);
      detail.innerHTML = html;
      detail.querySelectorAll(".pf-mf button").forEach(function (b) {
        b.addEventListener("click", function () { mfilter = b.getAttribute("data-f"); drawDetail(); });
      });
    }

    sortEl.addEventListener("change", drawList);
    var t; q.addEventListener("input", function () { clearTimeout(t); t = setTimeout(drawList, 120); });
    drawList(); drawDetail();
    // portfolio-wide summary
    var allMs = [].concat.apply([], D.portfolios.map(function (p) { return p.measures || []; }));
    $("#pf-summary").innerHTML = '<div><b class="tnum">' + depts.length + "</b>departments and agencies</div><div><b class=\"tnum\">16</b>Hospital and Health Services</div><div><b class=\"tnum\">" +
      allMs.length.toLocaleString("en-AU") + "</b>service standards</div>";
  };
})();
