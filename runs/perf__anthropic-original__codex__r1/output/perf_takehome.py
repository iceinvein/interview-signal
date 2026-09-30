"""
# Anthropic's Original Performance Engineering Take-home (Release version)

Copyright Anthropic PBC 2026. Permission is granted to modify and use, but not
to publish or redistribute your solutions so it's hard to find spoilers.

# Task

- Optimize the kernel (in KernelBuilder.build_kernel) as much as possible in the
  available time, as measured by test_kernel_cycles on a frozen separate copy
  of the simulator.

Validate your results using `python tests/submission_tests.py` without modifying
anything in the tests/ folder.

We recommend you look through problem.py next.
"""

from collections import defaultdict
import random
import unittest

from problem import (
    Engine,
    DebugInfo,
    SLOT_LIMITS,
    VLEN,
    N_CORES,
    SCRATCH_SIZE,
    Machine,
    Tree,
    Input,
    HASH_STAGES,
    reference_kernel,
    build_mem_image,
    reference_kernel2,
)


class KernelBuilder:
    def __init__(self):
        self.instrs = []
        self.scratch = {}
        self.scratch_debug = {}
        self.scratch_ptr = 0
        self.const_map = {}

    def debug_info(self):
        return DebugInfo(scratch_map=self.scratch_debug)

    def build(self, slots: list[tuple[Engine, tuple]], vliw: bool = False):
        # Simple slot packing that just uses one slot per instruction bundle
        instrs = []
        for engine, slot in slots:
            instrs.append({engine: [slot]})
        return instrs

    def add(self, engine, slot):
        self.instrs.append({engine: [slot]})

    def alloc_scratch(self, name=None, length=1):
        addr = self.scratch_ptr
        if name is not None:
            self.scratch[name] = addr
            self.scratch_debug[addr] = (name, length)
        self.scratch_ptr += length
        assert self.scratch_ptr <= SCRATCH_SIZE, "Out of scratch space"
        return addr

    def scratch_const(self, val, name=None):
        if val not in self.const_map:
            addr = self.alloc_scratch(name)
            self.add("load", ("const", addr, val))
            self.const_map[val] = addr
        return self.const_map[val]

    def build_hash(self, val_hash_addr, tmp1, tmp2, round, i):
        slots = []

        for hi, (op1, val1, op2, op3, val3) in enumerate(HASH_STAGES):
            slots.append(("alu", (op1, tmp1, val_hash_addr, self.scratch_const(val1))))
            slots.append(("alu", (op3, tmp2, val_hash_addr, self.scratch_const(val3))))
            slots.append(("alu", (op2, val_hash_addr, tmp1, tmp2)))
            slots.append(("debug", ("compare", val_hash_addr, (round, i, "hash_stage", hi))))

        return slots

    def build_kernel(
        self, forest_height: int, n_nodes: int, batch_size: int, rounds: int
    ):
        """Vectorized tree traversal with dependency-aware VLIW scheduling."""
        import heapq

        assert batch_size % VLEN == 0
        groups = batch_size // VLEN
        forest_base = self.scratch_const(7)
        zero = self.scratch_const(0)
        one = self.scratch_const(1)
        final_hash_const = self.scratch_const(0xB55A4F09)
        five = self.alloc_scratch("five")
        value_base = self.alloc_scratch("value_base")
        index_base = self.alloc_scratch("index_base")

        # Vector constants are shared by every block of eight inputs.
        constants = {}
        for number in (1, 2, 4097, 33, 9, 19, 16,
                       0x7ED55D16, 0xC761C23C, 0x165667B1,
                       0xD3A2646C, 0xFD7046C5):
            src = self.scratch_const(number)
            dest = self.alloc_scratch(f"vconst_{number}", VLEN)
            constants[number] = dest
            self.add("valu", ("vbroadcast", dest, src))

        # The first two tree levels contain only three shared nodes. Load
        # them once and evaluate level one as an affine function of its index.
        root = self.alloc_scratch("root")
        left = self.alloc_scratch("left")
        right = self.alloc_scratch("right")
        difference = self.alloc_scratch("difference")
        intercept = self.alloc_scratch("intercept")
        self.add("load", ("load", root, forest_base))
        self.add("load", ("load", left, self.scratch_const(8)))
        self.add("load", ("load", right, self.scratch_const(9)))
        self.add("alu", ("-", difference, right, left))
        self.add("alu", ("-", intercept, left, difference))
        root_vec = self.alloc_scratch("root_vec", VLEN)
        diff_vec = self.alloc_scratch("diff_vec", VLEN)
        intercept_vec = self.alloc_scratch("intercept_vec", VLEN)
        self.add("valu", ("vbroadcast", root_vec, root))
        self.add("valu", ("vbroadcast", diff_vec, difference))
        self.add("valu", ("vbroadcast", intercept_vec, intercept))
        level_two = []
        for position in range(3, 7):
            scalar = self.alloc_scratch(f"level_two_scalar_{position}")
            self.add("load", ("load", scalar, self.scratch_const(7 + position)))
            vector = self.alloc_scratch(f"level_two_vector_{position}", VLEN)
            self.add("valu", ("vbroadcast", vector, scalar))
            level_two.append(vector)
        level_three = []
        for position in range(7, 15):
            scalar = self.alloc_scratch(f"level_three_scalar_{position}")
            self.add("load", ("load", scalar, self.scratch_const(7 + position)))
            vector = self.alloc_scratch(f"level_three_vector_{position}", VLEN)
            self.add("valu", ("vbroadcast", vector, scalar))
            level_three.append(vector)

        # Keep all input values and tree indices in scratch across rounds.
        regs = []
        for g in range(groups):
            regs.append(tuple(self.alloc_scratch(f"{kind}_{g}", VLEN)
                              for kind in ("idx", "val", "addr", "node")))
        pool_a_size = 16
        pool_b_size = 8
        aux_pool = [self.alloc_scratch(f"aux_{i}", VLEN) for i in range(pool_a_size)]
        aux2_pool = [self.alloc_scratch(f"aux2_{i}", VLEN) for i in range(pool_b_size)]

        self.add("flow", ("pause",))

        tasks = []
        last_writer = {}
        readers = defaultdict(set)

        def words(addr, length=VLEN):
            return range(addr, addr + length)

        def emit(engine, slot, reads=(), writes=()):
            reads = tuple(reads)
            writes = tuple(writes)
            deps = set()
            for addr in reads:
                if addr in last_writer:
                    deps.add(last_writer[addr])
            for addr in writes:
                if addr in last_writer:
                    deps.add(last_writer[addr])
                deps.update(readers[addr])
            task_id = len(tasks)
            tasks.append([engine, slot, deps, [], g])
            for dep in deps:
                tasks[dep][3].append(task_id)
            for addr in reads:
                if addr not in writes:
                    readers[addr].add(task_id)
            for addr in writes:
                readers[addr].clear()
                last_writer[addr] = task_id

        def vop(op, dst, a, b):
            emit("valu", (op, dst, a, b),
                 (*words(a), *words(b)), words(dst))

        def madd(dst, a, b, c):
            emit("valu", ("multiply_add", dst, a, b, c),
                 (*words(a), *words(b), *words(c)), words(dst))

        def scalar_vector_op(op, dst, a, b):
            for lane in range(VLEN):
                emit("alu", (op, dst + lane, a + lane, b),
                     (a + lane, b), (dst + lane,))

        g = 0
        emit("load", ("const", five, 5), (), (five,))
        emit("load", ("const", value_base, 7 + n_nodes + batch_size),
             (), (value_base,))
        emit("load", ("const", index_base, 7 + n_nodes), (), (index_base,))

        value_ptrs = []
        for g, (idx, val, addr, node) in enumerate(regs):
            ptr = self.alloc_scratch(f"value_ptr_{g}")
            value_ptrs.append(ptr)
            emit("flow", ("add_imm", ptr, value_base, g * VLEN),
                 (value_base,), (ptr,))
            emit("load", ("vload", val, ptr), (ptr,), words(val))
            emit("valu", ("vbroadcast", idx, zero), (), words(idx))

        for r in range(rounds):
            for g, (idx, val, addr, node) in enumerate(regs):
                aux = aux_pool[g % pool_a_size]
                aux2 = aux2_pool[g % pool_b_size]
                depth_in_tree = r % (forest_height + 1)
                if depth_in_tree == 0:
                    vop("^", val, val, root_vec)
                elif depth_in_tree == 1:
                    madd(node, idx, diff_vec, intercept_vec)
                    vop("^", val, val, node)
                elif depth_in_tree == 2:
                    scalar_vector_op("&", addr, idx, one)
                    emit("flow", ("vselect", node, addr, level_two[0], level_two[1]),
                         (*words(addr), *words(level_two[0]), *words(level_two[1])), words(node))
                    emit("flow", ("vselect", aux, addr, level_two[2], level_two[3]),
                         (*words(addr), *words(level_two[2]), *words(level_two[3])), words(aux))
                    scalar_vector_op("<", addr, idx, five)
                    emit("flow", ("vselect", node, addr, node, aux),
                         (*words(addr), *words(node), *words(aux)), words(node))
                    vop("^", val, val, node)
                elif depth_in_tree == 3:
                    scalar_vector_op("&", addr, idx, one)
                    emit("flow", ("vselect", node, addr, level_three[0], level_three[1]),
                         (*words(addr), *words(level_three[0]), *words(level_three[1])), words(node))
                    emit("flow", ("vselect", aux, addr, level_three[2], level_three[3]),
                         (*words(addr), *words(level_three[2]), *words(level_three[3])), words(aux))
                    scalar_vector_op("<", addr, idx, self.scratch_const(9))
                    emit("flow", ("vselect", node, addr, node, aux),
                         (*words(addr), *words(node), *words(aux)), words(node))
                    scalar_vector_op("&", addr, idx, one)
                    emit("flow", ("vselect", aux, addr, level_three[4], level_three[5]),
                         (*words(addr), *words(level_three[4]), *words(level_three[5])), words(aux))
                    emit("flow", ("vselect", aux2, addr, level_three[6], level_three[7]),
                         (*words(addr), *words(level_three[6]), *words(level_three[7])), words(aux2))
                    scalar_vector_op("<", addr, idx, self.scratch_const(13))
                    emit("flow", ("vselect", aux, addr, aux, aux2),
                         (*words(addr), *words(aux), *words(aux2)), words(aux))
                    scalar_vector_op("<", addr, idx, self.scratch_const(11))
                    emit("flow", ("vselect", node, addr, node, aux),
                         (*words(addr), *words(node), *words(aux)), words(node))
                    vop("^", val, val, node)
                else:
                    for lane in range(VLEN):
                        emit("alu", ("+", addr + lane, idx + lane, forest_base),
                             (idx + lane,), (addr + lane,))
                    for lane in range(VLEN):
                        emit("load", ("load_offset", node, addr, lane),
                             (addr + lane,), (node + lane,))
                    vop("^", val, val, node)

                madd(val, val, constants[4097], constants[0x7ED55D16])
                vop("^", addr, val, constants[0xC761C23C])
                vop(">>", node, val, constants[19])
                vop("^", val, addr, node)
                madd(val, val, constants[33], constants[0x165667B1])
                vop("+", addr, val, constants[0xD3A2646C])
                vop("<<", node, val, constants[9])
                vop("^", val, addr, node)
                madd(val, val, constants[9], constants[0xFD7046C5])
                scalar_vector_op("^", addr, val, final_hash_const)
                vop(">>", node, val, constants[16])
                vop("^", val, addr, node)

                if r % (forest_height + 1) == forest_height:
                    emit("valu", ("vbroadcast", idx, zero), (), words(idx))
                else:
                    scalar_vector_op("&", addr, val, one)
                    madd(idx, idx, constants[2], constants[1])
                    vop("+", idx, idx, addr)

        for g, (idx, val, addr, node) in enumerate(regs):
            emit("store", ("vstore", value_ptrs[g], val),
                 (*words(val), value_ptrs[g]))
            emit("flow", ("add_imm", value_ptrs[g], index_base, g * VLEN),
                 (index_base,), (value_ptrs[g],))
            emit("store", ("vstore", value_ptrs[g], idx),
                 (*words(idx), value_ptrs[g]))

        # Pack the short initialization sequence while preserving scratch
        # dependencies and the pause required by the local trace harness.
        def pack_setup(sequence):
            packed = []
            last_write = {}
            last_read = {}
            for instruction in sequence:
                engine, slots = next(iter(instruction.items()))
                slot = slots[0]
                if engine == "load":
                    if slot[0] == "const":
                        reads, writes = (), (slot[1],)
                    else:
                        reads, writes = (slot[2],), (slot[1],)
                elif engine == "alu":
                    reads, writes = (slot[2], slot[3]), (slot[1],)
                elif engine == "valu":
                    reads, writes = (slot[2],), tuple(words(slot[1]))
                else:
                    raise AssertionError(engine)
                earliest = 0
                for address in reads:
                    earliest = max(earliest, last_write.get(address, -1) + 1)
                for address in writes:
                    earliest = max(earliest, last_write.get(address, -1) + 1,
                                   last_read.get(address, -1) + 1)
                cycle = earliest
                while cycle < len(packed) and len(packed[cycle].get(engine, ())) >= SLOT_LIMITS[engine]:
                    cycle += 1
                while len(packed) <= cycle:
                    packed.append({})
                packed[cycle].setdefault(engine, []).append(slot)
                for address in reads:
                    last_read[address] = cycle
                for address in writes:
                    last_write[address] = cycle
                    last_read.pop(address, None)
            return packed

        pause_at = next(i for i, instruction in enumerate(self.instrs)
                        if "flow" in instruction)
        setup_tail = self.instrs[pause_at + 1:]
        self.instrs = pack_setup(self.instrs[:pause_at])
        self.instrs[-1].setdefault("flow", []).append(("pause",))
        self.instrs.extend(pack_setup(setup_tail))

        # Longest remaining dependency path breaks ties between ready slots.
        weights = {"alu": 5, "valu": 10, "load": 20,
                   "store": 10, "flow": 15}
        depth = [0] * len(tasks)
        for i in range(len(tasks) - 1, -1, -1):
            depth[i] = weights[tasks[i][0]] + max((depth[j] for j in tasks[i][3]), default=0)
        pending = [len(task[2]) for task in tasks]
        def priority(i):
            engine, _, _, _, group = tasks[i]
            return (-depth[i] - 152 * (groups - 1 - group), i)
        ready = [priority(i) for i, count in enumerate(pending) if count == 0]
        heapq.heapify(ready)
        done = 0
        while done < len(tasks):
            limits = {name: SLOT_LIMITS[name] for name in ("alu", "valu", "load", "store", "flow")}
            bundle = defaultdict(list)
            postponed = []
            issued = []
            while ready:
                key, i = heapq.heappop(ready)
                engine, slot, _, _, _ = tasks[i]
                if limits[engine]:
                    bundle[engine].append(slot)
                    limits[engine] -= 1
                    issued.append(i)
                else:
                    postponed.append((key, i))
            for item in postponed:
                heapq.heappush(ready, item)
            assert issued, "Instruction dependency cycle"
            self.instrs.append(dict(bundle))
            done += len(issued)
            for i in issued:
                for child in tasks[i][3]:
                    pending[child] -= 1
                    if pending[child] == 0:
                        heapq.heappush(ready, priority(child))

        assert "flow" not in self.instrs[-1]
        self.instrs[-1]["flow"] = [("pause",)]

