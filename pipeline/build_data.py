"""Build the Maroon Ledger dataset.

Run:  python3 build_data.py
Reads: pipeline/sources/*  (official PDFs, open-data CSVs, ABS workbooks; kept locally so this re-runs offline)
Writes:
  pipeline/out/*.csv          intermediates, one tidy table per dataset
  pipeline/out/validation.txt every reconciliation check and its result
  site/assets/data.js         the dataset the site reads (window.ML_DATA)

All amounts are $ million, nominal, General Government Sector unless labelled NFPS.
"""
import csv
import json
import re
import datetime
from pathlib import Path

import extract_rsf as R
import extract_bp2 as B
import extract_other as O
from parse_lib import all_text

ROOT = Path(__file__).parent
OUT = ROOT / "out"
SITE = ROOT.parent / "site" / "assets"
OUT.mkdir(exist_ok=True)
SITE.mkdir(parents=True, exist_ok=True)

ACTUAL = R.RSF_YEARS                     # 2021-22 .. 2024-25
FWD = B.FWD                              # 2025-26 .. 2029-30
YEARS = ACTUAL + FWD
STATUS = {**{y: "actual" for y in ACTUAL}, "2025-26": "estimate", "2026-27": "budget",
          "2027-28": "projection", "2028-29": "projection", "2029-30": "projection"}
STATUS_LABEL = {"actual": "Actual", "estimate": "Estimated actual", "budget": "Budget",
                "projection": "Projection"}

SOURCES = {
    "bp2": {"title": "2026-27 Queensland Budget, Budget Paper 2: Budget Strategy and Outlook",
            "url": "https://budget.qld.gov.au/files/2026-27-budget-bp2-budget-strategy-outlook.pdf",
            "publisher": "Queensland Treasury", "date": "June 2026"},
    "bp3": {"title": "2026-27 Queensland Budget, Budget Paper 3: Capital Statement",
            "url": "https://budget.qld.gov.au/files/2026-27-budget-bp3-budget-capital-statement.pdf",
            "publisher": "Queensland Treasury", "date": "June 2026"},
    "myfer": {"title": "2025-26 Mid-Year Fiscal and Economic Review",
              "url": "https://www.treasury.qld.gov.au/files/mid-year-fiscal-and-economic-review-2025-26.pdf",
              "publisher": "Queensland Treasury", "date": "December 2025"},
    **{f"rsf{y}": {"title": f"{y} Report on State Finances of the Queensland Government",
                   "url": f"https://www.treasury.qld.gov.au/files/Report-on-State-Finances-{y}.pdf",
                   "publisher": "Queensland Treasury", "date": f"tabled after 30 June 20{y[-2:]}"} for y in ACTUAL},
    **{f"od{b}": {"title": f"{b} State Budget, Budget Paper 2 tables (open data)",
                  "url": f"https://www.data.qld.gov.au/dataset/{b}-state-budget-budget-paper-2-budget-strategy-and-outlook",
                  "publisher": "Queensland Government Open Data Portal", "date": b} for b in O.PAST_BUDGETS},
    "abs5220": {"title": "Australian National Accounts: State Accounts, 2024-25 (cat. 5220.0), Queensland",
                "url": "https://www.abs.gov.au/statistics/economy/national-accounts/australian-national-accounts-state-accounts/latest-release",
                "publisher": "Australian Bureau of Statistics", "date": "November 2025"},
    "abs3101": {"title": "National, state and territory population, March 2026 (cat. 3101.0)",
                "url": "https://www.abs.gov.au/statistics/people/population/national-state-and-territory-population/latest-release",
                "publisher": "Australian Bureau of Statistics", "date": "2026"},
    "abs3218": {"title": "Regional population, 2024-25 (cat. 3218.0), SA2 to SA4",
                "url": "https://www.abs.gov.au/statistics/people/population/regional-population/latest-release",
                "publisher": "Australian Bureau of Statistics", "date": "31 March 2026"},
}

checks = []


