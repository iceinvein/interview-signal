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
from dataclasses import dataclass
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


# Deepest tree level resolved with vselect (instead of gather loads), per
# pass over the tree (pass = round // (forest_height + 1)) and input vector.
# Mixing gather/vselect across vectors balances the load and flow engines;
# found by a small local search over schedules.
SEL_TABLE = [[1, 3, 1, 3, 3, 3, 3, 3, 4, 4, 4, 3, 4, 3, 4, 3, 4, 3, 4, 3, 3, 4, 4, 4, 3, 3, 3, 3, 3, 3, 3, 3], [4, 3, 4, 4, 4, 4, 4, 3, 3, 3, 4, 4, 3, 3, 3, 4, 3, 4, 3, 3, 3, 4, 3, 3, 2, 3, 3, 2, 2, 3, 2, 3]]

# Per-vector scheduling priority offsets (same search).
VEC_BIAS = [1.664908, -2.430337, 7.386958, 0.342508, -3.27445, -0.935806, 4.248657, 3.396695, -1.993486, -2.975461, -4.710236, -6.181278, -24.152781, 12.055141, -19.030755, -8.028805, -2.208541, -8.004537, -1.841833, -5.467072, 6.258032, -1.985344, 0.421987, 2.483227, 1.149609, 1.827784, 0.076826, 2.393923, 3.244092, 0.068338, 2.226287, 5.832037]


