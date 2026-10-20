"""Extract departmental and Hospital and Health Service detail from the 2026-27
Service Delivery Statements (SDS).

Each SDS document is split into sections at its "Overview" headings. A section is kept if it
is a department (it carries a "Departmental budget summary"), a Hospital and Health Service,
or one of the two Queensland Health component sections (Department of Health, Queensland
Ambulance Service). Other statutory bodies and commercialised business units are skipped.

All SDS amounts are $'000 in the source and returned here in $ million.
Columns in every SDS table: 2025-26 (Adjusted) Budget | 2025-26 Est. Actual | 2026-27 Budget.
"""
import re
import subprocess
from pathlib import Path

from parse_lib import split_line, num, norm

SDS = Path(__file__).parent / "sources" / "sds"
COLS = ["b2526", "ea2526", "b2627"]

SKIP_NAME_LINES = re.compile(r"Service Delivery Statements|^\s*(Statutory bod(y|ies)|Commercialised business units?|"
                             r"Shared service providers)\s*$|\.(qld\.)?gov\.au|\.edu\.au|\.com\.au|^\s*\d+\s*$")
NAME_FIX = {
    "Small and Family Business": "Department of Customer Services, Open Data and Small and Family Business",
    "Services and Child Safety": "Department of Families, Seniors, Disability Services and Child Safety",
    "Volunteers": "Department of Local Government, Water and Volunteers",
    "Manufacturing and Regional and Rural Development": "Department of Natural Resources and Mines, Manufacturing and Regional and Rural Development",
    "Paralympic Games": "Department of Sport, Racing and Olympic and Paralympic Games",
    "and Planning": "Department of State Development, Infrastructure and Planning",
    "and Innovation": "Department of the Environment, Tourism, Science and Innovation",
    "Strait Islander Partnerships and Multiculturalism": "Department of Women, Aboriginal and Torres Strait Islander Partnerships and Multiculturalism",
    "Service": "Children's Health Queensland Hospital and Health Service",
    "Management": "Office of the Inspector-General of Emergency Management",
    "Development": "Department of Natural Resources and Mines, Manufacturing and Regional and Rural Development",
}
HEALTH_PARTS = {"Department of Health", "Queensland Ambulance Service"}


def text(pdf):
    return subprocess.run(["pdftotext", "-layout", str(pdf), "-"], capture_output=True, text=True).stdout


def sections(doc_text):
    lines = doc_text.splitlines()
    starts = [i for i, l in enumerate(lines) if l.strip() == "Overview"]
    out = []
    for k, s in enumerate(starts):
        # entity name: nearest meaningful line above "Overview"
        j = s - 1
        while j > 0 and (not lines[j].strip() or SKIP_NAME_LINES.search(lines[j])):
            j -= 1
        name = re.sub(r"\s+", " ", lines[j].strip())
        name = NAME_FIX.get(name, name)
        end = starts[k + 1] if k + 1 < len(starts) else len(lines)
        out.append((name, lines[s:end]))
    return out


def m(v):
    return None if v is None else round(v / 1000.0, 3)


def strip_fn(label):
    """Remove footnote markers glued to a label: 'Appropriation revenue1' -> 'Appropriation revenue'."""
    label = re.sub(r"(?<=[A-Za-z\)%])\d{1,2}(,\d{1,2})*$", "", label.strip())
    label = re.sub(r"\s+\d{1,2}(,\d{1,2})*$", "", label)
    return label.strip().rstrip(",")


NUMTOK = re.compile(r"\(?-?[\d,]+\)?|\.\.|-")
HEADINGS = re.compile(r"^(Income|Expenses|Revenue|CONTROLLED|ADMINISTERED|INCOME|EXPENSES|Service area|Entity|Staffing)\b|Budget|\$.000|Est\. Actual")


def fix_num(t):
    """'1,382,5131' (number with a footnote digit glued on) -> '1,382,513'."""
    m_ = re.fullmatch(r"(\(?)(\d{1,3}(?:,\d{3})*,\d{3})\d{1,2}(\)?)", t)
    return m_.group(1) + m_.group(2) + m_.group(3) if m_ else t