def check(name, a, b, tol=3.0):
    ok = a is not None and b is not None and abs(a - b) <= tol
    checks.append((("PASS" if ok else "FLAG"), name, a, b, None if a is None or b is None else round(a - b, 1)))
    return ok


def src_for(y, table):
    return {"src": f"rsf{y}" if y in ACTUAL else "bp2", "ref": table}


# ------------------------------------------------------------------ extract
rsf = R.extract_all()
bop, bbs, bcf = B.operating(), B.balance(), B.cashflow()
bfn, bfn_total = B.functions()
bpn, bpn_total = B.pnfa_functions()
brev = B.revenue_detail()

# ------------------------------------------------------------------ headline series
HKEYS = ["revenue", "expenses", "nob", "pnfa", "fiscal_balance",
         "rev_tax", "rev_grants", "rev_sales", "rev_interest", "rev_dividends", "rev_other",
         "exp_employee", "exp_super_int", "exp_super_other", "exp_other_op", "exp_depreciation",
         "exp_interest", "exp_grants", "exp_other_property"]
BKEYS = ["ggs_borrowing", "ggs_net_debt", "nfps_borrowing", "nfps_net_debt", "ggs_net_worth"]
CKEYS = ["cash_receipts", "cash_payments", "cash_net_operating", "cash_surplus"]

series = {}
for y in YEARS:
    s = {}
    if y in ACTUAL:
        d = rsf[y]
        for k in HKEYS: s[k] = d["op"][k]
        for k in BKEYS: s[k] = d["bs"][k]
        for k in CKEYS: s[k] = d["cf"][k]
    else:
        for k in HKEYS: s[k] = bop[k][y]
        for k in BKEYS: s[k] = bbs[k][y]
        for k in CKEYS: s[k] = bcf[k][y]
    series[y] = s

# ------------------------------------------------------------------ context: GSP and population
bp2txt = all_text(B.PDF)
FRAC = {"¼": .25, "½": .5, "¾": .75}


def frac(s):
    s = s.strip().rstrip("%")
    v = 0.0
    if s and s[-1] in FRAC:
        v, s = FRAC[s[-1]], s[:-1]
    return (float(s) if s else 0.0) + v


m = re.search(r"Population\s+([\d.]+)\s+(\S+)\s+(\S+)\s+(\S+)\s+(\S+)\s+(\S+)", bp2txt)
pop_growth = dict(zip(B.ALL_FWD, [frac(x) for x in m.groups()[1:]]))
m = re.search(r"nominal GSP growth rates\s+are ([\d.]+)% in 2024-25, (\S+?)% in 2025-26, (\S+?)% in 2026-27, (\S+?) in 2027-28,"
              r" (\S+?)% in 2028-29 and (\S+?)% in\s+2029-30", bp2txt.replace("\n", " ").replace("  ", " "))
assert m, "nominal GSP growth note not found"
gsp_growth = dict(zip(B.ALL_FWD, [frac(x) for x in m.groups()[1:]]))
gsp_a, erp = O.abs_gsp(), O.abs_erp_june()
check("BP2 nominal GSP growth 2024-25 vs ABS", float(m.group(1)), round((gsp_a["2024-25"] / gsp_a["2023-24"] - 1) * 100, 1), tol=0.05)

context = {}
g, p = gsp_a["2024-25"], erp["2024-25"]
for y in YEARS:
    if y in ACTUAL:
        context[y] = {"gsp": gsp_a[y], "gsp_basis": "ABS actual", "pop": erp[y], "pop_basis": "ABS ERP, 30 June"}
    else:
        g *= 1 + gsp_growth[y] / 100
        p *= 1 + pop_growth[y] / 100
        context[y] = {"gsp": round(g), "gsp_basis": f"Derived: grown at Budget nominal GSP forecast ({gsp_growth[y]}%)",
                      "pop": round(p), "pop_basis": f"Derived: 30 June 2025 ERP grown at Budget population forecast ({pop_growth[y]}%)"}

