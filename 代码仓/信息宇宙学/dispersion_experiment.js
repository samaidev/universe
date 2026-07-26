#!/usr/bin/env node
'use strict';
// ============================================================
//  色散关系实验: 消融对重分配 → 非微扰色散修正?
//
//  核心问题:
//    LQG标准色散修正: E² = p²c²[1 + ξ(E/E_P)^n]  (平滑幂律)
//    东山框架独有机制: 阈值筛选 → 消融对 → 重标定
//    问: 重标定因子随能量变化时,是否产生非微扰阶跃修正?
//
//  实验设计:
//    1. 构建叠加态 → 投影生成拓扑
//    2. 在拓扑上注入不同能量级别的扰动(光子)
//    3. 扰动改变局部关联强度 → 改变存活/消融边界
//    4. 测量有效传播速度 c_eff(E) 随能量变化
//    5. 与LQG平滑幂律对比
// ============================================================

const LN2 = Math.log(2);

// ============================================================
//  叠加态 (同 functional_dynamics.js)
// ============================================================
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
            this.amplitudes.push({
                k, re: amp * Math.cos(phase), im: amp * Math.sin(phase),
                p, amp
            });
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

// ============================================================
//  投影 + 重标定 (核心机制)
//
//  关键: 重标定因子 R = √(I_0 / Σ_kept rawMag²)
//  当扰动改变哪些对存活时, R 发生变化 → c_eff 变化
// ============================================================
class ProjectionWithRescaling {
    project(psi, C0) {
        const N = psi.N;
        const pairs = [];
        let keptSumSq = 0;
        let totalSumSq = 0;

        for (let i = 0; i < N; i++) {
            for (let j = i + 1; j < N; j++) {
                const c = psi.correlation(i, j);
                const pair = { i, j, rawMag: c.mag, kept: c.mag >= C0 };
                pairs.push(pair);
                totalSumSq += c.mag * c.mag;
                if (pair.kept) keptSumSq += c.mag * c.mag;
            }
        }

        const rescale = keptSumSq > 0 ? Math.sqrt(psi.I_0 / keptSumSq) : 0;
        let finalSumSq = 0;
        for (const p of pairs) {
            if (p.kept) {
                p.C = p.rawMag * rescale;
                finalSumSq += p.C * p.C;
            }
        }

        return {
            pairs, rescale, finalSumSq,
            keptCount: pairs.filter(p => p.kept).length,
            totalCount: pairs.length,
            keptFraction: pairs.filter(p => p.kept).length / pairs.length,
            conservationError: Math.abs(finalSumSq - psi.I_0) / psi.I_0 * 100
        };
    }
}

// ============================================================
//  扰动注入: 模拟能量为E的光子
//
//  光子 = 拓扑上的局域扰动
//  能量E越高 → 扰动越强 → 影响更多关联对
//
//  机制:
//    1. 光子扰动修改局部关联强度: C'_{ij} = C_{ij} + δC(E, r)
//    2. 扰动强度 ∝ E, 扰动范围 ∝ √E (波长)
//    3. 修改后的关联对可能跨越阈值:
//       - 原存活对变弱 → 消融 (信息释放)
//       - 原消融对变强 → 复活 (信息回收)
//    4. 重标定因子变化 → 有效光速变化
// ============================================================
class PhotonPerturbation {
    // 注入扰动,返回扰动后的投影结果
    perturb(psi, C0, E, E_planck) {
        const N = psi.N;
        // 扰动强度: 能量越高,扰动越大
        // δC/C ~ (E/E_P)^α, α待定
        const alpha = 0.5;  // 线性色散对应α=1,我们测试亚线性
        const perturbStrength = Math.pow(E / E_planck, alpha);

        // 扰动影响范围: 能量越高,涉及越多模态
        const numAffected = Math.max(1, Math.floor(N * perturbStrength * 0.3));
        const affectedModes = new Set();
        // 随机选择受影响模态(局域扰动)
        for (let k = 0; k < numAffected && k < N; k++) {
            affectedModes.add(Math.floor(Math.random() * N));
        }

        // 计算扰动后的关联对
        const pairs = [];
        let keptSumSq = 0;
        let keptCount = 0;
        let nearThresholdCount = 0;  // 接近阈值的对(易受扰动影响)
        let flippedCount = 0;        // 状态翻转的对(存活↔消融)

        for (let i = 0; i < N; i++) {
            for (let j = i + 1; j < N; j++) {
                const c = psi.correlation(i, j);
                let rawMag = c.mag;

                // 扰动: 受影响模态的关联强度被修改
                const affected_i = affectedModes.has(i);
                const affected_j = affectedModes.has(j);
                if (affected_i || affected_j) {
                    // 扰动改变关联强度: δC = C × perturbStrength × random
                    const localPerturb = perturbStrength * (0.5 + Math.random() * 0.5);
                    rawMag *= (1 + (Math.random() - 0.5) * 2 * localPerturb);
                    rawMag = Math.max(0, rawMag);
                }

                const originalKept = c.mag >= C0;
                const newKept = rawMag >= C0;

                if (originalKept !== newKept) flippedCount++;
                if (Math.abs(rawMag - C0) / C0 < 0.1) nearThresholdCount++;

                const pair = { i, j, rawMag, kept: newKept, originalKept };
                pairs.push(pair);
                if (newKept) {
                    keptSumSq += rawMag * rawMag;
                    keptCount++;
                }
            }
        }

        // 重标定
        const rescale = keptSumSq > 0 ? Math.sqrt(psi.I_0 / keptSumSq) : 0;
        let finalSumSq = 0;
        for (const p of pairs) {
            if (p.kept) {
                p.C = p.rawMag * rescale;
                finalSumSq += p.C * p.C;
            }
        }

        return {
            E, E_planck,
            rescale, finalSumSq,
            keptCount, totalCount: pairs.length,
            keptFraction: keptCount / pairs.length,
            nearThresholdCount,
            flippedCount,
            conservationError: Math.abs(finalSumSq - psi.I_0) / psi.I_0 * 100,
            perturbStrength
        };
    }
}

