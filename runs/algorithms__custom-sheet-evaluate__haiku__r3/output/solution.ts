export function evaluateSheet(cells: Record<string, string>): Record<string, number | "#CYCLE"> {
  const result: Record<string, number | "#CYCLE"> = {};

  // Parse each cell into terms
  const parsedCells: Record<string, Array<{ type: 'cell' | 'number', value: string }>> = {};

  for (const [cellName, content] of Object.entries(cells)) {
    const terms: Array<{ type: 'cell' | 'number', value: string }> = [];

    if (content.startsWith('=')) {
      const formulaStr = content.substring(1);
      let current = '';

      for (let i = 0; i < formulaStr.length; i++) {
        if (formulaStr[i] === '+') {
          if (current) {
            terms.push({
              type: /^-?\d+$/.test(current) ? 'number' : 'cell',
              value: current
            });
            current = '';
          }
        } else {
          current += formulaStr[i];
        }
      }

      if (current) {
        terms.push({
          type: /^-?\d+$/.test(current) ? 'number' : 'cell',
          value: current
        });
      }
    } else {
      terms.push({ type: 'number', value: content });
    }

    parsedCells[cellName] = terms;
  }

  // Detect cycles using DFS
  const STATE = { UNVISITED: 0, VISITING: 1, VISITED: 2 };
  const state: Record<string, number> = {};
  const inCycle = new Set<string>();

  function dfs(cellName: string): boolean {
    if (!(cellName in state)) {
      state[cellName] = STATE.UNVISITED;
    }

    if (state[cellName] === STATE.VISITED) {
      return false;
    }

    if (state[cellName] === STATE.VISITING) {
      return true; // Back edge found - cycle detected
    }

    state[cellName] = STATE.VISITING;

    const terms = parsedCells[cellName];
    if (terms) {
      for (const term of terms) {
        if (term.type === 'cell' && dfs(term.value)) {
          inCycle.add(cellName);
          state[cellName] = STATE.VISITED;
          return true;
        }
      }
    }

    state[cellName] = STATE.VISITED;
    return false;
  }

  // Run DFS from all input cells
  for (const cellName of Object.keys(cells)) {
    if (!(cellName in state)) {
      dfs(cellName);
    }
  }

  // Mark all cells that depend on cycle cells
  let changed = true;
  while (changed) {
    changed = false;
    for (const cellName of Object.keys(cells)) {
      if (!inCycle.has(cellName)) {
        const terms = parsedCells[cellName];
        if (terms) {
          for (const term of terms) {
            if (term.type === 'cell' && inCycle.has(term.value)) {
              inCycle.add(cellName);
              changed = true;
              break;
            }
          }
        }
      }
    }
  }

  // Evaluate non-cycle cells
  const memo: Record<string, number> = {};

  function evaluate(cellName: string): number {
    if (cellName in memo) {
      return memo[cellName];
    }

    const terms = parsedCells[cellName];
    if (!terms) {
      memo[cellName] = 0;
      return 0;
    }

    let sum = 0;
    for (const term of terms) {
      if (term.type === 'number') {
        sum += parseInt(term.value, 10);
      } else {
        sum += evaluate(term.value);
      }
    }

    memo[cellName] = sum;
    return sum;
  }

  // Build result
  for (const cellName of Object.keys(cells)) {
    if (inCycle.has(cellName)) {
      result[cellName] = "#CYCLE";
    } else {
      result[cellName] = evaluate(cellName);
    }
  }

  return result;
}
