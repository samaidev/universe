#!/usr/bin/env node
'use strict';
// ============================================================
//  严谨化审计一：魔法常数敏感性分析
//
//  目标：对引擎中每一个"调出来的"常数做±50%扰动，
//  测量关键结论指标是否robust。
//  如果结论一改就翻盘，说明"解释"依赖魔法常数，不是物理。
// ============================================================

const DELTA_PSI = 1e-12;

function traceDistance(a, b) {
    const diff = Math.abs(a - b);
    const norm = Math.abs(a) + Math.abs(b) + DELTA_PSI;
    return Math.min(1, diff / norm);
}
function correlation(a, b) { return 1 - traceDistance(a, b); }
function idx(x, y, n) {
    x = ((x % n) + n) % n;
    y = ((y % n) + n) % n;
    return y * n + x;
}

// 参数化引擎：所有魔法常数作为params传入
class UniverseP {
    constructor(n, p) {
        this.n = n;
        this.N = n * n;
        this.psi = new Float64Array(this.N);
        this.psiNext = new Float64Array(this.N);
        this.tick = 0;
        this.endoAvgC = 1.0;
        this.params = p;  // 参数集
        this.nIdx = new Int32Array(this.N * 4);
        for (let y = 0; y < n; y++) {
            for (let x = 0; x < n; x++) {
                const i = y * n + x;
                this.nIdx[i*4]   = idx(x+1, y, n);
                this.nIdx[i*4+1] = idx(x-1, y, n);
                this.nIdx[i*4+2] = idx(x, y+1, n);
                this.nIdx[i*4+3] = idx(x, y-1, n);
            }
        }
        let seed = 42;
        for (let i = 0; i < this.N; i++) {
            seed = (seed * 1103515245 + 12345) & 0x7fffffff;
            this.psi[i] = 0.5 + (seed / 0x7fffffff - 0.5) * 0.2;
        }
    }

    evolve() {
        const n = this.n, N = this.N, nIdx = this.nIdx, p = this.params;
        const cArr = new Float64Array(N * 4);
        let sumC = 0, sumPsi = 0;
        for (let i = 0; i < N; i++) {
            sumPsi += this.psi[i];
            for (let d = 0; d < 4; d++) {
                const j = nIdx[i*4+d];
                const c = correlation(this.psi[i], this.psi[j]);
                cArr[i*4+d] = c;
                sumC += c;
            }
        }
        const avgC = sumC / (N * 4);
        const avgPsi = sumPsi / N;
        const cTh = avgC, dStar = avgC, gStar = 1 - avgC;

        for (let i = 0; i < N; i++) {
            const cur = this.psi[i];
            let diffSum = 0, diffWeight = 0, gravAcc = 0, gravCount = 0, lapSum = 0;
            for (let d = 0; d < 4; d++) {
                const j = nIdx[i*4+d];
                const c = cArr[i*4+d];
                lapSum += this.psi[j] - cur;
                if (c > cTh) { diffSum += c*(this.psi[j]-cur); diffWeight += c; }
                else { gravAcc += (cur - this.psi[j]); gravCount++; }
            }
            let delta = 0;
            if (diffWeight > 0) {
                const sat = 1.0 / (1.0 + cur * cur * p.satDiff);
                delta = dStar * diffSum / diffWeight * sat;
            }
            if (gravCount > 0) {
                const gSat = cur / (1.0 + cur * p.satGrav);
                let gDelta = gStar * gravAcc / gravCount * gSat;
                const maxLoss = cur * p.maxLossFrac;
                gDelta = Math.max(-maxLoss, Math.min(maxLoss, gDelta));
                delta += gDelta;
            }
            const dev = cur - avgPsi;
            delta += p.linDev * dev;
            delta -= p.cubDev * dev * dev * dev;
            delta += p.autoCat * cur * cur;
            delta -= p.autoSat * cur * cur * cur;
            delta += p.lapCouple * Math.tanh(lapSum * p.lapScale);
            const vacuumFactor = 1.0 + p.vacAmp * Math.exp(-cur * p.vacDecay);
            delta += (Math.random() - 0.5) * p.noiseAmp * vacuumFactor;
            let next = cur + delta;
            if (Math.abs(next - cur) < DELTA_PSI) next = cur;
            next = Math.max(0, Math.min(10, next));
            this.psiNext[i] = next;
        }
        const tmp = this.psi; this.psi = this.psiNext; this.psiNext = tmp;
        let maxAbs = 0;
        for (let i = 0; i < N; i++) { const v = Math.abs(this.psi[i]); if (v > maxAbs) maxAbs = v; }
        if (maxAbs > 15) { const s = 15/maxAbs; for (let i = 0; i < N; i++) this.psi[i] *= s; }
        this.endoAvgC = avgC;
        this.tick++;
    }

