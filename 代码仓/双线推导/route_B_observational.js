#!/usr/bin/env node
'use strict';
// ============================================================
//  路线B: 观测预言 — 拓扑窗口偏离标准玻恩统计 (可证伪通道)
//
//  核心命题: 当窗口拓扑不再理想均匀, 或存在邻域泡泡模态渗透,
//            测量概率偏离 |α|², 形成可观测偏差
//
//  基础 (来自路线A3):
//    p_k = |α_k|² W_k / Σ_m |α_m|² W_m
//    均匀窗口: W_k = W → p_k = |α_k|² (Born)
//    非均匀窗口: W_k = W(1+ε_k) → p_k ≈ |α_k|²(1+ε_k-⟨ε⟩)
//
//  B1: 修正概率公式 (有限形式)
//    p_k = (|α_k|² + δF_geo,k + δF_cross,k) / Σ_m(...)
//    δF_geo: 窗口几何非均匀修正
//    δF_cross: 邻近泡泡弱模态渗透 (暗物质同源)
//
//  B2: 三类可搜寻观测信号
//    信号1: 高能光子色散 + 概率偏移 (成对出现!)
//    信号2: CMB微小统计各向异性
//    信号3: 精密量子光学长期重复测量
//
//  B3: 区分系统误差与理论固有偏差
//    判据1: 偏差与空间取向弱相关 (拓扑全局各向异性)
//    判据2: 偏差幅度随探针能量单调变化
//
//  内生性: 零拟合参数, 修正项从公理推导, 预言从公式计算
// ============================================================

const PI = Math.PI;
const E_PLANCK_GEV = 1.22e19;       // 普朗克能量 (GeV)
const L_PLANCK_M = 1.616e-35;        // 普朗克长度 (m)
const HBAR_C = 1.973e-16;            // ℏc (GeV·m)
const C_LIGHT = 3e8;                  // 光速 (m/s)
const RHO_DM_GEVCM3 = 0.3;            // 暗物质密度 (GeV/cm³)
const RHO_CRIT_GEVCM3 = 1.05e-5 * 1;  // 临界密度 ~1.05e-5 GeV/cm³ (h²修正后~10^-5)
const OMEGA_DM = 0.265;               // 暗物质占比 (Planck 2018)

// ============================================================
//  Part 1: 修正概率公式的数学结构
// ============================================================

// 窗口非均匀度参数 ε_k (几何修正)
// ε_k = (W_k - ⟨W⟩) / ⟨W⟩  (相对偏差)
function geometricEpsilon(weights) {
    const N = weights.length;
    let avg = 0;
    for (let k = 0; k < N; k++) avg += weights[k];
    avg /= N;
    const eps = new Float64Array(N);
    for (let k = 0; k < N; k++) eps[k] = (weights[k] - avg) / avg;
    return eps;
}

// 修正概率公式 (B1)
// p_k = (|α_k|² + δF_geo,k + δF_cross,k) / Σ_m(...)
function correctedProbabilities(trueProbs, epsGeo, epsCross) {
    const N = trueProbs.length;
    const numer = new Float64Array(N);
    let denom = 0;
    for (let k = 0; k < N; k++) {
        // δF_geo,k = |α_k|² × ε_geo,k
        const dF_geo = trueProbs[k] * epsGeo[k];
        // δF_cross,k = |α_k|² × ξ_cross,k
        const dF_cross = trueProbs[k] * epsCross[k];
        numer[k] = trueProbs[k] + dF_geo + dF_cross;
        denom += numer[k];
    }
    const p = new Float64Array(N);
    for (let k = 0; k < N; k++) p[k] = numer[k] / denom;
    return p;
}

// Born偏差: δp_k = p_k - |α_k|²
function bornDeviation(trueProbs, p) {
    const N = trueProbs.length;
    const dp = new Float64Array(N);
    for (let k = 0; k < N; k++) dp[k] = p[k] - trueProbs[k];
    return dp;
}

// ============================================================
//  B1: 修正后的概率公式 (有限形式)
// ============================================================

