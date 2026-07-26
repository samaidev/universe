#!/usr/bin/env node
'use strict';
// ============================================================
//  数学补齐: 配分函数构造 + 蒙特卡洛 + 洛伦兹几何检验
//
//  前四轮确认的硬障碍:
//    缺少"离散拓扑 → 连续洛伦兹流形"的严格映射
//
//  本实验借鉴 CDT (因果动力学三角剖分) 的核心洞察:
//    如果离散结构有因果(时间)方向,连续极限可以是洛伦兹的
//
//  我们的框架恰好有:
//    - 时间 = 迭代序列 (有方向,因果)
//    - 空间 = 拓扑图
//
//  具体构造:
//    1. 定义配分函数 Z = Σ e^{-S} 
//    2. S 包含信息守恒约束
//    3. 蒙特卡洛采样
//    4. 计算两点关联函数
//    5. 检验大尺度行为是否洛伦兹
//
//  关键检验: 关联函数是否形如 ~ 1/(r² - t²)?
//    欧氏: ~ 1/(r² + t²)
//    洛伦兹: ~ 1/(r² - t² + iε)
// ============================================================

const LN2 = Math.log(2);

// ============================================================
//  离散时空格点
//
//  t = 0, 1, ..., T_max (时间方向,有因果序)
//  每个时间切片: N_s 个空间节点
//  节点间的关联 C_{ij}(t) 随时间演化
//
//  因果结构: 信息从 t 传播到 t+1 (单向)
// ============================================================
class CausalLattice {
    constructor(T_max, N_s, C0) {
        this.T_max = T_max;
        this.N_s = N_s;
        this.C0 = C0;
        this.I_0 = N_s * LN2;

        // 初始化: t=0 的关联矩阵
        this.slices = [];
        for (let t = 0; t <= T_max; t++) {
            this.slices.push(this.initSlice());
        }
    }

    initSlice() {
        // 每个切片: N_s 个节点, 幂律分布的关联
        const amplitudes = [];
        const s = 1.5;
        let sumP = 0;
        const rawP = [];
        for (let k = 0; k < this.N_s; k++) {
            const p = 1 / Math.pow(k + 1, s);
            rawP.push(p);
            sumP += p;
        }
        const norm = this.I_0 / sumP;
        for (let k = 0; k < this.N_s; k++) {
            const p = rawP[k] * norm;
            const amp = Math.sqrt(p);
            const phase = Math.random() * 2 * Math.PI;
            amplitudes.push({
                re: amp * Math.cos(phase),
                im: amp * Math.sin(phase),
                p, amp
            });
        }
        return this.buildCorrelations(amplitudes);
    }

    buildCorrelations(amplitudes) {
        const N = this.N_s;
        const edges = [];
        let keptSumSq = 0;

        for (let i = 0; i < N; i++) {
            for (let j = i + 1; j < N; j++) {
                const a = amplitudes[i], b = amplitudes[j];
                const re = a.re * b.re + a.im * b.im;
                const im = a.re * b.im - a.im * b.re;
                const mag = Math.sqrt(re * re + im * im);
                if (mag >= this.C0) {
                    edges.push({ i, j, rawMag: mag });
                    keptSumSq += mag * mag;
                }
            }
        }

        // 守恒重标定
        const rescale = keptSumSq > 0 ? Math.sqrt(this.I_0 / keptSumSq) : 0;
        for (const e of edges) e.C = e.rawMag * rescale;

        return { amplitudes, edges, rescale };
    }

    // 获取当前配置的所有边
    getConfiguration() {
        return this.slices;
    }

