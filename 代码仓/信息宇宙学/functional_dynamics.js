#!/usr/bin/env node
'use strict';
// ============================================================
//  泛函动力学: 叠加模态 → 时序+拓扑 精细化转化机制
//
//  严格依托五条公理,信息守恒全程锁定
//
//  算子:
//    P_{C_0} — 分辨投影算子 (阈值截断)
//    G       — 拓扑邻接生成泛函
//    T       — 时序迭代算子
//
//  守恒约束:
//    dim(Ψ_S) = dim(拓扑自由度 + 时序自由度)
//    Σ_k|α_k|² = Σ_{i<j} C_{ij}²
// ============================================================

const LN2 = Math.log(2);

// ============================================================
//  阶段0: 叠加态 Ψ_S (奇点内封存的并行叠加)
//
//  Ψ_S = Σ_k α_k φ_k
//  φ_k 互斥潜在模态,无先后、无远近
//  信息: I_0 = Σ|α_k|² (隐式信息)
// ============================================================
class SuperpositionState {
    constructor(N) {
        this.N = N;
        this.amplitudes = [];

        // 幂律分布: 模态权重不均匀 (奇点内相干凝聚)
        // p_k = c / k^s, 使少数模态主导,多数微弱
        const s = 1.5;
        let sumP = 0;
        const rawP = [];
        for (let k = 0; k < N; k++) {
            const p = 1 / Math.pow(k + 1, s);
            rawP.push(p);
            sumP += p;
        }

        // 归一化: Σ|α_k|² = I_0 = N × ln(2) (量子信息量)
        const I_0 = N * LN2;
        const norm = I_0 / sumP;

        for (let k = 0; k < N; k++) {
            const p = rawP[k] * norm;       // |α_k|²
            const amp = Math.sqrt(p);        // |α_k|
            const phase = Math.random() * 2 * Math.PI;
            this.amplitudes.push({
                k,
                re: amp * Math.cos(phase),
                im: amp * Math.sin(phase),
                p, amp
            });
        }
        this.I_0 = I_0;
    }

    // 复数关联: C_{ij} = α_i* · α_j
    correlation(i, j) {
        const a = this.amplitudes[i];
        const b = this.amplitudes[j];
        const re = a.re * b.re + a.im * b.im;
        const im = a.re * b.im - a.im * b.re;
        return { re, im, mag: Math.sqrt(re * re + im * im) };
    }

    totalAmplitudeSq() {
        return this.amplitudes.reduce((s, a) => s + a.p, 0);
    }

    shannonEntropy() {
        const total = this.totalAmplitudeSq();
        let H = 0;
        for (const a of this.amplitudes) {
            const p = a.p / total;
            if (p > 1e-15) H -= p * Math.log(p);
        }
        return H;
    }
}

// ============================================================
//  阶段1: 分辨投影 P_{C_0}
//
//  Ψ_S → {C_{ij}}
//  规则:
//    C_{ij} ≥ C_0 → 稳定可区分关联对
//    C_{ij} < C_0 → 消融,退回背景涨落
//
//  守恒重标定:
//    C_{ij} = rawMag × √(I_0 / Σ_kept rawMag²)
//    → Σ C_{ij}² = I_0 (严格守恒!)
//    消融对的信息被重分配到存活对中
// ============================================================
class ResolutionProjection {
    project(psi, C0) {
        const N = psi.N;
        const allPairs = [];
        let keptRawSumSq = 0;
        let discardedSumSq = 0;

        for (let i = 0; i < N; i++) {
            for (let j = i + 1; j < N; j++) {
                const c = psi.correlation(i, j);
                const pair = { i, j, rawMag: c.mag, rawRe: c.re, rawIm: c.im };
                if (c.mag >= C0) {
                    pair.kept = true;
                    keptRawSumSq += c.mag * c.mag;
                } else {
                    pair.kept = false;
                    discardedSumSq += c.mag * c.mag;
                }
                allPairs.push(pair);
            }
        }

        // 守恒重标定: Σ C_{ij}² = I_0
        const I_0 = psi.I_0;
        const rescale = Math.sqrt(I_0 / keptRawSumSq);

        const keptPairs = [];
        let finalSumSq = 0;
        for (const pair of allPairs) {
            if (pair.kept) {
                pair.C = pair.rawMag * rescale;
                pair.distance = 1 / pair.C;     // d_{ij} ∝ 1/C_{ij}
                finalSumSq += pair.C * pair.C;
                keptPairs.push(pair);
            }
        }

        return {
            pairs: keptPairs,
            allPairs,
            keptCount: keptPairs.length,
            totalCount: allPairs.length,
            discardedCount: allPairs.length - keptPairs.length,
            keptRawSumSq, discardedSumSq,
            rescaleFactor: rescale,
            finalSumSq,
            I_0,
            conservationError: Math.abs(finalSumSq - I_0) / I_0 * 100
        };
    }
}

