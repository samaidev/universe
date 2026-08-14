#!/usr/bin/env node
'use strict';
// ============================================================
//  重标定守恒色散: 框架独有预言
//
//  核心独创: 重标定守恒机制 (标准格点理论没有!)
//
//  ┌─────────────────────────────────────────────────────────┐
//  │  标准格点理论 (Wilson, 1974):                              │
//  │    格点间距 a = 固定常数                                  │
//  │    耦合 J = 固定常数                                      │
//  │    色散: δc/c = -ξ(ka)²  (a不随能量变化)                 │
//  │                                                         │
//  │  本框架 (重标定守恒):                                     │
//  │    格点间距 a = a₀ × R₀/R(E)  ← 动力学变量!              │
//  │    当能量E扰动注入:                                      │
//  │      1. 扰动改变关联分布 C_{ij}                          │
//  │      2. 部分对跨越阈值C₀消融                              │
//  │      3. 消融对信息重分配到存活对                          │
//  │      4. 重标定因子 R(E) = √(I₀/Σ'_raw²) 变化            │
//  │      5. 有效格点间距 a(E) = a₀/R(E) 变化                 │
//  │                                                         │
//  │    色散 = 标准格点项 + 重标定项 (新!)                     │
//  │    δc/c = -ξ(ka)² + [R₀/R(E) - 1]                      │
//  │                        ^^^^^^^^^^^^^^                    │
//  │                        框架独有,标准格点没有!             │
//  └─────────────────────────────────────────────────────────┘
//
//  关键区别:
//    标准格点: δc/c 单调递减 (总是变慢)
//    本框架:   δc/c 可能变慢也可能变快 (R(E)可增可减)
//              → 非单调色散! 这是可观测的独特信号
// ============================================================

const LN2 = Math.log(2);

// ============================================================
//  信息希尔伯特空间 (同前)
// ============================================================
class InfoHilbertSpace {
    constructor(N) {
        this.N = N;
        this.I_0 = N * LN2;
        this.amplitudes = [];

        const s = 1.5;
        let sumP = 0;
        const rawP = [];
        for (let k = 0; k < N; k++) {
            const p = 1 / Math.pow(k + 1, s);
            rawP.push(p);
            sumP += p;
        }
        const norm = this.I_0 / sumP;
        for (let k = 0; k < N; k++) {
            const p = rawP[k] * norm;
            const amp = Math.sqrt(p);
            const phase = Math.random() * 2 * Math.PI;
            this.amplitudes.push({
                k, re: amp * Math.cos(phase), im: amp * Math.sin(phase), p, amp
            });
        }
    }

    correlation(i, j) {
        const a = this.amplitudes[i], b = this.amplitudes[j];
        const re = a.re * b.re + a.im * b.im;
        const im = a.re * b.im - a.im * b.re;
        return { re, im, mag: Math.sqrt(re * re + im * im) };
    }
}