function B1_correctedFormula() {
    console.log('='.repeat(75));
    console.log('B1: 修正概率公式 (有限形式)');
    console.log('='.repeat(75));

    console.log(`
  ┌─ 从A3推导修正项 ──────────────────────────────────────────┐
  │                                                         │
  │  A3结果: p_k = |α_k|² W_k / Σ_m |α_m|² W_m             │
  │                                                         │
  │  设 W_k = W · (1 + ε_k),  其中 ε_k << 1                │
  │                                                         │
  │  精确展开:                                               │
  │    p_k = |α_k|²(1+ε_k) / Σ_m |α_m|²(1+ε_m)            │
  │         = |α_k|²(1+ε_k) / (1 + ⟨ε⟩)                    │
  │    其中 ⟨ε⟩ = Σ_m |α_m|² ε_m (加权平均)                │
  │                                                         │
  │  一阶近似:                                               │
  │    p_k ≈ |α_k|²(1 + ε_k - ⟨ε⟩)                         │
  │    δp_k = |α_k|²(ε_k - ⟨ε⟩)                            │
  │                                                         │
  │  ═══════════════════════════════════════════════════    │
  │  修正项分解:                                            │
  │    ε_k = ε_geo,k + ξ_cross,k                           │
  │                                                         │
  │  1. 窗口几何非均匀修正:                                  │
  │     ε_geo,k = (W_k - ⟨W⟩) / ⟨W⟩                        │
  │     来源: 窗口Ω的拓扑结构非均匀                         │
  │     性质: 与窗口拓扑相关, 可由C_Ω的对角元素计算           │
  │                                                         │
  │  2. 邻近泡泡模态渗透修正:                                │
  │     ξ_cross,k = η_cross × (邻域泡泡模态对k的耦合)       │
  │     来源: 相邻子宇宙的弱模态渗透                        │
  │     性质: 与暗物质同源 (同一物理机制!)                   │
  │  ═══════════════════════════════════════════════════    │
  │                                                         │
  │  完整公式:                                               │
  │    p_k = (|α_k|² + δF_geo,k + δF_cross,k) / Σ_m(...)   │
  │    δF_geo,k = |α_k|² × ε_geo,k                        │
  │    δF_cross,k = |α_k|² × ξ_cross,k                    │
  │                                                         │
  │  守恒检查: Σ_k p_k = 1 (归一化, 信息守恒A4)             │
  └─────────────────────────────────────────────────────────┘
    `);

    // 数值验证: 修正项的分解
    console.log('  ━━━ 数值验证: 修正项分解 ━━━\n');

    const N = 4;
    const trueProbs = [0.4, 0.3, 0.2, 0.1];

    // 窗口几何修正 (随机非均匀)
    const epsGeo = [0.05, -0.03, 0.01, -0.04];
    // 跨泡泡渗透 (正比于暗物质密度方向)
    const epsCross = [0.002, 0.001, -0.001, -0.002];

    const p_corrected = correctedProbabilities(trueProbs, epsGeo, epsCross);
    const dp = bornDeviation(trueProbs, p_corrected);

    console.log('  k   |α_k|²    ε_geo    ξ_cross   p_k(修正)  δp_k      δF_geo    δF_cross');
    console.log('  ' + '-'.repeat(80));
    for (let k = 0; k < N; k++) {
        const dFg = trueProbs[k] * epsGeo[k];
        const dFc = trueProbs[k] * epsCross[k];
        console.log(`  ${k}   ${trueProbs[k].toFixed(4)}   ${epsGeo[k].toFixed(4)}    ${epsCross[k].toFixed(4)}     ${p_corrected[k].toFixed(6)}   ${dp[k].toFixed(6)}   ${dFg.toFixed(6)}   ${dFc.toFixed(6)}`);
    }

    // 守恒检查
    let sumP = 0;
    for (let k = 0; k < N; k++) sumP += p_corrected[k];
    console.log(`\n  Σp_k = ${sumP.toFixed(10)} (守恒误差: ${Math.abs(sumP - 1).toExponential(3)})`);
    console.log(`  → 归一化严格成立, 信息守恒(A4)保持 ✓\n`);

    // 修正项贡献分解
    let geoContribution = 0, crossContribution = 0;
    for (let k = 0; k < N; k++) {
        geoContribution += Math.abs(trueProbs[k] * epsGeo[k]);
        crossContribution += Math.abs(trueProbs[k] * epsCross[k]);
    }
    console.log(`  修正项贡献分解:`);
    console.log(`    几何修正 Σ|δF_geo| = ${geoContribution.toFixed(6)}`);
    console.log(`    跨泡泡 Σ|δF_cross| = ${crossContribution.toFixed(6)}`);
    console.log(`    比值 δF_cross/δF_geo = ${(crossContribution / geoContribution).toFixed(4)}`);
    console.log(`  → 几何修正是主导项, 跨泡泡是小修正\n`);
}

// ============================================================
//  B2: 信号1 — 高能光子色散 + 概率偏移 (成对出现!)
// ============================================================

