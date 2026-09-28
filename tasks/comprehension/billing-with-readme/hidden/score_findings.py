"""Match the findings in FINDINGS.md to the planted bugs by line number.

Usage: python3 score_findings.py <solution_dir> <answer_key.json>

Each finding (a heading, list item or table row citing lines) is credited
to at most one bug: the one its citations overlap most. Whether the
explanation is right is left to the judge.
"""

import json
import pathlib
import re
import sys

# A citation wider than this names a region, not a defect; crediting it would
# let "lines 1-300" locate a bug. It still admits a whole-function citation.
MAX_SPAN = 40
# A finding touching more bugs than this is a summary list, not a finding.
MAX_BUGS = 3

RANGE_PATTERN = r"\d+(?:\s*(?:-|\u2013|\u2014|to)\s*\d+)?"
RANGE = re.compile(r"(\d+)(?:\s*(?:-|\u2013|\u2014|to)\s*(\d+))?")
LABELLED = re.compile(
    r"\b(?:line|ln)(?:s|\(s\))?(?![a-z])[\s:*`#.~\u2248]*"
    rf"({RANGE_PATTERN}(?:\s*(?:,\s*(?:and\s+)?|and|&)\s*{RANGE_PATTERN})*)",
    re.IGNORECASE,
)
L_PREFIXED = re.compile(r"\bL(\d+)(?:\s*[-\u2013]\s*L?(\d+))?\b")
FILE_COLON = re.compile(r"\.ts:(\d+)(?:[-\u2013](\d+))?")
FINDING_START = re.compile(r"^(?:#{1,6}\s|\d+[.)]\s|[-*+]\s|\|)")
HEADING = re.compile(r"^(#{1,6})\s")
TABLE_SEPARATOR = re.compile(r"^\|[\s|:-]+\|?$")
LINE_HEADERS = {"line", "lines", "location", "ln", "loc"}
# Non-bug wording only counts where it labels the text: a section heading
# ("## Not bugs") or the opening words of an item ("- Not a bug: ...").
# Anywhere else it is usually a hedge inside a real report ("probably not
# intentional", "verified with a failing test").
LEADING = r"^\W*(?:\d+[.)]\s*)?\W*"
CHUNK_NON_BUG = re.compile(
    LEADING + r"(?:not a bug|non-issue|false positive|verified (?:as )?correct|verified (?:ok|fine)"
    r"|verified:\s*not a bug)",
    re.IGNORECASE,
)
HEADING_NON_BUG = re.compile(
    LEADING + r"(?:not (?:a )?bugs?|non-bugs?|non-issues?|false positives?|verified (?:as )?correct"
    r"|verified (?:ok|fine)|verified:\s*not a bug|looks correct|intentional)",
    re.IGNORECASE,
)


def to_range(start: str, end: str | None) -> tuple[int, int]:
    lo, hi = int(start), int(end) if end else int(start)
    return (min(lo, hi), max(lo, hi))


def split_findings(text: str) -> list[str]:
    chunks: list[list[str]] = [[]]
    for line in text.splitlines():
        if FINDING_START.match(line):
            chunks.append([])
        chunks[-1].append(line)
    return ["\n".join(chunk) for chunk in chunks if chunk]


def table_cells(row: str) -> list[str]:
    return [cell.strip().strip("*`").strip() for cell in row.strip().strip("|").split("|")]


def is_line_header(cell: str) -> bool:
    return cell.lower().replace("(s)", "").replace("#", "").strip() in LINE_HEADERS


def cited_ranges(chunk: str, line_column: int | None) -> tuple[list[tuple[int, int]], int]:
    """The chunk's citations in the order they appear, and how many were too wide."""
    positioned = []
    for match in LABELLED.finditer(chunk):
        for m in RANGE.finditer(match.group(1)):
            positioned.append((match.start(1) + m.start(), to_range(m.group(1), m.group(2))))
    for pattern in (L_PREFIXED, FILE_COLON):
        positioned += [(m.start(), to_range(m.group(1), m.group(2))) for m in pattern.finditer(chunk)]
    if line_column is not None:
        cells = table_cells(chunk)
        if line_column < len(cells):
            offset = chunk.find(cells[line_column])
            positioned += [
                (offset + m.start(), to_range(m.group(1), m.group(2)))
                for m in RANGE.finditer(cells[line_column])
            ]
    positioned.sort(key=lambda item: item[0])
    ranges = [r for _, r in positioned]
    kept = [(lo, hi) for lo, hi in ranges if hi - lo + 1 <= MAX_SPAN]
    return kept, len(ranges) - len(kept)


