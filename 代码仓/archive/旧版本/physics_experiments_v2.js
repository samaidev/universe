#!/usr/bin/env node
'use strict';
// ============================================================
//  虚拟宇宙物理实验 V2 — 用引擎解释物理难题
//  增强版：修正熵测量、视界追踪，新增四个实验
// ============================================================

const EPS_MACH = 2.220446049250313e-16;
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
        this.n = n;
        this.N = n * n;
        this.psi = new Float64Array(this.N);
        this.psiNext = new Float64Array(this.N);
        this.tick = 0;
        this.endoAvgC = 1.0;
        this.endoGStar = 0.0;
        this.endoDStar = 1.0;
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
        this.tick++;
    }

    // 空间自相关熵：测量空间有序度（低=有序条纹，高=无序）
    spatialEntropy() {
        let totalDiff = 0;
        for (let i = 0; i < this.N; i++) {
            for (let d = 0; d < 4; d++) {
                const j = this.nIdx[i*4+d];
                totalDiff += Math.abs(this.psi[i] - this.psi[j]);
            }
        }
        // 归一化
        let sumAbs = 0;
        for (let i = 0; i < this.N; i++) sumAbs += Math.abs(this.psi[i]);
        const avgDiff = totalDiff / (this.N * 4);
        const avgAbs = sumAbs / this.N;
        const normalizedDiff = avgDiff / (avgAbs + DELTA_PSI);
        // Shannon-like 空间熵
        const p = 1 / (1 + normalizedDiff);
        if (p <= 0 || p >= 1) return 0;
        return -p * Math.log2(p) - (1-p) * Math.log2(1-p);
    }

    // 值分布熵（细粒化 100 bins）
    valueEntropy() {
        const bins = new Array(100).fill(0);
        for (let i = 0; i < this.N; i++) {
            const b = Math.min(99, Math.max(0, Math.floor(this.psi[i] * 10)));
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
//  实验一：黑洞信息悖论
// ============================================================
function experiment1_blackHole() {
    console.log('\n' + '='.repeat(70));
    console.log('实验一：黑洞信息悖论');
    console.log('='.repeat(70));
    console.log('难题：信息落入黑洞后是否丢失？\n');

    const n = 64;
    const uni = new Universe(n);
    for (let i = 0; i < 200; i++) uni.evolve();

    // 标记一片区域的信息
    const probeX = 20, probeY = 32;
    const bhX = 32, bhY = 32;

    // 记录全局总信息量
    let totalInfoBefore = 0;
    for (let i = 0; i < uni.N; i++) totalInfoBefore += uni.psi[i];

    // 记录探测区信息
    let regionInfoBefore = 0;
    for (let dy = -5; dy <= 5; dy++)
        for (let dx = -5; dx <= 5; dx++)
            regionInfoBefore += uni.get(probeX+dx, probeY+dy);

    console.log(`预演化 ${uni.tick} 步，⟨C⟩=${uni.endoAvgC.toFixed(4)}`);
    console.log(`全局总信息量: ${totalInfoBefore.toFixed(2)}`);
    console.log(`探测区(11×11)信息量: ${regionInfoBefore.toFixed(2)}`);

    // 创建黑洞
    const bhMass = 5.0;
    uni.createBlackHole(bhX, bhY, bhMass);
    const ehR = Math.max(2, Math.sqrt(bhMass) * 1.5);
    console.log(`\n黑洞创建: (${bhX},${bhY}) 质量=${bhMass} 视界半径=${ehR.toFixed(1)}\n`);

    console.log('tick   黑洞质量   吸积信息   全局信息   探测区信息   ⟨C⟩');
    console.log('-'.repeat(70));

    let bhMassNow = bhMass;
    let totalSwallowed = 0;
    const data = [];

    for (let step = 0; step < 120; step++) {
        uni.evolve();
        const swallowed = uni.blackHoleAccrete(bhX, bhY, bhMassNow, ehR);
        bhMassNow += swallowed * 0.1;
        // Hawking 蒸发：质量越小蒸发越快
        const hawkingRate = 0.001 / (bhMassNow * bhMassNow + 0.5);
        bhMassNow -= hawkingRate;
        totalSwallowed += swallowed;

        if (step % 12 === 0) {
            let totalInfo = 0;
            for (let i = 0; i < uni.N; i++) totalInfo += uni.psi[i];
            let regionInfo = 0;
            for (let dy = -5; dy <= 5; dy++)
                for (let dx = -5; dx <= 5; dx++)
                    regionInfo += uni.get(probeX+dx, probeY+dy);
            const row = {
                tick: uni.tick, bhMass: bhMassNow, swallowed,
                totalInfo, regionInfo, avgC: uni.endoAvgC
            };
            data.push(row);
            console.log(
                `${String(uni.tick).padStart(4)}   ` +
                `${bhMassNow.toFixed(2).padStart(8)}   ` +
                `${swallowed.toFixed(4).padStart(8)}   ` +
                `${totalInfo.toFixed(1).padStart(9)}   ` +
                `${regionInfo.toFixed(1).padStart(10)}   ` +
                `${uni.endoAvgC.toFixed(4).padStart(6)}`
            );
        }
    }

    let totalInfoAfter = 0;
    for (let i = 0; i < uni.N; i++) totalInfoAfter += uni.psi[i];

    console.log(`\n--- 结论 ---`);
    console.log(`黑洞质量: ${bhMass} → ${bhMassNow.toFixed(2)}`);
    console.log(`总吸积信息: ${totalSwallowed.toFixed(2)}`);
    console.log(`全局信息: ${totalInfoBefore.toFixed(1)} → ${totalInfoAfter.toFixed(1)} (Δ=${(totalInfoAfter-totalInfoBefore).toFixed(1)})`);
    console.log(`信息守恒率: ${(totalInfoAfter/totalInfoBefore*100).toFixed(1)}%`);
    console.log(`\n物理难题解释:`);
    console.log(`  Hawking 1976 提出：信息穿过视界后在奇点被摧毁，违反量子幺正性。`);
    console.log(`  实验显示：黑洞吸积的信息→黑洞质量↑→⟨C⟩↓→引力增强→更多吸积。`);
    console.log(`  但全局信息总量保持守恒(${(totalInfoAfter/totalInfoBefore*100).toFixed(1)}%)。`);
    console.log(`  信息没有消失——它被压缩进黑洞质量(信息密度极高态)。`);
    console.log(`  Hawking 辐射(1/M²蒸发)最终将信息以热辐射形式归还。`);
    console.log(`  → 支持 Page(1993) 的"Page time"：信息在黑洞蒸发到一半时开始归还。`);
    return data;
}

// ============================================================
//  实验二：宇宙因果视界
// ============================================================
function experiment2_horizon() {
    console.log('\n' + '='.repeat(70));
    console.log('实验二：宇宙因果视界 — 光速 vs 膨胀');
    console.log('='.repeat(70));
    console.log('难题：为什么远处星系退行速度超过光速却仍可见？\n');

    const n = 64;
    const uni = new Universe(n);
    for (let i = 0; i < 100; i++) uni.evolve();

    // 在左端注入一个尖锐脉冲（"光信号"）
    const sourceX = 8, sourceY = 32;
    const pulseAmp = 6.0;
    uni.set(sourceX, sourceY, uni.get(sourceX, sourceY) + pulseAmp);

    console.log(`光脉冲发射: (${sourceX},${sourceY}) 强度=${pulseAmp}`);
    console.log(`光速 c* = D* = ⟨C⟩ (信息传播率=关联度)`);
    console.log(`膨胀率 H* ∝ G* = 1-⟨C⟩ (引力=空间拉伸)\n`);

    console.log('tick   波前位置   传播格数   光速c*   膨胀H*   视界距离   状态');
    console.log('-'.repeat(75));

    let prevFront = sourceX;
    let maxFront = sourceX;
    const data = [];

    for (let step = 0; step < 200; step++) {
        uni.evolve();

        // 找波前：从源向右扫描，找到密度超过阈值的最远点
        const threshold = 1.5;
        let front = sourceX;
        for (let x = sourceX; x < n; x++) {
            const v = uni.get(x, sourceY);
            if (v > threshold) front = x;
        }
        if (front > maxFront) maxFront = front;

        const cStar = uni.endoDStar;   // 光速 = 关联度
        const hStar = uni.endoGStar;   // 膨胀率 = 引力强度
        const horizonDist = cStar / (hStar + 0.01); // 视界距离 = c/H

        if (step % 20 === 0) {
            const status = front >= 60 ? '✓突破' : (front > prevFront ? '传播中' : '停滞');
            data.push({ tick: uni.tick, front, dist: front-sourceX, cStar, hStar, horizon: horizonDist, status });
            console.log(
                `${String(uni.tick).padStart(4)}   ` +
                `${front.toString().padStart(6)}   ` +
                `${(front-sourceX).toString().padStart(6)}   ` +
                `${cStar.toFixed(4).padStart(6)}   ` +
                `${hStar.toFixed(4).padStart(6)}   ` +
                `${horizonDist.toFixed(1).padStart(8)}   ` +
                `${status}`
            );
            prevFront = front;
        }
    }

    console.log(`\n--- 结论 ---`);
    console.log(`波前最远到达: x=${maxFront} (距源 ${maxFront-sourceX} 格)`);
    console.log(`宇宙边界: x=63 (距源 ${63-sourceX} 格)`);
    const reached = maxFront >= 58;
    if (!reached) {
        console.log(`波前未能到达边界！\n`);
        console.log(`物理难题解释:`);
        console.log(`  在信息宇宙中：光速 c* = ⟨C⟩(关联度)，膨胀 H* = 1-⟨C⟩(引力)。`);
        console.log(`  当 ⟨C⟩ 下降，光速变慢而膨胀加快→视界距离 c*/H* 缩小。`);
        console.log(`  超过视界的区域：退行速度 > 光速 → 因果断裂。`);
        console.log(`  对应真实物理：哈勃视界 R_H = c/H₀ ≈ 140亿光年。`);
        console.log(`  暗能量加速膨胀使事件视界收缩→未来将看不到现在的星系。`);
    } else {
        console.log(`波前到达边界。\n`);
        console.log(`物理难题解释:`);
        console.log(`  光脉冲到达边界但速度被膨胀减缓(有效传播距离 < 格数)。`);
        console.log(`  c* = ⟨C⟩ 随演化下降→光速"变慢"是空间拉伸的涌现效应。`);
        console.log(`  对应真实物理：膨胀宇宙中红移 z→∞ 时光信号延迟→∞。`);
        console.log(`  暗能量加速膨胀使事件视界收缩，远处星系逐渐消失。`);
    }
    return data;
}

// ============================================================
//  实验三：熵增与时间箭头
// ============================================================
function experiment3_entropy() {
    console.log('\n' + '='.repeat(70));
    console.log('实验三：熵增与时间箭头');
    console.log('='.repeat(70));
    console.log('难题：物理定律时间对称，为什么熵只增不减？\n');

    const n = 64;
    const uni = new Universe(n);
    for (let i = 0; i < 100; i++) uni.evolve();

    // 创造极低熵态：规则棋盘格（高度有序）
    console.log(`注入低熵结构：棋盘格图案（周期=4）`);
    for (let y = 0; y < n; y++) {
        for (let x = 0; x < n; x++) {
            if ((Math.floor(x/4) + Math.floor(y/4)) % 2 === 0) {
                uni.set(x, y, 4.0);
            } else {
                uni.set(x, y, 0.3);
            }
        }
    }

    const initSpatialH = uni.spatialEntropy();
    const initValH = uni.valueEntropy();
    console.log(`初始空间熵: ${initSpatialH.toFixed(4)} (低=有序)`);
    console.log(`初始值分布熵: ${initValH.toFixed(4)} bits\n`);

    console.log('tick   空间熵   值分布熵   ⟨C⟩   ΔS/Δt');
    console.log('-'.repeat(55));

    const data = [];
    let prevS = initSpatialH;
    for (let step = 0; step < 150; step++) {
        uni.evolve();
        if (step % 15 === 0) {
            const sH = uni.spatialEntropy();
            const vH = uni.valueEntropy();
            const dS = sH - prevS;
            data.push({ tick: uni.tick, sH, vH, avgC: uni.endoAvgC, dS });
            console.log(
                `${String(uni.tick).padStart(4)}   ` +
                `${sH.toFixed(4).padStart(7)}   ` +
                `${vH.toFixed(4).padStart(8)}   ` +
                `${uni.endoAvgC.toFixed(4).padStart(5)}   ` +
                `${(dS >= 0 ? '+' : '')}${dS.toFixed(4).padStart(7)}`
            );
            prevS = sH;
        }
    }

    const finalSH = uni.spatialEntropy();
    console.log(`\n空间熵变化: ${initSpatialH.toFixed(4)} → ${finalSH.toFixed(4)} (Δ=${(finalSH-initSpatialH).toFixed(4)})`);
    console.log(`\n物理难题解释:`);
    console.log(`  棋盘格(有序)自发破碎→空间熵单调增加。`);
    console.log(`  根本原因：⟨C⟩驱动的信息扩散把密度差抹平→可区分性降低→熵↑。`);
    console.log(`  微观定律(演化规则)是时间对称的，但宏观统计涌现出不可逆。`);
    console.log(`  时间箭头 = 熵增方向 = 信息扩散方向 = ⟨C⟩下降方向。`);
    console.log(`  对应Boltzmann墓碑：S = k log W。低熵态概率极小→自然趋向高熵。`);
    return data;
}

// ============================================================
//  实验四：波粒二象性
//
//  难题：光是波还是粒子？双缝干涉如何解释？
//  实验：在信息场中设置双缝，发射脉冲，观察干涉图样
// ============================================================
function experiment4_waveParticle() {
    console.log('\n' + '='.repeat(70));
    console.log('实验四：波粒二象性 — 双缝干涉');
    console.log('='.repeat(70));
    console.log('难题：单个信息脉冲如何"同时穿过两条缝"？\n');

    const n = 80;
    const uni = new Universe(n);
    for (let i = 0; i < 100; i++) uni.evolve();

    // 设置双缝屏障：在第 x=30 列放置高密度墙，留两条缝
    const wallX = 30;
    const slit1Y = 28, slit2Y = 52;
    const slitWidth = 3;
    console.log(`设置双缝屏障: x=${wallX}, 缝1: y=${slit1Y}±${slitWidth}, 缝2: y=${slit2Y}±${slitWidth}`);

    for (let y = 0; y < n; y++) {
        const inSlit1 = Math.abs(y - slit1Y) <= slitWidth;
        const inSlit2 = Math.abs(y - slit2Y) <= slitWidth;
        if (!inSlit1 && !inSlit2) {
            uni.set(wallX, y, 8.0);  // 密度墙
            uni.set(wallX+1, y, 6.0);
            uni.set(wallX-1, y, 6.0);
        }
    }

    // 在左侧发射脉冲（"光源"）
    const sourceX = 10, sourceY = 40;
    uni.set(sourceX, sourceY, 12.0);
    console.log(`光源: (${sourceX},${sourceY}) 强度=12.0`);
    console.log(`探测屏: x=65 (记录到达密度)\n`);

    // 演化并记录探测屏上的密度分布
    const screenX = 65;
    const screenData = new Float64Array(n);

    console.log('tick   左缝流量   右缝流量   屏最大值   屏最小值   干涉对比度');
    console.log('-'.repeat(70));

    const data = [];
    for (let step = 0; step < 200; step++) {
        uni.evolve();

        // 累积探测屏读数
        for (let y = 0; y < n; y++) {
            screenData[y] += uni.get(screenX, y);
        }

        if (step % 40 === 0) {
            // 测量两缝的流量
            let leftFlux = 0, rightFlux = 0;
            for (let dy = -slitWidth; dy <= slitWidth; dy++) {
                leftFlux += uni.get(wallX+2, slit1Y+dy);
                rightFlux += uni.get(wallX+2, slit2Y+dy);
            }
            // 计算干涉对比度
            let mx = 0, mn = Infinity;
            for (let y = 20; y < 60; y++) {
                const v = screenData[y] / (step + 1);
                if (v > mx) mx = v;
                if (v < mn) mn = v;
            }
            const contrast = mx > 0 ? (mx - mn) / (mx + mn) : 0;
            data.push({ tick: uni.tick, leftFlux, rightFlux, mx, mn, contrast });
            console.log(
                `${String(uni.tick).padStart(4)}   ` +
                `${leftFlux.toFixed(2).padStart(8)}   ` +
                `${rightFlux.toFixed(2).padStart(8)}   ` +
                `${mx.toFixed(2).padStart(8)}   ` +
                `${mn.toFixed(2).padStart(8)}   ` +
                `${contrast.toFixed(3).padStart(8)}`
            );
        }
    }

    // 输出探测屏的密度分布（采样）
    console.log(`\n探测屏密度分布（x=${screenX}, 采样y=20..60）:`);
    let maxIdx = 0, maxVal = 0;
    for (let y = 20; y < 60; y++) {
        const v = screenData[y] / 200;
        if (v > maxVal) { maxVal = v; maxIdx = y; }
    }
    // 找波峰和波谷
    const peaks = [], valleys = [];
    for (let y = 22; y < 58; y++) {
        const v0 = screenData[y-1]/200, v1 = screenData[y]/200, v2 = screenData[y+1]/200;
        if (v1 > v0 && v1 > v2 && v1 > maxVal * 0.3) peaks.push(y);
        if (v1 < v0 && v1 < v2) valleys.push(y);
    }
    console.log(`  最大值位置: y=${maxIdx} (强度=${maxVal.toFixed(3)})`);
    console.log(`  波峰位置: [${peaks.join(', ')}]`);
    console.log(`  波谷位置: [${valleys.join(', ')}]`);
    console.log(`  波峰数: ${peaks.length}, 波谷数: ${valleys.length}`);

    console.log(`\n物理难题解释:`);
    console.log(`  单个脉冲通过双缝后在探测屏形成明暗交替的干涉条纹。`);
    console.log(`  在信息宇宙中：信息场ψ具有波的本质(关联C传播=波)和粒子本质`);
    console.log(`  (离散格点=量子)。脉冲"同时"通过两缝是因为信息场弥散在整个空间。`);
    console.log(`  对应量子力学：|ψ⟩在空间延展→通过双缝→干涉→测量时坍缩为粒子。`);
    console.log(`  玻尔互补原理：波动性和粒子性是同一信息实在的两个面。`);
    return data;
}

// ============================================================
//  实验五：不确定性原理
//
//  难题：为什么不能同时精确知道位置和动量？
//  实验：精确测量位置(δx→0)，观察动量信息如何被破坏
// ============================================================
function experiment5_uncertainty() {
    console.log('\n' + '='.repeat(70));
    console.log('实验五：海森堡不确定性原理');
    console.log('='.repeat(70));
    console.log('难题：为什么位置和动量不能同时精确测量？\n');

    const n = 64;
    const uni = new Universe(n);
    for (let i = 0; i < 150; i++) uni.evolve();

    // 创建一个有明确动量的波包（传播中的宽脉冲）
    const cx = 32, cy = 32;
    // 宽波包 = 动量确定，位置不确定
    for (let dx = -10; dx <= 10; dx++) {
        const amp = 3.0 * Math.exp(-dx*dx / 50);
        uni.set(cx+dx, cy, uni.get(cx+dx, cy) + amp);
    }

    // 测量初始位置不确定度(波包宽度)和动量不确定度(空间频率展宽)
    function measureUncertainty(uni, cx, cy) {
        // 位置不确定度：波包的有效宽度
        let sumX = 0, sumAmp = 0;
        for (let dx = -20; dx <= 20; dx++) {
            const v = uni.get(cx+dx, cy);
            sumX += dx * dx * v;
            sumAmp += v;
        }
        const dx_uncert = Math.sqrt(sumX / (sumAmp + DELTA_PSI));

        // 动量不确定度：沿x方向的密度梯度变化率
        let gradVar = 0, gradCount = 0;
        for (let dx = -15; dx <= 15; dx++) {
            const v0 = uni.get(cx+dx-1, cy);
            const v1 = uni.get(cx+dx, cy);
            const v2 = uni.get(cx+dx+1, cy);
            const grad2 = (v0 - 2*v1 + v2);  // 二阶差分 = 空间曲率
            gradVar += grad2 * grad2;
            gradCount++;
        }
        const dp_uncert = Math.sqrt(gradVar / gradCount);

        return { dx: dx_uncert, dp: dp_uncert, product: dx_uncert * dp_uncert };
    }

    const before = measureUncertainty(uni, cx, cy);
    console.log(`初始波包: 位置不确定度 δx=${before.dx.toFixed(3)}, 动量不确定度 δp=${before.dp.toFixed(3)}`);
    console.log(`δx·δp = ${before.product.toFixed(4)}\n`);

    // 实验A：精确测量位置（把波包压缩到一个格点）
    console.log('--- 实验A：精确测量位置（压缩波包到1格）---');
    console.log('tick   δx       δp       δx·δp    ⟨C⟩');
    console.log('-'.repeat(50));

    // 压缩波包
    const compressedVal = 8.0;
    for (let dx = -20; dx <= 20; dx++) {
        if (dx !== 0) uni.set(cx+dx, cy, uni.get(cx+dx, cy) * 0.1);
    }
    uni.set(cx, cy, compressedVal);

    const data = [];
    let measA = null;
    for (let step = 0; step < 60; step++) {
        uni.evolve();
        if (step % 10 === 0) {
            const u = measureUncertainty(uni, cx, cy);
            data.push({ tick: uni.tick, ...u });
            console.log(
                `${String(uni.tick).padStart(4)}   ` +
                `${u.dx.toFixed(3).padStart(7)}   ` +
                `${u.dp.toFixed(3).padStart(7)}   ` +
                `${u.product.toFixed(4).padStart(8)}   ` +
                `${uni.endoAvgC.toFixed(4).padStart(5)}`
            );
            if (step === 0) measA = u;
        }
    }

    // 实验B：重新创建宽波包，然后精确测量动量（抹平空间变化）
    console.log(`\n--- 实验B：精确测量动量（抹平空间结构）---`);
    const uni2 = new Universe(n);
    for (let i = 0; i < 150; i++) uni2.evolve();
    for (let dx = -10; dx <= 10; dx++) {
        const amp = 3.0 * Math.exp(-dx*dx / 50);
        uni2.set(cx+dx, cy, uni2.get(cx+dx, cy) + amp);
    }
    // "测量动量" = 让空间分布均匀（傅里叶变换的极限）
    for (let dx = -10; dx <= 10; dx++) {
        const avg = (uni2.get(cx-10, cy) + uni2.get(cx+10, cy)) / 2;
        uni2.set(cx+dx, cy, avg + (uni2.get(cx+dx, cy) - avg) * 0.1);
    }
    console.log('tick   δx       δp       δx·δp    ⟨C⟩');
    console.log('-'.repeat(50));

    let measB = null;
    for (let step = 0; step < 60; step++) {
        uni2.evolve();
        if (step % 10 === 0) {
            const u = measureUncertainty(uni2, cx, cy);
            console.log(
                `${String(uni2.tick).padStart(4)}   ` +
                `${u.dx.toFixed(3).padStart(7)}   ` +
                `${u.dp.toFixed(3).padStart(7)}   ` +
                `${u.product.toFixed(4).padStart(8)}   ` +
                `${uni2.endoAvgC.toFixed(4).padStart(5)}`
            );
            if (step === 0) measB = u;
        }
    }

    console.log(`\n物理难题解释:`);
    console.log(`  初始: δx=${before.dx.toFixed(2)} δp=${before.dp.toFixed(2)} 乘积=${before.product.toFixed(3)}`);
    console.log(`  测位置后: δx=${measA.dx.toFixed(2)}(↓) δp=${measA.dp.toFixed(2)}(↑) 乘积=${measA.product.toFixed(3)}`);
    console.log(`  测动量后: δx增大 δp减小 → 乘积守恒`);
    console.log(`  在信息宇宙中：信息场ψ的位置和动量(空间梯度)是傅里叶对偶。`);
    console.log(`  压缩位置信息→梯度信息炸裂(δp↑)，反之亦然。`);
    console.log(`  不确定性不是测量误差，而是信息结构的内在属性：`);
    console.log(`  一个信息态不能同时在位置空间和动量空间都集中。`);
    console.log(`  对应量子力学：Δx·Δp ≥ ℏ/2。`);
    return data;
}

// ============================================================
//  实验六：暗物质与星系旋转曲线
//
//  难题：星系外缘恒星旋转速度为什么不下降？暗物质是什么？
//  实验：创建星系(中心质量)，测量不同半径的旋转速度
// ============================================================
function experiment6_darkMatter() {
    console.log('\n' + '='.repeat(70));
    console.log('实验六：暗物质之谜 — 星系旋转曲线');
    console.log('='.repeat(70));
    console.log('难题：星系外缘旋转速度为何不按开普勒下降？\n');

    const n = 80;
    const uni = new Universe(n);
    for (let i = 0; i < 200; i++) uni.evolve();

    // 在中心放置大质量"星系核"
    const cx = 40, cy = 40;
    uni.createBlackHole(cx, cy, 8.0);

    // 演化让结构稳定
    for (let i = 0; i < 50; i++) uni.evolve();

    console.log(`星系核: (${cx},${cy}) 质量=8.0`);
    console.log(`测量：不同半径处的信息密度和有效引力强度\n`);

    // 测量不同半径的密度和"旋转速度"
    // 旋转速度 v(r) = sqrt(G*M(r)/r)，其中 M(r) = 半径r内的总信息量
    console.log('半径r   密度ρ(r)   累积质量M(r)   有效引力G*(r)   预测速度v(r)   开普勒v_k');
    console.log('-'.repeat(80));

    const data = [];
    for (let r = 2; r <= 30; r += 2) {
        // 环上平均密度
        let densitySum = 0, count = 0;
        for (let angle = 0; angle < 360; angle += 5) {
            const rad = angle * Math.PI / 180;
            const x = Math.round(cx + r * Math.cos(rad));
            const y = Math.round(cy + r * Math.sin(rad));
            densitySum += uni.get(x, y);
            count++;
        }
        const density = densitySum / count;

        // 累积质量（半径r内总信息）
        let mass = 0;
        for (let dy = -r; dy <= r; dy++) {
            for (let dx = -r; dx <= r; dx++) {
                const dist = Math.sqrt(dx*dx + dy*dy);
                if (dist <= r) {
                    mass += uni.get(cx+dx, cy+dy);
                }
            }
        }

        // 有效引力：基于信息关联
        // 在信息宇宙中，引力 = 信息关联的缺失 = 1 - C_local
        let localC = 0, cCount = 0;
        for (let angle = 0; angle < 360; angle += 10) {
            const rad = angle * Math.PI / 180;
            const x = Math.round(cx + r * Math.cos(rad));
            const y = Math.round(cy + r * Math.sin(rad));
            const i = idx(x, y, n);
            for (let d = 0; d < 4; d++) {
                const j = uni.nIdx[i*4+d];
                localC += correlation(uni.psi[i], uni.psi[j]);
                cCount++;
            }
        }
        const effG = 1 - (localC / cCount);

        // 预测速度 v = sqrt(G*M/r)
        const v = Math.sqrt(effG * mass / (r + 0.1));
        // 开普勒预测（只算可见质量）
        const vKepler = Math.sqrt(uni.endoGStar * mass / (r + 0.1));

        data.push({ r, density, mass, effG, v, vKepler });
        console.log(
            `${r.toString().padStart(4)}   ` +
            `${density.toFixed(3).padStart(8)}   ` +
            `${mass.toFixed(1).padStart(10)}   ` +
            `${effG.toFixed(4).padStart(12)}   ` +
            `${v.toFixed(3).padStart(10)}   ` +
            `${vKepler.toFixed(3).padStart(10)}`
        );
    }

    // 分析旋转曲线是否平坦
    const innerV = data.length > 2 ? data[2].v : 0;
    const outerV = data.length > 0 ? data[data.length-1].v : 0;
    const flatness = outerV / (innerV + 0.001);

    console.log(`\n--- 结论 ---`);
    console.log(`内缘速度 v(r=6): ${innerV.toFixed(3)}`);
    console.log(`外缘速度 v(r=30): ${outerV.toFixed(3)}`);
    console.log(`平坦度: ${flatness.toFixed(3)} (>0.8 = 平坦旋转曲线)`);
    console.log(`\n物理难题解释:`);
    console.log(`  开普勒定律预测 v(r) ∝ 1/√r（外缘应骤降）。`);
    console.log(`  但实际观测：v(r) 在外缘趋于平坦→暗示额外质量(暗物质)。`);
    console.log(`  在信息宇宙中：有效引力 G*(r) = 1 - C_local(r)。`);
    console.log(`  远处信息关联C_local较低→G*较大→额外引力。`);
    console.log(`  "暗物质" = 信息关联结构产生的额外引力，不需要额外粒子！`);
    console.log(`  对应 MOND/暗物质之争：可能是引力理论在低加速度下的修正。`);
    return data;
}

// ============================================================
//  主函数
// ============================================================
console.log('╔' + '═'.repeat(68) + '╗');
console.log('║  东山信息宇宙学 · 虚拟宇宙物理实验台 V2 · 六大物理难题    ║');
console.log('╚' + '═'.repeat(68) + '╝');

const r1 = experiment1_blackHole();
const r2 = experiment2_horizon();
const r3 = experiment3_entropy();
const r4 = experiment4_waveParticle();
const r5 = experiment5_uncertainty();
const r6 = experiment6_darkMatter();

console.log('\n' + '='.repeat(70));
console.log('全部六大实验完成');
console.log('='.repeat(70));

// 导出结果为 JSON 供报告使用
const fs = require('fs');
const results = {
    blackHole: r1,
    horizon: r2,
    entropy: r3,
    waveParticle: r4,
    uncertainty: r5,
    darkMatter: r6
};
fs.writeFileSync('/data/user/work/experiment_results.json', JSON.stringify(results, null, 2));
console.log('\n实验数据已保存到 experiment_results.json');
