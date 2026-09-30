export function courseOrder(numCourses: number, prerequisites: [number, number][]): number[] {
    // Build adjacency list and in-degree array
    const graph: number[][] = Array.from({ length: numCourses }, () => []);
    const inDegree: number[] = Array(numCourses).fill(0);

    for (const [a, b] of prerequisites) {
        graph[b].push(a); // b must come before a
        inDegree[a]++;
    }

    // Min-heap to store courses with in-degree 0
    const heap: number[] = [];
    for (let i = 0; i < numCourses; i++) {
        if (inDegree[i] === 0) {
            heap.push(i);
        }
    }

    // Build min-heap
    for (let i = Math.floor(heap.length / 2) - 1; i >= 0; i--) {
        heapifyDown(heap, i);
    }

    const result: number[] = [];

    while (heap.length > 0) {
        // Extract min
        const courseToTake = heap[0];
        heap[0] = heap[heap.length - 1];
        heap.pop();
        if (heap.length > 0) {
            heapifyDown(heap, 0);
        }

        result.push(courseToTake);

        // Update in-degrees of dependent courses
        for (const dependent of graph[courseToTake]) {
            inDegree[dependent]--;
            if (inDegree[dependent] === 0) {
                heap.push(dependent);
                heapifyUp(heap, heap.length - 1);
            }
        }
    }

    // If we couldn't process all courses, there's a cycle
    return result.length === numCourses ? result : [];
}

function heapifyUp(heap: number[], idx: number): void {
    while (idx > 0) {
        const parentIdx = Math.floor((idx - 1) / 2);
        if (heap[parentIdx] > heap[idx]) {
            [heap[parentIdx], heap[idx]] = [heap[idx], heap[parentIdx]];
            idx = parentIdx;
        } else {
            break;
        }
    }
}

function heapifyDown(heap: number[], idx: number): void {
    while (true) {
        let minIdx = idx;
        const leftIdx = 2 * idx + 1;
        const rightIdx = 2 * idx + 2;

        if (leftIdx < heap.length && heap[leftIdx] < heap[minIdx]) {
            minIdx = leftIdx;
        }
        if (rightIdx < heap.length && heap[rightIdx] < heap[minIdx]) {
            minIdx = rightIdx;
        }

        if (minIdx !== idx) {
            [heap[minIdx], heap[idx]] = [heap[idx], heap[minIdx]];
            idx = minIdx;
        } else {
            break;
        }
    }
}