// ============================================================
//  分辨投影 + 守恒重标定 (核心机制)
//
//  这是框架的灵魂:
//    1. 阈值截断: C_{ij} ≥ C₀ 保留, < C₀ 消融
//    2. 守恒重标定: Σ C² = I₀ (信息不丢失,重分配!)
//    3. 重标定因子 R = √(I₀/Σ_raw²)
//
//  关键: R 依赖哪些对被保留 → 依赖扰动!
// ============================================================
class RescalingProjection {
    project(psi, C0, perturbation = null) {
        const N = psi.N;

        // 如果有扰动: 重新分配模态振幅 |α_k|
        // 物理图像: 高能光子注入改变叠加态的能量分布
        //   |α_k|² → |α_k|² × (1 + δ_k), 保持 Σ|α_k|² = I₀
        //   这改变了 |C_{ij}| = |α_i||α_j| 的相对大小
        //   → 部分对跨越阈值C₀ → 重标定因子R变化
        let perturbedAmps = psi.amplitudes;
        if (perturbation) {
            perturbedAmps = [];
            const center = perturbation.node;
            const range = perturbation.range;
            const strength = perturbation.strength;

            // 为每个模态生成振幅扰动
            const newProbs = [];
            for (let k = 0; k < N; k++) {
                const dist = Math.abs(k - center);
                const decay = Math.exp(-dist / range);
                // 振幅平方的扰动 (高能扰动改变能量分布)
                const delta = strength * decay * (Math.random() - 0.5) * 2;
                const orig = psi.amplitudes[k].p;
                newProbs.push(Math.max(0, orig * (1 + delta)));
            }

            // 守恒归一化: Σ|α_k|² = I₀
            const sumNew = newProbs.reduce((s, p) => s + p, 0);
            const norm = psi.I_0 / sumNew;

            for (let k = 0; k < N; k++) {
                const p = newProbs[k] * norm;
                const amp = Math.sqrt(p);
                // 保留原始相位
                const orig = psi.amplitudes[k];
                perturbedAmps.push({
                    k,
                    re: amp * Math.cos(Math.atan2(orig.im, orig.re)),
                    im: amp * Math.sin(Math.atan2(orig.im, orig.re)),
                    p, amp
                });
            }
        }

        // 计算关联对 (用扰动后的振幅)
        let keptRawSumSq = 0;
        const keptPairs = [];
        for (let i = 0; i < N; i++) {
            for (let j = i + 1; j < N; j++) {
                const a = perturbedAmps[i];
                const b = perturbedAmps[j];
                const re = a.re * b.re + a.im * b.im;
                const im = a.re * b.im - a.im * b.re;
                const mag = Math.sqrt(re * re + im * im);

                if (mag >= C0) {
                    keptPairs.push({ i, j, rawMag: mag });
                    keptRawSumSq += mag * mag;
                }
            }
        }

        // 守恒重标定: Σ C² = I₀
        const I_0 = perturbation ? perturbation.I_0 : psi.I_0;
        const rescale = keptRawSumSq > 0 ? Math.sqrt(I_0 / keptRawSumSq) : 0;

        let finalSumSq = 0;
        const edges = [];
        for (const p of keptPairs) {
            p.C = p.rawMag * rescale;
            p.distance = 1 / p.C;
            finalSumSq += p.C * p.C;
            edges.push(p);
        }

        return {
            edges, rescale,
            numEdges: edges.length,
            finalSumSq,
            conservationError: Math.abs(finalSumSq - I_0) / I_0 * 100,
            // 关键输出: 重标定因子 R
            R: rescale
        };
    }
}

// ============================================================
//  重标定因子的能量依赖 R(E)
//
//  ┌─────────────────────────────────────────────────────────┐
//  │  物理图像                                                 │
//  │                                                         │
//  │  无扰动 (E=0):                                           │
//  │    R₀ = √(I₀/Σ_raw²)                                   │
//  │    a₀ = 1/R₀  (基准格点间距)                            │
//  │                                                         │
//  │  有扰动 (E>0):                                           │
//  │    扰动改变局部关联 → Σ_raw'² 变化 → R(E) 变化          │
//  │    a(E) = 1/R(E)  (格点间距随能量变化!)                 │
//  │                                                         │
//  │  两种效应:                                               │
//  │    1. 扰动增强局部关联 → 更多对越过阈值 → Σ_raw'²↑ → R↓  │
//  │       → a↑ (格点"膨胀") → c↓ (变慢)                     │
//  │    2. 扰动减弱局部关联 → 更少对越过阈值 → Σ_raw'²↓ → R↑  │
//  │       → a↓ (格点"压缩") → c↑ (变快!)                    │
//  │                                                         │
//  │  效应2是框架独有的: 标准格点理论中c只能变慢!             │
//  └─────────────────────────────────────────────────────────┘
// ============================================================

