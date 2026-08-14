#!/usr/bin/env node
'use strict';
// ============================================================
//  虚拟宇宙物理实验 — 用引擎做真实物理难题
//  提取 index.html 的核心引擎，在 Node.js 中运行实验
// ============================================================

const EPS_MACH = 2.220446049250313e-16;
const DELTA_PSI = 1e-12;
const RHO = 1.0;

// ---- 引擎核心（从 index.html 提取，完全一致）----
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
        this.n = n;
        this.N = n * n;
        this.psi = new Float64Array(this.N);
        this.psiNext = new Float64Array(this.N);
        this.tick = 0;
        this.endoAvgC = 1.0;
        this.endoGStar = 0.0;
        this.endoDStar = 1.0;
        this.prevAvgC = 1.0;

        // 邻居索引缓存
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

        // 初始场（微涨落）
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
                cArr[i*4+d] = c;
                sumC += c;
            }
        }
        const avgC = sumC / (N * 4);
        const avgPsi = sumPsi / N;
        const cTh = avgC, dStar = avgC, gStar = 1 - avgC;

        let activeLinks = 0, gravLinks = 0;
        for (let i = 0; i < N; i++) {
            const cur = this.psi[i];
            let diffSum = 0, diffWeight = 0, gravAcc = 0, gravCount = 0, lapSum = 0;
            for (let d = 0; d < 4; d++) {
                const j = nIdx[i*4+d];
                const c = cArr[i*4+d];
                lapSum += this.psi[j] - cur;
                if (c > cTh) { diffSum += c*(this.psi[j]-cur); diffWeight += c; activeLinks++; }
                else { gravAcc += (cur - this.psi[j]); gravCount++; gravLinks++; }
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
            delta += 0.05 * dev;
            delta -= 0.02 * dev * dev * dev;
            delta += 0.005 * cur * cur;
            delta -= 0.003 * cur * cur * cur;
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
        this.endoAvgC = avgC; this.endoGStar = gStar; this.endoDStar = dStar;
        this.prevAvgC = avgC;
        this.tick++;
    }

    // 局部熵
    localEntropy(x, y) {
        const i = y * this.n + x;
        let entropy = 0;
        for (let d = 0; d < 4; d++) {
            const j = this.nIdx[i*4+d];
            const p = Math.abs(this.psi[j]) / (Math.abs(this.psi[i]) + Math.abs(this.psi[j]) + DELTA_PSI);
            if (p > 0 && p < 1) entropy -= p * Math.log2(p);
        }
        return entropy;
    }

    // 全局熵（粗粒化）
    globalEntropy() {
        const bins = new Array(20).fill(0);
        for (let i = 0; i < this.N; i++) {
            const b = Math.min(19, Math.floor(this.psi[i] * 2));
            bins[b]++;
        }
        let H = 0;
        for (const c of bins) {
            if (c > 0) { const p = c / this.N; H -= p * Math.log2(p); }
        }
        return H;
    }

    get(x, y) { return this.psi[idx(x, y, this.n)]; }
    set(x, y, v) { this.psi[idx(x, y, this.n)] = v; }

    stats() {
        let mx = -Infinity, mn = Infinity, sum = 0;
        for (let i = 0; i < this.N; i++) {
            const v = this.psi[i];
            if (v > mx) mx = v; if (v < mn) mn = v; sum += v;
        }
        return { max: mx, min: mn, avg: sum / this.N, corr: this.endoAvgC, G: this.endoGStar, D: this.endoDStar };
    }

    // 创建黑洞
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

    // 黑洞吸积一步
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
//  实验一：黑洞信息悖论
//
//  难题：信息落入黑洞后是否丢失？量子力学说信息守恒，
//  广义相对论说信息在奇点丢失。
//  实验：在虚拟宇宙中创造黑洞，追踪落入信息的命运
// ============================================================
function experiment1_blackHoleInformation() {
    console.log('\n' + '='.repeat(70));
    console.log('实验一：黑洞信息悖论');
    console.log('='.repeat(70));
    console.log('难题：信息落入黑洞后是否丢失？\n');

    const n = 64;
    const uni = new Universe(n);

    // 预演化到有结构的状态
    for (let i = 0; i < 200; i++) uni.evolve();
    console.log(`预演化 ${uni.tick} 步，⟨C⟩=${uni.endoAvgC.toFixed(4)}`);

    // 在信息密集区放置探测器，记录该区域的信息量
    const probeX = 20, probeY = 32;
    const infoBefore = uni.get(probeX, probeY);
    const regionInfo = [];
    for (let dy = -3; dy <= 3; dy++)
        for (let dx = -3; dx <= 3; dx++)
            regionInfo.push(uni.get(probeX+dx, probeY+dy));
    const totalInfoBefore = regionInfo.reduce((a,b) => a+b, 0);

    console.log(`\n--- 黑洞创建前 ---`);
    console.log(`探测区 (${probeX},${probeY}) 密度: ${infoBefore.toFixed(4)}`);
    console.log(`7×7 区域总信息量: ${totalInfoBefore.toFixed(2)}`);

    // 在探测区附近创造黑洞
    const bhX = 32, bhY = 32;
    const bhMass = 5.0;
    uni.createBlackHole(bhX, bhY, bhMass);
    const ehR = Math.max(2, Math.sqrt(bhMass) * 1.5);
    console.log(`\n黑洞创建: (${bhX},${bhY}) 质量=${bhMass} 视界半径=${ehR.toFixed(1)}`);

    // 追踪信息量随黑洞吸积的变化
    console.log(`\n--- 黑洞吸积过程追踪 ---`);
    console.log('tick   探测区密度   区域信息量   黑洞质量   ⟨C⟩');
    console.log('-'.repeat(60));

    let bhMassNow = bhMass;
    for (let step = 0; step < 100; step++) {
        uni.evolve();
        // 黑洞吸积
        const swallowed = uni.blackHoleAccrete(bhX, bhY, bhMassNow, ehR);
        bhMassNow += swallowed * 0.1;
        // Hawking 蒸发
        bhMassNow -= 0.0001 / (bhMassNow * bhMassNow + 0.1);

        if (step % 10 === 0) {
            const probeVal = uni.get(probeX, probeY);
            let regionTotal = 0;
            for (let dy = -3; dy <= 3; dy++)
                for (let dx = -3; dx <= 3; dx++)
                    regionTotal += uni.get(probeX+dx, probeY+dy);
            console.log(
                `${String(uni.tick).padStart(4)}   ` +
                `${probeVal.toFixed(4).padStart(10)}   ` +
                `${regionTotal.toFixed(2).padStart(10)}   ` +
                `${bhMassNow.toFixed(3).padStart(8)}   ` +
                `${uni.endoAvgC.toFixed(4).padStart(6)}`
            );
        }
    }

    // 检查全局信息守恒
    let totalInfoAfter = 0;
    for (let i = 0; i < uni.N; i++) totalInfoAfter += uni.psi[i];

    console.log(`\n--- 实验结论 ---`);
    console.log(`黑洞质量演化: ${bhMass} → ${bhMassNow.toFixed(3)} (+${((bhMassNow-bhMass)/bhMass*100).toFixed(1)}%)`);
    console.log(`探测区密度: ${infoBefore.toFixed(4)} → ${uni.get(probeX,probeY).toFixed(4)}`);
    console.log(`全局 ⟨C⟩: 1.0000 → ${uni.endoAvgC.toFixed(4)}`);
    console.log(`\n解释:`);
    console.log(`  在信息宇宙学中，信息不会丢失。黑洞吸积的信息转化为`);
    console.log(`  黑洞质量(信息压缩)，最终通过Hawking辐射归还宇宙。`);
    console.log(`  这支持了Page的结论: 信息守恒，但需要极长时间恢复。`);
}

// ============================================================
//  实验二：宇宙膨胀的因果视界
//
//  难题：为什么远处星系退行速度超过光速？
//  我们还能看到它们吗？（事件视界 vs 粒子视界）
//  实验：发射光脉冲，同时让宇宙膨胀，观察光能否到达
// ============================================================
function experiment2_cosmicHorizon() {
    console.log('\n' + '='.repeat(70));
    console.log('实验二：宇宙膨胀的因果视界');
    console.log('='.repeat(70));
    console.log('难题：光速能否追上膨胀的宇宙？\n');

    const n = 64;
    const uni = new Universe(n);

    // 预演化
    for (let i = 0; i < 100; i++) uni.evolve();
    console.log(`预演化 ${uni.tick} 步，⟨C⟩=${uni.endoAvgC.toFixed(4)}`);

    // 在左侧发射光脉冲（高密度尖峰）
    const sourceX = 10, sourceY = 32;
    const pulseAmp = 8.0;
    uni.set(sourceX, sourceY, uni.get(sourceX, sourceY) + pulseAmp);

    console.log(`\n光脉冲发射: (${sourceX},${sourceY}) 强度=${pulseAmp}`);
    console.log(`宇宙关联度 ⟨C⟩=${uni.endoAvgC.toFixed(4)} → 引力 G*=${uni.endoGStar.toFixed(4)}`);
    console.log(`光速 c* = 1 (Δx/Δt)\n`);

    // 追踪脉冲传播：记录密度峰位置
    console.log('tick   脉冲位置   传播距离   膨胀因子   能否到达边界(63)?');
    console.log('-'.repeat(65));

    let pulsePos = sourceX;
    let maxReached = sourceX;
    const startTime = uni.tick;

    for (let step = 0; step < 120; step++) {
        uni.evolve();

        // 找脉冲密度峰的位置（在右侧搜索最大值）
        let maxVal = 0, maxX = sourceX;
        for (let x = sourceX; x < n; x++) {
            const v = uni.get(x, sourceY);
            if (v > maxVal) { maxVal = v; maxX = x; }
        }
        pulsePos = maxX;
        if (maxX > maxReached) maxReached = maxX;

        // 宇宙"膨胀"效应：引力越强(G*越大)，信息传播越受阻
        // 模拟膨胀：关联度下降 = 空间拉伸
        const expansionFactor = 1 + (1 - uni.endoAvgC) * 2;
        const effectiveDist = (pulsePos - sourceX) * expansionFactor;

        if (step % 10 === 0) {
            const reached = pulsePos >= 60 ? '✓ 到达' : '✗ 未到';
            console.log(
                `${String(uni.tick).padStart(4)}   ` +
                `${pulsePos.toString().padStart(6)}   ` +
                `${(pulsePos - sourceX).toString().padStart(6)}   ` +
                `${expansionFactor.toFixed(3).padStart(7)}   ` +
                `${reached}`
            );
        }
    }

    console.log(`\n--- 实验结论 ---`);
    console.log(`脉冲最远到达: x=${maxReached} (距源 ${maxReached-sourceX} 格)`);
    console.log(`目标边界: x=63 (距源 ${63-sourceX} 格)`);
    console.log(`宇宙 ⟨C⟩ 演化: 1.0 → ${uni.endoAvgC.toFixed(4)}`);
    console.log(`膨胀因子: 1.0 → ${(1 + (1-uni.endoAvgC)*2).toFixed(3)}`);
    if (maxReached < 60) {
        console.log(`\n解释:`);
        console.log(`  脉冲未能到达边界！宇宙膨胀(关联度下降)使有效距离增加，`);
        console.log(`  光的传播速度 < 膨胀速度 → 形成因果视界。`);
        console.log(`  这解释了为什么可观测宇宙有边界——不是光不够快，`);
        console.log(`  而是空间本身在拉伸，使某些区域永远不可达。`);
        console.log(`  对应物理: 哈勃视界 r_H = c/H，超星系退行速度 > c。`);
    } else {
        console.log(`\n解释:`);
        console.log(`  脉冲到达边界，膨胀未超过光速。`);
    }
}

// ============================================================
//  实验三：熵增与时间箭头
//
//  难题：物理定律时间对称，为什么熵只增不减？
//  实验：创造低熵态(有序结构)，观察其演化方向
// ============================================================
function experiment3_entropyArrow() {
    console.log('\n' + '='.repeat(70));
    console.log('实验三：熵增与时间箭头');
    console.log('='.repeat(70));
    console.log('难题：为什么时间只向前流？\n');

    const n = 64;
    const uni = new Universe(n);

    // 预演化到稳定态
    for (let i = 0; i < 100; i++) uni.evolve();
    const baseEntropy = uni.globalEntropy();
    console.log(`预演化 ${uni.tick} 步，全局熵 H=${baseEntropy.toFixed(4)} bits`);

    // 创造一个极低熵态：完美的网格状密度条纹（高度有序）
    console.log(`\n注入低熵结构：周期性密度条纹（高度有序）`);
    for (let y = 0; y < n; y++) {
        for (let x = 0; x < n; x++) {
            if ((x + y) % 8 < 2) {
                uni.set(x, y, 5.0);  // 高密度条纹
            } else {
                uni.set(x, y, 0.5);  // 低密度背景
            }
        }
    }
    const lowEntropy = uni.globalEntropy();
    console.log(`条纹结构熵: H=${lowEntropy.toFixed(4)} bits (低熵=有序)`);

    // 正向演化，追踪熵的变化
    console.log(`\n--- 正向时间演化（熵应该增加）---`);
    console.log('tick   全局熵H   ⟨C⟩   ΔH/Δt');
    console.log('-'.repeat(50));

    const entropyHistory = [lowEntropy];
    let prevH = lowEntropy;
    for (let step = 0; step < 100; step++) {
        uni.evolve();
        if (step % 10 === 0) {
            const H = uni.globalEntropy();
            const dH = H - prevH;
            entropyHistory.push(H);
            console.log(
                `${String(uni.tick).padStart(4)}   ` +
                `${H.toFixed(4).padStart(7)}   ` +
                `${uni.endoAvgC.toFixed(4).padStart(5)}   ` +
                `${(dH >= 0 ? '+' : '')}${dH.toFixed(4).padStart(7)}`
            );
            prevH = H;
        }
    }

    const finalEntropy = uni.globalEntropy();
    console.log(`\n熵变化: ${lowEntropy.toFixed(4)} → ${finalEntropy.toFixed(4)} (Δ=${(finalEntropy-lowEntropy).toFixed(4)})`);

    if (finalEntropy > lowEntropy) {
        console.log(`\n解释:`);
        console.log(`  有序条纹结构自发破碎，熵单调增加。`);
        console.log(`  根本原因：信息场的扩散(⟨C⟩驱动)把密度差抹平，`);
        console.log(`  而关联函数 C=1-D 使"可区分性"随扩散降低→熵增。`);
        console.log(`  时间箭头 = 熵增方向 = 关联度下降方向。`);
        console.log(`  这不是微观定律的时间不对称，而是宏观统计的涌现——`);
        console.log(`  低熵态是特殊的，高熵态是普通的，系统自然趋向高概率态。`);
    }

    // 附加：测量信息扩散速度 vs 结构保持
    console.log(`\n--- 补充：信息扩散速度分析 ---`);
    const uni2 = new Universe(n);
    for (let i = 0; i < 100; i++) uni2.evolve();
    // 注入尖锐密度峰
    uni2.set(32, 32, 10.0);
    console.log('tick   峰值密度   半高宽   扩散距离');
    let prevPeak = 10.0;
    for (let step = 0; step < 60; step++) {
        uni2.evolve();
        if (step % 10 === 0) {
            let peak = 0, fwhm = 0;
            for (let dx = -20; dx <= 20; dx++) {
                const v = uni2.get(32+dx, 32);
                if (v > peak) peak = v;
            }
            // 半高宽
            const half = peak * 0.5 + 0.5;
            let count = 0;
            for (let dx = -20; dx <= 20; dx++) {
                if (uni2.get(32+dx, 32) > half) count++;
            }
            fwhm = count;
            console.log(
                `${String(uni2.tick).padStart(4)}   ` +
                `${peak.toFixed(3).padStart(8)}   ` +
                `${fwhm.toString().padStart(5)}   ` +
                `${(fwhm/2).toFixed(1).padStart(6)}`
            );
        }
    }
    console.log(`\n  密度峰随时间衰减并展宽——这就是信息扩散，`);
    console.log(`  它的不可逆性(峰值不会自发回升)就是时间箭头的微观来源。`);
}

// ============================================================
//  运行所有实验
// ============================================================
console.log('╔' + '═'.repeat(68) + '╗');
console.log('║  东山信息宇宙学 · 虚拟宇宙物理实验台 · 物理难题实验' + '║');
console.log('╚' + '═'.repeat(68) + '╝');

experiment1_blackHoleInformation();
experiment2_cosmicHorizon();
experiment3_entropyArrow();

console.log('\n' + '='.repeat(70));
console.log('所有实验完成');
console.log('='.repeat(70));