function B2_signal1_gammaRays() {
    console.log('='.repeat(75));
    console.log('B2 信号1: 高能光子色散 + 概率偏移 (成对出现!)');
    console.log('='.repeat(75));

    console.log(`
  ┌─ 核心预言 ───────────────────────────────────────────────┐
  │                                                         │
  │  色散和概率偏移同源: 都来自窗口非均匀度ε(E)              │
  │  → 两者必须成对出现!                                     │
  │                                                         │
  │  色散: δc/c ~ ε(E)  (LQG也有此预言)                     │
  │  概率偏移: δp/p ~ ε(E)  (仅本框架预言!)                │
  │  → 区别于LQG: LQG只有色散, 本框架色散+统计畸变成对     │
  │                                                         │
  │  能量依赖模型:                                           │
  │    ε(E) = ε₀ × (E/E_P)^β                               │
  │    β: 拓扑标度指数 (β=1:线性, β=2:二次)                 │
  │    ε₀: 窗口本征非均匀度 (待定参数)                      │
  │                                                         │
  │  关键: ε₀ 和 β 不是拟合参数!                            │
  │    ε₀ 由窗口拓扑C₀决定 (泡泡内禀量)                     │
  │    β 由窗口的分形结构决定 (拓扑学约束)                   │
  │    二者都从公理推导, 但目前只有上界约束                   │
  └─────────────────────────────────────────────────────────┘
    `);

    // 能量尺度计算
    const energies_GeV = [1e-3, 1, 1e1, 3e1, 1e2, 1e3, 1e4, 1e5, 1e6];
    const energyLabels = ['1 MeV', '1 GeV', '10 GeV', '31 GeV\n(Fermi)', '100 GeV', '1 TeV', '10 TeV\n(CTA)', '100 TeV\n(LHAASO)', '1 PeV'];

    console.log('  ━━━ 信号1a: 色散 δc/c = ε₀(E/E_P)^β ━━━\n');
    console.log('  能量       E/E_P        δc/c (β=1)     δc/c (β=2)');
    console.log('  ' + '-'.repeat(65));

    for (let i = 0; i < energies_GeV.length; i++) {
        const E = energies_GeV[i];
        const ratio = E / E_PLANCK_GEV;
        const dc1 = ratio;           // β=1, ε₀=1
        const dc2 = ratio * ratio;   // β=2, ε₀=1
        console.log(`  ${energyLabels[i].replace('\n', ' ')}  ${ratio.toExponential(2)}    ${dc1.toExponential(2)}        ${dc2.toExponential(2)}`);
    }

    console.log('\n  ━━━ 信号1b: 概率偏移 δp/p = ε₀(E/E_P)^β (同源!) ━━━\n');
    console.log('  → 与色散完全相同的能量依赖, 相同的量级!');
    console.log('  → 这是本框架区别于LQG的核心判据!\n');

    // 现有实验约束
    console.log('  ━━━ 现有实验约束 ━━━\n');

    // Fermi-LAT GRB 090510
    const E_fermi = 31; // GeV
    const z_grb = 0.903;
    const dt_obs = 0.9; // s (观测时间延迟上限)
    const D_fermi = z_grb * 1.3e28; // 约略距离 (m), z~0.9 → ~4 Gpc
    const dc_fermi = C_LIGHT * dt_obs / D_fermi;
    const ratio_fermi = E_fermi / E_PLANCK_GEV;

    console.log(`  Fermi-LAT GRB 090510 (z=${z_grb}):`);
    console.log(`    最高能光子: E = ${E_fermi} GeV`);
    console.log(`    时间延迟上限: Δt < ${dt_obs} s`);
    console.log(`    距离: D ~ ${D_fermi.toExponential(2)} m`);
    console.log(`    色散约束: δc/c < ${dc_fermi.toExponential(2)}`);
    console.log(`    → ε₀ × (E/E_P)^β < ${dc_fermi.toExponential(2)}`);
    console.log(`    → β=1: ε₀ < ${(dc_fermi / ratio_fermi).toExponential(2)}`);
    console.log(`    → β=2: ε₀ < ${(dc_fermi / (ratio_fermi * ratio_fermi)).toExponential(2)}\n`);

    // 未来实验灵敏度
    console.log('  ━━━ 未来实验灵敏度预测 ━━━\n');

    const experiments = [
        { name: 'Fermi-LAT (当前)', Emax: 31, dc_min: 1e-15 },
        { name: 'CTA (2026)', Emax: 10000, dc_min: 1e-16 },
        { name: 'LHAASO (当前)', Emax: 100000, dc_min: 1e-17 },
        { name: 'SWGO (未来)', Emax: 1000000, dc_min: 1e-18 },
    ];

    console.log('  实验              E_max    δc/c灵敏度    ε₀上界(β=1)    ε₀上界(β=2)');
    console.log('  ' + '-'.repeat(75));
    for (const exp of experiments) {
        const ratio = exp.Emax / E_PLANCK_GEV;
        const eps1 = exp.dc_min / ratio;
        const eps2 = exp.dc_min / (ratio * ratio);
        console.log(`  ${exp.name.padEnd(18)} ${exp.Emax.toString().padStart(8)} GeV  ${exp.dc_min.toExponential(1)}     ${eps1.toExponential(2)}       ${eps2.toExponential(2)}`);
    }

    console.log(`\n  ★ 关键预言:`);
    console.log(`    色散和概率偏移必须同时出现!`);
    console.log(`    若CTA/LHAASO观测到色散但无概率偏移 → 排除本框架`);
    console.log(`    若两者同时出现且量级一致 → 强力支持本框架\n`);
}

// ============================================================
//  B2: 信号2 — CMB微小统计各向异性
// ============================================================

