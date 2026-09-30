export function fewestSteadyGroups(scores: number[], maxSpread: number): number {
  const n = scores.length;
  if (n === 0) return 0;
  const maxQ = new Int32Array(n);
  const minQ = new Int32Array(n);
  let mh = 0, mt = 0, nh = 0, nt = 0;
  let groups = 1;
  for (let i = 0; i < n; i++) {
    const v = scores[i];
    // Tentatively add i to the current group.
    while (mt > mh && scores[maxQ[mt - 1]] <= v) mt--;
    maxQ[mt++] = i;
    while (nt > nh && scores[minQ[nt - 1]] >= v) nt--;
    minQ[nt++] = i;
    if (scores[maxQ[mh]] - scores[minQ[nh]] > maxSpread) {
      // Start a new group at i.
      groups++;
      mh = mt = nh = nt = 0;
      maxQ[mt++] = i;
      minQ[nt++] = i;
    }
  }
  return groups;
}