# ------------------------------------------------------------------ revenue tree
TAX_NAMES = [("payroll", "Payroll tax"), ("duties", "Transfer and other duties"), ("land", "Land tax"),
             ("motor", "Motor vehicle taxes"), ("gambling", "Gambling taxes"), ("insurance", "Insurance taxes"),
             ("other", "Other taxes")]


def revenue_tree(y):
    s = series[y]
    if y in ACTUAL:
        d = rsf[y]
        tax = d["tax"]; gr = d["grants"]
        roy_total = d["roy"]["royalties"] + d["roy"]["land_rents"]
        if y == "2024-25":
            check("2024-25 royalties: RSF note vs BP2 Table 3.4", roy_total, brev["_check_2024_25"]["roy_total"])
        roy_children = [("Royalties", d["roy"]["royalties"]), ("Land rents", d["roy"]["land_rents"])]
        tsrc, gsrc, rsrc = f"RSF {y}, GGS Taxes", f"RSF {y}, GGS Grants Revenue", f"RSF {y}, AASB 1049 note: Other revenue"
    else:
        tax = {k: brev["tax"][k][y] for k in brev["tax"]}
        gr = {k: brev["grants"][k][y] for k in brev["grants"]}
        rv = brev["roy"]
        roy_total = rv["total"][y]
        roy_children = [("Coal royalties", rv["coal"][y]), ("Petroleum royalties", rv["petroleum"][y]),
                        ("Other royalties", rv["other_roy"][y]), ("Land rents", rv["land_rents"][y])]
        tsrc, gsrc, rsrc = "BP2 Table 3.2", "BP2 Table 3.3", "BP2 Table 3.4"
    check(f"{y} tax children = taxation revenue", sum(tax[k] for k, _ in TAX_NAMES), s["rev_tax"])
    check(f"{y} grant children = grants revenue", gr["gst"] + gr["cw_current"] + gr["cw_capital"] + gr["other"], s["rev_grants"])
    other_rem = s["rev_other"] - roy_total
    node = lambda id_, name, v, kids=None, ref=None: {"id": id_, "name": name, "value": v,
                                                      **({"children": kids} if kids else {}), **({"ref": ref} if ref else {})}
    kids = [
        node("tax", "Taxation", s["rev_tax"], [node("tax." + k, n, tax[k], ref=tsrc) for k, n in TAX_NAMES], tsrc),
        node("grants", "Commonwealth grants and GST", s["rev_grants"], [
            node("grants.gst", "GST payments", gr["gst"], ref=gsrc),
            node("grants.cwcur", "Other Commonwealth current grants", gr["cw_current"], ref=gsrc),
            node("grants.cwcap", "Commonwealth capital grants", gr["cw_capital"], ref=gsrc),
            node("grants.other", "Other grants and contributions", gr["other"], ref=gsrc)], gsrc),
        node("royalties", "Royalties and land rents", roy_total,
             [node("royalties." + re.sub(r"\W", "", n.lower()), n, v, ref=rsrc) for n, v in roy_children], rsrc),
        node("sales", "Sales of goods and services", s["rev_sales"]),
        node("interest", "Interest income", s["rev_interest"]),
        node("dividends", "Dividends and tax equivalents from GOCs", s["rev_dividends"]),
        node("other", "Fines and other revenue", other_rem),
    ]
    check(f"{y} revenue tree = total revenue", sum(k["value"] for k in kids), s["revenue"])
    return kids


# 2024-25: replace the two-way royalties split with BP2 Table 3.4's commodity split (same total)
def _fix_2024_25(tree):
    t34 = B.table("Table 3.4         Royalty revenue1", "Notes:")
    from parse_lib import pick
    vals = [("Coal royalties", pick(t34, "Coal", 0)), ("Petroleum royalties", pick(t34, "Petroleum", 0)),
            ("Other royalties", pick(t34, "Other royalties", 0)), ("Land rents", pick(t34, "Land rents", 0))]
    r = next(k for k in tree if k["id"] == "royalties")
    check("2024-25 royalties: commodity split sums to RSF total", sum(v for _, v in vals), r["value"])
    r["children"] = [{"id": "royalties." + re.sub(r"\W", "", n.lower()), "name": n, "value": v, "ref": "BP2 Table 3.4 (2024-25 actual)"} for n, v in vals]
    return tree