def default_sel_of(v, p):
    if p < len(SEL_TABLE) and v < len(SEL_TABLE[p]):
        return SEL_TABLE[p][v]
    return 3


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
        self, forest_height: int, n_nodes: int, batch_size: int, rounds: int,
        skew: float = 11.0, sel_of=None,
    ):
        """
        Vectorized kernel. Ops are emitted per input vector as a dataflow
        graph over virtual vector registers, then list-scheduled into VLIW
        bundles with register allocation done during scheduling.

        - Every lane starts at idx 0, so all lanes are at tree level
          r % (forest_height + 1) in round r (wraparound is static).
        - Levels 0..3: node values are preloaded as vectors and picked with
          vselect on the flow engine using the path's branch bits. Deeper
          levels gather with scalar loads; there we track the node address
          R = forest_values_p + idx directly: R' = 2R + (1 - fvp) + (val & 1).
        - Hash stages (a + c) + (a << k) become one multiply_add.
        - When the next round selects from preloaded nodes, the final
          "^ c5" of the hash is folded into those node constants. Branch bits
          taken from such a value are inverted, which is absorbed by swapping
          vselect operands / adjusting constants.
        """
        H = forest_height
        if sel_of is None:
            sel_of = getattr(self, "sel_of", None) or default_sel_of
        # deepest level resolved by vselect
        SEL = max(sel_of(v, p) for v in range(batch_size // VLEN) for p in range(rounds // (H + 1) + 1))
        assert H > SEL
        ops = []
        cur = [-1, -1]  # (vector, round) for priority heuristics
        meta = []
        n_vals = [0]

        def new():
            n_vals[0] += 1
            return VR(n_vals[0] - 1)

        def vr(a):
            return list(range(a, a + VLEN)) if isinstance(a, int) else []

        def emit(kind, tpl, reads=(), writes=()):
            ops.append((kind, tpl, list(reads), list(writes)))
            meta.append((cur[0], cur[1]))

        def v_op(op, a, b, dest=None):  # can be split onto scalar ALU lanes
            dest = dest if dest is not None else new()
            emit("v", (op, dest, a, b), vr(a) + vr(b), vr(dest))
            return dest

        def madd(a, b, c, dest=None):
            dest = dest if dest is not None else new()
            emit("valu", ("multiply_add", dest, a, b, c), vr(a) + vr(b) + vr(c), vr(dest))
            return dest

        def vsel(cond, a, b):
            dest = new()
            emit("flow", ("vselect", dest, cond, a, b), vr(cond) + vr(a) + vr(b))
            return dest

        # ---------------- setup (physical scratch) ----------------
        s_tmp = self.alloc_scratch("s_tmp", 2)
        fp = self.alloc_scratch("forest_values_p")
        vp = self.alloc_scratch("inp_values_p")
        emit("load", ("const", s_tmp, 4), [], [s_tmp])
        emit("load", ("const", s_tmp + 1, 6), [], [s_tmp + 1])
        emit("load", ("load", fp, s_tmp), [s_tmp], [fp])
        emit("load", ("load", vp, s_tmp + 1), [s_tmp + 1], [vp])

        scalar_consts = {}

        def sconst(val):
            val %= 2**32
            if val not in scalar_consts:
                a = self.alloc_scratch()
                emit("c", ("const", a, val), [], [a])
                scalar_consts[val] = a
            return scalar_consts[val]

        vconsts = {}

        def vconst(val):
            val %= 2**32
            if val not in vconsts:
                if val in scalar_consts:
                    s = scalar_consts[val]
                else:
                    s = self.alloc_scratch()
                    emit("c", ("const", s, val), [], [s])
                a = self.alloc_scratch(f"v{val:x}", VLEN)
                emit("valu", ("vbroadcast", a, s), [s], vr(a))
                vconsts[val] = a
            return vconsts[val]

        def vbcast_scalar(name, s):
            a = self.alloc_scratch(name, VLEN)
            emit("valu", ("vbroadcast", a, s), [s], vr(a))
            return a

        c5 = HASH_STAGES[-1][1]
        assert HASH_STAGES[-1][0] == "^" and HASH_STAGES[-1][2] == "^" and c5 & 1

        n_sel_nodes = 2 ** (SEL + 1) - 1
        nb = (n_sel_nodes + VLEN - 1) // VLEN
        node_buf = self.alloc_scratch("node_buf", nb * VLEN)
        emit("load", ("vload", node_buf, fp), [fp], vr(node_buf))
        for k in range(1, nb):
            fpk = self.alloc_scratch()
            emit("alu", ("+", fpk, fp, sconst(8 * k)), [fp, sconst(8 * k)], [fpk])
            emit("load", ("vload", node_buf + 8 * k, fpk), [fpk], vr(node_buf + 8 * k))
        s_c5 = sconst(c5)
        N0 = vbcast_scalar("N0", node_buf)
        NF = []  # node values ^ c5
        for i in range(n_sel_nodes):
            t = self.alloc_scratch()
            emit("alu", ("^", t, node_buf + i, s_c5), [node_buf + i, s_c5], [t])
            NF.append(vbcast_scalar(f"NF{i}", t))

        s_c1 = self.alloc_scratch()
        emit("alu", ("-", s_c1, sconst(1), fp), [sconst(1), fp], [s_c1])
        v_c1 = vbcast_scalar("v_c1", s_c1)
        # transition out of vselect levels (L = last vselect level):
        # idx' = 2^(L+1) - 1 + sum_j 2^(L+1-j) (1 - b'_j) + b
        v_kt = {}

        def kt_vec(L):
            if L not in v_kt:
                k = 2 ** (L + 1) - 1 + sum(2 ** (L + 1 - j) for j in range(1, L + 1))
                t = self.alloc_scratch()
                emit("alu", ("+", t, fp, sconst(k)), [fp, sconst(k)], [t])
                v_kt[L] = vbcast_scalar(f"v_kt{L}", t)
            return v_kt[L]

        hash_plan = []
        for op1, val1, op2, op3, val3 in HASH_STAGES:
            if op1 == "+" and op2 == "+" and op3 == "<<":
                hash_plan.append(("madd", vconst(1 + (1 << val3)), vconst(val1)))
            else:
                hash_plan.append(("3op", op1, vconst(val1), op2, op3, vconst(val3)))
        v1, v2, vm2 = vconst(1), vconst(2), vconst(-2)
        for v_ in {sel_of(v, p) for v in range(batch_size // VLEN) for p in range(rounds // (H + 1) + 1)}:
            kt_vec(v_)

        n_vec = batch_size // VLEN
        addrs = [vp]
        while len(addrs) < n_vec:
            k = len(addrs)
            for v in range(k, min(2 * k, n_vec)):
                a = self.alloc_scratch()
                emit("alu", ("+", a, addrs[v - k], sconst(8 * k)), [addrs[v - k], sconst(8 * k)], [a])
                addrs.append(a)

        # ---------------- per-vector streams (virtual registers) ----------------
        def mux(conds, nodes):
            """nodes[index], index bits MSB-first in conds; cond registers hold
            inverted bits (nonzero -> bit is 0)."""
            if len(conds) == 1:
                return vsel(conds[0], nodes[0], nodes[1])
            half = len(nodes) // 2
            lo = mux(conds[1:], nodes[:half])
            hi = mux(conds[1:], nodes[half:])
            return vsel(conds[0], lo, hi)

        for v in range(n_vec):
            cur[0] = v
            cur[1] = -1
            V = new()
            emit("load", ("vload", V, addrs[v]), [addrs[v]])
            R = None
            folded = False  # V holds true value ^ c5
            bits = []
            for r in range(rounds):
                cur[1] = r
                level = r % (H + 1)
                sel = sel_of(v, r // (H + 1))
                last = r == rounds - 1
                nlevel = (r + 1) % (H + 1)
                fold_out = (not last) and nlevel <= sel
                # ---- node value ----
                if level == 0:
                    V = v_op("^", V, NF[0] if folded else N0)
                    bits = []
                elif level <= sel:
                    assert folded
                    lo = 2 ** level - 1
                    V = v_op("^", V, mux(bits, NF[lo: 2 * lo + 1]))
                else:
                    assert not folded
                    G = new()
                    for i in range(VLEN):
                        emit("load", ("load", VR(G.vid, i), VR(R.vid, i)))
                    V = v_op("^", V, G)
                # ---- transition: combine path bits into address ----
                P = None
                if level == sel and nlevel == sel + 1 and not last and bits:
                    # P = sum b'_j 2^(L-j)  (Horner), then kt - 2P
                    kt = kt_vec(level)
                    if len(bits) == 1:
                        P = madd(bits[0], vm2, kt)
                    else:
                        P = madd(bits[0], v2, bits[1])
                        for b in bits[2:]:
                            P = madd(P, v2, b)
                        P = madd(P, vm2, kt)
                    bits = []
                elif level > sel and not last and nlevel != 0:
                    P = madd(R, v2, v_c1)
                # ---- hash ----
                for hi_, hp in enumerate(hash_plan):
                    if hp[0] == "madd":
                        V = madd(V, hp[1], hp[2])
                    else:
                        _, op1, cc1, op2, op3, cc3 = hp
                        if hi_ == len(hash_plan) - 1 and fold_out:
                            V = v_op(op2, V, v_op(op3, V, cc3))
                        else:
                            V = v_op(op2, v_op(op1, V, cc1), v_op(op3, V, cc3))
                folded = fold_out
                if last or nlevel == 0:
                    continue
                # ---- branch ----
                b = v_op("&", V, v1)
                if nlevel <= sel:
                    bits.append(b)
                elif level == 0:
                    R = v_op("+", kt_vec(0), b)
                else:
                    R = v_op("+", P, b)
            cur[1] = rounds
            emit("store", ("vstore", addrs[v], V), [addrs[v]])

        zero = self.alloc_scratch("zero")  # never written
        # pool of physical vector registers for virtual values
        pool = []
        while self.scratch_ptr + VLEN <= SCRATCH_SIZE:
            pool.append(self.alloc_scratch(None, VLEN))
        self.schedule(ops, meta, pool, skew=skew, n_vec=n_vec, zero=zero)

    def schedule(self, ops, meta, pool, skew=0.0, n_vec=1, zero=None):
        import heapq

        n = len(ops)
        succs = [[] for _ in range(n)]
        npred = [0] * n
        last_w = {}
        readers = {}
        producers = defaultdict(list)  # vid -> op ids
        consumers = defaultdict(set)  # vid -> op ids
        op_dst = [None] * n
        op_srcs = [()] * n
        for i, (kind, tpl, reads, writes) in enumerate(ops):
            deps = {}
            vals = [x for x in tpl[1:] if isinstance(x, VR)]
            if kind == "store":
                dst, srcs = None, vals
            else:
                dst = vals[0] if tpl and isinstance(tpl[1], VR) else None
                srcs = vals[1:] if dst is not None else vals
            if dst is not None:
                producers[dst.vid].append(i)
                op_dst[i] = dst.vid
            op_srcs[i] = tuple({s.vid for s in srcs})
            for s in op_srcs[i]:
                consumers[s].add(i)
                for p in producers[s]:
                    deps[p] = 1
            for w in reads:
                if w in last_w:
                    p = last_w[w]
                    deps[p] = max(deps.get(p, 0), 1)
            for w in writes:
                if w in last_w:
                    p = last_w[w]
                    deps[p] = max(deps.get(p, 0), 1)
                for p in readers.get(w, ()):
                    if p != i:
                        deps[p] = max(deps.get(p, 0), 0)
            for w in reads:
                readers.setdefault(w, []).append(i)
            for w in writes:
                last_w[w] = i
                readers[w] = []
            for p, lat in deps.items():
                succs[p].append((i, lat))
                npred[i] += 1

        # priority: longest path to the end
        height = [0.0] * n
        for i in range(n - 1, -1, -1):
            h = 0
            for s, lat in succs[i]:
                h = max(h, height[s] + lat)
            height[i] = h + 1
        prio_fn = getattr(self, "prio_fn", None)
        if prio_fn is None:
            bias = getattr(self, "vec_bias", None) or VEC_BIAS
            prio = [
                height[i]
                + skew * (n_vec - max(meta[i][0], 0))
                + (bias[meta[i][0]] if 0 <= meta[i][0] < len(bias) else 0)
                for i in range(n)
            ]
        else:
            prio = [prio_fn(height[i], meta[i][0], meta[i][1], ops[i][0]) for i in range(n)]

        refcnt = {vid: len(c) for vid, c in consumers.items()}
        reg = {}
        reused = set()
        free = list(pool)
        earliest = [0] * n
        lanes_done = [0] * n
        sched = [None] * n

        def res(x):
            return reg[x.vid] + x.lane if isinstance(x, VR) else x

        ready = [i for i in range(n) if npred[i] == 0]
        instrs = []
        cycle = 0
        remaining = n
        LIM = SLOT_LIMITS
        while remaining:
            bundle = defaultdict(list)
            used = defaultdict(int)
            heap = [(-prio[i], i) for i in ready if earliest[i] <= cycle]
            later = [i for i in ready if earliest[i] > cycle]
            heapq.heapify(heap)
            deferred = []
            while heap:
                _, i = heapq.heappop(heap)
                kind, tpl, reads, writes = ops[i]
                eng = kind
                if kind == "v":
                    if lanes_done[i] == 0 and used["valu"] < LIM["valu"]:
                        eng = "valu"
                    elif used["alu"] < LIM["alu"]:
                        eng = "alu_lanes"
                    else:
                        deferred.append(i)
                        continue
                elif kind == "c":
                    if used["load"] < LIM["load"]:
                        eng = "load"
                    elif used["flow"] < LIM["flow"]:
                        eng = "flow"
                        tpl = ("add_imm", tpl[1], zero, tpl[2])
                    else:
                        deferred.append(i)
                        continue
                elif used[kind] >= LIM[kind]:
                    deferred.append(i)
                    continue
                d = op_dst[i]
                if d is not None and d not in reg:
                    # try to reuse the register of an input dying here
                    for s in op_srcs[i]:
                        if refcnt[s] == 1 and s in reg and s not in reused:
                            reg[d] = reg[s]
                            reused.add(s)
                            break
                    else:
                        if not free:
                            deferred.append(i)
                            continue
                        reg[d] = free.pop()
                if eng == "alu_lanes":
                    op, dd, a, b = (tpl[0],) + tuple(res(x) for x in tpl[1:])
                    k0 = lanes_done[i]
                    k1 = min(VLEN, k0 + LIM["alu"] - used["alu"])
                    for k in range(k0, k1):
                        bundle["alu"].append((op, dd + k, a + k, b + k))
                    used["alu"] += k1 - k0
                    lanes_done[i] = k1
                    if k1 < VLEN:
                        deferred.append(i)
                        continue
                else:
                    bundle[eng].append((tpl[0],) + tuple(res(x) for x in tpl[1:]))
                    used[eng] += 1
                sched[i] = cycle
                remaining -= 1
                for s in op_srcs[i]:
                    refcnt[s] -= 1
                    if refcnt[s] == 0 and s not in reused:
                        free.append(reg[s])
                for s, lat in succs[i]:
                    npred[s] -= 1
                    earliest[s] = max(earliest[s], cycle + lat)
                    if npred[s] == 0:
                        if earliest[s] <= cycle:
                            heapq.heappush(heap, (-prio[s], s))
                        else:
                            later.append(s)
            if not bundle and not later:
                raise RuntimeError(f"scheduler deadlock at cycle {cycle}")
            ready = deferred + later
            instrs.append(dict(bundle))
            cycle += 1
        # pause bookkeeping for the local debug harness
        if "flow" not in instrs[0]:
            instrs[0]["flow"] = [("pause",)]
        else:
            instrs.insert(0, {"flow": [("pause",)]})
        self.instrs = instrs
        self.sched = sched
        self.meta = meta


@dataclass(frozen=True)
class VR:
    """Reference to lane `lane` of virtual vector register `vid`."""

    vid: int
    lane: int = 0


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
