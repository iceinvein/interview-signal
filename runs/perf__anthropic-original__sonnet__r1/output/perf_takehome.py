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


class Sched:
    """ASAP list scheduler with dependency tracking on scratch addresses."""

    def __init__(self):
        self.bundles = []
        self.wc = [-1] * SCRATCH_SIZE
        self.rc = [-1] * SCRATCH_SIZE
        self.zero = None

    def _b(self, c):
        while len(self.bundles) <= c:
            self.bundles.append({})
        return self.bundles[c]

    def free(self, eng, c, extra=0):
        return len(self._b(c).get(eng, ())) + extra < SLOT_LIMITS[eng]

    def dep_time(self, reads, writes):
        t = 0
        wc, rc = self.wc, self.rc
        for r in reads:
            if wc[r] + 1 > t:
                t = wc[r] + 1
        for w in writes:
            if wc[w] + 1 > t:
                t = wc[w] + 1
            if rc[w] > t:
                t = rc[w]
        return t

    def emit(self, eng, slot, reads, writes, t0=0):
        t = max(t0, self.dep_time(reads, writes))
        while not self.free(eng, t):
            t += 1
        self._b(t).setdefault(eng, []).append(slot)
        for r in reads:
            if self.rc[r] < t:
                self.rc[r] = t
        for w in writes:
            self.wc[w] = t
        return t

    def vop(self, op, d, a, b, mode='d'):
        bias = self.bias
        alu_ok = mode != 'v'
        """Elementwise vector op; either 1 valu slot or 8 alu slots."""
        rd = list(range(a, a + 8)) + list(range(b, b + 8))
        wr = list(range(d, d + 8))
        if alu_ok:
            tv = max(self.dep_time(rd, wr), 0)
            while not self.free("valu", tv):
                tv += 1
            # trial for alu
            extra = {}
            ta = 0
            for i in range(8):
                t = self.dep_time([a + i, b + i], [d + i])
                while not self.free("alu", t, extra.get(t, 0)):
                    t += 1
                extra[t] = extra.get(t, 0) + 1
                ta = max(ta, t)
            if mode == 'a' or ta + bias < tv:
                for i in range(8):
                    self.emit("alu", (op, d + i, a + i, b + i), [a + i, b + i], [d + i])
                return
        self.emit("valu", (op, d, a, b), rd, wr)

    def madd(self, d, a, b, c):
        rd = list(range(a, a + 8)) + list(range(b, b + 8)) + list(range(c, c + 8))
        self.emit("valu", ("multiply_add", d, a, b, c), rd, list(range(d, d + 8)))

    def vsel(self, d, cond, a, b):
        rd = list(range(cond, cond + 8)) + list(range(a, a + 8)) + list(range(b, b + 8))
        self.emit("flow", ("vselect", d, cond, a, b), rd, list(range(d, d + 8)))

    def bcast(self, d, s):
        self.emit("valu", ("vbroadcast", d, s), [s], list(range(d, d + 8)))

    def const(self, d, val):
        t0 = self.dep_time([], [d])
        tl = t0
        while not self.free("load", tl):
            tl += 1
        tf = t0
        while not self.free("flow", tf):
            tf += 1
        if tf < tl and self.zero is not None:
            self.emit("flow", ("add_imm", d, self.zero, val % 2**32), [self.zero], [d])
        else:
            self.emit("load", ("const", d, val), [], [d])

    def alu(self, op, d, a, b):
        self.emit("alu", (op, d, a, b), [a, b], [d])


