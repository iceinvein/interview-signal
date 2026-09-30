export function maxSlidingWindow(nums: number[], k: number): number[] {
    const result: number[] = [];
    const deque: number[] = [];

    for (let i = 0; i < nums.length; i++) {
        // Remove indices outside the current window
        while (deque.length > 0 && deque[0] < i - k + 1) {
            deque.shift();
        }

        // Remove indices of elements smaller than current element from back
        while (deque.length > 0 && nums[deque[deque.length - 1]] < nums[i]) {
            deque.pop();
        }

        // Add current index
        deque.push(i);

        // Once window is full, record the max (front of deque)
        if (i >= k - 1) {
            result.push(nums[deque[0]]);
        }
    }

    return result;
}