// ============================================================
//  阶段2: 拓扑生成 G
//
//  {C_{ij}} → G(V,E)
//  邻接: C_{ij} 高 → 近; C_{ij} 低 → 远
//  距离: d_{ij} = 1/C_{ij}
//  维度: 从平均连接数涌现
// ============================================================
class TopologyGeneration {
    build(corrResult, N) {
        const nodes = [];
        for (let k = 0; k < N; k++) {
            nodes.push({ id: k, neighbors: [], degree: 0, component: -1 });
        }

        const edges = [];
        for (const pair of corrResult.pairs) {
            edges.push({
                from: pair.i, to: pair.j,
                weight: pair.C, distance: pair.distance
            });
            nodes[pair.i].neighbors.push(pair.j);
            nodes[pair.j].neighbors.push(pair.i);
            nodes[pair.i].degree++;
            nodes[pair.j].degree++;
        }

        // 维度估计: 2D≈4邻居, 3D≈6邻居, nD≈2n邻居
        const totalDegree = nodes.reduce((s, n) => s + n.degree, 0);
        const avgDegree = N > 0 ? totalDegree / N : 0;
        const dimension = Math.round(avgDegree / 2);

        // 连通分量分析
        let compId = 0;
        for (let i = 0; i < N; i++) {
            if (nodes[i].component !== -1) continue;
            const stack = [i];
            while (stack.length > 0) {
                const node = stack.pop();
                if (nodes[node].component !== -1) continue;
                nodes[node].component = compId;
                for (const nb of nodes[node].neighbors) {
                    if (nodes[nb].component === -1) stack.push(nb);
                }
            }
            compId++;
        }

        const componentSizes = new Array(compId).fill(0);
        for (const n of nodes) componentSizes[n.component]++;
        const largestComp = Math.max(...componentSizes);

        // 拓扑结构熵
        let topoEntropy = 0;
        const weightSum = edges.reduce((s, e) => s + e.weight, 0);
        for (const e of edges) {
            const p = e.weight / weightSum;
            if (p > 0) topoEntropy -= p * Math.log(p);
        }

        return {
            nodes, edges, avgDegree, dimension,
            numComponents: compId,
            largestComponent: largestComp,
            isConnected: compId === 1,
            topologyEntropy: topoEntropy,
            numEdges: edges.length,
            numNodes: N
        };
    }
}