def row_iter(lines):
    """(label, [3 numbers]) for table rows. A label wrapped over contiguous lines (before and/or
    after the numbers) is joined; a blank line ends a label."""
    rows = []          # [label, nums, label_from_pend]
    pend, prev_kind = "", "blank"
    for ln in lines:
        if "Service Delivery Statements" in ln:
            continue
        if not ln.strip():
            pend, prev_kind = "", "blank"
            continue
        lab, nums = split_line(ln)
        lab = lab.replace("||", "").strip()
        nums = [fix_num(x) for x in nums]
        if len(nums) >= 3 and all(NUMTOK.fullmatch(x) for x in nums[-3:]):
            full = (pend + " " + lab).strip() if pend else lab
            rows.append([strip_fn(full), [num(x) for x in nums[-3:]], bool(pend and not lab)])
            pend, prev_kind = "", "row"
        elif lab and not nums:
            if HEADINGS.search(lab):
                pend, prev_kind = "", "heading"
            elif prev_kind == "row" and rows and rows[-1][2]:
                rows[-1][0] = strip_fn(rows[-1][0] + " " + lab)   # suffix of a wrapped label
                rows[-1][2] = False
                prev_kind = "suffix"
            else:
                pend = (pend + " " + lab).strip() if prev_kind == "label" else lab
                prev_kind = "label"
        else:
            pend, prev_kind = "", "other"
    for lab, v, _ in rows:
        yield lab, v


def find(lines, pattern, start=0):
    for i in range(start, len(lines)):
        if re.search(pattern, lines[i]):
            return i
    return None


def budget_summary(lines):
    i = find(lines, r"^\s*Departmental budget summary")
    if i is None:
        return None
    end = find(lines, r"^\s*(Staffing[\d,]*|Capital program|Administered Items|Budgeted financial statements)\s*$", i + 1) or len(lines)
    blk = lines[i:end]
    # split the block into controlled / administered halves, and the controlled half into income / expenses
    a_ = next((k for k, l in enumerate(blk) if re.match(r"^\s*ADMINISTERED", l)), len(blk))
    ctrl, adm = blk[:a_], blk[a_:]
    e_ = next((k for k, l in enumerate(ctrl) if re.match(r"^\s*Expenses[\d,]*\s*$", l)), None)
    out = {"income": [], "service_areas": [], "administered": {}}
    for lab, v in row_iter(ctrl[:e_]):
        if norm(lab) == "totalincome":
            out["total_income"] = v
        elif lab:
            out["income"].append({"name": lab, "v": v})
    for lab, v in row_iter(ctrl[e_:]):
        n = norm(lab)
        if n == "totalexpenses":
            out["total_expenses"] = v
            break
        if lab:
            out["service_areas"].append({"name": lab, "v": v})
    for lab, v in row_iter(adm):
        if norm(lab) in ("totalrevenue", "totalexpenses"):
            out["administered"].setdefault(norm(lab), v)
    if any(not sa["name"] for sa in out["service_areas"]):
        raise ValueError("unlabelled service area")
    return out


def staffing(lines):
    out = []
    i = 0
    while True:
        i = find(lines, r"^\s*Staffing[\d,]*\s*$", i)
        if i is None:
            break
        end = find(lines, r"^\s*Total FTEs", i + 1)
        if end is None:
            break
        rows = [(lab, v) for lab, v in row_iter(lines[i:end + 1]) if lab]
        out.append(rows)
        i = end + 1
    return out


def capital(lines):
    d = {}
    for lab, v in row_iter(lines):
        k = norm(lab)
        if k in ("capitalpurchases", "capitalgrants", "totalcapitaloutlays") and k not in d:
            d[k] = v
    return d


def income_statement(lines):
    """First INCOME ... Total expenses block (controlled / entity income statement)."""
    i = find(lines, r"^\s*INCOME\s*$")
    if i is None:
        return None
    j = find(lines, r"^\s*Total expenses", i)
    inc, exp, state, out = [], [], "inc", {}
    for lab, v in row_iter(lines[i:j + 1]):
        n = norm(lab)
        if n == "totalincome":
            out["total_income"] = v; state = "exp"; continue
        if n == "totalexpenses":
            out["total_expenses"] = v; continue
        (inc if state == "inc" else exp).append({"name": lab, "v": v})
    out["income"], out["expenses"] = inc, exp
    return out