    // 真正的Boltzmann熵：把场离散化到N个bin，按概率分布算
    boltzmannEntropy(bins=50) {
        const counts = new Array(bins).fill(0);
        let total = 0;
        for (let i = 0; i < this.N; i++) {
            const v = this.psi[i];
            if (v < 0) continue;
            const b = Math.min(bins-1, Math.floor(v / 10 * bins));
            counts[b]++; total++;
        }
        let H = 0;
        for (const c of counts) {
            if (c > 0) { const pr = c/total; H -= pr * Math.log2(pr); }
        }
        return H;
    }

    // 结构因子：场方差的归一化值（>0说明有结构，=0说明均匀）
    structureFactor() {
        let mean = 0;
        for (let i = 0; i < this.N; i++) mean += this.psi[i];
        mean /= this.N;
        let varr = 0;
        for (let i = 0; i < this.N; i++) { const d = this.psi[i]-mean; varr += d*d; }
        varr /= this.N;
        return Math.sqrt(varr) / (mean + DELTA_PSI);
    }
}

// 默认参数（原引擎的值）
const DEFAULT_PARAMS = {
    satDiff: 0.15,    // 扩散饱和
    satGrav: 0.15,    // 引力饱和
    maxLossFrac: 0.20, // 引力最大损失
    linDev: 0.05,    // 线性偏离项
    cubDev: 0.02,    // 立方偏离项
    autoCat: 0.005,  // 自催化
    autoSat: 0.003,  // 自饱和
    lapCouple: 0.015, // 拉普拉斯耦合
    lapScale: 0.3,   // 拉普拉斯尺度
    vacAmp: 5.0,     // 真空涨落幅度
    vacDecay: 1.5,   // 真空衰减
    noiseAmp: 0.015   // 噪声幅度
};

// 测量一个参数集下的关键指标
function measureMetrics(params, steps=300) {
    const uni = new UniverseP(64, params);
    for (let i = 0; i < steps; i++) uni.evolve();
    return {
        avgC: uni.endoAvgC,
        G: 1 - uni.endoAvgC,
        entropy: uni.boltzmannEntropy(),
        structure: uni.structureFactor(),
        finalTick: uni.tick
    };
}

// 敏感性分析：对每个参数做×0.5和×2.0扰动
console.log('╔' + '═'.repeat(70) + '╗');
console.log('║  严谨化审计：魔法常数敏感性分析                              ║');
console.log('╚' + '═'.repeat(70) + '╝\n');

// 先测基线
const baseline = measureMetrics(DEFAULT_PARAMS);
console.log('基线（默认参数，300步演化）:');
console.log(`  ⟨C⟩ = ${baseline.avgC.toFixed(4)}`);
console.log(`  G*  = ${baseline.G.toFixed(4)}`);
console.log(`  Boltzmann熵 = ${baseline.entropy.toFixed(4)} bits`);
console.log(`  结构因子 = ${baseline.structure.toFixed(4)} (>0=有结构)\n`);

// 对每个参数扰动
const paramNames = Object.keys(DEFAULT_PARAMS);
console.log('参数              ×0.5 → ⟨C⟩    ×2.0 → ⟨C⟩    ⟨C⟩变化范围     结论robust?');
console.log('-'.repeat(80));

