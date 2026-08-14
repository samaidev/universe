#!/usr/bin/env node
'use strict';
// ============================================================
//  内生扰动参数推导: 能否从拓扑性质导出 α?
//
//  上一轮失败:
//    色散幂指数依赖外部输入的扰动参数α
//    α=0.5 → 幂指数0.73; α=0.2 → 幂指数0.44
//    如果α是任意的,幂指数就不是预测
//
//  本实验:
//    尝试从拓扑网络性质推导α应该是什么值
//    思路: 扰动在拓扑上传播,传播方式由网络结构决定
//    → α 应该是拓扑参数(度分布、路径长度)的函数
//
//  如果成功: α内生 → 幂指数变成预测
//  如果失败: 明确记录框架边界
// ============================================================

const LN2 = Math.log(2);

class SuperpositionState {
    constructor(N, powerIndex = 1.5) {
        this.N = N;
        this.amplitudes = [];
        const s = powerIndex;
        let sumP = 0;
        const rawP = [];
        for (let k = 0; k < N; k++) {
            const p = 1 / Math.pow(k + 1, s);
            rawP.push(p);
            sumP += p;
        }
        const I_0 = N * LN2;
        const norm = I_0 / sumP;
        for (let k = 0; k < N; k++) {
            const p = rawP[k] * norm;
            const amp = Math.sqrt(p);
            const phase = Math.random() * 2 * Math.PI;
            this.amplitudes.push({ k, re: amp * Math.cos(phase), im: amp * Math.sin(phase), p, amp });
        }
        this.I_0 = I_0;
    }
    correlation(i, j) {
        const a = this.amplitudes[i], b = this.amplitudes[j];
        const re = a.re * b.re + a.im * b.im;
        const im = a.re * b.im - a.im * b.re;
        return { re, im, mag: Math.sqrt(re * re + im * im) };
    }
}

// 构建拓扑并分析网络性质
function buildTopology(psi, C0) {
    const N = psi.N;
    const edges = [];
    const degree = new Array(N).fill(0);
    const adjacency = Array.from({length: N}, () => []);

    let keptSumSq = 0;
    for (let i = 0; i < N; i++) {
        for (let j = i + 1; j < N; j++) {
            const c = psi.correlation(i, j);
            if (c.mag >= C0) {
                keptSumSq += c.mag * c.mag;
                edges.push({ i, j, weight: c.mag });
                degree[i]++; degree[j]++;
                adjacency[i].push(j); adjacency[j].push(i);
            }
        }
    }

    const rescale = keptSumSq > 0 ? Math.sqrt(psi.I_0 / keptSumSq) : 0;
    const avgDegree = degree.reduce((s, d) => s + d, 0) / N;

    // 度分布的幂律拟合
    const degreeHist = {};
    for (const d of degree) degreeHist[d] = (degreeHist[d] || 0) + 1;
    const degPoints = Object.entries(degreeHist).map(([deg, count]) => ({
        x: Math.log(parseInt(deg) + 1),
        y: Math.log(count / N)
    })).filter(p => isFinite(p.x) && isFinite(p.y) && p.y < 0);

    let degSlope = 0;
    if (degPoints.length >= 3) {
        let sx=0, sy=0, sxy=0, sx2=0;
        for (const p of degPoints) { sx+=p.x; sy+=p.y; sxy+=p.x*p.y; sx2+=p.x*p.x; }
        const n = degPoints.length;
        degSlope = (n*sxy - sx*sy) / (n*sx2 - sx*sx);
    }

    // 平均最短路径长度 (BFS采样)
    let totalPathLen = 0, pathCount = 0;
    for (let src = 0; src < Math.min(N, 20); src++) {
        const visited = new Array(N).fill(-1);
        visited[src] = 0;
        const queue = [src];
        while (queue.length > 0) {
            const node = queue.shift();
            for (const nb of adjacency[node]) {
                if (visited[nb] === -1) {
                    visited[nb] = visited[node] + 1;
                    totalPathLen += visited[nb];
                    pathCount++;
                    queue.push(nb);
                }
            }
        }
    }
    const avgPathLength = pathCount > 0 ? totalPathLen / pathCount : 0;

    // 聚类系数
    let totalCluster = 0;
    for (let i = 0; i < N; i++) {
        const neighbors = adjacency[i];
        if (neighbors.length < 2) continue;
        let links = 0;
        for (let a = 0; a < neighbors.length; a++) {
            for (let b = a + 1; b < neighbors.length; b++) {
                if (adjacency[neighbors[a]].includes(neighbors[b])) links++;
            }
        }
        const possible = neighbors.length * (neighbors.length - 1) / 2;
        totalCluster += possible > 0 ? links / possible : 0;
    }
    const avgCluster = totalCluster / N;

    return {
        edges, degree, adjacency, rescale,
        avgDegree, degSlope, avgPathLength, avgCluster,
        numEdges: edges.length
    };
}