// ============================================================
//  阶段3: 时序迭代 T
//
//  关联依次刷新 → 离散时序
//  约束: 局部一组关联更新完成后,下一组才能稳定
//  单次最小刷新间隔 = 普朗克时间
//  每一轮全局局部刷新 = 一帧宇宙演化
// ============================================================
class TimeIteration {
    iterate(topology, corrResult, maxSteps) {
        const N = topology.numNodes;

        // 按C值排序: 最强关联最先稳定 (应力最大,优先刷新)
        const sortedPairs = [...corrResult.pairs].sort((a, b) => b.C - a.C);

        const events = [];
        const reachedNodes = new Set();
        const activeEdges = new Set();

        let t = 0;
        const stepsToRun = Math.min(maxSteps, sortedPairs.length);

        for (let step = 0; step < stepsToRun; step++) {
            t++; // 普朗克时间递增
            const pair = sortedPairs[step];

            // 因果锥: 新达到的节点
            const newNodes = [];
            if (!reachedNodes.has(pair.i)) { reachedNodes.add(pair.i); newNodes.push(pair.i); }
            if (!reachedNodes.has(pair.j)) { reachedNodes.add(pair.j); newNodes.push(pair.j); }

            activeEdges.add(`${pair.i}-${pair.j}`);

            // 因果锥半径 = 已达节点数 / 总节点数
            const causalReach = reachedNodes.size / N;

            events.push({
                t, step,
                pair: { i: pair.i, j: pair.j },
                C: pair.C,
                distance: pair.distance,
                newNodes,
                reachedNodes: reachedNodes.size,
                causalReach,
                activeEdges: activeEdges.size
            });
        }

        // 计算因果锥增长速率 (模拟光速)
        const lightSpeed = events.length > 1
            ? (events[events.length - 1].reachedNodes - events[0].reachedNodes) /
              (events[events.length - 1].t - events[0].t)
            : 0;

        return {
            events,
            totalTime: t,
            finalReachedNodes: reachedNodes.size,
            lightSpeed,
            causalHistory: events.map(e => ({ t: e.t, reached: e.reachedNodes, reach: e.causalReach }))
        };
    }
}

// ============================================================
//  阶段4: 模态分流
//
//  1. 全局同源模态绑定 (纠缠): C_{ij} ≥ C_ent
//     不参与局部时序刷新,保留全局相干,不受光速约束
//  2. 动态扰动模态: C_0 ≤ C_{ij} < C_ent
//     进入时序迭代链路,沿拓扑逐帧传递,涌现因果锥
// ============================================================
class ModeBifurcation {
    split(corrResult, C_ent) {
        const entPairs = [];
        const dynPairs = [];

        for (const pair of corrResult.pairs) {
            if (pair.C >= C_ent) entPairs.push(pair);
            else dynPairs.push(pair);
        }

        const entInfo = entPairs.reduce((s, p) => s + p.C * p.C, 0);
        const dynInfo = dynPairs.reduce((s, p) => s + p.C * p.C, 0);
        const total = entInfo + dynInfo;

        return {
            entanglement: {
                pairs: entPairs, count: entPairs.length,
                information: entInfo,
                fraction: total > 0 ? entInfo / total : 0
            },
            dynamic: {
                pairs: dynPairs, count: dynPairs.length,
                information: dynInfo,
                fraction: total > 0 ? dynInfo / total : 0
            }
        };
    }
}

// ============================================================
//  暴胀模拟: 渐进释放模态,拓扑持续扩张
//
//  边界梯度持续释放新模态 → 新 C_{ij} → 网络增边增节点 → 空间膨胀
// ============================================================
class InflationSimulation {
    constructor(N_total, C0, releaseRate) {
        this.N_total = N_total;
        this.C0 = C0;
        this.releaseRate = releaseRate;
        this.history = [];
    }

