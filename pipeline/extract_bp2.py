"""Extract 2025-26 estimated actual, 2026-27 Budget and projections to 2029-30
from 2026-27 Budget Paper 2 (Budget Strategy and Outlook)."""
from parse_lib import all_text, rows, pick, text_between

PDF = "2026-27-budget-bp2-budget-strategy-outlook.pdf"
ALL_FWD = ["2025-26", "2026-27", "2027-28", "2028-29", "2029-30"]  # column order in BP2 tables
FWD = list(ALL_FWD)  # years taken from BP2; remove "2025-26" once its Report on State Finances is in
_T = None


def T():
    global _T
    if _T is None:
        _T = all_text(PDF)
    return _T


def table(start, end):
    return rows(text_between(T(), start, end))


def series(r, label, first_idx, **kw):
    """Return {fy: value} for the five forward years starting at column first_idx."""
    return {fy: pick(r, label, first_idx + ALL_FWD.index(fy), **kw) for fy in FWD}


def operating():
    # Table 8.1 cols: 24-25 Outcome | 25-26 Budget | 25-26 EstAct | 26-27 | 27-28 | 28-29 | 29-30
    r = table("Table 8.1           General Government Sector Operating Statement", "Table 8.2")
    s = lambda lab: series(r, lab, 2)
    d = {
        "rev_tax": s("Taxation revenue"), "rev_grants": s("Grants revenue"),
        "rev_sales": s("Sales of goods and services"), "rev_interest": s("Interest income"),
        "rev_dividends": s("Dividend and income tax equivalent income"), "rev_other": s("Other revenue"),
        "revenue": s("Total Revenue from Transactions"),
        "exp_employee": s("Employee expenses"), "exp_super_int": s("Superannuation interest cost"),
        "exp_super_other": s("Other superannuation expenses"), "exp_other_op": s("Other operating expenses"),
        "exp_depreciation": s("Depreciation and amortisation"), "exp_interest": s("Other interest expenses"),
        "exp_grants": s("Grants expenses"), "expenses": s("Total Expenses from Transactions"),
        "nob": s("Equals Net Operating Balance"), "pnfa": s("Purchases of non-financial assets"),
        "fiscal_balance": s("Equals Fiscal Balance"),
    }
    d["exp_other_property"] = {fy: 0.0 for fy in FWD}
    # 2024-25 outcome column, used only to cross-check the RSF parse
    d["_check_2024_25"] = {k: pick(r, lab, 0) for k, lab in [
        ("revenue", "Total Revenue from Transactions"), ("expenses", "Total Expenses from Transactions"),
        ("nob", "Equals Net Operating Balance")]}
    return d


def balance():
    g = table("Table 8.4             General Government Sector balance sheet", "Table 8.5")
    n = table("Table 8.6             Non-financial Public Sector balance sheet", "Table 8.7")
    return {
        "ggs_borrowing": series(g, "Borrowing", 2), "ggs_net_debt": series(g, "Net Debt", 2),
        "nfps_borrowing": series(n, "Borrowing", 2), "nfps_net_debt": series(n, "Net Debt", 2),
        "ggs_net_worth": series(g, "Net Worth", 2),
        "_check_2024_25": {"ggs_net_debt": pick(g, "Net Debt", 0), "nfps_net_debt": pick(n, "Net Debt", 0)},
    }


def cashflow():
    r = table("Table 8.7            General Government Sector Cash Flow Statement", "Table 8.8")
    rec = ["Taxes received", "Grants and subsidies received", "Sales of goods and services",
           "Interest receipts", "Dividends and income tax equivalents", "Other receipts"]
    pay = ["Payments for employees", "Payments for goods and services", "Grants and subsidies",
           "Interest paid", "Other payments"]
    d = {"cash_receipts_items": {k: series(r, k, 2) for k in rec},
         "cash_payments_items": {k: {fy: -v for fy, v in series(r, k, 2, startswith=(k != "Grants and subsidies")).items()} for k in pay}}
    d["cash_receipts"] = series(r, "Total Operating Receipts", 2)
    d["cash_payments"] = {fy: -v for fy, v in series(r, "Total Operating Payments", 2).items()}
    d["cash_net_operating"] = series(r, "Net Cash Inflows from Operating Activities", 2)
    d["cash_surplus"] = series(r, "Surplus/(Deficit)", 2)
    return d


