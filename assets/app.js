/* The Maroon Ledger — shared shell, formatting and chart components.
   Plain JavaScript, no build step, no network: the site opens straight from disk. */
(function () {
  "use strict";
  var D = window.ML_DATA;
  var ML = (window.ML = {});
  ML.D = D;

  /* ------------------------------------------------------------ years */
  ML.years = D.years.map(function (y) { return y.fy; });
  ML.yearInfo = {};
  D.years.forEach(function (y) { ML.yearInfo[y.fy] = y; });
  ML.disp = function (fy) { return fy.replace("-", "–"); };
  ML.yearLabel = function (fy) { return ML.disp(fy) + " · " + ML.yearInfo[fy].label; };
  ML.pill = function (fy) {
    var y = ML.yearInfo[fy];
    return '<span class="pill ' + y.status + '">' + y.label + "</span>";
  };
  ML.prevYear = function (fy) { var i = ML.years.indexOf(fy); return i > 0 ? ML.years[i - 1] : null; };
  ML.isActual = function (fy) { return ML.yearInfo[fy].status === "actual"; };
  ML.endOfYear = function (fy) { return "30 June " + (2000 + parseInt(fy.slice(-2), 10)); };

  function store(k, v) {
    try { if (v === undefined) return window.localStorage.getItem(k); window.localStorage.setItem(k, v); } catch (e) { return null; }
  }
  function hashParams() {
    var o = {};
    (location.hash || "").replace(/^#/, "").split("&").forEach(function (p) {
      var kv = p.split("="); if (kv.length === 1 && kv[0]) o._ = decodeURIComponent(kv[0]); else if (kv[0]) o[decodeURIComponent(kv[0])] = decodeURIComponent(kv[1] || "");
    });
    return o;
  }
  ML.hash = hashParams;
  ML.setHash = function (obj) {
    var o = hashParams();
    Object.keys(obj).forEach(function (k) { if (obj[k] === null) delete o[k]; else o[k] = obj[k]; });
    var s = Object.keys(o).map(function (k) { return encodeURIComponent(k) + "=" + encodeURIComponent(o[k]); }).join("&");
    history.replaceState(null, "", s ? "#" + s : location.pathname + location.search);
  };
  ML.getFY = function () {
    var h = hashParams().fy;
    if (h && ML.yearInfo[h]) return h;
    var s = store("ml.fy");
    if (s && ML.yearInfo[s]) return s;
    return D.currentBudget;
  };
  ML.setFY = function (fy) {
    store("ml.fy", fy);
    ML.setHash({ fy: fy });
    document.querySelectorAll("select.fy-select").forEach(function (s) { s.value = fy; });
    document.dispatchEvent(new CustomEvent("fychange", { detail: fy }));
  };
  ML.yearOptions = function (selected, exclude) {
    return ML.years.filter(function (y) { return y !== exclude; }).map(function (y) {
      return '<option value="' + y + '"' + (y === selected ? " selected" : "") + ">" + ML.yearLabel(y) + "</option>";
    }).join("");
  };

  /* ------------------------------------------------------------ formatting ($ million in, text out) */
  var MINUS = "−";
  ML.bn = function (m, opts) {
    opts = opts || {};
    if (m === null || m === undefined || isNaN(m)) return "n/a";
    var v = m / 1000, a = Math.abs(v), dp = opts.dp !== undefined ? opts.dp : 1;
    var s = "$" + a.toLocaleString("en-AU", { minimumFractionDigits: dp, maximumFractionDigits: dp }) + "bn";
    if (v < 0 && a >= Math.pow(10, -dp) / 2) return MINUS + s;
    if (opts.sign && v > 0) return "+" + s;
    return s;
  };
  ML.mn = function (m, opts) {
    opts = opts || {};
    var a = Math.abs(m), s = "$" + Math.round(a).toLocaleString("en-AU") + "m";
    if (m < 0 && Math.round(a)) return MINUS + s;
    if (opts.sign && m > 0) return "+" + s;
    return s;
  };
  ML.money = function (m, opts) { return Math.abs(m) >= 1000 ? ML.bn(m, opts) : ML.mn(m, opts); };
  ML.pct = function (x, dp, sign) {
    if (x === null || x === undefined || !isFinite(x)) return "n/a";
    dp = dp === undefined ? 1 : dp;
    var s = Math.abs(x).toFixed(dp) + "%";
    if (x < 0 && Number(Math.abs(x).toFixed(dp))) return MINUS + s;
    if (sign && x > 0) return "+" + s;
    return s;
  };
  ML.dollars = function (v) { return (v < 0 ? MINUS : "") + "$" + Math.round(Math.abs(v)).toLocaleString("en-AU"); };
  ML.perPerson = function (m, fy) { return (m * 1e6) / D.context[fy].pop; };
  ML.ofGSP = function (m, fy) { return (m / D.context[fy].gsp) * 100; };
  ML.esc = function (s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); };
  ML.balanceWord = function (v) { return v >= 0 ? "surplus" : "deficit"; };

  /* ------------------------------------------------------------ data helpers */
  ML.tree = function (kind, fy) {
    return { revenue: D.revenue, purpose: D.expensesByPurpose, type: D.expensesByType, capital: D.capitalByPurpose }[kind][fy];
  };
  ML.find = function (nodes, id) {
    for (var i = 0; i < nodes.length; i++) {
      if (nodes[i].id === id) return nodes[i];
      if (nodes[i].children) { var f = ML.find(nodes[i].children, id); if (f) return f; }
    }
    return null;
  };
  ML.sum = function (nodes) { return nodes.reduce(function (a, n) { return a + n.value; }, 0); };
  ML.source = function (fy) { return D.sources[ML.yearInfo[fy].src]; };
  ML.sourceLink = function (key, extra) {
    var s = D.sources[key];
    return '<a href="' + s.url + '" target="_blank" rel="noopener">' + ML.esc(s.title) + "</a>" + (extra ? ", " + ML.esc(extra) : "");
  };

  /* ------------------------------------------------------------ plain-English explanations */
  ML.EXPLAIN = {
    tax: "Taxes the State levies itself. The big ones are payroll tax on larger employers, transfer duty (stamp duty) on property purchases, land tax, and motor vehicle registration.",
    "tax.payroll": "Tax on wages paid by employers whose payroll is above the threshold. Includes the mental health levy on the largest payrolls.",
    "tax.duties": "Mainly transfer duty (often called stamp duty) on purchases of property, plus smaller duties.",
    "tax.land": "An annual tax on the unimproved value of land holdings above a threshold. The family home is generally exempt.",
    "tax.motor": "Vehicle registration fees and the duty paid when a vehicle is registered or transferred.",
    "tax.gambling": "Taxes on gaming machines, lotteries, betting, casinos and keno.",
    "tax.insurance": "Duties on insurance premiums.",
    "tax.other": "Everything else, including the emergency management levy, the waste disposal levy and competitive neutrality fees. Calculated as total taxation less the named taxes.",
    grants: "Money from the Commonwealth. GST is distributed between the states by formula; other grants are mostly tied to specific purposes such as hospitals, schools, roads and disaster recovery. Some of it is passed straight on to councils, universities and non-government schools.",
    "grants.gst": "Queensland's share of the national GST pool, set each year on the recommendation of the Commonwealth Grants Commission.",
    "grants.cwcur": "Commonwealth payments tied to specific purposes, such as hospital and school funding, including amounts the State passes on to others.",
    "grants.cwcap": "Commonwealth payments for capital works, mostly transport infrastructure.",
    "grants.other": "Grants and contributions from sources other than the Commonwealth.",
    royalties: "Payments by mining and petroleum companies for the right to extract the State's resources, plus rents on State land. Coal royalties rise and fall with world coal prices, which makes this the most volatile line in the Budget.",
    sales: "Fees and charges for services the government provides, such as hospital fees, transport and traffic fees, and rents.",
    interest: "Interest earned on the government's cash and investments.",
    dividends: "Dividends and tax-equivalent payments from government-owned corporations such as the energy, water and port businesses.",
    other: "Fines and forfeitures, assets contributed to the State, and other revenue not classified elsewhere.",
    "fn.gps": "The machinery of government: Parliament, central agencies, revenue collection, interest on public debt and transfers to other levels of government.",
    "fn.pos": "Police, fire and emergency services, courts and prisons.",
    "fn.eco": "Support for industries and the economy: agriculture, fisheries, mining, energy, tourism, employment programs and economic development.",
    "fn.env": "Protecting biodiversity, landscapes and national parks, and other environmental programs.",
    "fn.hca": "Housing development, community development and water supply.",
    "fn.hea": "Public hospitals, outpatient and community health services, mental health and public health.",
    "fn.rec": "Sport and recreation facilities, arts and cultural institutions.",
    "fn.edu": "State schools from prep to year 12, vocational education and training, and support for non-government schools.",
    "fn.soc": "Disability services, child safety, family support, social housing support and other assistance to people in need.",
    "fn.tra": "Roads, rail, buses, ferries and other public transport.",
    "ty.emp": "Wages and salaries of public servants: nurses, doctors, teachers, police and others.",
    "ty.sup": "Employer superannuation contributions and the interest cost of past defined-benefit liabilities.",
    "ty.ops": "Supplies and services, contractors, maintenance, and other running costs.",
    "ty.dep": "The cost of wearing out roads, hospitals, schools and other assets, spread over their useful lives.",
    "ty.int": "Interest on the government's borrowings.",
    "ty.gra": "Grants and subsidies paid to councils, non-government organisations, businesses and households.",
  };

  /* ------------------------------------------------------------ dialog and tooltip */
  var dlg;
  ML.info = function (title, html) {
    if (!dlg) {
      dlg = document.createElement("dialog");
      dlg.className = "pop";
      document.body.appendChild(dlg);
      dlg.addEventListener("click", function (e) { if (e.target === dlg) dlg.close(); });
    }
    dlg.innerHTML = '<div class="pop-body"><h3>' + ML.esc(title) + "</h3>" + html +
      '</div><div class="pop-foot"><button type="button">Close</button></div>';
    dlg.querySelector(".pop-foot button").onclick = function () { dlg.close(); };
    if (dlg.showModal) dlg.showModal(); else dlg.setAttribute("open", "");
  };
  ML.nodeInfo = function (node, fy, total, totalName) {
    var y = ML.yearInfo[fy];
    var src = D.sources[y.src];
    var ref = node.ref || (y.src === "bp2" ? "BP2 Chapter 8 (Uniform Presentation Framework)" : "Outcomes Report, Uniform Presentation Framework");
    var html = "<p>" + (ML.EXPLAIN[node.id] || "A published line in the Queensland Budget papers.") + "</p>" +
      "<dl><dt>Amount</dt><dd>" + ML.bn(node.value) + " (" + ML.mn(node.value) + ")</dd>" +
      (total ? "<dt>Share</dt><dd>" + ML.pct((node.value / total) * 100) + " of " + ML.esc(totalName) + "</dd>" : "") +
      "<dt>Per person</dt><dd>" + ML.dollars(ML.perPerson(node.value, fy)) + "</dd>" +
      "<dt>Year</dt><dd>" + ML.yearLabel(fy) + "</dd>" +
      "<dt>Source</dt><dd>" + ML.sourceLink(y.src, ref) + "</dd></dl>";
    ML.info(node.name, html);
  };

  var tipEl;
  ML.tip = {
    show: function (html, x, y) {
      if (!tipEl) { tipEl = document.createElement("div"); tipEl.className = "tip"; tipEl.setAttribute("role", "status"); document.body.appendChild(tipEl); }
      tipEl.innerHTML = html;
      tipEl.classList.add("on");
      var w = tipEl.offsetWidth, h = tipEl.offsetHeight;
      var left = Math.min(x + 14, window.innerWidth - w - 8), top = y - h - 12;
      if (top < 8) top = y + 18;
      tipEl.style.left = Math.max(8, left) + "px";
      tipEl.style.top = top + "px";
    },
    hide: function () { if (tipEl) tipEl.classList.remove("on"); },
  };

  /* ------------------------------------------------------------ squarified treemap */
  function squarify(items, x, y, w, h) {
    var out = [], rest = items.slice(), total = ML.sum(rest);
    if (!total) return out;
    var scale = (w * h) / total;
    var nodes = rest.map(function (n) { return { n: n, a: n.value * scale }; });
    function worst(row, len) {
      var s = 0, mx = 0, mn = Infinity;
      row.forEach(function (r) { s += r.a; mx = Math.max(mx, r.a); mn = Math.min(mn, r.a); });
      var s2 = s * s, l2 = len * len;
      return Math.max((l2 * mx) / s2, s2 / (l2 * mn));
    }
    function layout(row, x0, y0, w0, h0) {
      var s = row.reduce(function (a, r) { return a + r.a; }, 0);
      if (w0 >= h0) {
        var cw = s / h0, cy = y0;
        row.forEach(function (r) { var rh = r.a / cw; out.push({ n: r.n, x: x0, y: cy, w: cw, h: rh }); cy += rh; });
        return [x0 + cw, y0, w0 - cw, h0];
      }
      var rh2 = s / w0, cx = x0;
      row.forEach(function (r) { var rw = r.a / rh2; out.push({ n: r.n, x: cx, y: y0, w: rw, h: rh2 }); cx += rw; });
      return [x0, y0 + rh2, w0, h0 - rh2];
    }
    var row = [], box = [x, y, w, h];
    while (nodes.length) {
      var len = Math.min(box[2], box[3]);
      var c = nodes[0];
      if (!row.length || worst(row.concat([c]), len) <= worst(row, len)) { row.push(c); nodes.shift(); }
      else { box = layout(row, box[0], box[1], box[2], box[3]); row = []; }
    }
    if (row.length) layout(row, box[0], box[1], box[2], box[3]);
    return out;
  }

  ML.treemap = function (el, nodes, opts) {
    opts = opts || {};
    var pos = nodes.filter(function (n) { return n.value > 0; }).sort(function (a, b) { return b.value - a.value; });
    var total = opts.total || ML.sum(pos);
    el.innerHTML = "";
    var W = 1000, H = el.clientHeight && el.clientWidth ? (1000 * el.clientHeight) / el.clientWidth : 750;
    var rects = squarify(pos, 0, 0, W, H);
    var gap = 2;
    rects.forEach(function (r) {
      var t = document.createElement(r.n.children && opts.onDrill ? "button" : "div");
      t.className = "tm-tile" + (r.n.children && opts.onDrill ? " can-drill" : "");
      var pw = (r.w / W) * el.clientWidth, ph = (r.h / H) * el.clientHeight;
      if (pw * ph < 5200 || pw < 72 || ph < 34) t.classList.add("tiny");
      else if (ph < 76 || pw < 120) t.classList.add("small");
      t.style.left = "calc(" + (r.x / W) * 100 + "% + " + gap / 2 + "px)";
      t.style.top = "calc(" + (r.y / H) * 100 + "% + " + gap / 2 + "px)";
      t.style.width = "calc(" + (r.w / W) * 100 + "% - " + gap + "px)";
      t.style.height = "calc(" + (r.h / H) * 100 + "% - " + gap + "px)";
      t.innerHTML = '<span class="n">' + ML.esc(r.n.name) + '</span><span class="v">' + ML.bn(r.n.value) + (r.n.children && opts.onDrill ? " ↘" : "") + "</span>";
      var tipHtml = "<b>" + ML.esc(r.n.name) + "</b><br>" + ML.bn(r.n.value) + " · " + ML.pct((r.n.value / total) * 100) + " of " + ML.esc(opts.totalName || "total") +
        (r.n.children && opts.onDrill ? "<br><span style='opacity:.75'>Select to see what's inside</span>" : "");
      t.addEventListener("mousemove", function (e) { ML.tip.show(tipHtml, e.clientX, e.clientY); });
      t.addEventListener("mouseleave", ML.tip.hide);
      t.setAttribute("aria-label", r.n.name + ", " + ML.bn(r.n.value));
      if (r.n.children && opts.onDrill) t.addEventListener("click", function () { ML.tip.hide(); opts.onDrill(r.n); });
      el.appendChild(t);
    });
  };

  /* ------------------------------------------------------------ SVG helpers */
  var NS = "http://www.w3.org/2000/svg";
  function S(tag, attrs, parent) {
    var e = document.createElementNS(NS, tag);
    for (var k in attrs) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e);
    return e;
  }
  ML.S = S;
  function niceTicks(lo, hi, n) {
    var span = hi - lo || 1, step = Math.pow(10, Math.floor(Math.log10(span / n))), err = (n * step) / span;
    if (err <= 0.15) step *= 10; else if (err <= 0.35) step *= 5; else if (err <= 0.75) step *= 2;
    var t = [], s = Math.floor(lo / step) * step;
    for (var v = s; v <= hi + step * 0.5; v += step) t.push(Math.round(v * 1e6) / 1e6);
    return t;
  }
  ML.niceTicks = niceTicks;

  /* Line chart over financial years. Actual years drawn solid; estimate, Budget and projections dashed. */
  ML.lineChart = function (el, cfg) {
    var years = cfg.years || ML.years;
    var W = 640, H = cfg.height || 300, m = { t: 14, r: 16, b: 46, l: 56 };
    var vals = [];
    cfg.series.forEach(function (s) { years.forEach(function (y) { var v = s.values[y]; if (v !== null && v !== undefined) vals.push(v); }); });
    var lo = Math.min.apply(null, vals.concat(cfg.zero === false ? [] : [0])), hi = Math.max.apply(null, vals.concat(cfg.zero === false ? [] : [0]));
    var ticks = niceTicks(lo, hi, 5);
    lo = Math.min(lo, ticks[0]); hi = Math.max(hi, ticks[ticks.length - 1]);
    var x = function (i) { return m.l + (i * (W - m.l - m.r)) / (years.length - 1); };
    var yv = function (v) { return m.t + ((hi - v) * (H - m.t - m.b)) / (hi - lo || 1); };
    el.innerHTML = "";
    var svg = S("svg", { viewBox: "0 0 " + W + " " + H, role: "img", "aria-label": cfg.label || "Chart" }, el);
    var g = S("g", { class: "grid" }, svg);
    var fmtAxis = cfg.axisFmt || function (v) { return (v / 1000).toLocaleString("en-AU") ; };
    ticks.forEach(function (t) {
      S("line", { x1: m.l, x2: W - m.r, y1: yv(t), y2: yv(t), class: t === 0 ? "zero" : "" }, g);
      var tx = S("text", { x: m.l - 8, y: yv(t) + 4, "text-anchor": "end", class: "axis" }, svg);
      tx.textContent = fmtAxis(t);
    });
    // estimate shading
    var firstEst = years.findIndex(function (y) { return !ML.isActual(y); });
    if (firstEst > 0) {
      S("rect", { x: (x(firstEst - 1) + x(firstEst)) / 2, y: m.t, width: W - m.r - (x(firstEst - 1) + x(firstEst)) / 2, height: H - m.t - m.b, fill: "#f3ece6", opacity: 0.6 }, svg);
      var lt = S("text", { x: (x(firstEst - 1) + x(firstEst)) / 2 + 6, y: m.t + 12, class: "axis" }, svg);
      lt.textContent = "Estimates →";
    }
    years.forEach(function (y, i) {
      var t1 = S("text", { x: x(i), y: H - m.b + 18, "text-anchor": "middle", class: "axis" }, svg);
      t1.textContent = ML.disp(y).replace("20", "").replace("–20", "–");
      var t2 = S("text", { x: x(i), y: H - m.b + 32, "text-anchor": "middle", class: "axis", "font-size": 9 }, svg);
      t2.textContent = ML.isActual(y) ? "Actual" : ML.yearInfo[y].status === "budget" ? "Budget" : ML.yearInfo[y].status === "estimate" ? "Est." : "Proj.";
      if (y === cfg.highlight) S("line", { x1: x(i), x2: x(i), y1: m.t, y2: H - m.b, stroke: "#d88a10", "stroke-width": 1.5, "stroke-dasharray": "3 3" }, svg);
    });
    cfg.series.forEach(function (s) {
      var pts = years.map(function (y, i) { var v = s.values[y]; return v === null || v === undefined ? null : [x(i), yv(v), y]; });
      var solid = [], dash = [];
      pts.forEach(function (p, i) {
        if (!p) return;
        if (ML.isActual(p[2])) solid.push(p);
        if (!ML.isActual(p[2]) || (i + 1 < pts.length && pts[i + 1] && !ML.isActual(pts[i + 1][2]))) dash.push(p);
      });
      var path = function (a) { return a.map(function (p, i) { return (i ? "L" : "M") + p[0].toFixed(1) + "," + p[1].toFixed(1); }).join(""); };
      if (solid.length > 1) S("path", { d: path(solid), fill: "none", stroke: s.color, "stroke-width": 2.25, "stroke-linejoin": "round" }, svg);
      if (dash.length > 1) S("path", { d: path(dash), fill: "none", stroke: s.color, "stroke-width": 2.25, "stroke-dasharray": "6 4" }, svg);
      pts.forEach(function (p) {
        if (!p) return;
        S("circle", { cx: p[0], cy: p[1], r: 4, fill: ML.isActual(p[2]) ? s.color : "#fff", stroke: s.color, "stroke-width": 2 }, svg);
      });
    });
    // crosshair + tooltip
    var cross = S("line", { y1: m.t, y2: H - m.b, stroke: "#554a4d", "stroke-width": 1, opacity: 0 }, svg);
    var hit = S("rect", { x: m.l, y: m.t, width: W - m.l - m.r, height: H - m.t - m.b, fill: "transparent" }, svg);
    var fmt = cfg.fmt || ML.bn;
    hit.addEventListener("mousemove", function (e) {
      var r = svg.getBoundingClientRect(), px = ((e.clientX - r.left) / r.width) * W;
      var i = Math.max(0, Math.min(years.length - 1, Math.round(((px - m.l) / (W - m.l - m.r)) * (years.length - 1))));
      cross.setAttribute("x1", x(i)); cross.setAttribute("x2", x(i)); cross.setAttribute("opacity", 0.5);
      var html = "<b>" + ML.yearLabel(years[i]) + "</b>";
      cfg.series.forEach(function (s) {
        var v = s.values[years[i]];
        if (v !== null && v !== undefined) html += '<br><span class="sw" style="background:' + s.color + '"></span>' + ML.esc(s.name) + ": " + fmt(v);
      });
      ML.tip.show(html, e.clientX, e.clientY);
    });
    hit.addEventListener("mouseleave", function () { cross.setAttribute("opacity", 0); ML.tip.hide(); });
    if (cfg.legendEl) {
      cfg.legendEl.innerHTML = cfg.series.length > 1 || cfg.forceLegend ? cfg.series.map(function (s) {
        return '<span><i style="background:' + s.color + '"></i>' + ML.esc(s.name) + "</span>";
      }).join("") + '<span style="color:#85797c"><i class="dash" style="color:#85797c"></i>Estimate, Budget or projection</span>' : "";
    }
  };

  /* Vertical bar chart for one series over years, bars from zero, negatives below. */
  ML.barChart = function (el, cfg) {
    var years = cfg.years || ML.years;
    var W = 640, H = cfg.height || 260, m = { t: 14, r: 12, b: 46, l: 56 };
    var vals = years.map(function (y) { return cfg.values[y]; });
    var lo = Math.min(0, Math.min.apply(null, vals)), hi = Math.max(0, Math.max.apply(null, vals));
    var ticks = niceTicks(lo, hi, 5); lo = Math.min(lo, ticks[0]); hi = Math.max(hi, ticks[ticks.length - 1]);
    var bw = (W - m.l - m.r) / years.length;
    var yv = function (v) { return m.t + ((hi - v) * (H - m.t - m.b)) / (hi - lo || 1); };
    el.innerHTML = "";
    var svg = S("svg", { viewBox: "0 0 " + W + " " + H, role: "img", "aria-label": cfg.label || "Bar chart" }, el);
    var fmtAxis = cfg.axisFmt || function (v) { return (v / 1000).toLocaleString("en-AU"); };
    ticks.forEach(function (t) {
      S("line", { x1: m.l, x2: W - m.r, y1: yv(t), y2: yv(t), stroke: t === 0 ? "#554a4d" : "#e6ddd7" }, svg);
      var tx = S("text", { x: m.l - 8, y: yv(t) + 4, "text-anchor": "end", class: "axis" }, svg); tx.textContent = fmtAxis(t);
    });
    years.forEach(function (y, i) {
      var v = cfg.values[y], x0 = m.l + i * bw + bw * 0.18, w = bw * 0.64;
      var top = yv(Math.max(0, v)), h = Math.max(1, Math.abs(yv(v) - yv(0)));
      var col = typeof cfg.color === "function" ? cfg.color(v, y) : cfg.color;
      var est = !ML.isActual(y);
      var b = S("rect", { x: x0, y: top, width: w, height: h, rx: 3, fill: est ? "#fff" : col, stroke: col, "stroke-width": est ? 2 : 0, "stroke-dasharray": est ? "5 3" : "" }, svg);
      if (y === cfg.highlight) S("rect", { x: x0 - 3, y: m.t, width: w + 6, height: H - m.t - m.b, fill: "none", stroke: "#d88a10", "stroke-width": 1.5, rx: 3 }, svg);
      var t1 = S("text", { x: x0 + w / 2, y: H - m.b + 18, "text-anchor": "middle", class: "axis" }, svg);
      t1.textContent = ML.disp(y).replace("20", "").replace("–20", "–");
      var t2 = S("text", { x: x0 + w / 2, y: H - m.b + 32, "text-anchor": "middle", class: "axis", "font-size": 9 }, svg);
      t2.textContent = ML.isActual(y) ? "Actual" : ML.yearInfo[y].status === "budget" ? "Budget" : ML.yearInfo[y].status === "estimate" ? "Est." : "Proj.";
      var hit = S("rect", { x: m.l + i * bw, y: m.t, width: bw, height: H - m.t - m.b, fill: "transparent" }, svg);
      hit.addEventListener("mousemove", function (e) { ML.tip.show("<b>" + ML.yearLabel(y) + "</b><br>" + ML.esc(cfg.name || "") + ": " + (cfg.fmt || ML.bn)(v), e.clientX, e.clientY); });
      hit.addEventListener("mouseleave", ML.tip.hide);
    });
  };

  /* ------------------------------------------------------------ shell */
  ML.LOCAL = location.protocol === "file:";
  ML.HOME = ML.LOCAL ? "index.html" : "./";
  ML.pageName = function () { return (document.querySelector("[data-page]") || document.body).getAttribute("data-page"); };
  var PAGES = [
    [ML.HOME, "Overview"], ["questions.html", "Questions"], ["changes.html", "What changed?"],
    ["budget.html", "Full Budget"], ["portfolios.html", "Portfolios"], ["bottom-line.html", "Bottom line"], ["regions.html", "Regions"],
    ["track-record.html", "Track record"], ["sources.html", "Sources"], ["about.html", "About"],
  ];
  ML.LOGO = '<svg viewBox="0 0 64 64" aria-hidden="true"><rect x="2" y="2" width="60" height="60" rx="10" fill="#5a1222"/><rect x="2" y="2" width="60" height="60" rx="10" fill="none" stroke="#fbf3f5" stroke-opacity=".25" stroke-width="2"/><rect x="14" y="31" width="9" height="15" rx="1.5" fill="#f5e4ea"/><rect x="27.5" y="23" width="9" height="23" rx="1.5" fill="#f5e4ea"/><rect x="41" y="14" width="9" height="32" rx="1.5" fill="#fff"/><rect x="11" y="50" width="42" height="2.4" rx="1.2" fill="#d88a10"/><rect x="11" y="54.6" width="42" height="2.4" rx="1.2" fill="#d88a10"/></svg>';

  function shell() {
    var here = location.pathname.split("/").pop();
    if (ML.pageName() === "overview") here = ML.HOME;
    var header = document.getElementById("site-header");
    header.className = "site-header";
    header.innerHTML = '<div class="wrap"><a class="brand" href="' + ML.HOME + '">' + ML.LOGO +
      '<span class="brand-name">The Maroon Ledger<small>Queensland Budget, made clear</small></span></a>' +
      '<nav class="nav" aria-label="Main">' + PAGES.map(function (p) {
        return '<a href="' + p[0] + '"' + (p[0] === here ? ' aria-current="page"' : "") + ">" + p[1] + "</a>";
      }).join("") + "</nav></div>";
    var ctx = document.getElementById("context-bar");
    if (ctx) {
      var withYear = ctx.hasAttribute("data-year");
      ctx.className = "context-bar";
      ctx.innerHTML = '<div class="wrap"><span class="where">' +
        '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 4h12l4 4v12H4z" fill="none" stroke="#73182c" stroke-width="1.6"/><path d="M7 11h10M7 14h10M7 17h6" stroke="#d88a10" stroke-width="1.6"/></svg>' +
        "Queensland · State Budget · General Government Sector</span>" +
        (withYear ? '<label class="yearpick">Financial year <select class="fy-select" aria-label="Financial year">' + ML.yearOptions(ML.getFY()) + "</select></label>" : "") +
        "</div>";
      var sel = ctx.querySelector("select");
      if (sel) sel.addEventListener("change", function () { ML.setFY(sel.value); });
    }
    var f = document.getElementById("site-footer");
    f.className = "site-footer";
    f.innerHTML = '<div class="wrap"><div><a class="brand" href="' + ML.HOME + '">' + ML.LOGO.replace("<svg", '<svg style="width:34px;height:34px"') +
      '<span class="brand-name">The Maroon Ledger</span></a><p style="margin-top:12px;max-width:52ch">An independent guide to the Queensland State Budget, built from official published figures. Not a government publication.</p></div>' +
      '<div class="links"><a href="sources.html">Sources &amp; method</a><a href="about.html">About</a><a href="about.html#corrections">Report an error</a></div>' +
      '<div class="credit"><span>Figures: Queensland Treasury and ABS. Data built ' + D.built.split("-").reverse().join("/") + ".</span><span>Made by Conus Business Consultancy Services</span></div></div>";
  }

  ML.ready = function (fn) {
    if (document.readyState !== "loading") fn(); else document.addEventListener("DOMContentLoaded", fn);
  };
  ML.ready(function () {
    shell();
    var page = ML.pageName();
    if (window.MLPages && window.MLPages[page]) window.MLPages[page]();
    var t;
    window.addEventListener("resize", function () { clearTimeout(t); t = setTimeout(function () { document.dispatchEvent(new CustomEvent("mlresize")); }, 150); });
  });
})();