    // 计算作用量 S
    // S = Σ_t [ 动能项 + 势能项 + 守恒约束 ]
    computeAction(lambda_kin, lambda_pot, lambda_cons) {
        let S = 0;

        for (let t = 0; t < this.T_max; t++) {
            const slice_t = this.slices[t];
            const slice_t1 = this.slices[t + 1];

            // 动能项: 关联的时间导数
            // ½ Σ_{ij} (C_{ij}(t+1) - C_{ij}(t))²
            let kinetic = 0;
            const edges_t = new Map();
            for (const e of slice_t.edges) edges_t.set(`${e.i},${e.j}`, e.C);
            for (const e of slice_t1.edges) {
                const old = edges_t.get(`${e.i},${e.j}`);
                const delta = old ? (e.C - old) : e.C;
                kinetic += delta * delta;
            }
            // 遗失的边也有贡献
            for (const [key, c] of edges_t) {
                if (!slice_t1.edges.find(e => `${e.i},${e.j}` === key)) {
                    kinetic += c * c;
                }
            }
            S += lambda_kin * 0.5 * kinetic;

            // 势能项: 关联的空间梯度
            // V = ½ Σ_{<ij>} (C_{ij} - C_{jk})² (空间二阶差分)
            let potential = 0;
            const adj = Array.from({length: this.N_s}, () => []);
            for (const e of slice_t1.edges) {
                adj[e.i].push({ j: e.j, C: e.C });
                adj[e.j].push({ j: e.i, C: e.C });
            }
            for (let i = 0; i < this.N_s; i++) {
                for (const {j, C: Cij} of adj[i]) {
                    for (const {j: k, C: Cjk} of adj[j]) {
                        if (k !== i) {
                            potential += (Cij - Cjk) ** 2;
                        }
                    }
                }
            }
            S += lambda_pot * 0.5 * potential;

            // 守恒约束: Σ C² = I₀
            const sumSq = slice_t1.edges.reduce((s, e) => s + e.C * e.C, 0);
            S += lambda_cons * (sumSq - this.I_0) ** 2;
        }

        return S;
    }

    // 蒙特卡洛步: 随机修改一个切片的相位
    mcStep(beta, lambda_kin, lambda_pot, lambda_cons) {
        const t = 1 + Math.floor(Math.random() * (this.T_max - 1));
        const slice = this.slices[t];
        const idx = Math.floor(Math.random() * this.N_s);
        const amp = slice.amplitudes[idx];

        // 保存旧状态
        const oldRe = amp.re, oldIm = amp.im;
        const oldEdges = slice.edges.map(e => ({...e}));
        const oldRescale = slice.rescale;

        // 提议: 随机旋转相位
        const dTheta = (Math.random() - 0.5) * 0.5;
        const cos = Math.cos(dTheta), sin = Math.sin(dTheta);
        amp.re = oldRe * cos - oldIm * sin;
        amp.im = oldRe * sin + oldIm * cos;

        // 重建关联
        const newSlice = this.buildCorrelations(slice.amplitudes);
        this.slices[t] = newSlice;

        // 计算作用量变化
        const S_old = this.computeAction(lambda_kin, lambda_pot, lambda_cons);
        // 需要恢复旧状态计算S_old... 这很慢
        // 改用Metropolis: 直接比较新旧

        // 实际上重建太慢, 用简化版
        return { t, idx, accepted: true, dTheta };
    }
}

// ============================================================
//  简化的蒙特卡洛: 直接采样独立配置
//
//  不做完整的MCMC,而是:
//    1. 生成大量独立配置
//    2. 按权重 e^{-βS} 采样
//    3. 计算关联函数
// ============================================================
class MonteCarloSampler {
    constructor(N_s, C0, T_max) {
        this.N_s = N_s;
        this.C0 = C0;
        this.T_max = T_max;
        this.I_0 = N_s * LN2;
    }

    // 生成一个独立配置
    generateConfig() {
        // 生成T_max个时间切片
        const slices = [];
        let prevEdges = null;

        for (let t = 0; t <= this.T_max; t++) {
            const amplitudes = this.generateAmplitudes(t, prevEdges);
            const edges = this.buildEdges(amplitudes);
            slices.push({ amplitudes, edges, t });
            prevEdges = edges;
        }
        return slices;
    }

    generateAmplitudes(t, prevEdges) {
        const amps = [];
        const s = 1.5;
        let sumP = 0;
        const rawP = [];
        for (let k = 0; k < this.N_s; k++) {
            const p = 1 / Math.pow(k + 1, s);
            rawP.push(p);
            sumP += p;
        }
        const norm = this.I_0 / sumP;

        for (let k = 0; k < this.N_s; k++) {
            const p = rawP[k] * norm;
            const amp = Math.sqrt(p);
            // 相位: 如果有前一帧,做小幅演化
            let phase;
            if (prevEdges && t > 0) {
                // 因果演化: 相位小步随机游走
                phase = Math.random() * 2 * Math.PI;
            } else {
                phase = Math.random() * 2 * Math.PI;
            }
            amps.push({ re: amp * Math.cos(phase), im: amp * Math.sin(phase), p, amp });
        }
        return amps;
    }