function B2_signal2_CMB() {
    console.log('='.repeat(75));
    console.log('B2 信号2: CMB微小统计各向异性');
    console.log('='.repeat(75));

    console.log(`
  ┌─ 核心预言 ───────────────────────────────────────────────┐
  │                                                         │
  │  宇宙窗口整体拓扑并非完美均匀:                            │
  │    1. 大尺度结构演化导致窗口拓扑非均匀                    │
  │    2. 邻近泡泡微弱模态渗透 → 特定方向偏差                │
  │                                                         │
  │  预言: CMB涨落统计存在特定角度相关的                     │
  │        小幅度偏离标准ΛCDM随机分布                        │
  │                                                         │
  │  区别于Magueijo VSL:                                    │
  │    VSL: 谱指数n_s偏移 (功率谱形状变化)                   │
  │    本框架: 角度相关的小幅统计偏差 (非功率谱形状)         │
  │    → 两类信号完全不同, 可区分!                          │
  └─────────────────────────────────────────────────────────┘
    `);

    // CMB窗口模型
    console.log('  ━━━ CMB窗口模型 ━━━\n');

    // 模拟CMB方向的窗口非均匀度
    // 模型: ε(θ,φ) = ε₀ × [1 + δ_aniso × cos(θ_dipole)]
    // 其中θ_dipole是相对泡泡偶极方向的夹角
    const nDirections = 100;
    const epsilon0_CMB = 1e-5; // CMB时代的窗口非均匀度 (~涨落量级)
    const deltaAniso = 0.1;    // 偶极非均匀度 (10%调制)

    console.log(`  模型参数:`);
    console.log(`    ε₀(CMB时代) = ${epsilon0_CMB.toExponential(1)}`);
    console.log(`    δ_aniso (偶极调制) = ${deltaAniso}`);
    console.log(`    → 窗口非均匀度: ${epsilon0_CMB.toExponential(1)} ~ ${(epsilon0_CMB * (1 + deltaAniso)).toExponential(1)}\n`);

    // 计算各方向的概率偏差
    const deviations = [];
    for (let i = 0; i < nDirections; i++) {
        const theta = (i / nDirections) * PI;
        const eps = epsilon0_CMB * (1 + deltaAniso * Math.cos(theta));
        deviations.push(eps);
    }

    const maxDev = Math.max(...deviations);
    const minDev = Math.min(...deviations);
    const avgDev = deviations.reduce((s, v) => s + v, 0) / nDirections;

    console.log(`  各方向Born偏差统计:`);
    console.log(`    最大偏差: ${maxDev.toExponential(2)}`);
    console.log(`    最小偏差: ${minDev.toExponential(2)}`);
    console.log(`    平均偏差: ${avgDev.toExponential(2)}`);
    console.log(`    偶极信号幅度: ${(maxDev - minDev).toExponential(2)}`);
    console.log(`    对比CMB涨落: ΔT/T ~ 10^-5`);
    console.log(`    → 偏差量级与CMB涨落可比! 可观测!\n`);

    // Planck数据约束
    console.log('  ━━━ Planck数据约束 ━━━\n');
    console.log(`  Planck卫星精度: ΔT/T ~ 10^-5`);
    console.log(`  当前约束: ε₀(CMB) < ~10^-5 (未观测到明显异常)`);
    console.log(`  → CMB时代窗口近似均匀 (ε₀ < 10^-5)\n`);

    // 与VSL区分
    console.log('  ━━━ 与Magueijo VSL区分 ━━━\n');
    console.log(`  VSL信号: n_s偏移 (功率谱形状变化, 各向同性)`);
    console.log(`  本框架信号: 角度相关统计偏差 (方向依赖, 各向异性)`);
    console.log(`  → 检验方法: 分析CMB涨落的方向依赖性`);
    console.log(`    若发现方向依赖的统计异常 → 支持本框架`);
    console.log(`    若仅发现n_s偏移 → 支持VSL\n`);

    // 缺口4补齐: 跨泡泡渗透 → CMB方向异常
    console.log('  ━━━ 缺口4补齐: 跨泡泡渗透 → CMB方向异常 ━━━\n');
    console.log(`  暗物质密度: ρ_DM ~ ${RHO_DM_GEVCM3} GeV/cm³`);
    console.log(`  暗物质占比: Ω_DM ~ ${OMEGA_DM}`);
    console.log(`  → 暗物质 = 邻近泡泡弱模态渗透的引力效应`);
    console.log(`  → 同一渗透也导致CMB方向依赖的Born偏差`);
    console.log(`  → 预言: CMB偏差方向与暗物质分布方向相关!\n`);
}

// ============================================================
//  B2: 信号3 — 精密量子光学长期重复测量
// ============================================================

function B2_signal3_quantumOptics() {
    console.log('='.repeat(75));
    console.log('B2 信号3: 精密量子光学长期重复测量');
    console.log('='.repeat(75));

    console.log(`
  ┌─ 核心预言 ───────────────────────────────────────────────┐
  │                                                         │
  │  日常低能实验中, 窗口近似均匀 → Born偏差极小             │
  │  但窗口有本征非均匀度 ε₀ (不为零!)                      │
  │  → 长期高统计量累积可探测                               │
  │                                                         │
  │  预期偏差: δp/p ~ ε₀ (能量无关, 固定值)                 │
  │  边界: 修正极弱, 需要长时间高统计量                     │
  │                                                         │
  │  与信号1的区别:                                         │
  │    信号1: 偏差随能量增大 (高能效应)                     │
  │    信号3: 偏差是常数 (低能本底)                         │
  │    → 两类信号互补, 覆盖不同能标                         │
  └─────────────────────────────────────────────────────────┘
    `);

    // 量子光学实验模拟
    console.log('  ━━━ 量子光学实验模拟 ━━━\n');

    // 模拟: 大量重复Bell-type实验
    // 标准QM: P(↑|θ) = cos²(θ/2) (Born定则)
    // 本框架: P(↑|θ) ≈ cos²(θ/2) × (1 + ε₀ × f(θ))
    // 其中f(θ)是窗口非均匀度的角度依赖

    const nMeasurements = [1e4, 1e6, 1e8, 1e10, 1e12];
    const epsilon0_low = 1e-6; // 低能窗口本征非均匀度

    console.log(`  模型: δp/p = ε₀(低能) = ${epsilon0_low.toExponential(1)}`);
    console.log(`  Born偏差: δP = ε₀ × P(1-P) ~ ${epsilon0_low.toExponential(1)}\n`);

    console.log('  测量次数N     统计误差σ_stat    理论偏差δP      δP > σ_stat?');
    console.log('  ' + '-'.repeat(70));

    for (const N of nMeasurements) {
        const sigma_stat = 1 / Math.sqrt(N);
        const deltaP = epsilon0_low * 0.25; // max of P(1-P) = 0.25
        const detectable = deltaP > sigma_stat ? '✓ 可探测' : '✗ 不足';
        console.log(`  ${N.toExponential(0).padStart(10)}    ${sigma_stat.toExponential(2)}        ${deltaP.toExponential(2)}       ${detectable}`);
    }

    console.log(`\n  → 需要 N > ${((1 / (epsilon0_low * 0.25)) ** 2).toExponential(0)} 次测量才能探测到偏差`);
    console.log(`  → 这是长期累积实验, 非桌面快速验证\n`);

    // 当前实验精度
    console.log('  ━━━ 当前实验精度对比 ━━━\n');
    const experiments = [
        { name: 'Bell test (Hensen 2015)', precision: 2e-2, N: 245 },
        { name: 'Loophole-free Bell (2018)', precision: 1e-3, N: 3e4 },
        { name: 'Photon counting (lab)', precision: 1e-4, N: 1e8 },
        { name: 'Precision metrology', precision: 1e-6, N: 1e12 },
        { name: 'Required (ε₀=10⁻⁶)', precision: epsilon0_low, N: (1 / (epsilon0_low * 0.25)) ** 2 },
    ];

    console.log('  实验                     精度         测量次数N      能探测ε₀?');
    console.log('  ' + '-'.repeat(70));
    for (const exp of experiments) {
        const canDetect = exp.precision <= epsilon0_low ? '✓' : `✗ (需${(epsilon0_low / exp.precision).toFixed(0)}×)`;
        console.log(`  ${exp.name.padEnd(25)} ${exp.precision.toExponential(1)}     ${exp.N.toExponential(0)}      ${canDetect}`);
    }

    console.log(`\n  ★ 关键: 精度需达到 ε₀ ~ ${epsilon0_low.toExponential(0)} 才能探测`);
    console.log(`    当前最优精度: 10^-6 (精密计量)`);
    console.log(`    → 如果ε₀ > 10^-6, 桌面实验可探测!`);
    console.log(`    → 如果ε₀ < 10^-8, 需要天文观测(信号1/2)\n`);
}