// ============================================================
//  有效光速计算
//
//  c_eff ∝ 拓扑网络上的传播速度
//  传播速度 ∝ 平均关联强度 (连接越强,传播越快)
//  但重标定改变了所有关联强度
//
//  关键: c_eff(E) = c_0 × R(E) / R(0)
//  R(E) = 重标定因子(随能量变化)
//  如果R(E)不是平滑函数 → 非微扰色散修正!
// ============================================================
function computeEffectiveSpeed(perturbResult, baselineRescale) {
    return perturbResult.rescale / baselineRescale;
}

// ============================================================
//  LQG标准色散 (对比基准)
//  δc/c = -ξ × (E/E_P)^n
//  n=1 (线性) 或 n=2 (二次)
// ============================================================
function lqgDispersion(E, E_planck, xi, n) {
    return 1 - xi * Math.pow(E / E_planck, n);
}

// ============================================================
//  运行实验
// ============================================================
console.log('='.repeat(75));
console.log('色散关系实验: 消融对重分配 → 非微扰色散修正?');
console.log('与LQG标准色散对比');
console.log('='.repeat(75));

const N = 80;
const C0 = 0.45;
const psi = new SuperpositionState(N, 1.5);
const projector = new ProjectionWithRescaling();
const photon = new PhotonPerturbation();

// 基线 (无扰动)
const baseline = projector.project(psi, C0);
const baselineRescale = baseline.rescale;

console.log(`\n基线参数:`);
console.log(`  N=${N}, C₀=${C0}, I₀=${psi.I_0.toFixed(4)}`);
console.log(`  基线重标定: R₀=${baselineRescale.toFixed(6)}`);
console.log(`  存活对: ${baseline.keptCount}/${baseline.totalCount} (${(baseline.keptFraction*100).toFixed(1)}%)`);
console.log(`  守恒误差: ${baseline.conservationError.toFixed(6)}%`);

// 扫描能量
console.log(`\n━━━ 能量扫描: c_eff(E) 随能量变化 ━━━`);
console.log(`  E/E_P    R(E)/R₀    c_eff/c₀    翻转对   近阈值对   守恒%    LQG(n=1)   LQG(n=2)`);

const E_planck = 1.0;  // 归一化普朗克能量
const energies = [];
for (let i = -4; i <= 0; i += 0.25) {
    energies.push(Math.pow(10, i));
}

const results = [];
const xi = 1.0;  // LQG系数

for (const E of energies) {
    // 多次采样取平均 (统计涨落)
    let avgRescale = 0;
    let avgFlipped = 0;
    let avgNearThr = 0;
    let avgConsErr = 0;
    let avgKeptFrac = 0;
    const samples = 20;

    for (let s = 0; s < samples; s++) {
        const result = photon.perturb(psi, C0, E, E_planck);
        avgRescale += result.rescale;
        avgFlipped += result.flippedCount;
        avgNearThr += result.nearThresholdCount;
        avgConsErr += result.conservationError;
        avgKeptFrac += result.keptFraction;
    }
    avgRescale /= samples;
    avgFlipped /= samples;
    avgNearThr /= samples;
    avgConsErr /= samples;
    avgKeptFrac /= samples;

    const c_eff = avgRescale / baselineRescale;
    const lqg1 = lqgDispersion(E, E_planck, xi, 1);
    const lqg2 = lqgDispersion(E, E_planck, xi, 2);

    results.push({
        E_ratio: E / E_planck,
        c_eff,
        flipped: avgFlipped,
        nearThreshold: avgNearThr,
        keptFraction: avgKeptFrac,
        lqg1, lqg2
    });

    const bar = '█'.repeat(Math.max(0, Math.round((1 - c_eff) * 30)));
    console.log(`  ${(E/E_planck).toExponential(2).padStart(7)}  ${(avgRescale/baselineRescale).toFixed(6)}  ${c_eff.toFixed(6)}  ${avgFlipped.toFixed(0).padStart(5)}    ${avgNearThr.toFixed(0).padStart(5)}     ${avgConsErr.toFixed(4)}  ${lqg1.toFixed(6)}  ${lqg2.toFixed(6)}  ${bar}`);
}

