export function countDigitSum(limit: string, target: number): bigint {
    const digits = limit.split('').map(Number);
    const memo = new Map<string, bigint>();

    function dp(pos: number, sum: number, tight: boolean): bigint {
        if (pos === digits.length) {
            return sum === target ? 1n : 0n;
        }

        const key = `${pos},${sum},${tight}`;
        if (memo.has(key)) {
            return memo.get(key)!;
        }

        const maxDigit = tight ? digits[pos] : 9;
        let count = 0n;

        for (let digit = 0; digit <= maxDigit; digit++) {
            const newSum = sum + digit;
            if (newSum <= target) {
                const newTight = tight && digit === digits[pos];
                count += dp(pos + 1, newSum, newTight);
            }
        }

        memo.set(key, count);
        return count;
    }

    return dp(0, 0, true);
}
