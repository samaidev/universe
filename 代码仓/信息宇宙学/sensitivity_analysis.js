#!/usr/bin/env node
'use strict';
// ============================================================
//  敏感性分析: 色散幂指数是否依赖扰动模型参数?
//
//  关键问题:
//    幂指数 0.731 是框架固有预测,还是参数 α=0.5 的人为结果?
//    如果 δc/c ~ (E/E_P)^α 那就只是扰动模型的映射,不是独立预测
//
//  测试:
//    1. 扫描 α ∈ [0.3, 0.8],看拟合幂指数是否跟踪 α
//    2. 扫描阈值 C₀,看非微扰阶跃是否稳健
//    3. 扫描模态分布 s,看结论是否依赖初始条件
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

function project(psi, C0) {
    const N = psi.N;
    let keptSumSq = 0;
    for (let i = 0; i < N; i++)
        for (let j = i + 1; j < N; j++) {
            const c = psi.correlation(i, j);
            if (c.mag >= C0) keptSumSq += c.mag * c.mag;
        }
    return keptSumSq > 0 ? Math.sqrt(psi.I_0 / keptSumSq) : 0;
}

function perturbAndProject(psi, C0, E, E_planck, alpha) {
    const N = psi.N;
    const perturbStrength = Math.pow(E / E_planck, alpha);
    const numAffected = Math.max(1, Math.floor(N * perturbStrength * 0.3));
    const affectedModes = new Set();
    for (let k = 0; k < numAffected && k < N; k++)
        affectedModes.add(Math.floor(Math.random() * N));

    let keptSumSq = 0, flippedCount = 0;
    for (let i = 0; i < N; i++) {
        for (let j = i + 1; j < N; j++) {
            const c = psi.correlation(i, j);
            let rawMag = c.mag;
            if (affectedModes.has(i) || affectedModes.has(j)) {
                const localPerturb = perturbStrength * (0.5 + Math.random() * 0.5);
                rawMag *= (1 + (Math.random() - 0.5) * 2 * localPerturb);
                rawMag = Math.max(0, rawMag);
            }
            if (rawMag >= C0) keptSumSq += rawMag * rawMag;
            if ((c.mag >= C0) !== (rawMag >= C0)) flippedCount++;
        }
    }
    const rescale = keptSumSq > 0 ? Math.sqrt(psi.I_0 / keptSumSq) : 0;
    return { rescale, flippedCount };
}