revenue = {y: revenue_tree(y) for y in YEARS}
revenue["2024-25"] = _fix_2024_25(revenue["2024-25"])

# ------------------------------------------------------------------ expenses by purpose (GFS function)
FN_PLAIN = {"gps": "General public services", "pos": "Public order and safety", "eco": "Economic affairs",
            "env": "Environmental protection", "hca": "Housing and community amenities", "hea": "Health",
            "rec": "Recreation, culture and religion", "edu": "Education", "soc": "Social protection",
            "tra": "Transport"}
expenses_fn = {}
for y in YEARS:
    kids = []
    if y in ACTUAL:
        fn = rsf[y]["fn"]
        check(f"{y} functions sum = total expenses", sum(v["value"] for v in fn.values()), series[y]["expenses"])
        for k, name in R.FUNCTIONS:
            ch = fn[k]["children"]
            check(f"{y} {name}: sub-functions sum to function", sum(c["value"] for c in ch), fn[k]["value"])
            kids.append({"id": "fn." + k, "name": FN_PLAIN[k], "value": fn[k]["value"], "ref": f"RSF {y}, GGS Expenses by Function",
                         "children": [{"id": f"fn.{k}.{i}", "name": c["name"], "value": c["value"]} for i, c in enumerate(ch) if c["value"]]})
    else:
        check(f"{y} functions sum = total expenses", sum(bfn[k][y] for k in bfn), series[y]["expenses"])
        for k, name in R.FUNCTIONS:
            kids.append({"id": "fn." + k, "name": FN_PLAIN[k], "value": bfn[k][y], "ref": "BP2 Table 8.14"})
    expenses_fn[y] = kids

# expenses by type (nature)
expenses_type = {}
for y in YEARS:
    s = series[y]
    kids = [
        {"id": "ty.emp", "name": "Employee expenses", "value": s["exp_employee"]},
        {"id": "ty.sup", "name": "Superannuation", "value": s["exp_super_int"] + s["exp_super_other"]},
        {"id": "ty.ops", "name": "Supplies, services and other operating", "value": s["exp_other_op"] + s["exp_other_property"]},
        {"id": "ty.dep", "name": "Depreciation and amortisation", "value": s["exp_depreciation"]},
        {"id": "ty.int", "name": "Interest", "value": s["exp_interest"]},
        {"id": "ty.gra", "name": "Grants paid", "value": s["exp_grants"]},
    ]
    check(f"{y} expense types sum = total expenses", sum(k["value"] for k in kids), s["expenses"])
    expenses_type[y] = kids

# capital purchases by function
capex_fn = {}
for y in YEARS:
    if y in ACTUAL:
        d, tot = rsf[y]["pnfa_fn"], rsf[y]["pnfa_total"]
        vals = {k: d[k] for k, _ in R.FUNCTIONS}
    else:
        vals, tot = {k: bpn[k][y] for k, _ in R.FUNCTIONS}, bpn_total[y]
    check(f"{y} capital by function sums to total", sum(vals.values()), tot)
    check(f"{y} capital by function total = operating statement PNFA", tot, series[y]["pnfa"])
    capex_fn[y] = [{"id": "cx." + k, "name": FN_PLAIN[k], "value": vals[k]} for k, _ in R.FUNCTIONS]

# ------------------------------------------------------------------ cross-checks between documents
c = bop["_check_2024_25"]
for k in ["revenue", "expenses", "nob"]:
    check(f"2024-25 {k}: RSF 2024-25 vs BP2 2026-27 outcome column", series["2024-25"][k], c[k])
for k in ["ggs_net_debt", "nfps_net_debt"]:
    check(f"2024-25 {k}: RSF vs BP2", series["2024-25"][k], bbs["_check_2024_25"][k])