// 从拓扑性质推导α的候选公式
function deriveAlpha(topo) {
    // 候选1: α = 1 / (2 × avgPathLength)
    // 物理直觉: 路径越长,扰动衰减越快 → α越小
    const alpha1 = topo.avgPathLength > 0 ? 1 / (2 * topo.avgPathLength) : 0.5;

    // 候选2: α = avgDegree / (avgDegree + avgPathLength)
    // 物理直觉: 度越高传播越快,路径越长传播越慢
    const alpha2 = (topo.avgDegree + topo.avgPathLength) > 0 ?
        topo.avgDegree / (topo.avgDegree + topo.avgPathLength) : 0.5;

    // 候选3: α = |degSlope| / (|degSlope| + 1)
    // 物理直觉: 度分布越陡(少数hub),扰动越集中 → α越大
    const alpha3 = Math.abs(topo.degSlope) / (Math.abs(topo.degSlope) + 1);

    // 候选4: α = avgCluster (聚类系数直接决定局部传播)
    const alpha4 = topo.avgCluster;

    // 候选5: α = ln(avgDegree) / ln(avgDegree + 1)
    // 对数尺度,使α在合理范围内
    const alpha5 = topo.avgDegree > 1 ?
        Math.log(topo.avgDegree) / Math.log(topo.avgDegree + 1) : 0.5;

    return { alpha1, alpha2, alpha3, alpha4, alpha5 };
}

// 用给定α运行色散实验
function runDispersion(psi, C0, alpha, E_planck = 1.0, samples = 15) {
    const N = psi.N;
    let baselineSumSq = 0;
    for (let i = 0; i < N; i++)
        for (let j = i + 1; j < N; j++) {
            const c = psi.correlation(i, j);
            if (c.mag >= C0) baselineSumSq += c.mag * c.mag;
        }
    const baselineRescale = baselineSumSq > 0 ? Math.sqrt(psi.I_0 / baselineSumSq) : 0;
    if (baselineRescale === 0) return null;

    const energies = [];
    for (let i = -4; i <= 0; i += 0.25) energies.push(Math.pow(10, i));

    const results = [];
    for (const E of energies) {
        let avgRescale = 0;
        for (let s = 0; s < samples; s++) {
            const perturbStrength = Math.pow(E / E_planck, alpha);
            const numAffected = Math.max(1, Math.floor(N * perturbStrength * 0.3));
            const affected = new Set();
            for (let k = 0; k < numAffected && k < N; k++)
                affected.add(Math.floor(Math.random() * N));

            let keptSumSq = 0;
            for (let i = 0; i < N; i++) {
                for (let j = i + 1; j < N; j++) {
                    const c = psi.correlation(i, j);
                    let rawMag = c.mag;
                    if (affected.has(i) || affected.has(j)) {
                        const localPerturb = perturbStrength * (0.5 + Math.random() * 0.5);
                        rawMag *= (1 + (Math.random() - 0.5) * 2 * localPerturb);
                        rawMag = Math.max(0, rawMag);
                    }
                    if (rawMag >= C0) keptSumSq += rawMag * rawMag;
                }
            }
            avgRescale += keptSumSq > 0 ? Math.sqrt(psi.I_0 / keptSumSq) : 0;
        }
        avgRescale /= samples;
        const c_eff = avgRescale / baselineRescale;
        results.push({ E_ratio: E / E_planck, c_eff });
    }

    const fitData = results
        .filter(r => r.E_ratio < 0.5 && r.c_eff < 1.0 + 1e-6)
        .map(r => ({ x: Math.log(r.E_ratio), y: Math.log(Math.max(1 - r.c_eff, 1e-10)) }));
    if (fitData.length < 3) return null;

    let sx=0, sy=0, sxy=0, sx2=0;
    for (const d of fitData) { sx+=d.x; sy+=d.y; sxy+=d.x*d.y; sx2+=d.x*d.x; }
    const n = fitData.length;
    const exponent = (n*sxy - sx*sy) / (n*sx2 - sx*sx);

    return { exponent, alpha };
}