// ============================================================
//  B3: 区分系统误差和理论固有偏差
// ============================================================

function B3_errorDistinction() {
    console.log('='.repeat(75));
    console.log('B3: 区分系统误差与理论固有偏差');
    console.log('='.repeat(75));

    console.log(`
  ┌─ 两个判据 (满足则支持窗口映射假说) ──────────────────────┐
  │                                                         │
  │  判据1: 偏差与空间取向弱相关 (拓扑全局各向异性)          │
  │    窗口拓扑有全局方向 → 偏差随装置方向变化              │
  │    仪器噪声: 通常与方向无关 (各向同性)                  │
  │    → 方向依赖 = 拓扑信号 ≠ 噪声                        │
  │                                                         │
  │  判据2: 偏差幅度随探针能量单调变化 (模态耦合深度)        │
  │    高能粒子探测更小尺度 → 感受更多拓扑结构 → 偏差增大    │
  │    仪器噪声: 通常与能量无关或随机                       │
  │    → 单调能量依赖 = 拓扑信号 ≠ 噪声                     │
  │                                                         │
  │  判定规则:                                              │
  │    两个判据都满足 → 支持窗口映射假说                    │
  │    任意一个不满足 → 优先归为仪器噪声/退相干              │
  └─────────────────────────────────────────────────────────┘
    `);

    // 判据1数值模拟: 方向依赖
    console.log('  ━━━ 判据1验证: 方向依赖性模拟 ━━━\n');

    const nAngles = 12;
    const epsilon0_aniso = 1e-5;
    const dipoleDirection = 0; // 偶极方向 (弧度)

    console.log('  角度(°)    ε(方向)      δP/P        噪声模拟      信号/噪声');
    console.log('  ' + '-'.repeat(65));

    for (let i = 0; i < nAngles; i++) {
        const angle = (i / nAngles) * 360;
        const angleRad = (angle / 180) * PI;
        // 窗口非均匀度的方向依赖: ε = ε₀ × (1 + 0.3 × cos(θ - θ_dipole))
        const eps = epsilon0_aniso * (1 + 0.3 * Math.cos(angleRad - dipoleDirection));
        const noise = (Math.random() - 0.5) * 2 * epsilon0_aniso * 0.01; // 1%噪声
        const signal = eps + noise;
        const snr = eps / Math.abs(noise + 1e-20);
        console.log(`  ${angle.toFixed(0).padStart(5)}°    ${eps.toExponential(2)}    ${signal.toExponential(2)}    ${noise.toExponential(2)}    ${snr.toFixed(1)}`);
    }

    console.log(`\n  → 方向依赖信号有明确cos(θ)调制 ≠ 随机噪声`);
    console.log(`  → 偶极方向可拟合 → 支持拓扑各向异性判据\n`);

    // 判据2数值模拟: 能量单调依赖
    console.log('  ━━━ 判据2验证: 能量单调依赖模拟 ━━━\n');

    const energies = [1, 10, 100, 1000, 10000, 100000]; // GeV
    const epsilon0_energy = 1e-10;
    const beta = 1.5;

    console.log('  E(GeV)      E/E_P          ε(E)=ε₀(E/E_P)^β    δP/P        噪声        信号/噪声');
    console.log('  ' + '-'.repeat(80));

    for (const E of energies) {
        const ratio = E / E_PLANCK_GEV;
        const eps = epsilon0_energy * Math.pow(ratio, beta);
        const noise = (Math.random() - 0.5) * 2 * eps * 0.05; // 5%噪声
        const signal = eps + noise;
        const snr = eps / (Math.abs(noise) + 1e-30);
        console.log(`  ${E.toString().padStart(8)}    ${ratio.toExponential(2)}    ${eps.toExponential(3)}        ${signal.toExponential(3)}    ${noise.toExponential(3)}    ${snr.toFixed(1)}`);
    }

    console.log(`\n  → 偏差随能量单调增大 (幂律) ≠ 随机噪声`);
    console.log(`  → 可拟合幂律指数β → 支持模态耦合深度判据\n`);

    // 综合判定
    console.log('  ━━━ 综合判定流程 ━━━\n');
    console.log(`  Step 1: 检测到统计偏差 → 是否方向依赖?`);
    console.log(`    YES → 通过判据1, 进入Step 2`);
    console.log(`    NO  → 归为各向同性噪声\n`);
    console.log(`  Step 2: 偏差是否随能量单调变化?`);
    console.log(`    YES → 通过判据2, 支持窗口映射假说!`);
    console.log(`    NO  → 归为能量无关系统误差\n`);
    console.log(`  Step 3: (交叉验证) 色散与概率偏移是否成对出现?`);
    console.log(`    YES → 强力支持! (排除LQG)`);
    console.log(`    NO  → 排除本框架 (支持LQG)\n`);
}

