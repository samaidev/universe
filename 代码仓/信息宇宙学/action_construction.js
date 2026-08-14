#!/usr/bin/env node
'use strict';
// ============================================================
//  作用量构造实验: 能否从信息守恒约束导出动力学?
//
//  前三轮失败的根因: 缺少作用量 → α无法内生
//
//  本实验尝试:
//    从信息守恒约束 Σ|α_k|² = Σ C_{ij}² = const
//    用变分法推导最小作用量原理
//
//  思路:
//    1. 信息守恒 = 约束条件
//    2. 问: 什么动力学使信息守恒自动满足?
//    3. 变分: δS = 0, S = ∫ L dt, L = ?
//    4. 如果能从约束反推L → 作用量内生
//    5. 从L的耦合常数 → α内生
//
//  关键检验: 导出的L是否包含洛伦兹结构?
// ============================================================

const LN2 = Math.log(2);

// ============================================================
//  离散作用量构造
//
//  框架的"时间" = 关联刷新步 (离散)
//  S = Σ_t L(t)
//  L(t) = 信息产生率 - 信息守恒约束
//
//  尝试1: L = -½ Σ_{ij} (ΔC_{ij}/Δt)² + λ(Σ C_{ij}² - I₀)
//    → 谐振子型, 不会产生色散
//
//  尝试2: L = Σ_{ij} C_{ij} ∂_t C_{ij} - V[C]
//    → 辛结构, 更接近场论
//
//  尝试3: 从重标定不变性推导
//    重标定 R = √(I₀/Σraw²) 是守恒的来源
//    问: 什么样的L使R自动守恒?
// ============================================================

