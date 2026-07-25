#!/usr/bin/env node
'use strict';
// ============================================================
//  重新审查：被判定"不成立"的实验是否有实现bug
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

class Universe {
    constructor(n) {
        this.n = n; this.N = n * n;
        this.psi = new Float64Array(this.N);
        this.psiNext = new Float64Array(this.N);
        this.tick = 0; this.endoAvgC = 1.0;
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
        const n = this.n, N = this.N, nIdx = this.nIdx;
        const cArr = new Float64Array(N * 4);
        let sumC = 0, sumPsi = 0;
        for (let i = 0; i < N; i++) {
            sumPsi += this.psi[i];
            for (let d = 0; d < 4; d++) {
                const j = nIdx[i*4+d];
                const c = correlation(this.psi[i], this.psi[j]);
                cArr[i*4+d] = c; sumC += c;
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
                const sat = 1.0 / (1.0 + cur * cur * 0.15);
                delta = dStar * diffSum / diffWeight * sat;
            }
            if (gravCount > 0) {
                const gSat = cur / (1.0 + cur * 0.15);
                let gDelta = gStar * gravAcc / gravCount * gSat;
                const maxLoss = cur * 0.20;
                gDelta = Math.max(-maxLoss, Math.min(maxLoss, gDelta));
                delta += gDelta;
            }
            const dev = cur - avgPsi;
            delta += 0.05 * dev - 0.02 * dev * dev * dev;
            delta += 0.005 * cur * cur - 0.003 * cur * cur * cur;
            delta += 0.015 * Math.tanh(lapSum * 0.3);
            const vacuumFactor = 1.0 + 5.0 * Math.exp(-cur * 1.5);
            delta += (Math.random() - 0.5) * 0.015 * vacuumFactor;
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
    get(x, y) { return this.psi[idx(x, y, this.n)]; }
    set(x, y, v) { this.psi[idx(x, y, this.n)] = v; }
    totalInfo() { let s = 0; for (let i = 0; i < this.N; i++) s += this.psi[i]; return s; }
    createBlackHole(cx, cy, mass) {
        const r = Math.ceil(Math.max(2, Math.sqrt(mass) * 1.5));
        for (let dy = -r; dy <= r; dy++) {
            for (let dx = -r; dx <= r; dx++) {
                const dist = Math.sqrt(dx*dx + dy*dy);
                if (dist > r) continue;
                const x = ((cx+dx)%this.n+this.n)%this.n;
                const y = ((cy+dy)%this.n+this.n)%this.n;
                const i = y * this.n + x;
                if (dist < r * 0.3) this.psi[i] = Math.max(this.psi[i], mass * 2);
                else this.psi[i] = Math.max(this.psi[i], mass * (1 - dist/r));
            }
        }
    }
    blackHoleAccrete(cx, cy, mass, ehR) {
        const accR = Math.ceil(Math.max(4, Math.sqrt(mass) * 4));
        let swallowed = 0;
        for (let dy = -accR; dy <= accR; dy++) {
            for (let dx = -accR; dx <= accR; dx++) {
                const dist = Math.sqrt(dx*dx + dy*dy);
                if (dist < 0.5 || dist > accR) continue;
                const x = ((cx+dx)%this.n+this.n)%this.n;
                const y = ((cy+dy)%this.n+this.n)%this.n;
                const i = y * this.n + x;
                const accRate = mass * 0.005 / (dist * dist);
                const extracted = Math.min(this.psi[i], accRate);
                this.psi[i] -= extracted;
                swallowed += extracted;
                if (dist < ehR) { swallowed += this.psi[i]; this.psi[i] = 0.01; }
            }
        }
        return swallowed;
    }
}

// ============================================================
//  BUG审查一：黑洞信息守恒
//  怀疑bug: bhMass += swallowed * 0.1 只记录了10%
// ============================================================
console.log('='.repeat(70));
console.log('BUG审查一：黑洞信息守恒 — bhMass += swallowed * 0.1 是bug吗?');
console.log('='.repeat(70));

const n = 64;
const uni = new Universe(n);
for (let i = 0; i < 200; i++) uni.evolve();
const infoBefore = uni.totalInfo();

const uniCtrl = new Universe(n);
for (let i = 0; i < 200; i++) uniCtrl.evolve();
const ctrlBefore = uniCtrl.totalInfo();

uni.createBlackHole(32, 32, 5.0);
const afterBH = uni.totalInfo();
const injectedMass = afterBH - infoBefore;

console.log(`\n初始信息: ${infoBefore.toFixed(2)}`);
console.log(`黑洞注入后: ${afterBH.toFixed(2)} (注入了${injectedMass.toFixed(2)}到场中)`);
console.log(`\n关键：totalInfo()只计算场信息psi[]，不计算黑洞质量bhMass`);
console.log(`吸积函数从场中提取swallowed，但黑洞质量只增加swallowed*0.1\n`);

// 跟踪所有信息流
let bhMass_buggy = 5.0;     // 有bug的版本: swallowed * 0.1
let bhMass_fixed = 5.0;      // 修正版: swallowed * 1.0
let totalSwallowed = 0;      // 累计所有被吸积的信息
let totalEvaporated_buggy = 0;
let totalEvaporated_fixed = 0;

console.log('tick   场信息     对照组   swallowed  bhMass(buggy)  bhMass(固定)  场+bh(buggy)  场+bh(固定)');
console.log('-'.repeat(110));

for (let step = 0; step < 120; step++) {
    uni.evolve();
    uniCtrl.evolve();
    const swallowed = uni.blackHoleAccrete(32, 32, Math.max(bhMass_buggy, 1), 3.4);
    totalSwallowed += swallowed;

    // buggy版本 (原代码)
    bhMass_buggy += swallowed * 0.1;
    const evap_buggy = 0.0001 / (bhMass_buggy * bhMass_buggy + 0.1);
    bhMass_buggy -= evap_buggy;
    totalEvaporated_buggy += evap_buggy;

    // 修正版本
    bhMass_fixed += swallowed;  // 记录全部吸积信息
    const evap_fixed = 0.0001 / (bhMass_fixed * bhMass_fixed + 0.1);
    bhMass_fixed -= evap_fixed;
    totalEvaporated_fixed += evap_fixed;

    if (step % 20 === 0) {
        const infoNow = uni.totalInfo();
        const ctrlNow = uniCtrl.totalInfo();
        const total_buggy = infoNow + bhMass_buggy;
        const total_fixed = infoNow + bhMass_fixed;
        console.log(
            `${String(uni.tick).padStart(4)}   ` +
            `${infoNow.toFixed(1).padStart(9)}   ` +
            `${ctrlNow.toFixed(1).padStart(7)}   ` +
            `${swallowed.toFixed(1).padStart(9)}   ` +
            `${bhMass_buggy.toFixed(1).padStart(13)}   ` +
            `${bhMass_fixed.toFixed(1).padStart(13)}   ` +
            `${total_buggy.toFixed(1).padStart(13)}   ` +
            `${total_fixed.toFixed(1).padStart(13)}`
        );
    }
}

const finalInfo = uni.totalInfo();
const finalCtrl = uniCtrl.totalInfo();

console.log(`\n--- 信息守恒分析 ---`);
console.log(`黑洞注入后总信息(场): ${afterBH.toFixed(2)}`);
console.log(`最终场信息: ${finalInfo.toFixed(2)}`);
console.log(`对照组漂移: ${(finalCtrl - ctrlBefore).toFixed(2)}`);
console.log(`\n累计吸积信息(swallowed): ${totalSwallowed.toFixed(2)}`);
console.log(`\n有bug版本 (bhMass += swallowed * 0.1):`);
console.log(`  最终bhMass: ${bhMass_buggy.toFixed(2)}`);
console.log(`  场+bhMass: ${(finalInfo + bhMass_buggy).toFixed(2)}`);
console.log(`  相对afterBH变化: ${((finalInfo + bhMass_buggy) - afterBH).toFixed(2)}`);
console.log(`  相对afterBH变化率: ${(((finalInfo + bhMass_buggy) - afterBH) / afterBH * 100).toFixed(2)}%`);

console.log(`\n修正版本 (bhMass += swallowed):`);
console.log(`  最终bhMass: ${bhMass_fixed.toFixed(2)}`);
console.log(`  场+bhMass: ${(finalInfo + bhMass_fixed).toFixed(2)}`);
console.log(`  相对afterBH变化: ${((finalInfo + bhMass_fixed) - afterBH).toFixed(2)}`);
console.log(`  相对afterBH变化率: ${(((finalInfo + bhMass_fixed) - afterBH) / afterBH * 100).toFixed(2)}%`);

const ctrlDrift = finalCtrl - ctrlBefore;
console.log(`\n扣除对照组漂移后:`);
console.log(`  有bug: 物理泄漏 = ${((finalInfo + bhMass_buggy) - afterBH - ctrlDrift).toFixed(2)}`);
console.log(`  修正:  物理泄漏 = ${((finalInfo + bhMass_fixed) - afterBH - ctrlDrift).toFixed(2)}`);

const conservBuggy = 1 - Math.abs(((finalInfo + bhMass_buggy) - afterBH - ctrlDrift)) / afterBH;
const conservFixed = 1 - Math.abs(((finalInfo + bhMass_fixed) - afterBH - ctrlDrift)) / afterBH;
console.log(`\n信息守恒率:`);
console.log(`  有bug版本: ${(conservBuggy * 100).toFixed(1)}%`);
console.log(`  修正版本: ${(conservFixed * 100).toFixed(1)}%`);
console.log(`\n结论: ${conservFixed > 0.95 ? '✓ 修正后信息守恒成立！bhMass += swallowed*0.1 确实是bug' : '✗ 仍有泄漏'}`);