# ------------------------------------------------------------------ performance measures
VALUE_WORDS = {"..", "-", "n/a", "N/A", "New measure", "Discontinued measure", "Nil", "Yes", "No", "TBA", "TBC", "Not applicable"}


def value_like(t):
    t = t.strip()
    if t in VALUE_WORDS:
        return True
    if len(t) > 24 or not re.search(r"\d", t):
        return False
    letters = len(re.findall(r"[A-Za-z]", t))
    return letters <= 8 and re.match(r"^[<>≤≥=~±$\-–\d(.]", t) is not None


MTYPE = re.compile(r"^(Effectiveness|Efficiency|Other) measures?\s*$", re.I)


def clean_label(x):
    x = re.sub(r"\s+", " ", x).strip()
    x = re.sub(r"\s+\d{1,2}(,\d{1,2})*$", "", x)          # 'per hour 3', 'months) 5,6'
    x = re.sub(r"(?<=\.)\d{1,2}$", "", x).rstrip(".")      # 'publication.5'
    x = re.sub(r"\b((?:19|20)\d{2})\d$", r"\1", x)         # 'Act 20161' -> 'Act 2016'
    x = re.sub(r"(\$\d{1,3}(?:,\d{3})+)\d$", r"\1", x)     # '$5,0001' -> '$5,000'
    x = re.sub(r"(?<=[A-Za-z\)])\d{1,2}(,\d{1,2})*(?=:|$)", "", x)
    return x.strip().rstrip(":").strip()


FN = r"\d{1,2}(?:,\s*\d{1,2})*"


def marks(text):
    """Footnote markers attached to a label: 'program1:' -> ['1']; 'unit4' -> ['4']; '(minutes)1,9' -> ['1','9'];
    'Category 2 (90 days)  7' -> ['7']; 'publication.5' -> ['5']."""
    t = text.strip()
    found = []
    for tok in re.split(r"\s{2,}", t):
        if re.fullmatch(FN, tok.strip()):
            found += re.findall(r"\d+", tok)
    t2 = re.sub(r"\s{2,}" + FN + r"\s*$", "", t)
    m_ = re.search(r":\s*(" + FN + r")$", t2) or re.search(r"(?<=[A-Za-z\)%’'])(" + FN + r"):?$", t2) or re.search(r"(?<=\.)(\d{1,2})$", t2)
    if m_:
        found += re.findall(r"\d+", m_.group(1))
    return list(dict.fromkeys(found))


FOOTER = re.compile(r"(Queensland Budget 2026-27|2026-2027 Queensland State Budget)\s*-?\s*Service Delivery Statements")
NOTE_START = re.compile(r"^\s{0,8}(\d{1,2})\.\s+(\S.*)$")