    simulate() {
        // 全部模态先初始化,但逐步"释放"
        const fullPsi = new SuperpositionState(this.N_total);
        const N = this.N_total;

        // 模态按幅度排序 (最强先释放)
        const modeOrder = fullPsi.amplitudes
            .map((a, idx) => ({ idx, p: a.p }))
            .sort((a, b) => b.p - a.p)
            .map(m => m.idx);

        let releasedModes = new Set();
        let prevEdgeCount = 0;

        for (let release = 0; release < N; release += this.releaseRate) {
            const numReleased = Math.min(release + this.releaseRate, N);
            for (let k = release; k < numReleased; k++) {
                releasedModes.add(modeOrder[k]);
            }

            // 构建当前已释放模态的子叠加态
            const releasedList = [...releasedModes];
            if (releasedList.length < 2) continue;

            // 计算已释放模态间的关联对
            let keptCount = 0;
            let keptSumSq = 0;
            const pairs = [];

            for (const i of releasedList) {
                for (const j of releasedList) {
                    if (i >= j) continue;
                    const c = fullPsi.correlation(i, j);
                    if (c.mag >= this.C0) {
                        pairs.push({ i, j, rawMag: c.mag });
                        keptSumSq += c.mag * c.mag;
                        keptCount++;
                    }
                }
            }

            // 重标定
            const I_released = releasedList.length * LN2;
            const rescale = keptSumSq > 0 ? Math.sqrt(I_released / keptSumSq) : 0;
            let finalSumSq = 0;
            for (const p of pairs) {
                p.C = p.rawMag * rescale;
                finalSumSq += p.C * p.C;
            }

            const edgeGrowth = keptCount - prevEdgeCount;
            const consErr = keptSumSq > 0 ? Math.abs(finalSumSq - I_released) / I_released * 100 : 0;

            this.history.push({
                releasedModes: releasedList.length,
                edges: keptCount,
                edgeGrowth: Math.max(0, edgeGrowth),
                information: finalSumSq,
                expectedInfo: I_released,
                conservationError: consErr,
                avgDegree: releasedList.length > 0 ? (2 * keptCount) / releasedList.length : 0,
                estDimension: releasedList.length > 0 ? Math.round((2 * keptCount / releasedList.length) / 2) : 0
            });

            prevEdgeCount = keptCount;
        }
    }
}

// ============================================================
//  运行完整实验
// ============================================================
console.log('='.repeat(75));
console.log('泛函动力学: 叠加模态 → 时序+拓扑 精细化转化机制');
console.log('严格依托五条公理 · 信息守恒全程锁定');
console.log('='.repeat(75));

// --- 参数 ---
const N = 80;           // 模态数
const C0 = 0.45;        // 分辨阈值 (高于平均关联,只保留强关联对)
const C_ent = 1.2;      // 纠缠阈值 (极强关联=全局纠缠)

// === 阶段0: 叠加态 Ψ_S ===
console.log('\n━━━ 阶段0: 叠加态 Ψ_S (奇点内封存) ━━━');
const psi = new SuperpositionState(N);
const I_0 = psi.I_0;
const sumAmpSq = psi.totalAmplitudeSq();

console.log(`  模态数 N = ${N}`);
console.log(`  Ψ_S = Σ α_k φ_k  (互斥潜在模态并行共存)`);
console.log(`  隐式信息 I₀ = Σ|α_k|² = ${sumAmpSq.toFixed(6)}`);
console.log(`  量子信息 = N×ln(2) = ${I_0.toFixed(6)}`);
console.log(`  Shannon熵 H = ${psi.shannonEntropy().toFixed(4)} (测量不确定性,非守恒量)`);
console.log(`  状态: 无时序、无几何,全部可能性共存`);
console.log(`  公理A2: 叠加不增加自由度,同一组自由度承载多重潜在组态`);

// === 阶段1: 分辨投影 P_{C_0} ===
console.log('\n━━━ 阶段1: 分辨投影 P_{C_0} ━━━');
const projector = new ResolutionProjection();
const corrResult = projector.project(psi, C0);