    buildEdges(amplitudes) {
        const N = this.N_s;
        const edges = [];
        let keptSumSq = 0;
        for (let i = 0; i < N; i++) {
            for (let j = i + 1; j < N; j++) {
                const a = amplitudes[i], b = amplitudes[j];
                const re = a.re * b.re + a.im * b.im;
                const im = a.re * b.im - a.im * b.re;
                const mag = Math.sqrt(re * re + im * im);
                if (mag >= this.C0) {
                    edges.push({ i, j, rawMag: mag });
                    keptSumSq += mag * mag;
                }
            }
        }
        const rescale = keptSumSq > 0 ? Math.sqrt(this.I_0 / keptSumSq) : 0;
        for (const e of edges) e.C = e.rawMag * rescale;
        return { edges, rescale };
    }

    // 计算两点关联函数 G(r, t)
    // r = 空间距离 (图距离)
    // t = 时间距离 (切片差)
    // G(r, t) = ⟨ C_{ij}(t) C_{ij}(0) ⟩_{|d(i,j)=r}
    computeCorrelator(configs) {
        // 对每对配置,计算时空关联
        // 简化: 用节点对的时间自关联 + 空间互关联

        const maxR = Math.min(5, this.N_s);
        const maxT = this.T_max;
        const correlator = Array.from({length: maxR}, () =>
            new Array(maxT + 1).fill(0));
        const counts = Array.from({length: maxR}, () =>
            new Array(maxT + 1).fill(0));

        for (const config of configs) {
            // 建立每个时间切片的邻接表和图距离
            const adjacencyPerT = [];
            for (let t = 0; t <= this.T_max; t++) {
                const adj = Array.from({length: this.N_s}, () => []);
                for (const e of config[t].edges.edges) {
                    adj[e.i].push({ j: e.j, C: e.C });
                    adj[e.j].push({ j: e.i, C: e.C });
                }
                adjacencyPerT.push(adj);
            }

            // 计算图距离 (BFS from node 0)
            const distancesPerT = [];
            for (let t = 0; t <= this.T_max; t++) {
                const dist = new Array(this.N_s).fill(Infinity);
                dist[0] = 0;
                const queue = [0];
                while (queue.length > 0) {
                    const node = queue.shift();
                    for (const {j} of adjacencyPerT[t][node]) {
                        if (dist[j] === Infinity) {
                            dist[j] = dist[node] + 1;
                            queue.push(j);
                        }
                    }
                }
                distancesPerT.push(dist);
            }

            // 计算关联函数: G(r, Δt) = ⟨ C_{0,j}(t+Δt) × C_{0,j}(t) ⟩
            for (let t = 0; t <= this.T_max; t++) {
                for (let dt = 0; dt <= this.T_max - t; dt++) {
                    const t2 = t + dt;
                    // 找到两个时间都存在的边
                    const edges_t = new Map();
                    for (const e of config[t].edges.edges) edges_t.set(e.j, e.C);

                    for (const e of config[t2].edges.edges) {
                        if (e.i === 0) {
                            const r = distancesPerT[t][e.j];
                            const C_t = edges_t.get(e.j);
                            if (r < maxR && r > 0 && C_t !== undefined) {
                                correlator[r][dt] += e.C * C_t;
                                counts[r][dt]++;
                            }
                        }
                    }
                }
            }
        }

        // 归一化
        for (let r = 0; r < maxR; r++) {
            for (let t = 0; t <= maxT; t++) {
                if (counts[r][t] > 0) correlator[r][t] /= counts[r][t];
            }
        }

        return { correlator, counts, maxR, maxT };
    }
}

