export function fewestSteadyGroups(scores: number[], maxSpread: number): number {
    if (scores.length === 0) return 0;

    let groupCount = 0;
    let i = 0;

    while (i < scores.length) {
        let min = scores[i];
        let max = scores[i];
        let j = i;

        // Extend the group as far as possible while staying steady
        while (j < scores.length) {
            const newMin = Math.min(min, scores[j]);
            const newMax = Math.max(max, scores[j]);

            if (newMax - newMin <= maxSpread) {
                min = newMin;
                max = newMax;
                j++;
            } else {
                break;
            }
        }

        groupCount++;
        i = j;
    }

    return groupCount;
}