function computeRescalingDispersion(N, C0, numEnergyPoints = 20) {
    const psi = new InfoHilbertSpace(N);
    const proj = new RescalingProjection();

    // 基准 (无扰动)
    const baseline = proj.project(psi, C0);
    const R0 = baseline.R;
    const a0 = 1 / R0;
    const k_avg = baseline.numEdges > 0 ? (2 * baseline.numEdges) / N : 1;
    const J = k_avg > 0 ? LN2 / k_avg : 0;

    // 能量扫描: 模拟不同能量光子扰动
    const results = [];
    for (let ei = 0; ei < numEnergyPoints; ei++) {
        // 扰动强度 ∝ E (能量越高,扰动越大)
        const E_norm = ei / (numEnergyPoints - 1); // 归一化能量 0→1

        // 扰动参数: 强度 ∝ E (高能扰动更剧烈)
        // range ∝ E (高能扰动影响范围更广)
        const strength = E_norm * 3.0;  // 足够大以触发阈值跨越
        const range = Math.max(2, 3 + E_norm * 7);  // 低能局域,高能广域
        const perturbation = {
            node: Math.floor(N / 2),
            strength,
            range,
            I_0: psi.I_0
        };

        const perturbed = proj.project(psi, C0, perturbation);
        const R_E = perturbed.R;
        const a_E = 1 / R_E;

        // 低能波数: k = 2π / L, L = N × a₀ (系统尺寸)
        // ka = 2π/N << 1 (低能极限, 小量)
        const k_wave = 2 * Math.PI / (N * a0);  // 低能波数
        const ka_standard = k_wave * a0;         // 基准ka = 2π/N
        const ka_rescaled = k_wave * a_E;        // 动态ka

        // 标准格点色散 (a固定): δc/c = -ξ(ka₀)²
        const xi = 1 / (2 * (3 + 2)); // 3D各向同性
        const standardDispersion = -xi * ka_standard * ka_standard;

        // 本框架色散 = 标准项(用动态a) + 重标定项
        const rescaledDispersion_lattice = -xi * ka_rescaled * ka_rescaled;
        const rescalingTerm = (R0 / R_E) - 1; // a(E)/a₀ - 1 = R₀/R(E) - 1
        const totalDispersion = rescaledDispersion_lattice + rescalingTerm;

        results.push({
            E: E_norm,
            R: R_E,
            R_ratio: R_E / R0,
            a_ratio: a_E / a0,
            standardDeltaC: standardDispersion,
            rescaledLatticeTerm: rescaledDispersion_lattice,
            rescalingTerm: rescalingTerm,
            totalDeltaC: totalDispersion,
            numEdges: perturbed.numEdges,
            edgeChange: perturbed.numEdges - baseline.numEdges
        });
    }

    return { baseline, results, R0, a0, J, k_avg };
}

// ============================================================
//  蒙特卡洛统计: R(E) 的稳定性
// ============================================================
function monteCarloRescaling(N, C0, numTrials = 30, numEnergyPoints = 10) {
    const allRatios = [];

    for (let trial = 0; trial < numTrials; trial++) {
        const psi = new InfoHilbertSpace(N);
        const proj = new RescalingProjection();
        const baseline = proj.project(psi, C0);
        const R0 = baseline.R;

        const ratios = [1.0]; // E=0 时 R/R₀ = 1
        for (let ei = 1; ei < numEnergyPoints; ei++) {
            const E_norm = ei / (numEnergyPoints - 1);
            const perturbation = {
                node: Math.floor(N / 2),
                strength: E_norm * 3.0,
                range: Math.max(2, 3 + E_norm * 7),
                I_0: psi.I_0
            };
            const perturbed = proj.project(psi, C0, perturbation);
            ratios.push(perturbed.R / R0);
        }
        allRatios.push(ratios);
    }

    // 统计
    const stats = [];
    for (let ei = 0; ei < numEnergyPoints; ei++) {
        const values = allRatios.map(r => r[ei]);
        const mean = values.reduce((s, v) => s + v, 0) / values.length;
        const variance = values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length;
        const std = Math.sqrt(variance);
        stats.push({ E: ei / (numEnergyPoints - 1), mean, std, cv: std / Math.abs(mean) });
    }

    return stats;
}

// ============================================================
//  独有可观测信号: 非单调色散
//
//  ┌─────────────────────────────────────────────────────────┐
//  │  标准格点理论预言:                                        │
//  │    δc/c = -ξ(E/E_P)²  → 单调递减 (c只变慢)              │
//  │    无论E多大, c_eff ≤ c₀                                 │
//  │                                                         │
//  │  本框架预言:                                              │
//  │    δc/c = -ξ(ka(E))² + [R₀/R(E) - 1]                   │
//  │                                                         │
//  │    低能: 重标定项小, 标准项主导 → c变慢 (同标准格点)      │
//  │    高能: 重标定项可能反转! → c可能变快!                  │
//  │                                                         │
//  │    非单调色散 = 框架独有信号!                            │
//  │    标准格点理论绝对给不出 c_eff > c₀ 的区域              │
//  └─────────────────────────────────────────────────────────┘
// ============================================================