class KernelBuilder:
    def __init__(self):
        self.instrs = []
        self.scratch = {}
        self.scratch_debug = {}
        self.scratch_ptr = 0
        self.const_map = {}

    def debug_info(self):
        return DebugInfo(scratch_map=self.scratch_debug)

    def alloc_scratch(self, name=None, length=1):
        addr = self.scratch_ptr
        if name is not None:
            self.scratch[name] = addr
            self.scratch_debug[addr] = (name, length)
        self.scratch_ptr += length
        assert self.scratch_ptr <= SCRATCH_SIZE, "Out of scratch space"
        return addr

    def build_kernel(
        self, forest_height: int, n_nodes: int, batch_size: int, rounds: int,
        cfg=None,
    ):
        cfg = dict(CFG) if cfg is None else cfg
        S = Sched()
        S.bias = cfg.get('bias', 0)
        S.zero = self.alloc_scratch(None, 1)
        NV = batch_size // VLEN
        assert batch_size % VLEN == 0 and forest_height == 10 and rounds == 16
        FP = 7
        IV = FP + n_nodes + batch_size
        A1 = cfg["A1"]  # per-vector last arithmetic depth, pass 1
        A2 = cfg["A2"]
        madd_first = cfg["madd_first"]
        MODE = cfg['mode']
        DEPTH_LAST = forest_height  # 10
        PASS_LEN = forest_height + 1  # 11
        maxA = max(max(A1), max(A2))
        set_size = max(4, 2 ** (maxA - 1))

        vec = lambda n=1: self.alloc_scratch(None, 8 * n)
        pcell = lambda: self.alloc_scratch(None, 1)
        Zr = [vec() for _ in range(NV)]
        BFr = [vec() for _ in range(NV)]
        pool = []
        for v in range(NV):
            pool.extend(range(Zr[v], Zr[v] + 8))
        pool_i = [0]
        def cell():
            c = pool[pool_i[0]]
            pool_i[0] += 1
            return c

        # ---- constants
        def vconst(val):
            c = cell()
            S.const(c, val % 2**32)
            d = vec()
            S.bcast(d, c)
            return d, c
        M32 = 2**32
        c0, c1, c2, c3, c4, c5 = [h[1] for h in HASH_STAGES[:0]] or [
            0x7ED55D16, 0xC761C23C, 0x165667B1, 0xD3A2646C, 0xFD7046C5, 0xB55A4F09]
        # scalar addr cells for vload/vstore
        AD = [None] * NV
        AD[0] = pcell()
        S.const(AD[0], IV)
        j = 0
        while (1 << j) < NV:
            cj = cell()
            S.const(cj, 8 << j)
            for k in range(1 << j):
                if k + (1 << j) < NV:
                    AD[k + (1 << j)] = pcell()
                    S.alu("+", AD[k + (1 << j)], AD[k], cj)
            j += 1
        # tree top: vload nodes 0..31
        need_nodes = 2 ** (maxA + 1)
        nblk = (need_nodes + 7) // 8
        TREE = pool[pool_i[0]]; pool_i[0] += 8 * nblk
        for b in range(nblk):
            ca = cell()
            S.const(ca, FP + 8 * b)
            S.emit("load", ("vload", TREE + 8 * b, ca), [ca], list(range(TREE + 8 * b, TREE + 8 * b + 8)))
        # V regs load first (priority)
        V = [vec() for _ in range(NV)]

        K4097, _ = vconst(4097)
        C0, _ = vconst(c0)
        S19, _ = vconst(19)
        C1, _ = vconst(c1)
        K33, _ = vconst(33)
        C23, _ = vconst(c2 + c3)
        K33_512, _ = vconst(33 * 512)
        C2_512, _ = vconst(c2 << 9)
        K9, _ = vconst(9)
        C4, _ = vconst(c4)
        S16, _ = vconst(16)
        C5, c5cell = vconst(c5)
        TWO, _ = vconst(2)
        MASKS = {1: None, 2: TWO}
        if maxA >= 4:
            MASKS[4], _ = vconst(4)
        ONE, _ = vconst(1)
        MASKS[1] = ONE

        # folded node scalars F[i] = tree[i]^c5
        F = [None] * need_nodes
        for i in range(need_nodes):
            F[i] = cell()
            S.alu("^", F[i], TREE + i, c5cell)
        # node tables
        T0 = vec()
        S.bcast(T0, F[0])
        T0raw = vec()
        S.bcast(T0raw, TREE + 0)
        tab = {}
        for d in range(1, maxA + 1):
            pairs = []
            for k in range(2 ** (d - 1)):
                Lc = F[2 ** d - 1 + 2 * k]
                Rc = F[2 ** d - 1 + 2 * k + 1]
                if madd_first[d]:
                    Dc = cell()
                    S.alu("-", Dc, Lc, Rc)
                    a, b = vec(), vec()
                    S.bcast(a, Dc)  # D
                    S.bcast(b, Rc)  # R
                    pairs.append((a, b))
                else:
                    a, b = vec(), vec()
                    S.bcast(a, Lc)
                    S.bcast(b, Rc)
                    pairs.append((a, b))
            tab[d] = pairs
        # address consts
        Kc = {}
        for d in range(min(A1) + 1, DEPTH_LAST + 1):
            Kc[d] = pcell()
            S.const(Kc[d], 5 + 2 ** (d + 1))
        for d in range(min(A2) + 1, 5):
            if d not in Kc:
                Kc[d] = pcell()
                S.const(Kc[d], 5 + 2 ** (d + 1))

        # per-vector regs
        ntmp = (SCRATCH_SIZE - self.scratch_ptr) // 8
        if cfg.get("ntmp"): ntmp = min(ntmp, cfg["ntmp"])
        tpool = [vec() for _ in range(ntmp)]
        tctr = [0]
        def tmp():
            t = tpool[tctr[0] % len(tpool)]
            tctr[0] += 1
            return t

        def do_round(v, r):
            p = 0 if r < PASS_LEN else 1
            d = r - p * PASS_LEN
            A = (A1 if p == 0 else A2)[v]
            last = DEPTH_LAST if p == 0 else 4
            Vv = V[v]
            Z = Zr[v]
            BF = BFr[v]
            load_mode = d > A
            true_after = (d == last and p == 1) or (d + 1 > A and d < last)
            # ---- node
            if d >= 2 and load_mode:
                S.madd(Z, Z, TWO, BF)
                N = tmp()
                for i in range(8):
                    S.emit("alu", ("-", N + i, Kc[d], Z + i), [Kc[d], Z + i], [N + i])
                for i in range(8):
                    S.emit("load", ("load", N + i, N + i), [N + i], [N + i])
            elif d == 0:
                N = T0raw if r == 0 else T0
            else:
                pairs = tab[d]
                inner = Z if d == 1 else BF
                slots = [tmp() for _ in range(len(pairs))]
                # outer conds: bit k (k=0..d-2) from z_{d-1}: mask 1<<(d-2-k)
                conds = []
                for k in range(d - 1):
                    if d == 2:
                        conds.append(Z)
                    else:
                        c = tmp()
                        S.vop("&", c, Z, MASKS[1 << (d - 2 - k)], mode=MODE['ext'])
                        conds.append(c)
                for k, (a_, b_) in enumerate(pairs):
                    if madd_first[d]:
                        S.madd(slots[k], inner, a_, b_)
                    else:
                        S.vsel(slots[k], inner, a_, b_)
                n = len(pairs)
                lvl = d - 2
                while n > 1:
                    for j in range(n // 2):
                        S.vsel(slots[j], conds[lvl], slots[2 * j], slots[2 * j + 1])
                    n //= 2
                    lvl -= 1
                N = slots[0]
                if d >= 2 and d < last:
                    S.madd(Z, Z, TWO, BF)
            T1, T2 = tmp(), tmp()
            S.vop("^", Vv, Vv, N, mode=MODE['xN'])
            S.madd(Vv, Vv, K4097, C0)
            S.vop(">>", T1, Vv, S19, mode=MODE['s19'])
            S.vop("^", Vv, Vv, C1, mode=MODE['xc1'])
            S.vop("^", Vv, Vv, T1, mode=MODE['xt1'])
            S.madd(T1, Vv, K33, C23)
            S.madd(T2, Vv, K33_512, C2_512)
            S.vop("^", Vv, T1, T2, mode=MODE['xT'])
            S.madd(Vv, Vv, K9, C4)
            S.vop(">>", T1, Vv, S16, mode=MODE['s16'])
            S.vop("^", Vv, Vv, T1, mode=MODE['xp'])
            if d < last:
                S.vop("&", Z if d == 0 else BF, Vv, ONE, mode=MODE['and'])
            if true_after:
                S.vop("^", Vv, Vv, C5, mode=MODE['c5'])

        order = cfg["order"](NV, rounds)
        for (v, r) in order:
            if r == 0:
                S.emit("load", ("vload", V[v], AD[v]), [AD[v]], list(range(V[v], V[v] + 8)))
            do_round(v, r)
        for v in range(NV):
            S.emit("store", ("vstore", AD[v], V[v]), [AD[v]] + list(range(V[v], V[v] + 8)), [])

        self.instrs = [dict(b) for b in S.bundles]
        self.instrs.append({"flow": [("pause",)]}) if False else None
        self.instrs.insert(0, {"flow": [("pause",)]})
        self.instrs.append({"flow": [("pause",)]})


def order_round_major(NV, rounds):
    return [(v, r) for r in range(rounds) for v in range(NV)]


def order_groups(g):
    def f(NV, rounds):
        out = []
        for s in range(0, NV, g):
            for r in range(rounds):
                for v in range(s, min(NV, s + g)):
                    out.append((v, r))
        return out
    return f


def order_off(off):
    def f(NV, rounds):
        items = [(r + off[v], v, r) for v in range(NV) for r in range(rounds)]
        items.sort()
        return [(v, r) for _, v, r in items]
    return f


def order_skew(g, lag):
    def f(NV, rounds):
        items = [(r + lag * (v // g), v, r) for v in range(NV) for r in range(rounds)]
        items.sort()
        return [(v, r) for _, v, r in items]
    return f


CFG = dict(
    A1=[2, 2, 3, 2, 4, 3, 2, 2, 4, 4, 4, 4, 3, 4, 4, 4, 4, 4, 4, 4, 4, 4, 3, 3, 3, 3, 4, 4, 4, 4, 4, 4],
    A2=[3, 3, 4, 3, 3, 3, 3, 4, 4, 4, 4, 3, 4, 3, 4, 3, 3, 3, 4, 3, 2, 4, 3, 4, 3, 3, 4, 2, 2, 3, 3, 3],
    madd_first={1: True, 2: False, 3: True, 4: False},
    ntmp=0,
    mode={'xN': 'd', 's19': 'd', 'xc1': 'd', 'xt1': 'v', 'xT': 'v', 's16': 'd', 'xp': 'v', 'and': 'd', 'c5': 'v', 'ext': 'd'},
    bias=-1,
    order=order_off([1, -0.25, -0.25, -0.5, 0.5, 0.0, -1.75, -1.25, 2.75, 3.0, 4.75, 3.5, 4.0, 4.25, 4.5, 5.5, 7.75, 8.75, 6.5, 7.0, 8.5, 5.75, 7.0, 7.25, 12.0, 12.75, 12.5, 11.0, 11.5, 13.25, 10.5, 12.5]),
)

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
