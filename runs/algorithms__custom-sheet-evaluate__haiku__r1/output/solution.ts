export function evaluateSheet(cells: Record<string, string>): Record<string, number | "#CYCLE"> {
  const result: Record<string, number | "#CYCLE"> = {};
  const computing: Set<string> = new Set();
  const computed: Record<string, number | "#CYCLE"> = {};

  function computeValue(cell: string): number | "#CYCLE" {
    if (computed.hasOwnProperty(cell)) {
      return computed[cell];
    }

    if (computing.has(cell)) {
      return "#CYCLE";
    }

    if (!cells.hasOwnProperty(cell)) {
      return 0;
    }

    computing.add(cell);
    const content = cells[cell];

    if (content.startsWith("=")) {
      const terms = parseFormula(content.substring(1));
      let sum = 0;
      let hasCycle = false;

      for (const term of terms) {
        if (isNumericLiteral(term)) {
          sum += Number(term);
        } else {
          const value = computeValue(term);
          if (value === "#CYCLE") {
            hasCycle = true;
          } else {
            sum += value;
          }
        }
      }

      computing.delete(cell);
      const finalResult = hasCycle ? "#CYCLE" : sum;
      computed[cell] = finalResult;
      return finalResult;
    } else {
      const value = Number(content);
      computing.delete(cell);
      computed[cell] = value;
      return value;
    }
  }

  for (const cell of Object.keys(cells)) {
    result[cell] = computeValue(cell);
  }

  return result;
}

function isNumericLiteral(term: string): boolean {
  return /^-?\d+$/.test(term);
}

function parseFormula(formula: string): string[] {
  return formula.split("+");
}