// ============================================================
//  运行实验
// ============================================================
console.log('='.repeat(75));
console.log('内生扰动参数推导: 能否从拓扑性质导出 α?');
console.log('='.repeat(75));

// 测试多组拓扑参数
const testCases = [
    { N: 80, C0: 0.35, s: 1.5 },
    { N: 80, C0: 0.45, s: 1.5 },
    { N: 80, C0: 0.55, s: 1.5 },
    { N: 100, C0: 0.40, s: 1.3 },
    { N: 100, C0: 0.40, s: 2.0 },
    { N: 60, C0: 0.50, s: 1.5 },
];

console.log('\n━━━ 拓扑性质分析与α推导 ━━━');
console.log('  案例  N   C₀    s    ⟨k⟩   路径长  聚类系数  度斜率  | α1    α2    α3    α4    α5');
console.log('  ' + '─'.repeat(100));

const allResults = [];

for (let tc = 0; tc < testCases.length; tc++) {
    const { N, C0, s } = testCases[tc];
    const psi = new SuperpositionState(N, s);
    const topo = buildTopology(psi, C0);
    const alphas = deriveAlpha(topo);

    console.log(`  ${tc+1}    ${N}  ${C0.toFixed(2)}  ${s.toFixed(2)}  ${topo.avgDegree.toFixed(1)}  ${topo.avgPathLength.toFixed(2)}    ${topo.avgCluster.toFixed(3)}    ${topo.degSlope.toFixed(2)}  | ${alphas.alpha1.toFixed(3)} ${alphas.alpha2.toFixed(3)} ${alphas.alpha3.toFixed(3)} ${alphas.alpha4.toFixed(3)} ${alphas.alpha5.toFixed(3)}`);

    // 对每个候选α运行色散实验
    const alphaCandidates = [
        { name: 'α1=1/(2L)', val: alphas.alpha1 },
        { name: 'α2=k/(k+L)', val: alphas.alpha2 },
        { name: 'α3=|slope|/(|slope|+1)', val: alphas.alpha3 },
        { name: 'α4=cluster', val: alphas.alpha4 },
        { name: 'α5=ln(k)/ln(k+1)', val: alphas.alpha5 },
    ];

    const caseResults = { caseIdx: tc+1, N, C0, s, topo, alphas, dispersions: [] };
    for (const ac of alphaCandidates) {
        const disp = runDispersion(psi, C0, ac.val);
        if (disp) {
            caseResults.dispersions.push({ ...ac, exponent: disp.exponent });
        }
    }
    allResults.push(caseResults);
}

// 分析: 哪个候选α在不同拓扑下给出最稳定的幂指数?
console.log(`\n━━━ 各候选α的色散幂指数稳定性 ━━━`);
console.log('  候选α公式              | 各案例幂指数                                    | 均值    标准差  稳定性');
console.log('  ' + '─'.repeat(100));

