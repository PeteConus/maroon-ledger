"""Extract General Government Sector actuals from each Report on State Finances.

Column layout of the 'by Sector' UPF tables (checked in every RSF 2021-22 to 2024-25):
  GGS Est.Actual | GGS Outcome | PNFC Est.Actual | PNFC Outcome | NFPS Est.Actual | NFPS Outcome | PFC | SFS
So GGS outcome = numbers[1], NFPS outcome = numbers[5].
"""
import re
from parse_lib import page_text, find_page, rows, pick, norm, split_line, num

RSF_YEARS = ["2021-22", "2022-23", "2023-24", "2024-25"]
GGS, NFPS = 1, 5

FUNCTIONS = [
    ("gps", "General public services"),
    ("pos", "Public order and safety"),
    ("eco", "Economic affairs"),
    ("env", "Environmental protection"),
    ("hca", "Housing and community amenities"),
    ("hea", "Health"),
    ("rec", "Recreation, culture and religion"),
    ("edu", "Education"),
    ("soc", "Social protection"),
    ("tra", "Transport"),
]


def pdf(y):
    return f"RSF-{y}.pdf"


def sector_page(y, title):
    return find_page(pdf(y), [title, "by Sector ($ million)"], maxpage=25)


def operating(y):
    t = page_text(pdf(y), sector_page(y, "Operating Statement"))
    r = rows(t)
    g = lambda lab, occ=1: pick(r, lab, GGS, occurrence=occ)
    d = {
        "rev_tax": g("Taxation revenue"),
        "rev_grants": g("Grants revenue"),
        "rev_sales": g("Sales of goods and services"),
        "rev_interest": g("Interest income"),
        "rev_dividends": g("Dividend and income tax equivalent income"),
        "rev_other": g("Other revenue"),
        "revenue": g("Total Revenue from Transactions"),
        "exp_employee": g("Employee expenses"),
        "exp_super_int": g("Superannuation interest cost"),
        "exp_super_other": g("Other superannuation expenses"),
        "exp_other_op": g("Other operating expenses"),
        "exp_depreciation": g("Depreciation and amortisation"),
        "exp_interest": g("Other interest expenses"),
        "exp_grants": g("Grants expenses"),
        "expenses": g("Total Expenses from Transactions"),
        "nob": g("Net Operating Balance"),
        "pnfa": g("Purchases of non-financial assets"),
        "fiscal_balance": g("Fiscal Balance"),
    }
    try:
        d["exp_other_property"] = g("Other property expenses")
    except KeyError:
        d["exp_other_property"] = 0.0
    return d


def balance(y):
    t = page_text(pdf(y), sector_page(y, "Balance Sheet"))
    r = rows(t)
    return {
        "ggs_borrowing": pick(r, "Borrowing", GGS),
        "ggs_net_debt": pick(r, "Net Debt", GGS),
        "nfps_borrowing": pick(r, "Borrowing", NFPS),
        "nfps_net_debt": pick(r, "Net Debt", NFPS),
        "ggs_net_worth": pick(r, "Net Worth", GGS),
    }


def cashflow(y):
    t = page_text(pdf(y), sector_page(y, "Cash Flow Statement"))
    r = rows(t)
    rec = ["Taxes received", "Grants and subsidies received", "Sales of goods and services",
           "Interest receipts", "Dividends and income tax equivalents", "Other receipts"]
    pay = ["Payments for employees", "Payments for goods and services", "Grants and subsidies",
           "Interest paid", "Other payments"]
    d = {}
    d["cash_receipts_items"] = {k: pick(r, k, GGS) for k in rec}
    # 'Grants and subsidies' first match is 'Grants and subsidies received'; take the payment row
    payitems = {}
    for k in pay:
        if k == "Grants and subsidies":
            payitems[k] = -pick(r, k, GGS, startswith=False)
        else:
            payitems[k] = -pick(r, k, GGS)
    d["cash_payments_items"] = payitems
    d["cash_receipts"] = sum(d["cash_receipts_items"].values())
    d["cash_payments"] = sum(payitems.values())
    d["cash_net_operating"] = pick(r, "Net Cash Flows from Operating Activities", GGS)
    d["cash_surplus"] = pick(r, "Cash Surplus/(Deficit)", GGS)
    return d


def taxes(y):
    p = find_page(pdf(y), ["UPF Data", "Taxes on employers"], maxpage=25)
    r = rows(page_text(pdf(y), p))
    # outcome is the only numeric column on this page
    v = lambda lab, occ=1, after=None: pick(r, lab, -1, occurrence=occ, after=after)
    d = {
        "payroll": v("Taxes on employers"),
        "land": v("Land taxes"),
        "duties": v("Stamp duties on financial and capital transactions"),
        "gambling": v("Taxes on gambling"),
        "insurance": v("Taxes on insurance"),
        "motor": v("Motor vehicle taxes"),
        "total": v("Total Taxation Revenue"),
    }
    d["other"] = d["total"] - sum(d[k] for k in ["payroll", "land", "duties", "gambling", "insurance", "motor"])
    return d