def performance(lines):
    """Service standards: one record per measure, with group/sub-group labels joined by ': ',
    and the footnotes printed under each table attached to the measures that cite them."""
    out = []
    area, mtype, in_tbl = None, None, False
    area_m = []
    group, sub, bullet_pend, seen_bullet = "", "", "", False
    gm, sm, bm = [], [], []
    prev_group, prev_gm = "", []
    closed = False
    notes_mode, notes, cur_note, pending = False, {}, None, []

    def reset_block(hard=True):
        nonlocal group, sub, bullet_pend, seen_bullet, prev_group, closed, gm, sm, bm, prev_gm
        closed = False
        if group:
            prev_group, prev_gm = group, gm
        if not hard and (seen_bullet or sub or group.endswith(':')):   # bullet lists sometimes have blank lines between items
            bullet_pend, bm = "", []
            return
        group, sub, bullet_pend, seen_bullet = "", "", "", False
        gm, sm, bm = [], [], []

    def close_notes():
        nonlocal notes_mode, notes, cur_note, pending
        for rec in pending:
            rec["notes"] = [{"n": k, "text": re.sub(r"\s+", " ", notes[k]).strip()} for k in rec["marks"] if k in notes]
            rec["missing_notes"] = [k for k in rec["marks"] if k not in notes]
            if "*" in notes:
                rec["notes"].append({"n": "", "text": re.sub(r"\s+", " ", notes["*"]).strip()})
        notes_mode, notes, cur_note, pending = False, {}, None, []
        area_m.clear()   # an area-heading footnote is explained in the first notes block after the heading

    for idx, ln in enumerate(lines):
        s = ln.strip()
        if notes_mode:
            if not s or FOOTER.search(s):
                continue
            nm_ = NOTE_START.match(ln)
            if nm_:
                cur_note = nm_.group(1); notes[cur_note] = nm_.group(2); continue
            if s.startswith("Service standards") or s == "Objective" or MTYPE.match(s) or re.match(r"^(Staffing|Departmental budget summary|Performance statement|Capital program|Budget highlights)", s):
                close_notes()
            elif ln.startswith("   ") and cur_note:
                notes[cur_note] += " " + s; continue
            elif cur_note is None and not notes:
                notes["*"] = s; cur_note = "*"; continue
            else:
                close_notes()
        if s == "Objective" and idx > 0:
            k = idx - 1
            while k > 0 and not lines[k].strip():
                k -= 1
            area_m[:] = marks(lines[k].strip())
            area = strip_fn(re.sub(r"\s+", " ", lines[k].strip()))
            continue
        if s.startswith("Service standards"):
            in_tbl = True; reset_block(); prev_group, prev_gm = "", []; continue
        if not in_tbl:
            continue
        if s.startswith("Notes:") or s.startswith("Note:"):
            in_tbl = False; reset_block(); notes_mode, notes, cur_note = True, {}, None
            rest = re.sub(r"^Notes?:\s*", "", s)
            if rest:
                nm_ = re.match(r"^(\d{1,2})\.\s+(.*)", rest)
                if nm_:
                    cur_note = nm_.group(1); notes[cur_note] = nm_.group(2)
                else:
                    cur_note = "*"; notes["*"] = rest
            continue
        if re.match(r"^(Staffing|Departmental budget summary|Performance statement)", s):
            in_tbl = False; reset_block(); continue
        if not s:
            reset_block(hard=False); continue
        if "Service Delivery Statements" in s or re.match(r"^(\d{4}-\d{2}|Target|Actual|\$\'000)", s) or "Target/Est" in s:
            continue
        mt = MTYPE.match(s)
        if mt:
            mtype = mt.group(1).capitalize(); reset_block(); prev_group, prev_gm = "", []; continue
        toks = [t for t in re.split(r"\s{2,}", s) if t]
        is_bullet = s.startswith("•")
        has_vals = len(toks) >= 3 and all(value_like(t) for t in toks[-3:])
        lm = marks("  ".join(toks[:-3]) if has_vals else s)
        lab = " ".join(toks[:-3]) if has_vals else " ".join(t for t in toks if not re.fullmatch(r"\d{1,2}(,\d{1,2})*", t))
        lab = lab.lstrip("•").strip()
        lab = re.sub(r":\s*\d{1,2}(,\s*\d{1,2})*$", ":", lab)
        lab = re.sub(r"(?<=[A-Za-z\)])\d{1,2}(,\s*\d{1,2})*(?=:?$)", "", lab).strip()
        if not has_vals:
            if not lab:
                continue
            if is_bullet:
                bullet_pend, bm = lab, lm; seen_bullet = True
            elif bullet_pend:
                bullet_pend += " " + lab; bm = bm + lm
            elif not group or (closed and lab[:1].isupper() and not lab.endswith(":")):
                group, sub, seen_bullet, closed = lab, "", False, False
                gm, sm = lm, []
            elif lab.endswith(":") and lab[:1].isupper():
                if seen_bullet and not sub and group.endswith(":"):
                    group, gm = lab, lm
                else:
                    sub, sm = lab, lm
                seen_bullet = False
            elif seen_bullet:
                group, sub, seen_bullet = lab, "", False
                gm, sm = lm, []
            else:
                group = (group + " " + lab).strip(); gm = gm + lm
            continue
        vals = [v.strip() for v in toks[-3:]]
        if not lab or is_bullet or bullet_pend or lab.endswith(":"):
            closed = False
        if is_bullet or bullet_pend:
            item = (bullet_pend + " " + lab).strip() if bullet_pend and not is_bullet else lab
            name = ": ".join(clean_label(x) for x in (group, sub, item) if x and clean_label(x))
            mk = gm + sm + (bm if not is_bullet else []) + lm
            bullet_pend, bm, seen_bullet = "", [], True
        elif not lab:
            name = ": ".join(clean_label(x) for x in (group, sub) if x and clean_label(x))
            mk = gm + sm + lm
        elif lab.endswith(":"):
            if not group and len(lab) < 40 and prev_group:
                group, gm = prev_group, prev_gm
            name = ": ".join(clean_label(x) for x in (group, lab) if x and clean_label(x))
            mk = gm + lm
            sub, sm, seen_bullet = lab, lm, False
        elif seen_bullet and lab[:1].isupper():
            name = clean_label(lab)
            mk = lm
            group, sub, seen_bullet = "", "", False
            gm, sm = [], []
        else:
            name = clean_label((group + " " + lab).strip()) if not sub else ": ".join(clean_label(x) for x in (group, sub, lab) if x)
            mk = gm + sm + lm
            if not sub:
                group, gm = clean_label((group + " " + lab).strip()), gm + lm
            closed = True
        rec = {"area": area, "type": mtype, "name": name, "vals": vals,
               "marks": list(dict.fromkeys(area_m + mk))}
        out.append(rec)
        pending.append(rec)
    if notes_mode:
        close_notes()
    for rec in pending:   # tables with no notes block at all
        rec.setdefault("notes", [])
        rec.setdefault("missing_notes", list(rec["marks"]))
    return out