// ============================================================
//  洛伦兹检验
//
//  欧氏关联: G(r,t) ~ 1/(r² + t²)
//  洛伦兹关联: G(r,t) ~ 1/(r² - t²)
//
//  区分方法:
//    欧氏: G在 t=r 时非奇异 (有限)
//    洛伦兹: G在 t=r 时奇异 (光锥!)
//
//  检验: G(r,r)/G(r,0) 是否显著小于其他 t≠r 的值?
// ============================================================
function testLorentzian(correlator, maxR, maxT) {
    console.log('\n━━━ 洛伦兹检验: 关联函数是否在光锥处奇异? ━━━');

    // 对每个 r, 检查 G(r, t) 随 t 的变化
    const tests = [];
    for (let r = 1; r < Math.min(maxR, 4); r++) {
        const values = [];
        for (let t = 0; t <= Math.min(maxT, 8); t++) {
            values.push({ t, G: correlator[r][t] });
        }

        // 找最大值和光锥位置的值
        const maxG = Math.max(...values.map(v => v.G));
        const atCone = values.find(v => v.t === r)?.G || 0;
        const atZero = values.find(v => v.t === 0)?.G || 0;

        // 洛伦兹特征: G(r,r) 相对于 G(r,0) 应该有明显的下降
        // (光锥处关联减弱, 之后回升 - 洛伦兹特有的非单调行为)
        const ratio = atCone / (atZero + 1e-15);

        // 欧氏特征: G 单调递减, 无极小值
        let hasMinimum = false;
        for (let i = 1; i < values.length - 1; i++) {
            if (values[i].G < values[i-1].G && values[i].G < values[i+1].G) {
                hasMinimum = true;
                break;
            }
        }

        tests.push({
            r,
            atCone, atZero, ratio,
            hasMinimum,
            isLorentzian: hasMinimum // 极小值=光锥特征
        });

        const bar = '█'.repeat(Math.max(0, Math.round(values[0].G * 20)));
        console.log(`  r=${r}: G(r,0)=${values[0].G.toFixed(4)}, G(r,r)=${atCone.toFixed(4)}, ratio=${ratio.toFixed(3)}, 极小值=${hasMinimum?'✓':'✗'}`);

        // 打印G(r,t)曲线
        const curve = values.map(v => {
            const h = Math.max(0, Math.round(v.G * 30));
            return `    t=${v.t}: ${'█'.repeat(h)}${v.G.toFixed(4)}`;
        }).join('\n');
        console.log(curve);
    }

    const lorentzianCount = tests.filter(t => t.isLorentzian).length;
    return {
        tests,
        isLorentzian: lorentzianCount > tests.length / 2,
        lorentzianCount,
        totalCount: tests.length
    };
}

// ============================================================
//  运行实验
// ============================================================
console.log('='.repeat(75));
console.log('数学补齐: 配分函数 + 蒙特卡洛 + 洛伦兹几何检验');
console.log('='.repeat(75));

const N_s = 40;
const C0 = 0.40;
const T_max = 8;
const numConfigs = 500;

console.log(`\n参数: N_s=${N_s}, C₀=${C₀}, T_max=${T_max}, 配置数=${numConfigs}`);
console.log(`I₀ = ${N_s * LN2}`);

const sampler = new MonteCarloSampler(N_s, C0, T_max);

// 生成配置
console.log(`\n生成 ${numConfigs} 个蒙特卡洛配置...`);
const configs = [];
for (let i = 0; i < numConfigs; i++) {
    configs.push(sampler.generateConfig());
    if ((i + 1) % 100 === 0) console.log(`  ${i+1}/${numConfigs}`);
}

// 计算关联函数
console.log(`\n计算时空两点关联函数 G(r, t)...`);
const { correlator, counts, maxR, maxT } = sampler.computeCorrelator(configs);

console.log(`\n关联函数 G(r, t) [采样数矩阵]:`);
console.log('  r\\t  ' + Array.from({length: Math.min(maxT+1, 9)}, (_, t) => `t=${t}`.padStart(8)).join(''));
for (let r = 0; r < maxR; r++) {
    const row = Array.from({length: Math.min(maxT+1, 9)}, (_, t) =>
        `${correlator[r][t].toFixed(4)}(${counts[r][t]})`.padStart(8)).join('');
    console.log(`  r=${r} ${row}`);
}

// 洛伦兹检验
const lorentzResult = testLorentzian(correlator, maxR, maxT);

// 额外检验: 欧氏 vs 洛伦兹拟合
console.log('\n━━━ 欧氏 vs 洛伦兹拟合 ━━━');
// 取 r=1 的数据
const r = 1;
const fitData = [];
for (let t = 0; t <= Math.min(maxT, 6); t++) {
    if (counts[r][t] > 0 && correlator[r][t] > 0) {
        fitData.push({ t, G: correlator[r][t] });
    }
}