// 分析: 东山框架 vs LQG色散差异
console.log(`\n━━━ 色散修正对比分析 ━━━`);

// 拟合东山框架的色散: δc/c ~ (E/E_P)^n_dongshan
// δc/c = 1 - c_eff
const dongshanData = results.filter(r => r.E_ratio < 0.5 && r.c_eff < 1.0 + 1e-6);
const dongshanDelta = dongshanData.map(r => ({
    x: Math.log(r.E_ratio),
    y: Math.log(Math.max(1 - r.c_eff, 1e-10))
}));

// 线性回归: ln(δc/c) = n × ln(E/E_P) + const
let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
for (const d of dongshanDelta) {
    sumX += d.x; sumY += d.y; sumXY += d.x * d.y; sumX2 += d.x * d.x;
}
const nData = dongshanDelta.length;
const slope = (nData * sumXY - sumX * sumY) / (nData * sumX2 - sumX * sumX);
const intercept = (sumY - slope * sumX) / nData;

console.log(`  东山框架色散拟合: δc/c ~ (E/E_P)^${slope.toFixed(3)}`);
console.log(`  LQG标准色散:       δc/c ~ (E/E_P)^1 (线性) 或 (E/E_P)^2 (二次)`);
console.log(`  拟合范围: E/E_P ∈ [${dongshanData[0]?.E_ratio.toExponential(2)}, ${dongshanData[dongshanData.length-1]?.E_ratio.toExponential(2)}]`);

// 非微扰特征检测: 检查是否存在阶跃/非解析行为
console.log(`\n━━━ 非微扰特征检测 ━━━`);
let maxJump = 0;
let jumpEnergy = 0;
for (let i = 1; i < results.length; i++) {
    const jump = Math.abs(results[i].c_eff - results[i-1].c_eff);
    if (jump > maxJump) {
        maxJump = jump;
        jumpEnergy = results[i].E_ratio;
    }
}
console.log(`  最大c_eff跳变: ${maxJump.toFixed(6)} (E/E_P = ${jumpEnergy.toExponential(2)})`);
console.log(`  翻转对最大值: ${Math.max(...results.map(r => r.flipped)).toFixed(0)} 对`);
console.log(`  近阈值对最大值: ${Math.max(...results.map(r => r.nearThreshold)).toFixed(0)} 对`);

// 阶跃性判断: 如果最大跳变远大于平均跳变 → 非微扰特征
const avgJump = results.slice(1).reduce((s, r, i) => s + Math.abs(r.c_eff - results[i].c_eff), 0) / (results.length - 1);
const jumpRatio = maxJump / avgJump;
console.log(`  平均跳变: ${avgJump.toFixed(6)}`);
console.log(`  跳变比 (max/avg): ${jumpRatio.toFixed(2)}`);
console.log(`  非微扰特征: ${jumpRatio > 3 ? '✓ 存在阶跃 (非解析行为)' : '✗ 平滑变化 (微扰特征)'}`);

// 存活对分数变化
const keptFracRange = Math.max(...results.map(r => r.keptFraction)) - Math.min(...results.map(r => r.keptFraction));
console.log(`  存活对分数变化范围: ${(keptFracRange*100).toFixed(2)}%`);

// 总结
console.log(`\n${'='.repeat(75)}`);
console.log('结论: 消融对重分配的色散特征');
console.log('='.repeat(75));
console.log(`
机制:
  1. 光子扰动改变局部关联强度
  2. 近阈值对跨越存活/消融边界 → 翻转
  3. 翻转导致重标定因子R(E)变化
  4. R(E)变化 → 有效光速c_eff(E)变化

色散拟合:
  东山框架: δc/c ~ (E/E_P)^${slope.toFixed(3)}
  LQG线性:  δc/c ~ (E/E_P)^1
  LQG二次:  δc/c ~ (E/E_P)^2

关键发现:
  ${slope < 0.8 ? `东山框架幂指数 ${slope.toFixed(3)} < 1, 与LQG不同 → 独立预测!` :
    slope > 1.3 ? `东山框架幂指数 ${slope.toFixed(3)} > 1, 与LQG不同 → 独立预测!` :
    `东山框架幂指数 ${slope.toFixed(3)} ≈ LQG, 无独立预测`}
  非微扰阶跃: ${jumpRatio > 3 ? '存在 (消融边界跨越导致非解析行为)' : '不存在 (平滑微扰特征)'}
  翻转机制: ${Math.max(...results.map(r => r.flipped)) > 0 ? '活跃 (阈值筛选是动态的)' : '不活跃'}

${slope < 0.8 || slope > 1.3 || jumpRatio > 3 ?
  `★ 独立预测: 东山框架给出与LQG不同的色散关系
   可检验途径: 高能伽马射线暴色散测量
   预期差异: 幂指数 ${slope.toFixed(3)} vs LQG的1或2` :
  `× 无独立预测: 东山框架色散与LQG形式相同
   消融重分配机制未引入新的色散特征`}
`);
