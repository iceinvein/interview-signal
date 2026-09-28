"""Match the findings in FINDINGS.md to the planted bugs by line number.

Usage: python3 score_findings.py <solution_dir> <answer_key.json>

A bug counts as located when any finding cites a line inside one of the
bug's ranges. Whether the explanation is right is left to the judge.
"""

import json
import pathlib
import re
import sys

# A citation this wide names a region, not a defect; crediting it would let a
# finding such as "lines 1-300" locate every bug at once.
MAX_SPAN = 15

RANGE_PATTERN = r"\d+(?:\s*(?:-|\u2013|\u2014|to)\s*\d+)?"
RANGE = re.compile(r"(\d+)(?:\s*(?:-|\u2013|\u2014|to)\s*(\d+))?")
LABELLED = re.compile(
    rf"\b(?:lines?|ln)\b[\s:*`#.]*({RANGE_PATTERN}(?:\s*(?:,\s*(?:and\s+)?|and|&)\s*{RANGE_PATTERN})*)",
    re.IGNORECASE,
)
L_PREFIXED = re.compile(r"\bL(\d+)(?:\s*[-\u2013]\s*L?(\d+))?\b")
FILE_COLON = re.compile(r"\.ts:(\d+)(?:[-\u2013](\d+))?")
FINDING_START = re.compile(r"^(?:#{1,6}\s|\d+[.)]\s|[-*+]\s|\|)")
TABLE_SEPARATOR = re.compile(r"^\|[\s|:-]+\|?$")


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


def cited_ranges(chunk: str, line_column: int | None) -> list[tuple[int, int]]:
    ranges = []
    for match in LABELLED.finditer(chunk):
        ranges += [to_range(m.group(1), m.group(2)) for m in RANGE.finditer(match.group(1))]
    for pattern in (L_PREFIXED, FILE_COLON):
        ranges += [to_range(m.group(1), m.group(2)) for m in pattern.finditer(chunk)]
    if line_column is not None:
        cells = table_cells(chunk)
        if line_column < len(cells):
            ranges += [to_range(m.group(1), m.group(2)) for m in RANGE.finditer(cells[line_column])]
    return [(lo, hi) for lo, hi in ranges if hi - lo + 1 <= MAX_SPAN]


def findings(text: str) -> list[list[tuple[int, int]]]:
    """Each finding's cited line ranges; chunks citing no line are not findings."""
    result = []
    line_column = None
    for chunk in split_findings(text):
        if chunk.startswith("|"):
            if TABLE_SEPARATOR.match(chunk.strip()):
                continue
            cells = [cell.lower() for cell in table_cells(chunk)]
            header = [i for i, cell in enumerate(cells) if cell in ("line", "lines")]
            if header:
                line_column = header[0]
                continue
        else:
            line_column = None
        ranges = cited_ranges(chunk, line_column)
        if ranges:
            result.append(ranges)
    return result


def overlaps(cited: list[tuple[int, int]], bug_ranges: list[list[int]]) -> bool:
    return any(lo <= hi_b and lo_b <= hi for lo, hi in cited for lo_b, hi_b in bug_ranges)


def score(text: str, key: dict) -> dict:
    cited = findings(text)
    results = [
        {"id": bug["id"], "passed": any(overlaps(f, bug["ranges"]) for f in cited)}
        for bug in key["bugs"]
    ]
    unmatched = [f for f in cited if not any(overlaps(f, bug["ranges"]) for bug in key["bugs"])]
    return {
        "results": results,
        "metrics": {
            "findings_file": 1,
            "findings": len(cited),
            "unmatched_findings": len(unmatched),
            "bugs_located": sum(r["passed"] for r in results),
        },
    }


def main(argv: list[str]) -> int:
    solution_dir, key_path = pathlib.Path(argv[0]), pathlib.Path(argv[1])
    key = json.loads(key_path.read_text())
    findings_path = solution_dir / "FINDINGS.md"
    if findings_path.is_file():
        output = score(findings_path.read_text(errors="replace"), key)
    else:
        output = {
            "results": [{"id": bug["id"], "passed": False} for bug in key["bugs"]],
            "metrics": {"findings_file": 0, "findings": 0, "unmatched_findings": 0, "bugs_located": 0},
        }
    print(json.dumps(output))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
