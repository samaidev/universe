#!/usr/bin/env node
'use strict';
// ============================================================
//  严谨化审计二：实验逻辑修复与诚实重做
//
//  上一轮指出的错误：
//  1. 不确定性：δx·δp乘积从67掉到26（下降≠守恒下界）
//  2. 暗物质：v(r)持续上升（上升≠平坦旋转曲线）
//  3. 黑洞：5%泄漏被说成Hawking辐射（数值误差≠物理效应）
//  4. 熵：粗粒化bin变化≠物理熵
//
//  本脚本诚实重做每个实验，不管结果是否支持"理论"。
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
        this.n = n;
        this.N = n * n;
        this.psi = new Float64Array(this.N);
        this.psiNext = new Float64Array(this.N);
        this.tick = 0;
        this.endoAvgC = 1.0;
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
        this.endoAvgC = avgC;
        this.tick++;
    }

    // 真正的Boltzmann熵（粗粒化概率分布）
    boltzmannEntropy(bins=50) {
        const counts = new Array(bins).fill(0);
        let total = 0;
        for (let i = 0; i < this.N; i++) {
            const v = Math.max(0, this.psi[i]);
            const b = Math.min(bins-1, Math.floor(v / 10 * bins));
            counts[b]++; total++;
        }
        let H = 0;
        for (const c of counts) {
            if (c > 0) { const pr = c/total; H -= pr * Math.log2(pr); }
        }
        return H;
    }

    get(x, y) { return this.psi[idx(x, y, this.n)]; }
    set(x, y, v) { this.psi[idx(x, y, this.n)] = v; }

    totalInfo() {
        let s = 0;
        for (let i = 0; i < this.N; i++) s += this.psi[i];
        return s;
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
//  修复实验一：黑洞信息守恒 — 诚实量化数值泄漏
// ============================================================
function experiment1_honest() {
    console.log('\n' + '='.repeat(70));
    console.log('修复实验一：黑洞信息守恒 — 诚实量化数值泄漏');
    console.log('='.repeat(70));

    const n = 64;
    const uni = new Universe(n);
    for (let i = 0; i < 200; i++) uni.evolve();

    const infoBefore = uni.totalInfo();

    // 对比组：不创建黑洞，纯演化，测量自然漂移
    const uniCtrl = new Universe(n);
    for (let i = 0; i < 200; i++) uniCtrl.evolve();
    const ctrlBefore = uniCtrl.totalInfo();

    console.log(`\n初始全局信息量: ${infoBefore.toFixed(2)}`);

    // 创建黑洞
    uni.createBlackHole(32, 32, 5.0);
    const afterBH = uni.totalInfo();
    console.log(`黑洞创建后: ${afterBH.toFixed(2)} (Δ=${(afterBH-infoBefore).toFixed(2)}, 这是注入的黑洞质量)\n`);

    console.log('tick   黑洞质量   全局信息   对照组信息   物理泄漏   数值漂移(对照)');
    console.log('-'.repeat(75));

    let bhMass = 5.0;
    const data = [];
    for (let step = 0; step < 120; step++) {
        uni.evolve();
        uniCtrl.evolve();
        const swallowed = uni.blackHoleAccrete(32, 32, bhMass, 3.4);
        bhMass += swallowed * 0.1;
        bhMass -= 0.0001 / (bhMass * bhMass + 0.1);

        if (step % 20 === 0) {
            const infoNow = uni.totalInfo();
            const ctrlNow = uniCtrl.totalInfo();
            const totalDrift = infoNow - afterBH;
            const numericalDrift = ctrlNow - ctrlBefore;
            const physicalLeak = totalDrift - numericalDrift;
            data.push({tick:uni.tick, bhMass, infoNow, ctrlNow, totalDrift, numericalDrift, physicalLeak});
            console.log(
                `${String(uni.tick).padStart(4)}   ` +
                `${bhMass.toFixed(1).padStart(7)}   ` +
                `${infoNow.toFixed(1).padStart(9)}   ` +
                `${ctrlNow.toFixed(1).padStart(9)}   ` +
                `${physicalLeak.toFixed(2).padStart(8)}   ` +
                `${numericalDrift.toFixed(2).padStart(8)}`
            );
        }
    }

    const finalInfo = uni.totalInfo();
    const finalCtrl = uniCtrl.totalInfo();
    const totalLeak = finalInfo - afterBH;
    const numericalBaseline = finalCtrl - ctrlBefore;
    const physicalLeak = totalLeak - numericalBaseline;

    console.log(`\n--- 诚实结论 ---`);
    console.log(`总信息变化(含黑洞注入): ${totalLeak.toFixed(2)}`);
    console.log(`对照组数值漂移(无黑洞): ${numericalBaseline.toFixed(2)}`);
    console.log(`扣除数值漂移后的物理泄漏: ${physicalLeak.toFixed(2)}`);
    console.log(`物理泄漏占比: ${(physicalLeak/afterBH*100).toFixed(2)}%`);
    console.log(`\n上一轮声明"94.9%守恒率=Hawking辐射归还"是过度解读。`);
    console.log(`真实情况：${Math.abs(physicalLeak).toFixed(1)}的泄漏中，`);
    console.log(`${Math.abs(numericalBaseline).toFixed(1)}是数值漂移(无物理意义)，`);
    console.log(`物理相关泄漏仅${Math.abs(physicalLeak).toFixed(1)}。`);
    console.log(`不能把数值漂移说成Hawking辐射——那是事后附会。`);
    return data;
}

// ============================================================
//  修复实验二：不确定性原理 — 必须证明δx·δp有下界
//
//  上一轮错误：压缩后δx从10→10.5(没压缩！)，δp从6.7→2.5(减小！)
//  正确做法：真正压缩波包宽度，测量δp是否增大，乘积是否守恒
// ============================================================
function experiment2_honest() {
    console.log('\n' + '='.repeat(70));
    console.log('修复实验二：不确定性原理 — 检验δx·δp下界');
    console.log('='.repeat(70));

    const n = 64;
    const uni = new Universe(n);
    for (let i = 0; i < 150; i++) uni.evolve();

    // 沿x轴取一条线，清空背景，注入高斯波包
    const cx = 32, cy = 32;
    for (let x = 0; x < n; x++) uni.set(x, cy, 0.1);

    // 测量函数：在y=cy这条线上分析
    function measure() {
        let sum = 0, sumX = 0, sumX2 = 0;
        for (let x = 0; x < n; x++) {
            const v = Math.max(0, uni.get(x, cy));
            sum += v;
            sumX += x * v;
            sumX2 += x * x * v;
        }
        const meanX = sumX / (sum + DELTA_PSI);
        const varX = sumX2 / (sum + DELTA_PSI) - meanX * meanX;
        const dx = Math.sqrt(Math.max(0, varX));

        // 动量：空间频率谱的宽度
        // 用差分的方差作为动量不确定度
        let sumGrad2 = 0, gradCount = 0;
        for (let x = 1; x < n-1; x++) {
            const g = uni.get(x+1, cy) - uni.get(x-1, cy);
            sumGrad2 += g * g;
            gradCount++;
        }
        const dp = Math.sqrt(sumGrad2 / gradCount);

        return {dx, dp, product: dx * dp, total: sum};
    }

    // 测试不同宽度的波包（从宽到窄）
    console.log('\n波包宽度   δx       δp       δx·δp    总能量');
    console.log('-'.repeat(55));

    const results = [];
    const widths = [20, 15, 10, 7, 5, 3, 2, 1];

    for (const w of widths) {
        // 重新创建干净场
        const uni2 = new Universe(n);
        for (let i = 0; i < 50; i++) uni2.evolve();
        // 清空背景
        for (let x = 0; x < n; x++) uni2.set(x, cy, 0.1);
        // 注入高斯波包，宽度w
        for (let x = 0; x < n; x++) {
            const d = x - cx;
            const amp = 5.0 * Math.exp(-d*d / (w*w));
            uni2.set(x, cy, 0.1 + amp);
        }
        // 演化几步让它稳定
        for (let i = 0; i < 5; i++) uni2.evolve();

        const m = measure.call(uni2);
        results.push({width: w, ...m});
        console.log(
            `${w.toString().padStart(6)}   ` +
            `${m.dx.toFixed(3).padStart(7)}   ` +
            `${m.dp.toFixed(3).padStart(7)}   ` +
            `${m.product.toFixed(3).padStart(8)}   ` +
            `${m.total.toFixed(2).padStart(7)}`
        );
    }

    // 分析：δx·δp是否随宽度变化保持下界？
    const products = results.map(r => r.product);
    const minProd = Math.min(...products);
    const maxProd = Math.max(...products);
    const ratio = maxProd / minProd;

    console.log(`\n--- 诚实结论 ---`);
    console.log(`δx·δp 范围: [${minProd.toFixed(3)}, ${maxProd.toFixed(3)}]`);
    console.log(`最大/最小比值: ${ratio.toFixed(2)}`);

    if (ratio < 3) {
        console.log(`δx·δp在宽度变化${widths[0]}→${widths[widths.length-1]}时基本守恒。`);
        console.log(`这支持不确定性原理：压缩位置(δx↓)导致动量展宽(δp↑)，乘积有下界。`);
        console.log(`下界 ≈ ${minProd.toFixed(3)}（本引擎的特征值，不是ℏ/2）。`);
    } else {
        console.log(`δx·δp变化大，乘积不守恒。不确定性关系在本引擎中不成立。`);
    }

    // 关键检验：δx减小是否伴随δp增大？
    const narrow = results[results.length-1];  // 最窄
    const wide = results[0];  // 最宽
    console.log(`\n最宽波包: δx=${wide.dx.toFixed(2)}, δp=${wide.dp.toFixed(2)}`);
    console.log(`最窄波包: δx=${narrow.dx.toFixed(2)}, δp=${narrow.dp.toFixed(2)}`);
    if (narrow.dx < wide.dx && narrow.dp > wide.dp) {
        console.log(`✓ 压缩位置(δx↓)伴随动量展宽(δp↑)——不确定性关系成立`);
    } else {
        console.log(`✗ 压缩位置未伴随动量展宽——不确定性关系不成立`);
    }
    return results;
}

// ============================================================
//  修复实验三：暗物质旋转曲线 — 诚实检验是否平坦
//
//  上一轮错误：v(r)从3.5持续上升到8.9，却声称"平坦"
//  正确做法：明确定义"平坦"=外缘速度/内缘速度≈1且不随r增长
// ============================================================
function experiment3_honest() {
    console.log('\n' + '='.repeat(70));
    console.log('修复实验三：暗物质旋转曲线 — 诚实检验');
    console.log('='.repeat(70));

    const n = 80;
    const uni = new Universe(n);
    for (let i = 0; i < 200; i++) uni.evolve();

    // 放置星系核
    const cx = 40, cy = 40;
    uni.createBlackHole(cx, cy, 8.0);
    for (let i = 0; i < 50; i++) uni.evolve();

    console.log(`\n半径r   v(r)     v_k      v/v_k    是否平坦`);
    console.log('-'.repeat(55));

    const data = [];
    for (let r = 4; r <= 36; r += 2) {
        let mass = 0;
        for (let dy = -r; dy <= r; dy++) {
            for (let dx = -r; dx <= r; dx++) {
                if (dx*dx + dy*dy <= r*r) {
                    mass += uni.get(cx+dx, cy+dy);
                }
            }
        }
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
        const v = Math.sqrt(effG * mass / (r + 0.1));
        const vKepler = Math.sqrt(uni.endoAvgC > 0 ? (1-uni.endoAvgC) * mass / (r+0.1) : 0);

        data.push({r, v, vKepler, effG, mass});
    }

    // 定义平坦：外缘(r=30-36)速度的斜率接近0
    const inner = data.filter(d => d.r >= 6 && d.r <= 12);
    const outer = data.filter(d => d.r >= 28 && d.r <= 36);
    const innerAvgV = inner.reduce((s,d)=>s+d.v,0) / inner.length;
    const outerAvgV = outer.reduce((s,d)=>s+d.v,0) / outer.length;
    const flatness = outerAvgV / innerAvgV;

    // 外缘是否随r增长？（线性拟合斜率）
    let sumX=0, sumY=0, sumXY=0, sumX2=0, cnt=0;
    for (const d of outer) {
        sumX += d.r; sumY += d.v; sumXY += d.r*d.v; sumX2 += d.r*d.r; cnt++;
    }
    const slope = (cnt*sumXY - sumX*sumY) / (cnt*sumX2 - sumX*sumX);

    // 输出表格
    for (const d of data) {
        const isFlat = d.r >= 28 ? (Math.abs(slope) < 0.05 ? '✓平坦' : '✗上升') : '-';
        console.log(
            `${d.r.toString().padStart(4)}   ` +
            `${d.v.toFixed(3).padStart(7)}   ` +
            `${d.vKepler.toFixed(3).padStart(7)}   ` +
            `${(d.v/(d.vKepler+0.001)).toFixed(2).padStart(6)}    ` +
            `${isFlat}`
        );
    }

    console.log(`\n--- 诚实结论 ---`);
    console.log(`内缘平均v(r=6-12): ${innerAvgV.toFixed(3)}`);
    console.log(`外缘平均v(r=28-36): ${outerAvgV.toFixed(3)}`);
    console.log(`外缘/内缘比值: ${flatness.toFixed(3)}`);
    console.log(`外缘线性斜率: ${slope.toFixed(4)} (接近0=平坦, >0=上升)`);
    console.log(`\n上一轮声称"平坦度2.51=平坦旋转曲线"是错误的。`);
    console.log(`真实情况：v(r)从${innerAvgV.toFixed(1)}上升到${outerAvgV.toFixed(1)}，`);
    console.log(`外缘斜率${slope.toFixed(3)}${slope > 0.05 ? '>0，仍在上升' : '，基本平坦'}。`);
    console.log(`\n真实星系旋转曲线特征：内缘上升后外缘<饱和>在常数。`);
    console.log(`本引擎：${slope > 0.05 ? '外缘持续上升，不符合真实旋转曲线。' : '外缘趋于平坦，定性符合。'}`);
    console.log(`\n"暗物质=信息关联效应"这个声明${slope > 0.05 ? '不被本实验支持' : '定性上未被推翻'}，`);
    console.log(`但无论如何，这不能替代真实的暗物质粒子证据(子弹星系等)。`);
    return data;
}

// ============================================================
//  修复实验四：熵增 — 用Boltzmann熵证明单调性
// ============================================================
function experiment4_honest() {
    console.log('\n' + '='.repeat(70));
    console.log('修复实验四：熵增 — Boltzmann熵单调性检验');
    console.log('='.repeat(70));

    const n = 64;
    const uni = new Universe(n);
    for (let i = 0; i < 100; i++) uni.evolve();

    // 注入低熵态：棋盘格
    for (let y = 0; y < n; y++) {
        for (let x = 0; x < n; x++) {
            uni.set(x, y, (Math.floor(x/4) + Math.floor(y/4)) % 2 === 0 ? 4.0 : 0.3);
        }
    }
    const initH = uni.boltzmannEntropy();
    console.log(`\n初始Boltzmann熵: ${initH.toFixed(4)} bits`);

    console.log('\ntick   Boltzmann熵   ΔH      单调?');
    console.log('-'.repeat(45));

    const data = [];
    let prevH = initH;
    let violations = 0;
    for (let step = 0; step < 100; step++) {
        uni.evolve();
        if (step % 5 === 0) {
            const H = uni.boltzmannEntropy();
            const dH = H - prevH;
            const monotonic = dH >= -0.01;  // 允许小数值涨落
            if (!monotonic) violations++;
            data.push({tick: uni.tick, H, dH});
            console.log(
                `${String(uni.tick).padStart(4)}   ` +
                `${H.toFixed(4).padStart(10)}   ` +
                `${(dH>=0?'+':'')}${dH.toFixed(4).padStart(7)}   ` +
                `${monotonic ? '✓' : '✗'}`
            );
            prevH = H;
        }
    }

    const finalH = uni.boltzmannEntropy();
    console.log(`\n--- 诚实结论 ---`);
    console.log(`熵: ${initH.toFixed(4)} → ${finalH.toFixed(4)} (Δ=${(finalH-initH).toFixed(4)})`);
    console.log(`单调性违反次数: ${violations} (允许小涨落)`);
    console.log(`\nBoltzmann熵${finalH > initH ? '增加' : '减小'}了${Math.abs(finalH-initH).toFixed(3)} bits。`);
    if (finalH > initH) {
        console.log(`低熵有序态自发趋向高熵态——熵增方向成立。`);
        console.log(`这与Boltzmann的统计解释一致：低概率态趋向高概率态。`);
    } else {
        console.log(`熵未增加——熵增在本实验条件下不成立。`);
    }
    return data;
}

// ============================================================
//  运行所有修复实验
// ============================================================
console.log('╔' + '═'.repeat(68) + '╗');
console.log('║  严谨化审计：实验逻辑修复与诚实重做                          ║');
console.log('╚' + '═'.repeat(68) + '╝');

const r1 = experiment1_honest();
const r2 = experiment2_honest();
const r3 = experiment3_honest();
const r4 = experiment4_honest();

// 保存结果
const fs = require('fs');
fs.writeFileSync('/data/user/work/honest_results.json', JSON.stringify({
    blackHole: r1, uncertainty: r2, darkMatter: r3, entropy: r4
}, null, 2));
console.log('\n结果已保存到 honest_results.json');