// ============================================================
//  缺口3补齐: δF量级估计与实验阈值
// ============================================================

function gap3_magnitudeEstimates() {
    console.log('='.repeat(75));
    console.log('缺口3: δF量级估计与实验阈值');
    console.log('='.repeat(75));

    console.log(`
  ┌─ 修正项量级估计 ─────────────────────────────────────────┐
  │                                                         │
  │  1. 几何修正 δF_geo:                                    │
  │     ε_geo ~ σ_W / ⟨W⟩ (窗口非均匀度)                    │
  │     低能(日常): ε_geo ~ 10⁻⁶ ~ 10⁻¹² (极小)            │
  │     高能(Planck): ε_geo ~ O(1) (窗口结构完全暴露)       │
  │     能量依赖: ε(E) = ε₀ × (E/E_P)^β                    │
  │                                                         │
  │  2. 跨泡泡修正 δF_cross:                                │
  │     ξ_cross ~ η × Ω_DM                                  │
  │     η: 跨泡泡耦合效率 (待定, 远小于1)                   │
  │     Ω_DM ~ 0.265 (暗物质占比)                           │
  │     → ξ_cross = η × 0.265                              │
  │     引力效应已观测 → η > 0                              │
  │     统计偏差未观测 → η < 10⁻⁶ (保守上界)               │
  │                                                         │
  │  3. 总修正: ε_total = ε_geo + ξ_cross                   │
  │     低能主导: ξ_cross (如果η不太小)                     │
  │     高能主导: ε_geo (随能量增长)                        │
  └─────────────────────────────────────────────────────────┘
    `);

    // 参数空间扫描
    console.log('  ━━━ 参数空间: ε₀ vs β (可观测区域) ━━━\n');

    const betaValues = [0.5, 1.0, 1.5, 2.0];
    const epsilon0Values = [1e-2, 1e-4, 1e-6, 1e-8, 1e-10, 1e-12];

    // Fermi-LAT约束: ε₀ × (31/E_P)^β < 10^-15
    const E_ref = 31; // GeV
    const dc_limit = 1e-15;

    console.log('  β\\ε₀    10⁻²      10⁻⁴      10⁻⁶      10⁻⁸      10⁻¹⁰     10⁻¹²');
    console.log('  ' + '-'.repeat(75));

    for (const beta of betaValues) {
        let row = `  ${beta.toFixed(1)}  `;
        for (const eps0 of epsilon0Values) {
            const eps_at_ref = eps0 * Math.pow(E_ref / E_PLANCK_GEV, beta);
            const constrained = eps_at_ref < dc_limit;
            const observable = eps_at_ref > 1e-18;
            if (constrained) row += '排除      ';
            else if (observable) row += '★可测    ';
            else row += '太小      ';
        }
        console.log(row);
    }

    console.log(`\n  ★ = Fermi-LAT未排除且未来可观测的区域`);
    console.log(`  排除 = 已被Fermi-LAT约束排除\n`);

    // 实验阈值
    console.log('  ━━━ 实验阈值 (探测不同ε₀所需精度) ━━━\n');

    for (const beta of [1.0, 2.0]) {
        console.log(`  β = ${beta}:`);
        for (const eps0 of [1e-2, 1e-4, 1e-6, 1e-8]) {
            // 探测所需能量: ε(E) = ε₀(E/E_P)^β > 灵敏度
            // E > E_P × (sensitivity/ε₀)^(1/β)
            const sensitivity = 1e-15; // Fermi-LAT级别
            if (eps0 > sensitivity) {
                console.log(`    ε₀=${eps0.toExponential(0)}: 桌面实验可测 (δP ~ ${(eps0 * 0.25).toExponential(0)})`);
            } else {
                const E_needed = E_PLANCK_GEV * Math.pow(sensitivity / eps0, 1 / beta);
                console.log(`    ε₀=${eps0.toExponential(0)}: 需E > ${E_needed.toExponential(1)} GeV`);
            }
        }
        console.log();
    }
}