def functions():
    # Table 8.14 cols: 25-26 Budget | 25-26 EstAct | 26-27 .. 29-30
    r = table("Table 8.14       General Government Sector expenses by function", "8.4.4")
    from extract_rsf import FUNCTIONS
    return {k: series(r, n, 1) for k, n in FUNCTIONS}, series(r, "Total Expenses", 1)


def pnfa_functions():
    r = table("Table 8.15       General Government Sector purchases of non-financial assets by function", "8.4.5")
    from extract_rsf import FUNCTIONS
    return {k: series(r, n, 1) for k, n in FUNCTIONS}, series(r, "Total Purchases", 1)


def revenue_detail():
    """Tables 3.1-3.4. Cols: 24-25 Actual | 25-26 EstAct | 26-27 .. 29-30 -> start at 1."""
    t32 = table("Table 3.2       State taxation revenue1", "Table 3.3 summarises")
    t33 = table("Table 3.3     Grants revenue1,2", "Notes:")
    t34 = table("Table 3.4         Royalty revenue1", "Notes:")
    t36 = table("Table 3.6    Other revenue1", "Note:")
    s = lambda r, lab, **kw: series(r, lab, 1, **kw)
    tax = {
        "payroll": s(t32, "Total payroll tax"),
        "duties": {fy: a + b for (fy, a), b in zip(s(t32, "Transfer duty").items(), s(t32, "Other duties").values())},
        "land": s(t32, "Land tax"),
        "motor": {fy: a + b for (fy, a), b in zip(s(t32, "Motor vehicle registration fees").items(),
                                                  s(t32, "Vehicle registration duty").values())},
        "gambling": s(t32, "Total gambling"),
        "insurance": s(t32, "Insurance duties"),
        "total": s(t32, "Total taxation revenue"),
    }
    tax["other"] = {fy: tax["total"][fy] - sum(tax[k][fy] for k in ["payroll", "duties", "land", "motor", "gambling", "insurance"]) for fy in FWD}
    grants = {
        "gst": s(t33, "GST revenue grants"),
        "cw_current": s(t33, "Federal Government grants"),
        "cw_capital": s(t33, "Federal Government capital grants"),
        "other": {fy: a + b for (fy, a), b in zip(s(t33, "Other grants and contributions", occurrence=1).items(),
                                                  s(t33, "Other grants and contributions", occurrence=2).values())},
        "total": s(t33, "Total grants revenue"),
    }
    roy = {
        "coal": s(t34, "Coal"), "petroleum": s(t34, "Petroleum"), "other_roy": s(t34, "Other royalties"),
        "land_rents": s(t34, "Land rents"), "total": s(t34, "Total royalties and land rents"),
    }
    other = {"fines": s(t36, "Fines and forfeitures"), "nec": s(t36, "Revenue not elsewhere classified"),
             "total": s(t36, "Total other revenue")}
    return {"tax": tax, "grants": grants, "roy": roy, "other": other,
            "_check_2024_25": {"tax_total": pick(t32, "Total taxation revenue", 0),
                               "coal": pick(t34, "Coal", 0), "roy_total": pick(t34, "Total royalties and land rents", 0)}}


def reconciliation():
    r = table("Table 2.2     Reconciliation of net operating balance, 2025-26 MYFER to 2026-27 Budget1", "Notes:")
    years = ["2025-26", "2026-27", "2027-28", "2028-29"]
    labels = [
        ("start", "2025-26 MYFER net operating balance"),
        ("Taxation revisions", "Taxation revisions"),
        ("Royalty and land rent revisions", "Royalty and land rent revisions"),
        ("GST revisions", "GST revisions"),
        ("Disaster Recovery Funding Arrangements (net)", "Disaster Recovery Funding"),
        ("Revenue measures", "Revenue measures"),
        ("Expense measures", "Expense measures"),
        ("Other parameter adjustments", "Other parameter adjustments"),
        ("end", "2026-27 Budget net operating balance"),
    ]
    return years, [(k, [pick(r, lab, i) for i in range(4)]) for k, lab in labels]


def key_aggregates_table():
    return table("Table 2.1        Key fiscal aggregates1", "Notes:")


if __name__ == "__main__":
    import json
    print(json.dumps({"op": operating(), "bs": balance(), "cf": cashflow()}, indent=0)[:3000])
    fn, tot = functions(); print(fn, tot)
    print(pnfa_functions())
    print(json.dumps(revenue_detail(), indent=0)[:3000])
    print(reconciliation())