check("2024-25 tax: RSF vs BP2 Table 3.2", series["2024-25"]["rev_tax"], brev["_check_2024_25"]["tax_total"])
for y in YEARS:
    s = series[y]
    check(f"{y} revenue - expenses = NOB", s["revenue"] - s["expenses"], s["nob"])

# outcomes restated in later Budgets' open-data balance sheets
for b, (op_, gb, nb) in O.PAST_BUDGETS.items():
    for t, key in [(gb, "ggs_net_debt"), (nb, "nfps_net_debt")]:
        rs = O._csv(b, t)
        for (fy, kind), col in O._cols(rs).items():
            if kind == "Outcome" and fy in series:
                check(f"{fy} {key}: RSF vs {b} Budget open data outcome", series[fy][key], O._val(rs, "Net Debt", col))

# key aggregates table 2.1 vs operating statement
from parse_lib import pick
ka = B.key_aggregates_table()
for y in FWD:
    i = B.ALL_FWD.index(y)
    check(f"{y} Table 2.1 GGS net debt vs balance sheet", pick(ka, "Net debt", 2 + i), series[y]["ggs_net_debt"])

# ------------------------------------------------------------------ reconciliations ("What moved the bottom line")
def recon_block(pub, from_, years, lines, srcid, ref):
    start = dict(lines)["start"]; end = dict(lines)["end"]
    mid = [(k, v) for k, v in lines if k not in ("start", "end")]
    for i, y in enumerate(years):
        check(f"{pub} reconciliation {y}: start + changes = end", start[i] + sum(v[i] for _, v in mid), end[i])
    POLICY = {"Revenue measures", "Expense measures", "Additional enterprise bargaining expenses"}
    return {"publication": pub, "from": from_, "years": years, "src": srcid, "ref": ref,
            "start": start, "end": end,
            "lines": [{"name": k, "group": "decision" if k in POLICY else "parameter", "values": v} for k, v in mid]}


ry, rl = B.reconciliation()
my, ml = O.myfer_reconciliation()
reconciliations = [
    recon_block("2026-27 Budget", "2025-26 MYFER", ry, rl, "bp2", "Table 2.2"),
    recon_block("2025-26 MYFER", "2025-26 Budget", my, ml, "myfer", "Table 3"),
]

# ------------------------------------------------------------------ track record (Budget vs outcome)
past = O.past_budget_forecasts()
track = []
for b, yrs in past.items():
    f = yrs[b]
    out = series[b]
    track.append({"fy": b, "budget": f, "outcome": {k: out[k] for k in ["revenue", "expenses", "nob", "pnfa", "fiscal_balance", "ggs_net_debt", "nfps_net_debt"]},
                  "outcome_status": STATUS[b], "src_budget": f"od{b}", "src_outcome": f"rsf{b}" if b in ACTUAL else "bp2"})
# full forecast vintages for the 'how the forecast moved' chart
vintages = {b: {y: v for y, v in yrs.items()} for b, yrs in past.items()}
vintages["2026-27"] = {y: {k: series[y][k] for k in ["revenue", "expenses", "nob", "ggs_net_debt", "nfps_net_debt"]} for y in FWD if y >= "2026-27"}

# ------------------------------------------------------------------ regions
reg = O.bp3_regions()
sa4pop = O.abs_sa4_erp_2025()
check("BP3 regions sum to Totals column", sum(v["Funds allocated"] for k, v in reg.items() if k != "TOTAL"), reg["TOTAL"]["Funds allocated"], tol=5)
check("BP3 total = $23.938bn purchases quoted in BP3 text", reg["TOTAL"]["Funds allocated"], 23938.0, tol=1)
GREATER_BRIS = {"Brisbane - East", "Brisbane - North", "Brisbane - South", "Brisbane - West", "Brisbane Inner City",
                "Ipswich", "Logan - Beaudesert", "Moreton Bay - North", "Moreton Bay - South"}