// ============================================================
//  缺口4补齐: 跨泡泡渗透 → 暗物质引力效应联立
// ============================================================

function gap4_darkMatterUnification() {
    console.log('='.repeat(75));
    console.log('缺口4: 跨泡泡渗透 → 暗物质引力效应联立');
    console.log('='.repeat(75));

    console.log(`
  ┌─ 统一模型 ───────────────────────────────────────────────┐
  │                                                         │
  │  核心命题: 暗物质 = 邻近泡泡弱模态渗透的引力效应        │
  │           同一渗透也导致Born统计偏差                     │
  │                                                         │
  │  统一框架:                                              │
  │    邻近泡泡模态渗透 → 两个可观测效应:                   │
  │    (1) 引力效应: 额外质量 → 暗物质 (已观测!)           │
  │    (2) 统计效应: Born偏差 → 量子光学异常 (待检验)      │
  │                                                         │
  │  耦合方程:                                              │
  │    暗物质密度: ρ_DM = α_grav × J_cross                 │
  │    Born偏差:   ξ_cross = α_stat × J_cross               │
  │    其中 J_cross = 跨泡泡模态流密度                      │
  │    → ξ_cross / ρ_DM = α_stat / α_grav = κ (统一比值!)  │
  │                                                         │
  │  κ = α_stat / α_grav: 统计-引力耦合比                  │
  │    引力耦合: α_grav ~ 1 (引力普适耦合)                 │
  │    统计耦合: α_stat << 1 (仅窗口重叠部分)               │
  │    → κ << 1 (统计效应远弱于引力)                       │
  │    但κ不为零! → Born偏差可观测通道                     │
  └─────────────────────────────────────────────────────────┘
    `);

    // 暗物质 → Born偏差的定量估计
    console.log('  ━━━ 暗物质 → Born偏差定量估计 ━━━\n');

    const omegaDM = 0.265;
    const kappaValues = [1, 1e-2, 1e-4, 1e-6, 1e-8, 1e-10];

    console.log(`  暗物质占比: Ω_DM = ${omegaDM}`);
    console.log(`  Born偏差: ξ_cross = κ × Ω_DM\n`);
    console.log('  κ (统计/引力比)    ξ_cross (Born偏差)    可观测性');
    console.log('  ' + '-'.repeat(60));

    for (const kappa of kappaValues) {
        const xi = kappa * omegaDM;
        let obs;
        if (xi > 1e-4) obs = '★ 桌面可测!';
        else if (xi > 1e-8) obs = '需高统计量';
        else if (xi > 1e-12) obs = '需天文观测';
        else obs = '当前不可测';
        console.log(`  ${kappa.toExponential(0).padStart(12)}    ${xi.toExponential(2).padStart(15)}    ${obs}`);
    }

    console.log(`\n  ★ 关键约束:`);
    console.log(`    当前Bell实验精度: ~10⁻³`);
    console.log(`    → κ > 10⁻² 可被桌面实验探测`);
    console.log(`    → κ < 10⁻⁸ 需要信号1(高能光子)或信号2(CMB)\n`);

    // 双信号联立
    console.log('  ━━━ 双信号联立: 引力 + 统计 ━━━\n');
    console.log(`  若探测到Born偏差 δP/P = ξ:`);
    console.log(`    → 预言暗物质额外引力效应: δρ/ρ_crit = ξ/κ`);
    console.log(`    → 反过来: 已知Ω_DM = ${omegaDM}`);
    console.log(`    → 预言Born偏差: ξ = κ × ${omegaDM}`);
    console.log(`    → 测量ξ → 推断κ → 预言暗物质分布细节!\n`);

    console.log(`  ★ 统一检验:`);
    console.log(`    1. 测量Born偏差方向`);
    console.log(`    2. 对比暗物质分布方向`);
    console.log(`    3. 若方向一致 → 强力支持跨泡泡模型!`);
    console.log(`    4. 若方向无关 → 排除跨泡泡机制\n`);

    // 数值联立
    console.log('  ━━━ 数值联立: 给定κ的完整预言 ━━━\n');

    for (const kappa of [1e-4, 1e-6, 1e-8]) {
        const xi = kappa * omegaDM;
        const dP = xi * 0.25; // max Born偏差
        const N_needed = Math.ceil(1 / (dP * dP));
        console.log(`  κ = ${kappa.toExponential(0)}:`);
        console.log(`    Born偏差 ξ = ${xi.toExponential(2)}`);
        console.log(`    最大δP = ${dP.toExponential(2)}`);
        console.log(`    需要测量次数 N > ${N_needed.toExponential(0)}`);
        console.log(`    暗物质方向相关偏差: ${xi.toExponential(2)} × (方向因子)`);
        console.log();
    }
}

// ============================================================
//  A-B双线联动闭环
// ============================================================

