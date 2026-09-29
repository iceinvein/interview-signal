function isLiteral(term: string): boolean {
  const first = term[0];
  return first === "-" || (first >= "0" && first <= "9");
}

export function evaluateSheet(cells: Record<string, string>): Record<string, number | "#CYCLE"> {
  const names = Object.keys(cells);
  const indexOf = new Map<string, number>();
  names.forEach((name, i) => indexOf.set(name, i));

  // Each cell's literal terms fold into one constant; its filled references are kept by index.
  const constant = new Float64Array(names.length);
  const refs: number[][] = names.map(() => []);
  const dependents: number[][] = names.map(() => []);
  const pending = new Int32Array(names.length);
  names.forEach((name, i) => {
    const content = cells[name];
    if (!content.startsWith("=")) {
      constant[i] = Number(content);
      return;
    }
    for (const term of content.slice(1).split("+")) {
      if (isLiteral(term)) {
        constant[i] += Number(term);
        continue;
      }
      const ref = indexOf.get(term);
      if (ref === undefined) continue;
      refs[i].push(ref);
      dependents[ref].push(i);
      pending[i]++;
    }
  });

  // Kahn's order: a cell is ready once every reference is evaluated, so cells
  // that reach a cycle are never ready.
  const value = new Float64Array(names.length);
  const evaluated = new Uint8Array(names.length);
  const ready: number[] = [];
  for (let i = 0; i < names.length; i++) if (pending[i] === 0) ready.push(i);
  for (let next = 0; next < ready.length; next++) {
    const i = ready[next];
    let sum = constant[i];
    for (const ref of refs[i]) sum += value[ref];
    value[i] = sum;
    evaluated[i] = 1;
    for (const dependent of dependents[i]) {
      pending[dependent]--;
      if (pending[dependent] === 0) ready.push(dependent);
    }
  }

  const result: Record<string, number | "#CYCLE"> = {};
  names.forEach((name, i) => {
    result[name] = evaluated[i] === 1 ? value[i] : "#CYCLE";
  });
  return result;
}