const alphaNames = ['α1=1/(2L)', 'α2=k/(k+L)', 'α3=|slope|/(|slope|+1)', 'α4=cluster', 'α5=ln(k)/ln(k+1)'];
for (let ai = 0; ai < alphaNames.length; ai++) {
    const exponents = [];
    for (const cr of allResults) {
        if (cr.dispersions[ai]) exponents.push(cr.dispersions[ai].exponent);
    }
    if (exponents.length === 0) continue;
    const mean = exponents.reduce((s, e) => s + e, 0) / exponents.length;
    const variance = exponents.reduce((s, e) => s + (e - mean) ** 2, 0) / exponents.length;
    const std = Math.sqrt(variance);
    const cv = std / Math.abs(mean); // 变异系数

    const expStr = exponents.map(e => e.toFixed(3)).join(', ');
    const stability = cv < 0.15 ? '✓ 稳定' : cv < 0.30 ? '△ 中等' : '✗ 不稳定';
    console.log(`  ${alphaNames[ai].padEnd(22)} | ${expStr.padEnd(46)} | ${mean.toFixed(3)}  ${std.toFixed(3)}   ${stability}`);
}

// 关键检验: 如果某个候选α给出稳定幂指数,那就是内生预测
console.log(`\n${'='.repeat(75)}`);
console.log('内生推导检验结果');
console.log('='.repeat(75));

let bestCandidate = null;
let bestCV = Infinity;
for (let ai = 0; ai < alphaNames.length; ai++) {
    const exponents = [];
    for (const cr of allResults) {
        if (cr.dispersions[ai]) exponents.push(cr.dispersions[ai].exponent);
    }
    if (exponents.length < 3) continue;
    const mean = exponents.reduce((s, e) => s + e, 0) / exponents.length;
    const variance = exponents.reduce((s, e) => s + (e - mean) ** 2, 0) / exponents.length;
    const cv = Math.sqrt(variance) / Math.abs(mean);
    if (cv < bestCV) {
        bestCV = cv;
        bestCandidate = { name: alphaNames[ai], mean, cv, exponents };
    }
}

if (bestCandidate) {
    console.log(`
最佳候选: ${bestCandidate.name}
  幂指数: ${bestCandidate.mean.toFixed(4)} ± ${Math.sqrt(bestCandidate.cv * bestCandidate.cv * bestCandidate.mean * bestCandidate.mean).toFixed(4)}
  变异系数: ${(bestCandidate.cv * 100).toFixed(1)}%
  各案例: [${bestCandidate.exponents.map(e => e.toFixed(3)).join(', ')}]

判定:
  ${bestCandidate.cv < 0.15 ?
    `✓ 变异系数 < 15% → α可从拓扑性质内生推导
   → 幂指数 ${bestCandidate.mean.toFixed(3)} 是框架预测 (不依赖外部参数!)
   → 与LQG (n=1或2) 不同 → 独立可检验预测` :
    bestCandidate.cv < 0.30 ?
      `△ 变异系数 ${(bestCandidate.cv*100).toFixed(0)}% → 部分稳健
   幂指数 ${bestCandidate.mean.toFixed(3)} 大致稳定,但不够精确` :
      `✗ 变异系数 ${(bestCandidate.cv*100).toFixed(0)}% > 30% → 无法内生推导α
   → 幂指数仍依赖拓扑参数 → 无独立预测`}
`);
}

// 物理含义分析
console.log('━'.repeat(75));
console.log('拓扑性质与扰动传播的物理对应:');
console.log('━'.repeat(75));
console.log(`  avgDegree (⟨k⟩): 拓扑连接密度 → 扰动可走的路径数`);
console.log(`  avgPathLength (L): 信息传播距离 → 扰动衰减尺度`);
console.log(`  avgCluster (C): 局部聚集 → 扰动局部化程度`);
console.log(`  degSlope: 度分布异质性 → 扰动集中度`);
console.log(`
  如果 α = f(拓扑性质) 成立:
    → 扰动传播方式由网络结构决定 (物理合理)
    → 不同拓扑给出不同色散 → 可通过观测拓扑推断α
    → 但前提: 我们宇宙的拓扑参数可被独立测量
`);