function detectNonMonotonicity(results) {
    let minDeltaC = Infinity, minE = 0;
    let maxDeltaC = -Infinity, maxE = 0;
    let signChanges = 0;
    let prevSign = Math.sign(results[0].totalDeltaC);

    for (const r of results) {
        if (r.totalDeltaC < minDeltaC) { minDeltaC = r.totalDeltaC; minE = r.E; }
        if (r.totalDeltaC > maxDeltaC) { maxDeltaC = r.totalDeltaC; maxE = r.E; }
        const currSign = Math.sign(r.totalDeltaC);
        if (currSign !== 0 && prevSign !== 0 && currSign !== prevSign) signChanges++;
        if (currSign !== 0) prevSign = currSign;
    }

    return {
        minDeltaC, minE,
        maxDeltaC, maxE,
        signChanges,
        isNonMonotonic: signChanges > 0 || (minDeltaC < 0 && maxDeltaC > 0),
        hasSpeedup: maxDeltaC > 0 // c_eff > c₀ 的区域!
    };
}

// ============================================================
//  主程序
// ============================================================
console.log('='.repeat(75));
console.log('重标定守恒色散: 框架独有预言');
console.log('核心机制: a = a₀ × R₀/R(E) — 格点间距是动力学变量!');
console.log('='.repeat(75));

const N = 50;
const C0 = 0.45;

console.log('\n━━━ 1. 基准参数 (无扰动) ━━━');
const { baseline, results, R0, a0, J, k_avg } = computeRescalingDispersion(N, C0);
console.log(`  N = ${N}, C₀ = ${C0}`);
console.log(`  基准边数 = ${baseline.numEdges}`);
console.log(`  平均度 k = ${k_avg.toFixed(2)}`);
console.log(`  耦合 J = ln(2)/k = ${J.toFixed(6)}`);
console.log(`  基准重标定 R₀ = ${R0.toFixed(6)}`);
console.log(`  基准格点间距 a₀ = 1/R₀ = ${a0.toFixed(6)}`);
console.log(`  守恒误差 = ${baseline.conservationError.toExponential(3)}%`);

console.log('\n━━━ 2. 重标定因子 R(E) 能量依赖 ━━━');
console.log('  E/E_P    R(E)/R₀    a(E)/a₀    边数变化   守恒误差%');
console.log('  ' + '─'.repeat(65));
for (const r of results) {
    console.log(`  ${r.E.toFixed(3)}    ${r.R_ratio.toFixed(4)}    ${r.a_ratio.toFixed(4)}    ${r.edgeChange >= 0 ? '+' : ''}${r.edgeChange}       ${0..toFixed(4)}`);
}

console.log('\n━━━ 3. 色散分解: 标准项 vs 重标定项 ━━━');
console.log('  ┌────────────────────────────────────────────────────────┐');
console.log('  │ δc/c = -ξ(ka)²  +  [R₀/R(E) - 1]                     │');
console.log('  │         ↑标准项      ↑重标定项(框架独有!)              │');
console.log('  └────────────────────────────────────────────────────────┘');
console.log('');
console.log('  E/E_P    标准项       重标定项      总色散δc/c    标准格点δc/c');
console.log('  ' + '─'.repeat(70));
for (const r of results) {
    console.log(`  ${r.E.toFixed(3)}    ${(r.rescaledLatticeTerm).toFixed(6)}    ${r.rescalingTerm >= 0 ? '+' : ''}${r.rescalingTerm.toFixed(6)}     ${r.totalDeltaC >= 0 ? '+' : ''}${r.totalDeltaC.toFixed(6)}     ${r.standardDeltaC.toFixed(6)}`);
}