def findings(text: str) -> tuple[list[list[tuple[int, int]]], int]:
    """Each claimed finding's citations, and the count of wide citations dropped.

    Chunks citing no line, and chunks the author marks as not being a bug
    (directly or through an enclosing heading), are not findings.
    """
    result = []
    dropped = 0
    line_column = None
    headings: list[tuple[int, bool]] = []
    for chunk in split_findings(text):
        heading = HEADING.match(chunk)
        if heading:
            level = len(heading.group(1))
            headings = [h for h in headings if h[0] < level]
            heading_text = chunk.splitlines()[0][heading.end():]
            headings.append((level, bool(HEADING_NON_BUG.match(heading_text))))
        if chunk.startswith("|"):
            if TABLE_SEPARATOR.match(chunk.strip()):
                continue
            header = [i for i, cell in enumerate(table_cells(chunk)) if is_line_header(cell)]
            if header:
                line_column = header[0]
                continue
        else:
            line_column = None
        if any(non_bug for _, non_bug in headings) or (not heading and CHUNK_NON_BUG.match(chunk)):
            continue
        ranges, wide = cited_ranges(chunk, line_column)
        dropped += wide
        if ranges:
            result.append(ranges)
    return result, dropped


def overlap(a: tuple[int, int], b: list[int]) -> int:
    return max(0, min(a[1], b[1]) - max(a[0], b[0]) + 1)


def distance(a: tuple[int, int], b: list[int]) -> int:
    return max(0, b[0] - a[1], a[0] - b[1])


def credited_bug(cited: list[tuple[int, int]], bugs: list[dict]) -> int | None:
    """Index of the one bug this finding locates, or None."""
    touched = {
        i for i, bug in enumerate(bugs) if any(overlap(c, r) for c in cited for r in bug["ranges"])
    }
    if not touched or len(touched) > MAX_BUGS:
        return None
    first = cited[0]

    def rank(i: int) -> tuple[int, int, int]:
        total = sum(overlap(c, r) for c in cited for r in bugs[i]["ranges"])
        nearest = min(distance(first, r) for r in bugs[i]["ranges"])
        return (-total, nearest, i)

    return min(touched, key=rank)


def score(text: str, key: dict) -> dict:
    bugs = key["bugs"]
    cited, dropped = findings(text)
    credited = [credited_bug(f, bugs) for f in cited]
    results = [{"id": bug["id"], "passed": i in credited} for i, bug in enumerate(bugs)]
    return {
        "results": results,
        "metrics": {
            "findings_file": 1,
            "findings": len(cited),
            "unmatched_findings": sum(
                not any(overlap(c, r) for c in f for bug in bugs for r in bug["ranges"]) for f in cited
            ),
            "bugs_located": sum(r["passed"] for r in results),
            "dropped_wide_citations": dropped,
        },
    }


def main(argv: list[str]) -> int:
    solution_dir, key_path = pathlib.Path(argv[0]), pathlib.Path(argv[1])
    if not solution_dir.is_dir():
        print(f"solution directory {solution_dir} does not exist", file=sys.stderr)
        return 2
    key = json.loads(key_path.read_text())
    findings_path = solution_dir / "FINDINGS.md"
    if findings_path.is_file():
        output = score(findings_path.read_text(errors="replace"), key)
    else:
        output = {
            "results": [{"id": bug["id"], "passed": False} for bug in key["bugs"]],
            "metrics": {
                "findings_file": 0,
                "findings": 0,
                "unmatched_findings": 0,
                "bugs_located": 0,
                "dropped_wide_citations": 0,
            },
        }
    print(json.dumps(output))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
