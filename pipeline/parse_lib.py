"""Parsing helpers for the Maroon Ledger data pipeline.

Every figure on the site is read from an official PDF or open-data table by the
functions below. Nothing is typed in by hand except the column/label maps, which
are visible in build_data.py.
"""
import re
import subprocess
from pathlib import Path

SRC = Path(__file__).parent / "sources"

NUM_RE = re.compile(r"^\(?-?[\d,]+(?:\.\d+)?\)?[a-z]?$|^-$|^\.\.$|^NA$|^—$")


def num(tok):
    """'1,234' -> 1234 ; '(1,234)' -> -1234 ; '-' or '..' -> 0 ; 'NA' -> None."""
    t = tok.strip().rstrip("abcd")
    if t in ("-", "..", "—"):
        return 0.0
    if t == "NA":
        return None
    neg = t.startswith("(") and t.endswith(")")
    t = t.strip("()").replace(",", "")
    v = float(t)
    return -v if neg else v


def page_text(pdf, page):
    return subprocess.run(
        ["pdftotext", "-layout", "-f", str(page), "-l", str(page), str(SRC / pdf), "-"],
        capture_output=True, text=True).stdout


def all_text(pdf):
    return subprocess.run(["pdftotext", "-layout", str(SRC / pdf), "-"],
                          capture_output=True, text=True).stdout


def find_page(pdf, must, maxpage=40, start=1, nth=1):
    """First page (1-based) whose text contains every string in `must`."""
    hits = 0
    for i in range(start, maxpage + 1):
        t = page_text(pdf, i)
        if all(m in t for m in must):
            hits += 1
            if hits == nth:
                return i
    raise ValueError(f"{pdf}: page with {must} not found")


def split_line(line):
    """Split a layout line into (label, [numbers]). Label is the leading text;
    numbers are the trailing numeric tokens."""
    toks = re.split(r"\s{2,}", line.strip())
    label_parts, nums = [], []
    for t in toks:
        t2 = t.strip()
        if not t2:
            continue
        sub = t2.split()
        if all(NUM_RE.match(s) for s in sub):
            nums.extend(sub)
        else:
            if nums:  # text after numbers: start of a second column; stop
                label_parts.append("||")
            label_parts.append(t2)
    label = " ".join(label_parts)
    return label, nums


def rows(text):
    """Yield (label, numbers) for each line that carries numbers, joining a
    label-only line immediately above a numbers-only line (wrapped labels)."""
    pending = ""
    out = []
    lines = text.splitlines()
    for idx, ln in enumerate(lines):
        if not ln.strip():
            continue
        label, nums = split_line(ln)
        # footnote marker sitting beside a wrapped label ("Petroleum    2"):
        # the real numbers are on the next non-blank line, which has no label
        if label and len(nums) == 1 and re.fullmatch(r"[1-9]", nums[0]):
            nxt = next((l for l in lines[idx + 1:] if l.strip()), "")
            nl, nn = split_line(nxt)
            if nn and not nl:
                nums = []
        if nums:
            if not label:
                label = pending
                # wrapped label continuing below the numbers line
                if idx + 1 < len(lines):
                    nl, nn = split_line(lines[idx + 1])
                    if nl and not nn and nl[:1].islower():
                        label = (label + " " + nl).strip()
            elif pending and label[:1].islower():
                label = (pending + " " + label).strip()
            out.append((label.strip(), [num(n) for n in nums]))
            pending = ""
        else:
            pending = (pending + " " + label if pending and label[:1].islower() else label).strip()
    return out


def norm(s):
    return re.sub(r"[^a-z0-9]", "", s.lower())


def pick(rowlist, label, idx, startswith=True, occurrence=1, after=None):
    """Find the row whose normalised label starts with `label` and return
    numbers[idx]. `after` restricts search to rows after the first row matching it."""
    n = norm(label)
    started = after is None
    seen = 0
    for lab, nums in rowlist:
        if not started:
            if norm(lab).startswith(norm(after)):
                started = True
            continue
        nl = norm(lab)
        if (nl.startswith(n) if startswith else nl == n):
            seen += 1
            if seen == occurrence:
                return nums[idx]
    raise KeyError(f"row '{label}' not found")


def text_between(text, start, end=None):
    i = text.index(start)
    j = text.index(end, i + len(start)) if end else len(text)
    return text[i:j]