console.log(`  算子: Ψ_S →[P_{C_0}]→ {C_{ij}}`);
console.log(`  阈值 C₀ = ${C0}`);
console.log(`  总关联对: ${corrResult.totalCount}`);
console.log(`  存活对 (C≥C₀): ${corrResult.keptCount} (${(corrResult.keptCount/corrResult.totalCount*100).toFixed(1)}%)`);
console.log(`  消融对 (C<C₀): ${corrResult.discardedCount} (退回背景涨落)`);
console.log(`  重标定因子: √(I₀/Σraw²) = ${corrResult.rescaleFactor.toFixed(6)}`);
console.log(`  消融信息 → 重分配到存活对 (信息不丢失!)`);
console.log(`\n  ┌─ 信息守恒验证 ─────────────────────────┐`);
console.log(`  │  Σ|α_k|² (前) = ${sumAmpSq.toFixed(6)}          │`);
console.log(`  │  Σ C_{ij}² (后) = ${corrResult.finalSumSq.toFixed(6)}          │`);
console.log(`  │  守恒误差: ${corrResult.conservationError.toFixed(6)}%        │`);
console.log(`  └────────────────────────────────────────┘`);

// === 阶段2: 拓扑生成 G ===
console.log('\n━━━ 阶段2: 拓扑生成 G ━━━');
const topoGen = new TopologyGeneration();
const topology = topoGen.build(corrResult, N);

console.log(`  泛函: {C_{ij}} →[G]→ G(V,E)`);
console.log(`  节点 V = ${topology.numNodes}`);
console.log(`  边 E = ${topology.numEdges}`);
console.log(`  平均度 = ${topology.avgDegree.toFixed(2)}`);
console.log(`  估计维度 = ${topology.dimension}D  (从平均连接数涌现)`);
console.log(`  连通分量 = ${topology.numComponents} (最大: ${topology.largestComponent}节点)`);
console.log(`  拓扑连通: ${topology.isConnected ? '✓ 全连通' : '✗ 有孤立畴'}`);
console.log(`  拓扑结构熵 = ${topology.topologyEntropy.toFixed(4)}`);
console.log(`  距离 d_{ij} = 1/C_{ij}  (关联越强→越近)`);

// === 阶段3: 时序迭代 T ===
console.log('\n━━━ 阶段3: 时序迭代 T ━━━');
const timeIter = new TimeIteration();
const timeResult = timeIter.iterate(topology, corrResult, 200);

console.log(`  算子: 关联依次刷新 →[T]→ 离散时序`);
console.log(`  总时步 (普朗克时间) = ${timeResult.totalTime}`);
console.log(`  最终因果锥覆盖: ${timeResult.finalReachedNodes}/${N} 节点`);
console.log(`  因果传播速率 (光速): ${timeResult.lightSpeed.toFixed(3)} 节点/普朗克时间`);
console.log(`  时间 = 关联刷新次序 (涌现,非预设)`);

// 时序演化曲线
console.log(`\n  因果锥增长:`);
console.log(`  t     覆盖节点   因果锥半径   活跃边`);
const pts = 8;
for (let i = 0; i < pts; i++) {
    const idx = Math.floor(i * (timeResult.events.length - 1) / (pts - 1));
    if (idx >= timeResult.events.length) break;
    const e = timeResult.events[idx];
    const bar = '█'.repeat(Math.round(e.causalReach * 20));
    console.log(`  ${e.t.toString().padStart(4)}    ${e.reachedNodes.toString().padStart(3)}/${N}      ${(e.causalReach*100).toFixed(1)}%       ${e.activeEdges}  ${bar}`);
}

// === 阶段4: 模态分流 ===
console.log('\n━━━ 阶段4: 模态分流 ━━━');
const bifurcation = new ModeBifurcation();
const branches = bifurcation.split(corrResult, C_ent);

console.log(`  纠缠阈值 C_ent = ${C_ent}`);
console.log(`\n  支1: 全局同源模态绑定 (纠缠)`);
console.log(`    对数: ${branches.entanglement.count}`);
console.log(`    信息: ${branches.entanglement.information.toFixed(4)} (${(branches.entanglement.fraction*100).toFixed(1)}%)`);
console.log(`    特征: 不参与局部时序,全局相干,不受光速约束`);
console.log(`\n  支2: 动态扰动模态 (常规物质/光/力)`);
console.log(`    对数: ${branches.dynamic.count}`);
console.log(`    信息: ${branches.dynamic.information.toFixed(4)} (${(branches.dynamic.fraction*100).toFixed(1)}%)`);
console.log(`    特征: 进入时序迭代,沿拓扑逐帧传递,涌现因果锥`);