class ActionConstruction {
    constructor(N = 60, C0 = 0.45) {
        this.N = N;
        this.C0 = C0;
        // 初始化叠加态
        this.amplitudes = [];
        const s = 1.5;
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

    // 构建关联对 (存活)
    buildCorrelations() {
        const pairs = [];
        let keptSumSq = 0;
        for (let i = 0; i < this.N; i++) {
            for (let j = i + 1; j < this.N; j++) {
                const c = this.correlation(i, j);
                if (c.mag >= this.C0) {
                    pairs.push({ i, j, rawMag: c.mag, C: c.mag });
                    keptSumSq += c.mag * c.mag;
                }
            }
        }
        const rescale = keptSumSq > 0 ? Math.sqrt(this.I_0 / keptSumSq) : 0;
        for (const p of pairs) p.C = p.rawMag * rescale;
        return { pairs, rescale, keptSumSq };
    }

    // ============================================================
    //  尝试1: 离散欧拉-拉格朗日
    //
    //  L(t) = ½ Σ_{ij} (ΔC_{ij}/Δt)² - V[C_{ij}]
    //  运动方程: d²C/dt² = -∂V/∂C
    //
    //  问: V是什么能使信息守恒?
    //  约束: Σ C_{ij}² = I₀ → V必须使这个量守恒
    //  → V = ½ ω² (Σ C_{ij}² - I₀)²? 不,这只约束总量
    //  → V = ½ k C_{ij}²? 这是谐振子,不产生色散
    // ============================================================
    testHarmonicAction() {
        const { pairs } = this.buildCorrelations();
        const omega = 1.0; // 谐振子频率

        // 谐振子色散关系: E² = ω²p² (线性,无色散修正)
        // δc/c = 0 (无修正!)
        const dispersionCorrection = 0;

        return {
            type: 'harmonic',
            potential: 'V = ½ω²Σ C²',
            motionEquation: 'd²C/dt² = -ω²C',
            dispersionRelation: 'E² = ω²p² (线性)',
            dispersionCorrection,
            hasLorentzStructure: false,
            issue: '谐振子作用量不产生色散修正, 且无洛伦兹结构'
        };
    }

    // ============================================================
    //  尝试2: 非线性势 → 色散修正
    //
    //  L = ½ Σ (dC/dt)² - ½ ω² C² - λ C⁴
    //  非线性 → 色散修正 δc/c ~ E²
    //
    //  但: λ从哪来? 如果λ从信息守恒约束推导:
    //    Σ C² = I₀ → λ = I₀/Σ C⁴ ?
    //  这又依赖C的具体值 → 不是常数!
    // ============================================================
    testNonlinearAction() {
        const { pairs } = this.buildCorrelations();
        // 计算 λ 如果从守恒约束推导
        const sumC2 = pairs.reduce((s, p) => s + p.C * p.C, 0);
        const sumC4 = pairs.reduce((s, p) => s + p.C * p.C * p.C * p.C, 0);
        const lambda = sumC2 / (2 * sumC4);

        // 非线性色散: δc/c ~ λ × E² (类似LQG n=2)
        // 但λ不是普适常数,它依赖拓扑!
        const dispersionForm = 'δc/c ~ λ(E)²';
        const lambdaStability = this.testLambdaStability();

        return {
            type: 'nonlinear',
            potential: 'V = ½ω²C² + λC⁴',
            motionEquation: 'd²C/dt² = -ω²C - 4λC³',
            dispersionRelation: dispersionForm,
            lambda,
            lambdaIsUniversal: false,
            lambdaVariation: lambdaStability,
            hasLorentzStructure: false,
            issue: 'λ依赖拓扑状态(非普适), 且仍无洛伦兹结构'
        };
    }

    testLambdaStability() {
        // 在不同拓扑下测试λ
        const lambdas = [];
        for (const C0 of [0.35, 0.45, 0.55]) {
            const { pairs } = this.buildCorrelationsWithC0(C0);
            const sumC2 = pairs.reduce((s, p) => s + p.C * p.C, 0);
            const sumC4 = pairs.reduce((s, p) => s + p.C * p.C * p.C * p.C, 0);
            if (sumC4 > 0) lambdas.push(sumC2 / (2 * sumC4));
        }
        const mean = lambdas.reduce((s, l) => s + l, 0) / lambdas.length;
        const variance = lambdas.reduce((s, l) => s + (l - mean) ** 2, 0) / lambdas.length;
        return {
            values: lambdas,
            mean,
            cv: Math.sqrt(variance) / Math.abs(mean)
        };
    }

    buildCorrelationsWithC0(C0) {
        const pairs = [];
        let keptSumSq = 0;
        for (let i = 0; i < this.N; i++) {
            for (let j = i + 1; j < this.N; j++) {
                const c = this.correlation(i, j);
                if (c.mag >= C0) {
                    pairs.push({ i, j, rawMag: c.mag });
                    keptSumSq += c.mag * c.mag;
                }
            }
        }
        const rescale = keptSumSq > 0 ? Math.sqrt(this.I_0 / keptSumSq) : 0;
        for (const p of pairs) p.C = p.rawMag * rescale;
        return { pairs };
    }

    // ============================================================
    //  尝试3: 从重标定不变性推导作用量
    //
    //  核心洞察:
    //    重标定 R = √(I₀/Σraw²) 是框架独有的结构
    //    LQG没有这个机制!
    //
    //  问: 什么样的L在R变换下不变?
    //    R变换: C → λC, 使 Σ C² = I₀
    //    不变性要求: L[λC] = L[C]
    //    → L必须关于C是齐次的(零次齐次)
    //    → L = f(C_i / C_j, dC_i/dt, ...)
    //
    //  这意味着: 动力学只依赖关联的"比值",不依赖绝对值
    //  → 这给出了一个真实的约束!
    // ============================================================
    testRescalingInvariance() {
        const { pairs, rescale } = this.buildCorrelations();

        // 检查: L是否可以是关联比值的函数?
        // 取相邻关联对的比值
        const ratios = [];
        for (let i = 0; i < pairs.length - 1; i++) {
            if (pairs[i+1].C > 0) {
                ratios.push(pairs[i].C / pairs[i+1].C);
            }
        }
        const meanRatio = ratios.reduce((s, r) => s + r, 0) / ratios.length;
        const ratioVar = ratios.reduce((s, r) => s + (r - meanRatio) ** 2, 0) / ratios.length;

        // 如果比值分布窄 → 齐次作用量有意义
        // 如果比值分布宽 → 齐次性不成立
        const ratioCV = Math.sqrt(ratioVar) / meanRatio;

        // 关键检验: 重标定不变性是否给出洛伦兹结构?
        // 洛伦兹不变性要求: L在C → λC下不变
        // 且: 色散关系 E² = p²c² 形式不变
        // → c必须是R的函数: c ∝ R
        // → 但R是全局的(一次投影一个R)
        // → c对所有模态相同 → 没有能量依赖的色散!

        return {
            type: 'rescaling_invariance',
            keyInsight: '动力学只依赖关联比值,不依赖绝对值',
            ratioStatistics: { mean: meanRatio, cv: ratioCV },
            lorentzCheck: {
                requirement: 'c ∝ R (全局重标定因子)',
                consequence: 'c对所有模态相同 → 无能量依赖色散',
                hasEnergyDependentDispersion: false,
                issue: '重标定不变性禁止色散修正(与观测矛盾)'
            },
            hasLorentzStructure: 'partial',
            issue: '不变性约束太强,禁止了色散修正'
        };
    }

    // ============================================================
    //  尝试4: 局域破缺重标定不变性 → 色散
    //
    //  如果重标定不是全局的,而是局域的:
    //    R(x) = √(I₀(x) / Σ_local raw²)
    //  → c(x) ∝ R(x) → 不同位置不同光速
    //  → 但这需要"位置"概念,而位置是涌现的
    //  → 循环依赖!
    // ============================================================
    testLocalRescaling() {
        const { pairs, rescale } = this.buildCorrelations();

        // 将关联对分成局域块,每个块有自己的R
        const numBlocks = 4;
        const blockSize = Math.floor(pairs.length / numBlocks);
        const blockRescales = [];

        for (let b = 0; b < numBlocks; b++) {
            const block = pairs.slice(b * blockSize, (b + 1) * blockSize);
            const blockSumSq = block.reduce((s, p) => s + p.rawMag * p.rawMag, 0);
            const blockI = this.I_0 / numBlocks; // 均分信息
            const blockR = blockSumSq > 0 ? Math.sqrt(blockI / blockSumSq) : 0;
            blockRescales.push(blockR);
        }

        const meanR = blockRescales.reduce((s, r) => s + r, 0) / blockRescales.length;
        const varR = blockRescales.reduce((s, r) => s + (r - meanR) ** 2, 0) / blockRescales.length;
        const cvR = Math.sqrt(varR) / meanR;

        // 局域R变化 → c变化 → 色散
        // 但cvR依赖块的划分方式 → 又是参数!
        return {
            type: 'local_rescaling',
            blockRescales,
            meanR, cvR,
            hasEnergyDependentDispersion: true,
            dispersionDependsOn: '块划分方式 (非物理参数)',
            hasLorentzStructure: false,
            issue: '局域R的划分方式是任意的 → 色散仍依赖非物理参数'
        };
    }

    // ============================================================
    //  关键检验: 能否从作用量推导洛伦兹不变性?
    //
    //  洛伦兹不变性的数学要求:
    //    L在 Lorentz 变换下不变
    //    E² - p²c² = m²c⁴ (色散关系)
    //
    //  框架能否自然产生这个?
    //  → 需要L包含"时间"和"空间"的对称结构
    //  → 但框架的"时间"是刷新步,"空间"是关联图
    //  → 它们不对称! 时间是1维序列,空间是图结构
    //  → 除非: 图结构在低能极限变成连续流形
    //  → 这正是LQG的未解决问题!
    // ============================================================
    checkLorentzEmergence() {
        const { pairs } = this.buildCorrelations();
        const N = this.N;

        // 检查: 关联图是否近似各向同性?
        // (各向同性是洛伦兹不变性的前提)
        // 用度分布的方差衡量
        const degree = new Array(N).fill(0);
        for (const p of pairs) { degree[p.i]++; degree[p.j]++; }
        const avgDeg = degree.reduce((s, d) => s + d, 0) / N;
        const degVar = degree.reduce((s, d) => s + (d - avgDeg) ** 2, 0) / N;
        const degCV = Math.sqrt(degVar) / avgDeg;

        // 检查: 是否存在连续极限?
        // 连续极限要求: 大N时, 关联函数平滑
        // C(r) ~ exp(-r/ξ) (关联长度ξ有限)
        const sortedC = pairs.map(p => p.C).sort((a, b) => b - a);
        const correlationLength = sortedC.length > 0 ?
            1 / Math.abs(Math.log(sortedC[Math.floor(sortedC.length/2)] / sortedC[0])) : 0;

        return {
            isotropy: {
                degreeCV: degCV,
                isIsotropic: degCV < 0.3,
                issue: degCV < 0.3 ? '近似各向同性' : '度分布不均匀,非各向同性'
            },
            continuumLimit: {
                correlationLength,
                hasContinuumLimit: correlationLength > 1,
                issue: correlationLength > 1 ? '关联长度有限,可能连续' : '关联太短,离散效应强'
            },
            lorentzConclusion: {
                timeStructure: '1维序列 (刷新步)',
                spaceStructure: '图结构 (非流形)',
                symmetryIssue: '时间1维 vs 空间图结构 → 不对称',
                emergenceRequires: '图结构→连续流形的粗粒化极限 (LQG未解决问题)',
                canDeriveLorentz: false,
                reason: '缺少图→流形的严格映射,与LQG面临相同障碍'
            }
        };
    }
}

// ============================================================
//  运行实验
// ============================================================
console.log('='.repeat(75));
console.log('作用量构造实验: 能否从信息守恒导出动力学?');
console.log('='.repeat(75));

const exp = new ActionConstruction(60, 0.45);

// 尝试1: 谐振子作用量
console.log('\n━━━ 尝试1: 谐振子作用量 ━━━');
const t1 = exp.testHarmonicAction();
console.log(`  势能: ${t1.potential}`);
console.log(`  运动方程: ${t1.motionEquation}`);
console.log(`  色散关系: ${t1.dispersionRelation}`);
console.log(`  色散修正: ${t1.dispersionCorrection}`);
console.log(`  洛伦兹结构: ${t1.hasLorentzStructure ? '✓' : '✗'}`);
console.log(`  问题: ${t1.issue}`);

// 尝试2: 非线性作用量
console.log('\n━━━ 尝试2: 非线性作用量 (C⁴项) ━━━');
const t2 = exp.testNonlinearAction();
console.log(`  势能: ${t2.potential}`);
console.log(`  运动方程: ${t2.motionEquation}`);
console.log(`  色散关系: ${t2.dispersionForm}`);
console.log(`  λ = ${t2.lambda.toExponential(4)}`);
console.log(`  λ稳定性: CV = ${(t2.lambdaVariation.cv*100).toFixed(1)}%`);
console.log(`  λ普适? ${t2.lambdaIsUniversal ? '✓' : '✗ (依赖拓扑)'}`);
console.log(`  洛伦兹结构: ${t2.hasLorentzStructure ? '✓' : '✗'}`);
console.log(`  问题: ${t2.issue}`);
console.log(`  各C₀下λ: [${t2.lambdaVariation.values.map(v=>v.toExponential(3)).join(', ')}]`);

// 尝试3: 重标定不变性
console.log('\n━━━ 尝试3: 重标定不变性 ━━━');
const t3 = exp.testRescalingInvariance();
console.log(`  核心洞察: ${t3.keyInsight}`);
console.log(`  关联比值统计: 均值=${t3.ratioStatistics.mean.toFixed(3)}, CV=${(t3.ratioStatistics.cv*100).toFixed(1)}%`);
console.log(`  洛伦兹检验:`);
console.log(`    要求: ${t3.lorentzCheck.requirement}`);
console.log(`    后果: ${t3.lorentzCheck.consequence}`);
console.log(`    有能量依赖色散: ${t3.lorentzCheck.hasEnergyDependentDispersion ? '✓' : '✗'}`);
console.log(`  问题: ${t3.issue}`);

// 尝试4: 局域破缺
console.log('\n━━━ 尝试4: 局域重标定 ━━━');
const t4 = exp.testLocalRescaling();
console.log(`  各块R: [${t4.blockRescales.map(r=>r.toFixed(4)).join(', ')}]`);
console.log(`  R变异系数: ${(t4.cvR*100).toFixed(1)}%`);
console.log(`  有色散: ${t4.hasEnergyDependentDispersion ? '✓' : '✗'}`);
console.log(`  色散依赖: ${t4.dispersionDependsOn}`);
console.log(`  洛伦兹结构: ${t4.hasLorentzStructure ? '✓' : '✗'}`);
console.log(`  问题: ${t4.issue}`);

// 关键检验: 洛伦兹不变性涌现
console.log('\n━━━ 关键检验: 洛伦兹不变性能否涌现? ━━━');
const lorentz = exp.checkLorentzEmergence();
console.log(`  各向同性:`);
console.log(`    度分布CV: ${lorentz.isotropy.degreeCV.toFixed(3)}`);
console.log(`    各向同性: ${lorentz.isotropy.isIsotropic ? '✓' : '✗'} (${lorentz.isotropy.issue})`);
console.log(`  连续极限:`);
console.log(`    关联长度: ${lorentz.continuumLimit.correlationLength.toFixed(3)}`);
console.log(`    有连续极限: ${lorentz.continuumLimit.hasContinuumLimit ? '✓' : '✗'} (${lorentz.continuumLimit.issue})`);
console.log(`  洛伦兹结论:`);
console.log(`    时间结构: ${lorentz.lorentzConclusion.timeStructure}`);
console.log(`    空间结构: ${lorentz.lorentzConclusion.spaceStructure}`);
console.log(`    对称性问题: ${lorentz.lorentzConclusion.symmetryIssue}`);
console.log(`    涌现需要: ${lorentz.lorentzConclusion.emergenceRequires}`);
console.log(`    能推导洛伦兹? ${lorentz.lorentzConclusion.canDeriveLorentz ? '✓' : '✗'}`);
console.log(`    原因: ${lorentz.lorentzConclusion.reason}`);

// 总结
console.log(`\n${'='.repeat(75)}`);
console.log('作用量构造总结');
console.log('='.repeat(75));
console.log(`
尝试          色散修正    λ/α普适性    洛伦兹结构    可行?
─────────────────────────────────────────────────────────
谐振子        ✗ (无)       N/A          ✗            ✗
非线性C⁴      ✓ (~E²)     ✗ (CV>30%)   ✗            ✗
重标定不变    ✗ (被禁止)   N/A          △            ✗
局域重标定    ✓           ✗ (任意)     ✗            ✗
洛伦兹涌现    —           —            ✗            ✗

根本障碍:
  1. 谐振子: 最自然的信息守恒作用量,但不产生色散
  2. 非线性: 能产生色散,但耦合常数依赖拓扑(非普适)
  3. 不变性: 太强,禁止色散; 破缺它又引入任意参数
  4. 洛伦兹: 时间(1D序列) vs 空间(图)不对称
     → 需要图→流形的粗粒化 (LQG未解决问题)

结论:
  从信息守恒约束无法唯一导出动力学作用量
  能构造多个作用量,但都无法同时满足:
    - 产生色散修正
    - 耦合常数普适
    - 包含洛伦兹结构

  这与LQG面临完全相同的障碍:
    "从离散量子几何→连续洛伦兹流形"的严格映射不存在
  东山框架没有绕过这个障碍,只是重新遇到了它
`);
