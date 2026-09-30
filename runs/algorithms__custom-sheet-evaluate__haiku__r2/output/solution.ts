export function evaluateSheet(cells: Record<string, string>): Record<string, number | "#CYCLE"> {
    const result: Record<string, number | "#CYCLE"> = {};

    type Cell = { type: 'literal'; value: number } | { type: 'formula' };
    const parsed: Record<string, Cell> = {};

    for (const [name, content] of Object.entries(cells)) {
        if (content.startsWith('=')) {
            parsed[name] = { type: 'formula' };
        } else {
            parsed[name] = { type: 'literal', value: parseInt(content) };
        }
    }

    const memo: Record<string, number | "#CYCLE"> = {};

    function getValue(cell: string, computing: Set<string>): number | "#CYCLE" {
        if (memo[cell] !== undefined) {
            return memo[cell];
        }

        if (computing.has(cell)) {
            return "#CYCLE";
        }

        const cellData = parsed[cell];
        if (!cellData) {
            return 0;
        }

        if (cellData.type === 'literal') {
            memo[cell] = cellData.value;
            return cellData.value;
        }

        computing.add(cell);
        let sum = 0;
        let hasCycleInFormula = false;

        const formula = cells[cell].slice(1);
        const terms = formula.split('+');

        for (const term of terms) {
            if (term === '') continue;
            const value = parseInt(term);
            if (!isNaN(value)) {
                sum += value;
            } else {
                const depValue = getValue(term, computing);
                if (depValue === "#CYCLE") {
                    hasCycleInFormula = true;
                    break;
                }
                sum += depValue;
            }
        }

        computing.delete(cell);

        if (hasCycleInFormula) {
            memo[cell] = "#CYCLE";
            return "#CYCLE";
        }

        memo[cell] = sum;
        return sum;
    }

    for (const cell of Object.keys(cells)) {
        result[cell] = getValue(cell, new Set());
    }

    return result;
}