# Manual corrections where the PDF layout defeats the parser. Each was read off the source page.
MANUAL = {
    ("department-of-housing-and-public-works.pdf", "13.5m2 per"): ("Work point density: Average", ["13.5m2 per person", "13.3m2 per person", "13.5m2 per person"]),
    ("department-of-housing-and-public-works.pdf", "12m2 per"): ("Work point density: New and refurbished fitout", ["12m2 per person", "11.8m2 per person", "12m2 per person"]),
    ("department-of-housing-and-public-works.pdf", "≤$1,530 per"): ("New and refurbished office fitout – cost per square metre", ["≤$1,530 per square metre", "$1,800 per square metre", "≤$1,800 per square metre"]),
}


# Staffing row split across three lines in the source (one value floats above the row)
STAFF_FIX = {
    ("department-of-the-premier-and-cabinet.pdf", "Department of the Premier and Cabinet", "Governance Support and Advisory Services"): [56.0, 58.0, 58.0],
}


def strip_val(v):
    return re.sub(r"(?<=[\d%])\s*\d$", "", v.strip()) if False else v.strip()


def parse_number(v):
    """'>98%' -> ('>', 98.0, '%'); '$6,075' -> ('', 6075.0, '$'); '..' -> None."""
    m_ = re.match(r"^([<>≤≥]=?)?\s*(\$)?\s*(-?[\d,]*\.?\d+)\s*(%|[A-Za-z ]+)?$", v.strip())
    if not m_:
        return None
    return (m_.group(1) or "", float(m_.group(3).replace(",", "")), m_.group(4) or m_.group(2) or "")


def assess(target, actual):
    """Met / not met only where the target states a direction (>, <, ≥, ≤)."""
    t, a = parse_number(target), parse_number(actual)
    if not t or not a:
        return None
    op, tv, _ = t
    av = a[1]
    if op in (">", ">="):
        return "met" if av > tv or (op == ">=" and av == tv) else "not met"
    if op == "≥":
        return "met" if av >= tv else "not met"
    if op in ("<", "<="):
        return "met" if av < tv or (op == "<=" and av == tv) else "not met"
    if op == "≤":
        return "met" if av <= tv else "not met"
    return None


# ------------------------------------------------------------------ driver
def extract():
    entities = []
    for pdf in sorted(SDS.glob("*.pdf")):
        t = text(pdf)
        for name, lines in sections(t):
            is_dept = find(lines, r"^\s*Departmental budget summary") is not None
            is_hhs = "Hospital and Health Service" in name
            is_part = name in HEALTH_PARTS
            if not (is_dept or is_hhs or is_part):
                continue
            e = {"name": name, "doc": pdf.name, "kind": "department" if is_dept else "hhs" if is_hhs else "health_part"}
            bs = budget_summary(lines) if is_dept else None
            if bs:
                e["summary"] = bs
            e["staffing"] = staffing(lines)
            for (doc_, ent_, row_), vals_ in STAFF_FIX.items():
                if pdf.name == doc_ and name == ent_ and e["staffing"]:
                    e["staffing"][0].insert(2, (row_, vals_))
            e["capital"] = capital(lines)
            e["income_statement"] = income_statement(lines)
            ms = performance(lines)
            for m_ in ms:
                fix = MANUAL.get((pdf.name, m_["vals"][0]))
                if fix:
                    m_["name"], m_["vals"], m_["manual"] = fix[0], fix[1], True
            e["measures"] = ms
            e["_mcount"] = measure_count_check(lines)
            entities.append(e)
    return entities