function fitExponent(data) {
    let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
    const n = data.length;
    for (const d of data) {
        sumX += d.x; sumY += d.y; sumXY += d.x * d.y; sumX2 += d.x * d.x;
    }
    return (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
}

function runExperiment(N, C0, s, alpha, numSamples = 15) {
    const psi = new SuperpositionState(N, s);
    const baselineRescale = project(psi, C0);
    if (baselineRescale === 0) return null;

    const E_planck = 1.0;
    const energies = [];
    for (let i = -4; i <= 0; i += 0.25) energies.push(Math.pow(10, i));

    const results = [];
    for (const E of energies) {
        let avgRescale = 0, avgFlipped = 0;
        for (let t = 0; t < numSamples; t++) {
            const r = perturbAndProject(psi, C0, E, E_planck, alpha);
            avgRescale += r.rescale;
            avgFlipped += r.flippedCount;
        }
        avgRescale /= numSamples;
        avgFlipped /= numSamples;
        const c_eff = avgRescale / baselineRescale;
        results.push({ E_ratio: E / E_planck, c_eff, flipped: avgFlipped });
    }

    // 拟合幂指数
    const fitData = results
        .filter(r => r.E_ratio < 0.5 && r.c_eff < 1.0 + 1e-6)
        .map(r => ({ x: Math.log(r.E_ratio), y: Math.log(Math.max(1 - r.c_eff, 1e-10)) }));
    if (fitData.length < 3) return null;
    const exponent = fitExponent(fitData);

    // 非微扰阶跃检测
    let maxJump = 0, avgJump = 0;
    for (let i = 1; i < results.length; i++) {
        const jump = Math.abs(results[i].c_eff - results[i-1].c_eff);
        if (jump > maxJump) maxJump = jump;
        avgJump += jump;
    }
    avgJump /= (results.length - 1);
    const jumpRatio = maxJump / avgJump;

    const maxFlipped = Math.max(...results.map(r => r.flipped));

    return { exponent, jumpRatio, maxFlipped, alpha, C0, s };
}

// ============================================================
//  实验1: 扫描扰动参数 α
// ============================================================
console.log('='.repeat(75));
console.log('敏感性分析: 色散幂指数是否依赖扰动模型参数?');
console.log('='.repeat(75));

console.log('\n━━━ 实验1: 扰动参数 α 扫描 ━━━');
console.log('  α      拟合幂指数   阶跃比    翻转对   独立预测?');
console.log('  ' + '─'.repeat(60));

const alphaResults = [];
for (let alpha = 0.2; alpha <= 0.9; alpha += 0.1) {
    const r = runExperiment(80, 0.45, 1.5, alpha);
    if (r) {
        alphaResults.push(r);
        const independent = Math.abs(r.exponent - alpha) > 0.15 ? '✓ 不同' : '✗ 跟踪α';
        console.log(`  ${alpha.toFixed(1)}    ${r.exponent.toFixed(4)}      ${r.jumpRatio.toFixed(2)}     ${r.maxFlipped.toFixed(0)}      ${independent}`);
    }
}

// ============================================================
//  实验2: 扫描阈值 C₀
// ============================================================
console.log('\n━━━ 实验2: 阈值 C₀ 扫描 (α=0.5固定) ━━━');
console.log('  C₀     拟合幂指数   阶跃比    翻转对   非微扰?');
console.log('  ' + '─'.repeat(60));

const c0Results = [];
for (let C0 = 0.25; C0 <= 0.65; C0 += 0.05) {
    const r = runExperiment(80, C0, 1.5, 0.5);
    if (r) {
        c0Results.push(r);
        const nonpert = r.jumpRatio > 3 ? '✓ 阶跃' : '✗ 平滑';
        console.log(`  ${C0.toFixed(2)}   ${r.exponent.toFixed(4)}      ${r.jumpRatio.toFixed(2)}     ${r.maxFlipped.toFixed(0)}      ${nonpert}`);
    }
}

// ============================================================
//  实验3: 扫描模态分布 s
// ============================================================
console.log('\n━━━ 实验3: 模态分布 s 扫描 (α=0.5, C₀=0.45) ━━━');
console.log('  s      拟合幂指数   阶跃比    翻转对   非微扰?');
console.log('  ' + '─'.repeat(60));

const sResults = [];
for (let s = 1.0; s <= 2.5; s += 0.25) {
    const r = runExperiment(80, 0.45, s, 0.5);
    if (r) {
        sResults.push(r);
        const nonpert = r.jumpRatio > 3 ? '✓ 阶跃' : '✗ 平滑';
        console.log(`  ${s.toFixed(2)}   ${r.exponent.toFixed(4)}      ${r.jumpRatio.toFixed(2)}     ${r.maxFlipped.toFixed(0)}      ${nonpert}`);
    }
}

// ============================================================
//  分析
// ============================================================
console.log(`\n${'='.repeat(75)}`);
console.log('敏感性分析结论');
console.log('='.repeat(75));

// 幂指数 vs α 的相关性
const expCorrAlpha = alphaResults.map(r => ({ x: r.alpha, y: r.exponent }));
const alphaSlope = fitExponent(expCorrData(expCorrAlpha));

function expCorrData(data) {
    let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
    for (const d of data) { sumX += d.x; sumY += d.y; sumXY += d.x*d.y; sumX2 += d.x*d.x; }
    const n = data.length;
    return [{x:0, y: (n*sumXY - sumX*sumY)/(n*sumX2 - sumX*sumX)}];
}

const allExponents = alphaResults.map(r => r.exponent);
const expMin = Math.min(...allExponents);
const expMax = Math.max(...allExponents);
const expRange = expMax - expMin;

const allJumps = [...alphaResults, ...c0Results, ...sResults].map(r => r.jumpRatio);
const jumpMin = Math.min(...allJumps);
const jumpMax = Math.max(...allJumps);

console.log(`
幂指数敏感性:
  α ∈ [0.2, 0.9] → 幂指数 ∈ [${expMin.toFixed(3)}, ${expMax.toFixed(3)}]
  范围: ${expRange.toFixed(3)}
  ${expRange > 0.2 ?
    '✗ 幂指数强依赖扰动模型参数α → 不是框架固有预测' :
    '✓ 幂指数弱依赖参数α → 可能是框架固有特征'}

非微扰阶跃稳健性:
  全部测试中阶跃比范围: [${jumpMin.toFixed(2)}, ${jumpMax.toFixed(2)}]
  ${jumpMin > 3 ?
    '✓ 阶跃特征在所有参数组合下都存在 → 稳健的独立特征' :
    '△ 阶跃特征在某些参数下消失 → 部分稳健'}

翻转机制:
  全部测试中翻转对最大值: ${Math.max(...[...alphaResults, ...c0Results, ...sResults].map(r => r.maxFlipped)).toFixed(0)}
  ${Math.max(...[...alphaResults, ...c0Results, ...sResults].map(r => r.maxFlipped)) > 10 ?
    '✓ 阈值跨越活跃 → 消融重分配机制真实运作' :
    '✗ 阈值跨越不活跃 → 机制未生效'}

最终判断:
  ${expRange > 0.2 && jumpMin > 3 ?
    '幂指数不是独立预测(依赖α),但非微扰阶跃是稳健的独立特征' :
    expRange > 0.2 ?
      '幂指数依赖参数,阶跃不稳健 → 无独立预测' :
      '幂指数和阶跃都稳健 → 有独立预测'}
`);