const sensitivityResults = [];
for (const name of paramNames) {
    const baseVal = DEFAULT_PARAMS[name];
    const lowParams = {...DEFAULT_PARAMS, [name]: baseVal * 0.5};
    const highParams = {...DEFAULT_PARAMS, [name]: baseVal * 2.0};
    const lowM = measureMetrics(lowParams);
    const highM = measureMetrics(highParams);
    const cRange = Math.abs(highM.avgC - lowM.avgC);
    const robust = cRange < 0.1 ? '✓' : (cRange < 0.2 ? '~' : '✗');
    sensitivityResults.push({name, baseVal, lowC: lowM.avgC, highC: highM.avgC, cRange, robust,
                             lowStruct: lowM.structure, highStruct: highM.structure});
    console.log(
        `${name.padEnd(16)}   ` +
        `${lowM.avgC.toFixed(4).padStart(8)}   ` +
        `${highM.avgC.toFixed(4).padStart(8)}   ` +
        `[${Math.min(lowM.avgC,highM.avgC).toFixed(3)}, ${Math.max(lowM.avgC,highM.avgC).toFixed(3)}]   ` +
        `${robust}`
    );
}

// 检查结论的定性方向是否robust
console.log('\n--- 定性结论检验 ---\n');

// 结论1：⟨C⟩从1.0下降到<1（引力涌现）
let conclusion1Holds = 0;
for (const r of sensitivityResults) {
    if (r.lowC < 0.95 && r.highC < 0.95) conclusion1Holds++;
}
console.log(`结论1"⟨C⟩下降→引力G*=1-⟨C⟩涌现": ${conclusion1Holds}/${sensitivityResults.length} 参数扰动下成立`);

// 结论2：形成结构（结构因子>0）
let conclusion2Holds = 0;
for (const r of sensitivityResults) {
    if (r.lowStruct > 0.1 && r.highStruct > 0.1) conclusion2Holds++;
}
console.log(`结论2"信息场自发形成结构": ${conclusion2Holds}/${sensitivityResults.length} 参数扰动下成立`);

// 极端测试：完全去掉Turing不稳定项
console.log('\n--- 极端测试：去掉所有结构生成项 ---\n');
const noStructureParams = {...DEFAULT_PARAMS,
    linDev: 0, cubDev: 0, autoCat: 0, autoSat: 0, lapCouple: 0
};
const noStructM = measureMetrics(noStructureParams);
console.log(`去掉 linDev/cubDev/autoCat/autoSat/lapCouple 后:`);
console.log(`  ⟨C⟩ = ${noStructM.avgC.toFixed(4)} (基线 ${baseline.avgC.toFixed(4)})`);
console.log(`  结构因子 = ${noStructM.structure.toFixed(4)} (基线 ${baseline.structure.toFixed(4)})`);
console.log(`  → 结构${noStructM.structure < 0.05 ? '消失' : '仍存在'}，⟨C⟩${Math.abs(noStructM.avgC-baseline.avgC)<0.05 ? '基本不变' : '显著变化'}`);

// 极端测试：只保留核心（扩散+引力），去掉一切修饰
console.log('\n--- 极端测试：只保留核心（扩散+引力+噪声）---\n');
const coreOnlyParams = {...DEFAULT_PARAMS,
    linDev: 0, cubDev: 0, autoCat: 0, autoSat: 0, lapCouple: 0, satDiff: 0, satGrav: 0, maxLossFrac: 1.0
};
const coreM = measureMetrics(coreOnlyParams);
console.log(`纯核心引擎:`);
console.log(`  ⟨C⟩ = ${coreM.avgC.toFixed(4)}`);
console.log(`  结构因子 = ${coreM.structure.toFixed(4)}`);
console.log(`  → ${coreM.structure < 0.05 ? '无结构（均匀场）' : '有结构'}`);

console.log('\n' + '='.repeat(70));
console.log('审计完成');