if __name__ == "__main__":
    ents = extract()
    for e in ents:
        bs = e.get("summary") or {}
        st = e["staffing"]
        print(f"{e['kind']:11} {e['name'][:60]:60} SA={len(bs.get('service_areas', []))} "
              f"exp={bs.get('total_expenses')} FTEtables={len(st)} tot={[r for r in (st[0] if st else []) if norm(r[0]).startswith('total')]} "
              f"cap={e['capital'].get('totalcapitaloutlays')} IS={(e['income_statement'] or {}).get('total_expenses')} meas={len(e['measures'])}")


# ------------------------------------------------------------------ assemble for the site, with checks
SDS_URL = "https://budget.qld.gov.au/files/2026-27-budget-sds-{}"
HHS_REGIONS = {  # approximate correspondence of HHS areas to ABS SA4 regions (boundaries differ)
    "Cairns and Hinterland": ["Cairns"], "Torres and Cape": ["Queensland - Outback"], "North West": ["Queensland - Outback"],
    "Central West": ["Queensland - Outback"], "South West": ["Queensland - Outback"], "Townsville": ["Townsville"],
    "Mackay": ["Mackay - Isaac - Whitsunday"], "Central Queensland": ["Central Queensland"], "Wide Bay": ["Wide Bay"],
    "Sunshine Coast": ["Sunshine Coast"], "Gold Coast": ["Gold Coast"], "Darling Downs": ["Toowoomba", "Darling Downs - Maranoa"],
    "West Moreton": ["Ipswich"], "Metro North": ["Brisbane - North", "Brisbane Inner City", "Moreton Bay - North", "Moreton Bay - South"],
    "Metro South": ["Brisbane - South", "Brisbane - East", "Logan - Beaudesert"],
}


def slug(name):
    return re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")[:60]


def short(name):
    if name == "Department of Health":
        return name
    n = re.sub(r"^Department of (the )?", "", name)
    return n.replace(" Hospital and Health Service", " HHS")


def measure_count_check(pdf_text_lines):
    """Independent count of value rows inside service-standards tables (simple rule, no label logic)."""
    n, in_tbl = 0, False
    for ln in pdf_text_lines:
        s = ln.strip()
        if s.startswith("Service standards"):
            in_tbl = True; continue
        if s.startswith("Notes:") or s.startswith("Note:") or re.match(r"^(Staffing|Departmental budget summary|Performance statement)", s):
            in_tbl = False; continue
        if in_tbl and "Service Delivery Statements" not in s and not re.match(r"^\d{4}-\d{2}\b", s):
            toks = [t for t in re.split(r"\s{2,}", s) if t]
            if len(toks) >= 3 and all(value_like(t) for t in toks[-3:]):
                n += 1
    return n


_RAW = {}
UNRESOLVED = []


def triple_found(doc, t, ea, t2):
    """Independent check: the three published values appear together on one line of the source."""
    if doc not in _RAW:
        _RAW[doc] = text(SDS / doc).splitlines()
    pat = re.compile(r"\s{2,}".join(re.escape(v) for v in (t, ea, t2)) + r"\s*$")
    return any(pat.search(l) for l in _RAW[doc])