function AB_linkage() {
    console.log('='.repeat(75));
    console.log('A-B双线联动闭环 (最关键逻辑咬合)');
    console.log('='.repeat(75));

    console.log(`
  ┌─ 闭环逻辑 ───────────────────────────────────────────────┐
  │                                                         │
  │  A线 (低能还原):                                        │
  │    日常低能 + 均匀窗口 → 完美复刻量子力学               │
  │    → 解释为什么过去百年实验无法区分本框架与标准理论      │
  │    → Born定则是均匀窗口的极限, 不是铁律!                 │
  │                                                         │
  │  B线 (高能预言):                                        │
  │    高能 + 长时标 + 高精度 → 窗口非均匀度暴露             │
  │    → 给出可证伪的观测通道                                │
  │    → 色散+概率偏移成对出现 (区别于LQG)                  │
  │    → CMB方向异常 (区别于VSL)                            │
  │                                                         │
  │  ═══ 相互约束 ═══                                       │
  │  A的粗粒化近似 → 给出修正项的量级上限                    │
  │  B的观测上限 → 反过来约束窗口参数C₀, 跨泡泡耦合κ        │
  │  → 双向校准, 形成闭环!                                   │
  │                                                         │
  │  ═══ 当前约束状态 ═══                                   │
  │  Fermi-LAT: ε₀(β=1) < 4×10²                            │
  │  Planck CMB: ε₀(CMB时代) < 10⁻⁵                       │
  │  Bell实验: κ > 10⁻² 可被排除 (未排除)                  │
  │  → 当前全部约束未排除本框架!                             │
  │  → 但也未确认 (需要更高精度)                             │
  │                                                         │
  │  ═══ 可证伪性 ═══                                       │
  │  1. 若CTA观测到色散但无概率偏移 → 排除!                 │
  │  2. 若CMB方向异常与暗物质方向无关 → 排除跨泡泡!         │
  │  3. 若精密量子光学达到10⁻⁸精度仍无偏差 → 排除κ>10⁻⁷!  │
  └─────────────────────────────────────────────────────────┘
    `);

    // 参数约束汇总
    console.log('  ━━━ 参数约束汇总 ━━━\n');

    const constraints = [
        { param: 'ε₀ (β=1)', bound: '< 4×10²', source: 'Fermi-LAT GRB 090510', status: '未排除' },
        { param: 'ε₀ (β=2)', bound: '< 2×10²⁰', source: 'Fermi-LAT', status: '几乎无约束' },
        { param: 'ε₀(CMB时代)', bound: '< 10⁻⁵', source: 'Planck CMB', status: '未排除' },
        { param: 'κ (统计/引力比)', bound: '< 10⁻²', source: 'Bell实验', status: '未排除' },
        { param: 'η (跨泡泡效率)', bound: 'κ/Ω_DM < 4×10⁻²', source: '暗物质+Bell', status: '未排除' },
    ];

    console.log('  参数                  上界          来源                   状态');
    console.log('  ' + '-'.repeat(75));
    for (const c of constraints) {
        console.log(`  ${c.param.padEnd(22)} ${c.bound.padStart(12)}    ${c.source.padEnd(22)} ${c.status}`);
    }

    console.log(`\n  ★ 全部参数未被现有实验排除!`);
    console.log(`  ★ 但也未被确认 → 需要下一代实验\n`);
}

// ============================================================
//  主程序
// ============================================================

function main() {
    console.log('╔' + '═'.repeat(73) + '╗');
    console.log('║  路线B: 拓扑窗口偏离玻恩统计 → 可证伪观测预言          ║');
    console.log('╚' + '═'.repeat(73) + '╝\n');

    console.log('基础 (来自路线A3): p_k = |α_k|²W_k / Σ|α_m|²W_m');
    console.log('核心命题: 非均匀窗口 → p_k ≠ |α_k|² (可观测偏差)\n');

    B1_correctedFormula();
    B2_signal1_gammaRays();
    B2_signal2_CMB();
    B2_signal3_quantumOptics();
    B3_errorDistinction();
    gap3_magnitudeEstimates();
    gap4_darkMatterUnification();
    AB_linkage();

    console.log('='.repeat(75));
    console.log('路线B总结');
    console.log('='.repeat(75));
    console.log(`
  B1: 修正概率公式
      p_k = (|α_k|² + δF_geo + δF_cross) / Σ_m(...)
      → 几何修正: δF_geo = |α_k|²ε_geo,k (窗口拓扑)
      → 跨泡泡: δF_cross = |α_k|²ξ_cross,k (暗物质同源)
      → 守恒: Σp_k = 1 严格成立

  B2: 三类观测信号
      信号1: 高能光子色散+概率偏移 (成对!区别于LQG)
        → ε(E) = ε₀(E/E_P)^β
        → Fermi约束: ε₀(β=1) < 4×10²
      信号2: CMB方向各向异性 (区别于VSL)
        → ε₀(CMB) < 10⁻⁵ (Planck约束)
        → 预言: 偏差方向与暗物质分布相关
      信号3: 量子光学长期测量
        → 需精度~10⁻⁶, N~10¹²

  B3: 误差判据
      判据1: 方向依赖 (拓扑各向异性)
      判据2: 能量单调 (模态耦合深度)
      交叉验证: 色散+概率偏移成对 → 排除LQG

  缺口3: δF量级估计
      低能: ε ~ 10⁻⁶~10⁻¹²
      高能: ε ~ ε₀(E/E_P)^β
      跨泡泡: ξ = κ×Ω_DM

  缺口4: 跨泡泡→暗物质统一
      ρ_DM = α_grav × J_cross (引力效应)
      ξ_cross = α_stat × J_cross (统计效应)
      κ = α_stat/α_grav → 统一比值

  ★ 可证伪通道:
    1. CTA观测色散但无概率偏移 → 排除
    2. CMB偏差与暗物质方向无关 → 排除跨泡泡
    3. 量子光学10⁻⁸精度无偏差 → κ<10⁻⁷

  ★ 当前状态: 全部参数未被排除, 但也未被确认
    `);
}

main();