BASELINE = 147734

def do_kernel_test(
    forest_height: int,
    rounds: int,
    batch_size: int,
    seed: int = 123,
    trace: bool = False,
    prints: bool = False,
):
    print(f"{forest_height=}, {rounds=}, {batch_size=}")
    random.seed(seed)
    forest = Tree.generate(forest_height)
    inp = Input.generate(forest, batch_size, rounds)
    mem = build_mem_image(forest, inp)

    kb = KernelBuilder()
    kb.build_kernel(forest.height, len(forest.values), len(inp.indices), rounds)
    # print(kb.instrs)

    value_trace = {}
    machine = Machine(
        mem,
        kb.instrs,
        kb.debug_info(),
        n_cores=N_CORES,
        value_trace=value_trace,
        trace=trace,
    )
    machine.prints = prints
    for i, ref_mem in enumerate(reference_kernel2(mem, value_trace)):
        machine.run()
        inp_values_p = ref_mem[6]
        if prints:
            print(machine.mem[inp_values_p : inp_values_p + len(inp.values)])
            print(ref_mem[inp_values_p : inp_values_p + len(inp.values)])
        assert (
            machine.mem[inp_values_p : inp_values_p + len(inp.values)]
            == ref_mem[inp_values_p : inp_values_p + len(inp.values)]
        ), f"Incorrect result on round {i}"
        inp_indices_p = ref_mem[5]
        if prints:
            print(machine.mem[inp_indices_p : inp_indices_p + len(inp.indices)])
            print(ref_mem[inp_indices_p : inp_indices_p + len(inp.indices)])
        # Updating these in memory isn't required, but you can enable this check for debugging
        # assert machine.mem[inp_indices_p:inp_indices_p+len(inp.indices)] == ref_mem[inp_indices_p:inp_indices_p+len(inp.indices)]

    print("CYCLES: ", machine.cycle)
    print("Speedup over baseline: ", BASELINE / machine.cycle)
    return machine.cycle


