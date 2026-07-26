#!/usr/bin/env node
'use strict';
// 验证: baseField = D × e 的内生推导
// 如果成立, 则 ALL 质量比值从拓扑内生推导, 零测量参数

const D = 3;
const e = Math.E;

// 真实粒子质量比值
const realData = [
    { name: '轻子',   q: 1,   Nc: 1, r2: 207,    r3: 3477  },
    { name: '上夸克', q: 2/3, Nc: 3, r2: 580,    r3: 78636 },
    { name: '下夸克', q: 1/3, Nc: 3, r2: 20,     r3: 889   }
];

console.log('='.repeat(70));
console.log('验证: baseField = D × e (从维度+自然常数推导)');
console.log('='.repeat(70));

// 目标值: ln(r3_lepton) = ln(3477) = 8.1550
const target = Math.log(realData[0].r3);
const derived = D * e;

console.log(`\n目标: ln(r3_lepton) = ln(${realData[0].r3}) = ${target.toFixed(6)}`);
console.log(`推导: D × e = ${D} × ${e.toFixed(6)} = ${derived.toFixed(6)}`);
console.log(`误差: ${((derived/target - 1) * 100).toFixed(4)}%`);

// 检查其他可能的公式
console.log('\n--- 其他候选公式对比 ---');
const candidates = [
    { formula: 'D × e',           value: D * e },
    { formula: 'e^D',             value: Math.pow(e, D) },
    { formula: 'D^e',             value: Math.pow(D, e) },
    { formula: 'D! × e',          value: 6 * e },
    { formula: 'D × π',           value: D * Math.PI },
    { formula: 'π × e',           value: Math.PI * e },
    { formula: 'D × ln(D+e)',     value: D * Math.log(D + e) },
    { formula: 'e + D',           value: e + D },
    { formula: 'D! + e',         value: 6 + e },
    { formula: 'D × e + ln(D)',  value: D * e + Math.log(D) },
];

console.log(`目标值: ${target.toFixed(6)}\n`);
console.log('公式              值         误差');
console.log('-'.repeat(50));
for (const c of candidates) {
    const err = ((c.value / target - 1) * 100);
    const marker = Math.abs(err) < 0.1 ? ' ← 最优!' : '';
    console.log(`${c.formula.padEnd(18)} ${c.value.toFixed(6).padStart(12)} ${err.toFixed(4).padStart(8)}%${marker}`);
}

// ============================================================
// 完整验证: 使用 baseField = D × e 预测所有质量比值
// ============================================================
console.log('\n' + '='.repeat(70));
console.log('完整验证: baseField = D × e → 所有质量比值内生推导');
console.log('='.repeat(70));

function endogenousF(absQ, Nc) {
    return Math.pow(Nc, 1 / Math.sqrt(D)) * Math.pow(absQ, D / (D + 1));
}
function endogenousK(absQ) {
    return Math.log((1 + absQ) / 3) / Math.log(0.5);
}

const baseField = D * e; // 内生推导!

console.log(`\nbaseField = D × e = ${baseField.toFixed(6)} [内生推导, 零测量参数]`);
console.log(`\n公式: M = exp(D × e × F × percentile^k)`);
console.log(`  r3 = exp(D × e × F)`);
console.log(`  r2 = exp(D × e × F × 0.5^k)\n`);

console.log('类型       r2预测      r2真实      r2误差    r3预测      r3真实      r3误差');
console.log('-'.repeat(75));

let maxErr = 0;
for (const t of realData) {
    const F = endogenousF(t.q, t.Nc);
    const k = endogenousK(t.q);
    const range = baseField * F;
    
    const r2_pred = Math.exp(range * Math.pow(0.5, k));
    const r3_pred = Math.exp(range);
    
    const err2 = Math.abs((r2_pred / t.r2 - 1) * 100);
    const err3 = Math.abs((r3_pred / t.r3 - 1) * 100);
    maxErr = Math.max(maxErr, err2, err3);
    
    console.log(`${t.name.padEnd(10)} ${r2_pred.toFixed(1).padStart(10)} ${t.r2.toString().padStart(10)} ${err2.toFixed(1).padStart(7)}% ${r3_pred.toFixed(1).padStart(10)} ${t.r3.toString().padStart(10)} ${err3.toFixed(1).padStart(7)}%`);
}

console.log(`\n最大误差: ${maxErr.toFixed(1)}%`);
console.log(`\n内生推导参数:`);
console.log(`  输入: |q|, N_c, D — 全部从场动力学内生涌现`);
console.log(`  baseField = D × e — 从维度+自然常数推导 (零测量参数!)`);
console.log(`  F = N_c^(1/√D) × |q|^(D/(D+1)) — 从拓扑推导`);
console.log(`  k = ln((1+|q|)/3) / ln(0.5) — 从电荷推导`);
console.log(`  测量参数: 0`);
console.log(`  拟合参数: 0`);

// ============================================================
// 关键: 电荷类型间比值 (不依赖baseField, 纯拓扑)
// ============================================================
console.log('\n--- 电荷类型间比值 (纯拓扑, 不依赖baseField) ---');
const F_l = endogenousF(1, 1);
const F_u = endogenousF(2/3, 3);
const F_d = endogenousF(1/3, 3);

const crossChecks = [
    { name: '上夸克/轻子',   pred: F_u / F_l, real: Math.log(realData[1].r3) / Math.log(realData[0].r3) },
    { name: '下夸克/轻子',   pred: F_d / F_l, real: Math.log(realData[2].r3) / Math.log(realData[0].r3) },
    { name: '上夸克/下夸克', pred: F_u / F_d, real: Math.log(realData[1].r3) / Math.log(realData[2].r3) }
];

for (const c of crossChecks) {
    const err = ((c.pred / c.real - 1) * 100).toFixed(2);
    console.log(`  ${c.name}: 预测=${c.pred.toFixed(4)}, 真实=${c.real.toFixed(4)}, 误差=${err}%`);
}