def grants(y):
    p = find_page(pdf(y), ["UPF Data", "Grants Revenue"], maxpage=25)
    t = page_text(pdf(y), p)
    t = t[t.index("Grants Revenue"):]
    t = t[: t.index("Total grants revenue") + 200]
    r = rows(t)
    v = lambda lab, occ=1: pick(r, lab, -1, occurrence=occ)
    gst = v("General purpose grants")
    spg = v("Specific purpose grants", 1)
    try:
        onpass = v("Specific purpose grants for on-passing")
    except KeyError:
        onpass = 0.0
    try:
        gp_on = v("General purpose grants for on-passing")
    except KeyError:
        gp_on = 0.0
    cur_other = v("Other contributions and grants", 1)
    cap_spg = v("Specific purpose grants", 3 if onpass else 2)
    cap_other = v("Other contributions and grants", 2)
    total = v("Total grants revenue")
    d = {"gst": gst, "cw_current": spg + onpass + gp_on, "cw_capital": cap_spg,
         "other": cur_other + cap_other, "total": total}
    return d


def royalties(y):
    """Royalties and land rents from the AASB 1049 'Other revenue' note (GGS current-year column)."""
    for p in range(40, 80):
        t = page_text(pdf(y), p)
        if re.search(r"^\s*Royalties\s{2,}[\d,]+", t, re.M) and "Land rents" in t:
            r = rows(t)
            roy = pick(r, "Royalties", 0, startswith=False)
            lr = pick(r, "Land rents", 0)
            return {"royalties": roy, "land_rents": lr, "page": p}
    raise ValueError("royalties note not found " + y)


SUBFN_ALIASES = {}


def functions(y):
    """GGS expenses by function, with sub-functions (two-column layout)."""
    p = find_page(pdf(y), ["UPF Data", "Expenses by Function"], maxpage=25)
    t = page_text(pdf(y), p)
    t = t[t.index("Expenses by Function"):]
    t = t[: t.index("Total") + 120]
    # split each line into left/right halves at the column gutter
    lines = t.splitlines()
    # find column split: position of the right-hand function header 'Health'
    hl = next(l for l in lines if re.search(r"\bHealth\s{2,}[\d,]", l))
    cut = hl.index("Health")
    left = "\n".join(l[:cut] for l in lines)
    right = "\n".join(l[cut:] for l in lines)
    items = []
    for half in (left, right):
        pend = ""
        for ln in half.splitlines():
            lab, nums = split_line(ln)
            lab = lab.replace("||", "").strip()
            if nums and lab:
                full = (pend + " " + lab).strip() if pend and lab[:1].islower() else lab
                items.append((full, nums[-1], ln[: len(ln) - len(ln.lstrip())]))
                pend = ""
            elif nums and not lab:
                items.append((pend, nums[-1], ""))
                pend = ""
            elif lab and not nums:
                pend = (pend + " " + lab).strip() if pend else lab
    # assemble tree: top-level function names match FUNCTIONS (case-insensitive)
    fnames = {norm(n): k for k, n in FUNCTIONS}
    tree, cur = {}, None
    total = None
    for lab, v, _ in items:
        nl = norm(lab)
        if nl in fnames and fnames[nl] not in tree:
            cur = fnames[nl]
            tree[cur] = {"value": num(v), "children": []}
        elif nl == "total":
            total = num(v)
        elif cur and lab and lab != "Expenses by Function":
            name = lab.strip()
            if norm(name) == norm(dict(FUNCTIONS)[cur]):
                name += " n.e.c."
            tree[cur]["children"].append({"name": name, "value": num(v)})
    return tree, total


def pnfa_functions(y):
    p = find_page(pdf(y), ["UPF Data", "Purchases of Non-financial Assets by Function"], maxpage=25)
    t = page_text(pdf(y), p)
    t = t[t.index("Purchases of Non-financial Assets by Function"):]
    r = rows(t)
    return {k: pick(r, n, -1) for k, n in FUNCTIONS}, pick(r, "Total", -1)


def extract_all():
    out = {}
    for y in RSF_YEARS:
        d = {"op": operating(y), "bs": balance(y), "cf": cashflow(y), "tax": taxes(y),
             "grants": grants(y), "roy": royalties(y)}
        d["fn"], d["fn_total"] = functions(y)
        d["pnfa_fn"], d["pnfa_total"] = pnfa_functions(y)
        out[y] = d
    return out


if __name__ == "__main__":
    import json
    res = extract_all()
    print(json.dumps(res, indent=1)[:6000])