def to_site(entities, check):
    out = []
    for e in entities:
        nm = e["name"]
        rec = {"id": slug(nm), "name": nm, "short": short(nm), "kind": e["kind"], "doc": e["doc"],
               "url": SDS_URL.format(e["doc"])}
        bs = e.get("summary")
        if bs:
            for i, c in enumerate(COLS):
                check(f"SDS {short(nm)}: service areas sum to total expenses ({c})", sum(sa["v"][i] for sa in bs["service_areas"]) / 1000, bs["total_expenses"][i] / 1000, tol=0.01)
                check(f"SDS {short(nm)}: income lines sum to total income ({c})", sum(x["v"][i] for x in bs["income"]) / 1000, bs["total_income"][i] / 1000, tol=0.01)
            rec["service_areas"] = [{"name": sa["name"], "v": [m(x) for x in sa["v"]]} for sa in bs["service_areas"]]
            rec["expenses"] = [m(x) for x in bs["total_expenses"]]
            rec["income"] = [{"name": x["name"], "v": [m(y) for y in x["v"]]} for x in bs["income"]]
            adm = bs.get("administered", {})
            if adm.get("totalexpenses"):
                rec["administered"] = [m(x) for x in adm["totalexpenses"]]
        inc = e.get("income_statement")
        if inc:
            for i, c in enumerate(COLS):
                check(f"SDS {short(nm)}: income statement expense lines sum to total ({c})", sum(x["v"][i] for x in inc["expenses"]) / 1000, inc["total_expenses"][i] / 1000, tol=0.01)
            rec["expense_types"] = [{"name": x["name"], "v": [m(y) for y in x["v"]]} for x in inc["expenses"] if any(y for y in x["v"])]
            if "expenses" not in rec:
                rec["expenses"] = [m(x) for x in inc["total_expenses"]]
            elif bs:
                for i, c in enumerate(COLS):
                    check(f"SDS {short(nm)}: budget summary total = income statement total ({c})", bs["total_expenses"][i] / 1000, inc["total_expenses"][i] / 1000, tol=0.01)
        if e["staffing"]:
            rows = e["staffing"][0]
            total = next((v for lab, v in rows if norm(lab) == "totalftes"), None)
            parts = [(lab, v) for lab, v in rows if not norm(lab).startswith("total") and "subtotal" not in norm(lab)]
            ctrl = next((v for lab, v in rows if norm(lab).startswith("total") and "controlled" in norm(lab)), None)
            if total and parts:
                check(f"SDS {short(nm)}: FTE rows sum to Total FTEs (2026-27)", sum(v[2] for _, v in parts), total[2], tol=1.5)
            if total:
                rec["fte"] = {"rows": [{"name": lab, "v": v} for lab, v in parts], "total": total, "controlled": ctrl}
        cap = e.get("capital") or {}
        if cap.get("totalcapitaloutlays"):
            rec["capital"] = {k: [m(x) for x in v] for k, v in cap.items()}
            if "capitalpurchases" in cap and "capitalgrants" in cap:
                check(f"SDS {short(nm)}: capital purchases + grants = total outlays (2026-27)", (cap["capitalpurchases"][2] + cap["capitalgrants"][2]) / 1000, cap["totalcapitaloutlays"][2] / 1000, tol=0.01)
        ms = []
        for x in e["measures"]:
            ms.append({"area": x["area"], "type": x["type"], "name": x["name"], "t": x["vals"][0], "ea": x["vals"][1], "t2": x["vals"][2],
                       "assess": assess(x["vals"][0], x["vals"][1]), **({"manual": True} if x.get("manual") else {}),
                       **({"notes": x["notes"]} if x.get("notes") else {})})
        rec["measures"] = ms
        unres = [(x["name"][:50], x.get("missing_notes")) for x in e["measures"] if x.get("missing_notes")]
        check(f"SDS {short(nm)}: footnote markers with no matching note", len(unres), 0, tol=0)
        if unres:
            UNRESOLVED.extend((short(nm),) + u for u in unres)
        nf = sum(1 for x in ms if not x.get("manual") and not triple_found(e["doc"], x["t"], x["ea"], x["t2"]))
        check(f"SDS {short(nm)}: every measure's three values found together on one source line (not found)", nf, 0, tol=0)
        check(f"SDS {short(nm)}: measures extracted = value rows in service standards tables", len(ms), e["_mcount"], tol=0)
        if e["kind"] == "hhs":
            key = nm.replace(" Hospital and Health Service", "").replace("Children's Health Queensland", "Children's Health Queensland")
            rec["regions"] = HHS_REGIONS.get(key, [])
        out.append(rec)
    return out