class Tests(unittest.TestCase):
    def test_ref_kernels(self):
        """
        Test the reference kernels against each other
        """
        random.seed(123)
        for i in range(10):
            f = Tree.generate(4)
            inp = Input.generate(f, 10, 6)
            mem = build_mem_image(f, inp)
            reference_kernel(f, inp)
            for _ in reference_kernel2(mem, {}):
                pass
            assert inp.indices == mem[mem[5] : mem[5] + len(inp.indices)]
            assert inp.values == mem[mem[6] : mem[6] + len(inp.values)]

    def test_kernel_trace(self):
        # Full-scale example for performance testing
        do_kernel_test(10, 16, 256, trace=True, prints=False)

    # Passing this test is not required for submission, see submission_tests.py for the actual correctness test
    # You can uncomment this if you think it might help you debug
    # def test_kernel_correctness(self):
    #     for batch in range(1, 3):
    #         for forest_height in range(3):
    #             do_kernel_test(
    #                 forest_height + 2, forest_height + 4, batch * 16 * VLEN * N_CORES
    #             )

    def test_kernel_cycles(self):
        do_kernel_test(10, 16, 256)


# To run all the tests:
#    python perf_takehome.py
# To run a specific test:
#    python perf_takehome.py Tests.test_kernel_cycles
# To view a hot-reloading trace of all the instructions:  **Recommended debug loop**
# NOTE: The trace hot-reloading only works in Chrome. In the worst case if things aren't working, drag trace.json onto https://ui.perfetto.dev/
#    python perf_takehome.py Tests.test_kernel_trace
# Then run `python watch_trace.py` in another tab, it'll open a browser tab, then click "Open Perfetto"
# You can then keep that open and re-run the test to see a new trace.

# To run the proper checks to see which thresholds you pass:
#    python tests/submission_tests.py

if __name__ == "__main__":
    unittest.main()