regions = []
for name, vals in reg.items():
    if name == "TOTAL":
        continue
    ents = {k: v for k, v in vals.items() if k not in ("Funds allocated",) and not k.startswith("Anticipated") and v}
    regions.append({"name": name, "total": vals["Funds allocated"], "pop": sa4pop.get(name),
                    "greater_brisbane": name in GREATER_BRIS,
                    "entities": sorted([{"name": k, "value": v} for k, v in ents.items()], key=lambda e: -e["value"])})
    if sa4pop.get(name) is None:
        checks.append(("FLAG", f"no ABS population for SA4 '{name}'", None, None, None))

# ------------------------------------------------------------------ cash flow items
cash_items = {}
for y in YEARS:
    if y in ACTUAL:
        rc, pm = rsf[y]["cf"]["cash_receipts_items"], rsf[y]["cf"]["cash_payments_items"]
    else:
        rc = {k: v[y] for k, v in bcf["cash_receipts_items"].items()}
        pm = {k: v[y] for k, v in bcf["cash_payments_items"].items()}
    check(f"{y} cash receipt items sum to total", sum(rc.values()), series[y]["cash_receipts"])
    check(f"{y} cash payment items sum to total", sum(pm.values()), series[y]["cash_payments"])
    check(f"{y} receipts - payments = net cash from operating", series[y]["cash_receipts"] - series[y]["cash_payments"], series[y]["cash_net_operating"])
    cash_items[y] = {"receipts": rc, "payments": pm}

# ------------------------------------------------------------------ portfolios (Service Delivery Statements)
import extract_sds as SDSX
sds_entities = SDSX.extract()
portfolios = SDSX.to_site(sds_entities, check)
SOURCES["sds"] = {"title": "2026-27 Queensland Budget, Service Delivery Statements (one per portfolio)",
                  "url": "https://budget.qld.gov.au/budget-papers/", "publisher": "Queensland Treasury", "date": "June 2026"}
# BP2 Table 4.2: funded controlled FTEs by department, for comparison with each SDS staffing table
t42 = B.table("Table 4.2     Funded Controlled FTE positions by department 1", "Notes:")
bp2_fte = {}
for lab, nums_ in t42:
    if len(nums_) >= 3 and lab and not lab.startswith("Total"):
        bp2_fte[SDSX.norm(lab)] = nums_[-1]
for p_ in portfolios:
    key = SDSX.norm(re.sub(r"^Department of (the )?", "", p_["name"]))
    alias = {"queenslandpublictrustee": "thepublictrusteeofqueensland", "officeoftheinspectorgeneralofemergencymanagement": "officeoftheinspectorgeneralemergencymanagement"}
    k2 = alias.get(key, key)
    v = bp2_fte.get(k2) or next((vv for kk, vv in bp2_fte.items() if kk[:28] == k2[:28]), None)
    if v is not None:
        p_["fte_bp2"] = v
with open(OUT / "portfolios_2026-27.csv", "w", newline="") as f:
    w = csv.writer(f); w.writerow(["entity", "kind", "item_type", "item", "2025-26 budget", "2025-26 est actual", "2026-27 budget"])
    for p_ in portfolios:
        for sa in p_.get("service_areas", []):
            w.writerow([p_["name"], p_["kind"], "expenses by service area ($m)", sa["name"]] + sa["v"])
        for x in p_.get("expense_types", []):
            w.writerow([p_["name"], p_["kind"], "expenses by type ($m)", x["name"]] + x["v"])
        if p_.get("fte"):
            for r_ in p_["fte"]["rows"]:
                w.writerow([p_["name"], p_["kind"], "FTEs", r_["name"]] + r_["v"])
            w.writerow([p_["name"], p_["kind"], "FTEs", "Total FTEs"] + p_["fte"]["total"])
        for mm in p_["measures"]:
            w.writerow([p_["name"], p_["kind"], "measure: " + (mm["type"] or ""), (mm["area"] or "") + " | " + mm["name"], mm["t"], mm["ea"], mm["t2"]])

# ------------------------------------------------------------------ write intermediates
with open(OUT / "series.csv", "w", newline="") as f:
    w = csv.writer(f); keys = HKEYS + BKEYS + CKEYS
    w.writerow(["fy", "status"] + keys + ["gsp", "pop"])
    for y in YEARS:
        w.writerow([y, STATUS[y]] + [series[y][k] for k in keys] + [context[y]["gsp"], context[y]["pop"]])