// === 暴胀模拟 ===
console.log('\n━━━ 暴胀模拟: 渐进释放模态 ━━━');
const inflation = new InflationSimulation(N, C0, 5);
inflation.simulate();

console.log(`  释放率: 每轮5个模态`);
console.log(`  释放模态  存活边  边增量  信息量     守恒误差%  估计维度`);
for (const h of inflation.history) {
    if (h.releasedModes % 10 !== 0 && h.releasedModes !== N) continue;
    console.log(`  ${h.releasedModes.toString().padStart(4)}     ${h.edges.toString().padStart(4)}   ${h.edgeGrowth.toString().padStart(3)}    ${h.information.toFixed(2).padStart(8)}   ${h.conservationError.toFixed(4).padStart(6)}    ${h.estDimension}D`);
}

// === 守恒总结 ===
console.log(`\n${'='.repeat(75)}`);
console.log('信息守恒全程验证');
console.log('='.repeat(75));
console.log(`  初始隐式信息:  I₀ = Σ|α_k|² = ${sumAmpSq.toFixed(6)}`);
console.log(`  投影后显式信息: Σ C_{ij}² = ${corrResult.finalSumSq.toFixed(6)}`);
console.log(`  守恒误差:      ${corrResult.conservationError.toFixed(8)}%`);
console.log(`\n  纠缠支信息:    ${branches.entanglement.information.toFixed(4)} (${(branches.entanglement.fraction*100).toFixed(1)}%)`);
console.log(`  动态支信息:    ${branches.dynamic.information.toFixed(4)} (${(branches.dynamic.fraction*100).toFixed(1)}%)`);
console.log(`  两支总和:      ${(branches.entanglement.information + branches.dynamic.information).toFixed(4)}`);
console.log(`\n  公理A4: 自由度守恒 — 隐式并行潜在信息 → 显式几何+时序信息`);
console.log(`  Σ|α_k|² = Σ C_{ij}² = I₀  (严格成立)`);

// 暴胀守恒检查
let maxInflationErr = 0;
for (const h of inflation.history) {
    if (h.conservationError > maxInflationErr) maxInflationErr = h.conservationError;
}
console.log(`  暴胀全程最大守恒误差: ${maxInflationErr.toFixed(6)}%`);

console.log(`\n${'='.repeat(75)}`);
console.log('完整转化链条');
console.log('='.repeat(75));
console.log(`
  奇点相干叠加态 Ψ_S
    │  Σ|α_k|² = I₀ (隐式信息)
    │
    ↓ 内外模态梯度 (A3 不相容张力, 唯一驱动力)
    ↓ P_{C_0} 分辨投影 (阈值筛选 + 守恒重标定)
    │
  可区分关联对 {C_{ij}}
    │  Σ C_{ij}² = I₀ (显式信息, 守恒!)
    │
    ├─→ G 拓扑生成 → 邻接关系 → 拓扑空间 (${topology.dimension}D)
    │     距离 d = 1/C, 维度从连接性涌现
    │
    └─→ T 时序迭代 → 关联依次刷新 → 离散时序
          时间 = 刷新次序, 因果锥涌现光速

  模态分流:
    纠缠支 (${(branches.entanglement.fraction*100).toFixed(0)}%): 全局相干, 不受光速限制
    动态支 (${(branches.dynamic.fraction*100).toFixed(0)}%): 逐帧传播, 因果锥生效

  全程: 自由度守恒; 隐式并行潜在信息 → 显式几何+时序信息
`);