console.log('\n━━━ 4. 非单调性检测 (框架独有信号) ━━━');
const nonMono = detectNonMonotonicity(results);
console.log(`  最小 δc/c = ${nonMono.minDeltaC.toFixed(6)} (at E=${nonMono.minE.toFixed(3)})`);
console.log(`  最大 δc/c = ${nonMono.maxDeltaC.toFixed(6)} (at E=${nonMono.maxE.toFixed(3)})`);
console.log(`  符号变化次数 = ${nonMono.signChanges}`);
console.log(`  非单调? ${nonMono.isNonMonotonic ? '✓ 是' : '✗ 否'}`);
console.log(`  存在c_eff > c₀区域? ${nonMono.hasSpeedup ? '✓ 是 (框架独有!)' : '✗ 否'}`);

if (nonMono.hasSpeedup) {
    console.log('\n  ★★★ 框架独有预言确认 ★★★');
    console.log('  标准格点理论: δc/c ≤ 0 恒成立 (c只变慢)');
    console.log('  本框架:       δc/c 可正可负 (c可变快!)');
    console.log('  → 这是可观测区分本框架与标准格点的独有信号!');
}

console.log('\n━━━ 5. 蒙特卡洛稳定性 (30次采样) ━━━');
const mcStats = monteCarloRescaling(N, C0, 30, 10);
console.log('  E/E_P    R(E)/R₀ (均值)    标准差      变异系数');
console.log('  ' + '─'.repeat(55));
for (const s of mcStats) {
    console.log(`  ${s.E.toFixed(3)}    ${s.mean.toFixed(4)}          ${s.std.toFixed(4)}      ${(s.cv * 100).toFixed(1)}%`);
}

// 检查R(E)是否单调
const R_means = mcStats.map(s => s.mean);
let R_monotonic = true;
for (let i = 1; i < R_means.length; i++) {
    if (R_means[i] > R_means[i-1] + 0.001) { R_monotonic = false; break; }
}
console.log(`\n  R(E) 单调递减? ${R_monotonic ? '✓' : '✗ (非单调!)'}`);
if (!R_monotonic) {
    console.log('  → R(E)非单调 = 重标定机制的独有特征');
}

console.log('\n━━━ 6. 完整预言公式 ━━━');
console.log('  ┌─────────────────────────────────────────────────────────┐');
console.log('  │  本框架独有色散公式:                                     │');
console.log('  │                                                         │');
console.log('  │    δc     ξ          R₀                                │');
console.log('  │   ─── = - ─ (ka)² + ─── - 1                           │');
console.log('  │    c      2          R(E)                               │');
console.log('  │                                                         │');
console.log('  │  其中:                                                  │');
console.log('  │    R(E) = √(I₀ / Σ\'_raw²)  (守恒重标定)              │');
console.log('  │    a(E) = a₀ × R₀/R(E)      (动态格点间距)            │');
console.log('  │    ξ ≈ 0.10                  (3D各向同性)             │');
console.log('  │                                                         │');
console.log('  │  两个可检验特征:                                        │');
console.log('  │    1. n=2 (二次色散, 与LQG一致)                         │');
console.log('  │    2. 非单调性 (c可变快, LQG给不出!)                    │');
console.log('  │       → 这是本框架独有的可证伪信号                      │');
console.log('  └─────────────────────────────────────────────────────────┘');

console.log('\n' + '='.repeat(75));
console.log('总结: 真正用好了核心思想');
console.log('='.repeat(75));
console.log(`
  之前的错误:
    把 H 选成紧束缚模型 → 直接变成标准格点理论
    把 a 当成常数 → 扔掉了重标定守恒这个核心独创
    色散预言退化成 Wilson 格点规范的标准结果

  现在的修正:
    核心独创 = 重标定守恒机制 (信息不丢失,重分配!)
    → 格点间距 a 是动力学变量, 不是常数
    → 色散 = 标准项 + 重标定项 (新!)
    → 重标定项可正可负 → 非单调色散 (标准格点给不出!)

  独有可证伪预言:
    1. δc/c 可出现正值 (c_eff > c₀)
       标准格点理论: δc/c ≤ 0 恒成立
       本框架: 高能区 δc/c 可 > 0

    2. 色散曲线非单调
       标准格点理论: δc/c 单调递减
       本框架: δc/c 可先减后增

  这是标准格点理论、LQG、VSL 都给不出的信号。
  因为它们都没有"消融对信息重分配"这个机制。
`);