def flat(tree, y, path=""):
    for n in tree:
        yield [y, path + n["name"], n["value"], n.get("ref", "")]
        if n.get("children"):
            yield from flat(n["children"], y, path + n["name"] + " > ")


for nm, dset in [("revenue_tree", revenue), ("expenses_by_purpose", expenses_fn), ("expenses_by_type", expenses_type), ("capital_by_purpose", capex_fn)]:
    with open(OUT / f"{nm}.csv", "w", newline="") as f:
        w = csv.writer(f); w.writerow(["fy", "item", "value_$m", "source_ref"])
        for y in YEARS:
            w.writerows(flat(dset[y], y))
with open(OUT / "regions_2026-27.csv", "w", newline="") as f:
    w = csv.writer(f); w.writerow(["sa4", "capital_purchases_$m", "erp_june_2025", "per_person_$"])
    for r_ in regions:
        w.writerow([r_["name"], round(r_["total"], 3), r_["pop"], round(r_["total"] * 1e6 / r_["pop"]) if r_["pop"] else ""])
with open(OUT / "track_record.csv", "w", newline="") as f:
    w = csv.writer(f); w.writerow(["fy", "measure", "budget", "outcome", "outcome_status", "difference"])
    for t in track:
        for k in ["revenue", "expenses", "nob", "ggs_net_debt"]:
            w.writerow([t["fy"], k, t["budget"][k], t["outcome"][k], t["outcome_status"], t["outcome"][k] - t["budget"][k]])
with open(OUT / "reconciliations.csv", "w", newline="") as f:
    w = csv.writer(f); w.writerow(["publication", "line", "group"] + reconciliations[0]["years"])
    for rc in reconciliations:
        w.writerow([rc["publication"], f"{rc['from']} NOB", "start"] + rc["start"])
        for ln in rc["lines"]:
            w.writerow([rc["publication"], ln["name"], ln["group"]] + ln["values"])
        w.writerow([rc["publication"], f"{rc['publication']} NOB", "end"] + rc["end"])

flags = [c for c in checks if c[0] == "FLAG"]
with open(OUT / "validation.txt", "w") as f:
    f.write(f"Maroon Ledger data build {datetime.datetime.now():%Y-%m-%d %H:%M}\n")
    f.write(f"{len(checks)} checks, {len(checks) - len(flags)} pass, {len(flags)} flagged (tolerance $3m unless stated)\n\n")
    for c_ in checks:
        f.write(f"{c_[0]}  {c_[1]}: {c_[2]} vs {c_[3]} (diff {c_[4]})\n")

# ------------------------------------------------------------------ write data.js
data = {
    "built": datetime.date.today().isoformat(),
    "currentBudget": "2026-27",
    "years": [{"fy": y, "status": STATUS[y], "label": STATUS_LABEL[STATUS[y]],
               "src": f"rsf{y}" if y in ACTUAL else "bp2"} for y in YEARS],
    "series": series, "context": context,
    "revenue": revenue, "expensesByPurpose": expenses_fn, "expensesByType": expenses_type, "capitalByPurpose": capex_fn, "cashItems": cash_items,
    "reconciliations": reconciliations, "track": track, "vintages": vintages,
    "regions": {"fy": "2026-27", "src": "bp3", "ref": "Appendix C", "popSrc": "abs3218", "total": reg["TOTAL"]["Funds allocated"],
                "items": regions},
    "sources": SOURCES,
    "portfolios": portfolios,
    "flags": [{"check": c_[1], "a": c_[2], "b": c_[3], "diff": c_[4]} for c_ in flags],
}
(SITE / "data.js").write_text("/* Generated by pipeline/build_data.py — do not edit by hand */\nwindow.ML_DATA = "
                              + json.dumps(data, separators=(",", ":")) + ";\n")
print(f"{len(checks)} checks, {len(flags)} flagged")
for c_ in flags:
    print("  FLAG", c_)