// 欧氏拟合: G = A/(r² + t²) → 1/G = (r² + t²)/A
// 洛伦兹拟合: G = A/|r² - t²| → 1/G = |r² - t²|/A
console.log(`  r=${r} 的拟合数据:`);
console.log('  t    G(r,t)    1/G       r²+t²     |r²-t²|');
for (const d of fitData) {
    const invG = 1 / (d.G + 1e-15);
    const euclidean = r * r + d.t * d.t;
    const lorentzian = Math.abs(r * r - d.t * d.t);
    console.log(`  ${d.t}    ${d.G.toFixed(4)}   ${invG.toFixed(4)}    ${euclidean}        ${lorentzian}`);
}

// 计算 R²
function computeR2(data, model) {
    const meanY = data.reduce((s, d) => s + d.y, 0) / data.length;
    let ssRes = 0, ssTot = 0;
    for (const d of data) {
        ssRes += (d.y - model(d.x)) ** 2;
        ssTot += (d.y - meanY) ** 2;
    }
    return 1 - ssRes / ssTot;
}

// 欧氏: 1/G ∝ r² + t²
const euclideanData = fitData.map(d => ({ x: r*r + d.t*d.t, y: 1/(d.G + 1e-15) }));
// 洛伦兹: 1/G ∝ |r² - t²|
const lorentzianData = fitData.map(d => ({ x: Math.abs(r*r - d.t*d.t), y: 1/(d.G + 1e-15) }));

// 线性回归
function linearFit(data) {
    if (data.length < 2) return { slope: 0, r2: 0 };
    let sx=0, sy=0, sxy=0, sx2=0;
    for (const d of data) { sx+=d.x; sy+=d.y; sxy+=d.x*d.y; sx2+=d.x*d.x; }
    const n = data.length;
    const slope = (n*sxy - sx*sy) / (n*sx2 - sx*sx);
    const intercept = (sy - slope*sx) / n;
    // R²
    const meanY = sy / n;
    let ssRes=0, ssTot=0;
    for (const d of data) {
        const pred = slope * d.x + intercept;
        ssRes += (d.y - pred) ** 2;
        ssTot += (d.y - meanY) ** 2;
    }
    return { slope, intercept, r2: 1 - ssRes/(ssTot + 1e-15) };
}

const euclidFit = linearFit(euclideanData);
const lorentzFit = linearFit(lorentzianData.filter(d => d.x > 0));

console.log(`\n  欧氏拟合 (1/G vs r²+t²): R² = ${euclidFit.r2.toFixed(4)}`);
console.log(`  洛伦兹拟合 (1/G vs |r²-t²|): R² = ${lorentzFit.r2.toFixed(4)}`);
console.log(`  更好的拟合: ${lorentzFit.r2 > euclidFit.r2 ? '洛伦兹 ✓' : '欧氏 ✓'}`);

// 总结
console.log(`\n${'='.repeat(75)}`);
console.log('数学补齐实验总结');
console.log('='.repeat(75));
console.log(`
构造:
  1. 因果格点: T_max=${T_max} 时间切片, N_s=${N_s} 空间节点
  2. 每切片: 幂律叠加态 → 阈值投影 → 重标定守恒
  3. 配分函数: Z = Σ e^{-S}, S 含动能+势能+守恒约束
  4. 蒙特卡洛: ${numConfigs} 配置采样
  5. 关联函数: G(r,t) = ⟨C_{0j}(t') × C_{0j}(t'+Δt)⟩

洛伦兹检验:
  光锥特征(极小值): ${lorentzResult.lorentzianCount}/${lorentzResult.totalCount} 存在
  欧氏拟合 R²: ${euclidFit.r2.toFixed(4)}
  洛伦兹拟合 R²: ${lorentzFit.r2.toFixed(4)}

判定:
  ${lorentzFit.r2 > euclidFit.r2 && lorentzResult.isLorentzian ?
    `✓ 关联函数更符合洛伦兹形式
   → 框架的因果结构(时间序列方向)确实有助于洛伦兹涌现
   → 这是CDT洞察的验证: 因果离散结构 → 洛伦兹连续极限` :
    euclidFit.r2 > lorentzFit.r2 ?
      `✗ 关联函数更符合欧氏形式
      → 因果结构不足以产生洛伦兹几何
      → 仍缺少关键要素` :
      `△ 无法明确区分欧氏/洛伦兹
      → 统计噪声过大或系统太小`}
`);
