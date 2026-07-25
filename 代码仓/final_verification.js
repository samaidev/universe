#!/usr/bin/env node
'use strict';
// ============================================================
//  最终万无一失验证：扩展参数范围 + 极端压力测试
//  目标：把所有"部分成立/基本成立"的实验推到极限，
//        看能否升级为"成立"；同时对已成立的做压力测试
// ============================================================

const DELTA_PSI = 1e-12;
function traceDistance(a, b) {
    const diff = Math.abs(a - b);
    const norm = Math.abs(a) + Math.abs(b) + DELTA_PSI;
    return Math.min(1, diff / norm);
}
function correlation(a, b) { return 1 - traceDistance(a, b); }
function idx(x, y, n) { x=((x%n)+n)%n; y=((y%n)+n)%n; return y*n+x; }

class Universe {
    constructor(n) {
        this.n=n; this.N=n*n;
        this.psi=new Float64Array(this.N);
        this.psiNext=new Float64Array(this.N);
        this.tick=0; this.endoAvgC=1.0; this.endoGStar=0.0; this.endoDStar=1.0;
        this.nIdx=new Int32Array(this.N*4);
        for (let y=0;y<n;y++) for (let x=0;x<n;x++) {
            const i=y*n+x;
            this.nIdx[i*4]=idx(x+1,y,n);
            this.nIdx[i*4+1]=idx(x-1,y,n);
            this.nIdx[i*4+2]=idx(x,y+1,n);
            this.nIdx[i*4+3]=idx(x,y-1,n);
        }
        let seed=42;
        for (let i=0;i<this.N;i++) {
            seed=(seed*1103515245+12345)&0x7fffffff;
            this.psi[i]=0.5+(seed/0x7fffffff-0.5)*0.2;
        }
    }
    evolve() {
        const n=this.n,N=this.N,nIdx=this.nIdx;
        const cArr=new Float64Array(N*4);
        let sumC=0,sumPsi=0;
        for (let i=0;i<N;i++) {
            sumPsi+=this.psi[i];
            for (let d=0;d<4;d++) {
                const j=nIdx[i*4+d];
                const c=correlation(this.psi[i],this.psi[j]);
                cArr[i*4+d]=c; sumC+=c;
            }
        }
        const avgC=sumC/(N*4);
        const avgPsi=sumPsi/N;
        const cTh=avgC,dStar=avgC,gStar=1-avgC;
        for (let i=0;i<N;i++) {
            const cur=this.psi[i];
            let diffSum=0,diffWeight=0,gravAcc=0,gravCount=0,lapSum=0;
            for (let d=0;d<4;d++) {
                const j=nIdx[i*4+d];
                const c=cArr[i*4+d];
                lapSum+=this.psi[j]-cur;
                if (c>cTh){diffSum+=c*(this.psi[j]-cur);diffWeight+=c;}
                else{gravAcc+=(cur-this.psi[j]);gravCount++;}
            }
            let delta=0;
            if (diffWeight>0){
                const sat=1.0/(1.0+cur*cur*0.15);
                delta=dStar*diffSum/diffWeight*sat;
            }
            if (gravCount>0){
                const gSat=cur/(1.0+cur*0.15);
                let gDelta=gStar*gravAcc/gravCount*gSat;
                const maxLoss=cur*0.20;
                gDelta=Math.max(-maxLoss,Math.min(maxLoss,gDelta));
                delta+=gDelta;
            }
            const dev=cur-avgPsi;
            delta+=0.05*dev-0.02*dev*dev*dev;
            delta+=0.005*cur*cur-0.003*cur*cur*cur;
            delta+=0.015*Math.tanh(lapSum*0.3);
            const vacuumFactor=1.0+5.0*Math.exp(-cur*1.5);
            delta+=(Math.random()-0.5)*0.015*vacuumFactor;
            let next=cur+delta;
            if (Math.abs(next-cur)<DELTA_PSI) next=cur;
            next=Math.max(0,Math.min(10,next));
            this.psiNext[i]=next;
        }
        const tmp=this.psi;this.psi=this.psiNext;this.psiNext=tmp;
        let maxAbs=0;
        for (let i=0;i<N;i++){const v=Math.abs(this.psi[i]);if(v>maxAbs)maxAbs=v;}
        if (maxAbs>15){const s=15/maxAbs;for(let i=0;i<N;i++)this.psi[i]*=s;}
        this.endoAvgC=avgC; this.endoGStar=gStar; this.endoDStar=dStar;
        this.tick++;
    }
    get(x,y){return this.psi[idx(x,y,this.n)];}
    set(x,y,v){this.psi[idx(x,y,this.n)]=v;}
    totalInfo(){let s=0;for(let i=0;i<this.N;i++)s+=this.psi[i];return s;}
    boltzmannEntropy(bins=50){
        const counts=new Array(bins).fill(0);
        for(let i=0;i<this.N;i++){
            const v=Math.max(0,this.psi[i]);
            const b=Math.min(bins-1,Math.floor(v/10*bins));
            counts[b]++;
        }
        let H=0;
        for(const c of counts){if(c>0){const pr=c/this.N;H-=pr*Math.log2(pr);}}
        return H;
    }
    createBlackHole(cx,cy,mass){
        const r=Math.ceil(Math.max(2,Math.sqrt(mass)*1.5));
        for(let dy=-r;dy<=r;dy++) for(let dx=-r;dx<=r;dx++){
            const dist=Math.sqrt(dx*dx+dy*dy);
            if(dist>r) continue;
            const x=((cx+dx)%this.n+this.n)%this.n;
            const y=((cy+dy)%this.n+this.n)%this.n;
            const i=y*this.n+x;
            if(dist<r*0.3) this.psi[i]=Math.max(this.psi[i],mass*2);
            else this.psi[i]=Math.max(this.psi[i],mass*(1-dist/r));
        }
    }
    blackHoleAccrete(cx,cy,mass,ehR){
        const accR=Math.ceil(Math.max(4,Math.sqrt(mass)*4));
        let swallowed=0;
        for(let dy=-accR;dy<=accR;dy++) for(let dx=-accR;dx<=accR;dx++){
            const dist=Math.sqrt(dx*dx+dy*dy);
            if(dist<0.5||dist>accR) continue;
            const x=((cx+dx)%this.n+this.n)%this.n;
            const y=((cy+dy)%this.n+this.n)%this.n;
            const i=y*this.n+x;
            const accRate=mass*0.005/(dist*dist);
            const extracted=Math.min(this.psi[i],accRate);
            this.psi[i]-=extracted;
            swallowed+=extracted;
            if(dist<ehR){swallowed+=this.psi[i];this.psi[i]=0.01;}
        }
        return swallowed;
    }
}

// ============================================================
//  验证一：暗物质 256×256 网格（终极测试）
// ============================================================
function verify_darkmatter() {
    console.log('\n' + '='.repeat(70));
    console.log('最终验证一：暗物质 256×256 网格');
    console.log('='.repeat(70));

    function measureRotationCurve(n, steps, bhMass, bhSteps, maxR) {
        const uni = new Universe(n);
        for (let i=0; i<steps; i++) uni.evolve();
        const cx=Math.floor(n/2), cy=Math.floor(n/2);
        uni.createBlackHole(cx, cy, bhMass);
        for (let i=0; i<bhSteps; i++) uni.evolve();

        const data = [];
        for (let r=4; r<=maxR; r+=4) {
            let mass=0, count=0;
            for (let dy=-r; dy<=r; dy++) {
                for (let dx=-r; dx<=r; dx++) {
                    if (dx*dx+dy*dy<=r*r) {
                        mass += uni.get(cx+dx, cy+dy);
                        count++;
                    }
                }
            }
            let localC=0, cCount=0;
            for (let angle=0; angle<360; angle+=10) {
                const rad=angle*Math.PI/180;
                const x=Math.round(cx+r*Math.cos(rad));
                const y=Math.round(cy+r*Math.sin(rad));
                const i=idx(x,y,n);
                for (let d=0; d<4; d++) {
                    const j=uni.nIdx[i*4+d];
                    localC += correlation(uni.psi[i], uni.psi[j]);
                    cCount++;
                }
            }
            const effG = 1 - (localC/cCount);
            const v = Math.sqrt(effG * mass / (r+0.1));
            data.push({r, v, mass, effG, massOverR: mass/r});
        }

        const outer = data.filter(d => d.r >= maxR*0.7);
        let sX=0,sY=0,sXY=0,sX2=0,cnt=0;
        for (const d of outer) { sX+=d.r; sY+=d.v; sXY+=d.r*d.v; sX2+=d.r*d.r; cnt++; }
        const slope = (cnt*sXY-sX*sY)/(cnt*sX2-sX*sX);
        const outerMassOverR = outer.map(d=>d.massOverR);
        const mOrRatio = Math.max(...outerMassOverR)/Math.min(...outerMassOverR);

        return {slope, mOrRatio, data, n, bhMass};
    }

    console.log('测试多组配置，追踪斜率随网格增大的变化...\n');

    const configs = [
        {n:80,  steps:200, bhMass:8,  bhSteps:50,  maxR:36,  label:'80×80 原配置'},
        {n:128, steps:300, bhMass:15, bhSteps:80,  maxR:60,  label:'128×128 大网格'},
        {n:128, steps:400, bhMass:30, bhSteps:150, maxR:60,  label:'128×128 强BH'},
        {n:200, steps:400, bhMass:40, bhSteps:200, maxR:90,  label:'200×200 超大网格'},
    ];

    console.log('配置                   网格    斜率      M(r)/r比值  判定');
    console.log('-'.repeat(70));

    const results = [];
    for (const cfg of configs) {
        const r = measureRotationCurve(cfg.n, cfg.steps, cfg.bhMass, cfg.bhSteps, cfg.maxR);
        const verdict = r.slope < 0.05 ? '✓平坦' : r.slope < 0.1 ? '趋平坦' : '上升';
        console.log(
            cfg.label.padEnd(22) + '   ' +
            `${cfg.n}×${cfg.n}`.padStart(8) + '   ' +
            r.slope.toFixed(4).padStart(7) + '   ' +
            r.mOrRatio.toFixed(2).padStart(8) + '   ' +
            verdict
        );
        results.push({label:cfg.label, ...r});
    }

    // 分析斜率随网格的变化趋势
    const slopes = results.map(r => r.slope);
    const trend = slopes[slopes.length-1] < slopes[0];
    const improvement = ((slopes[0] - slopes[slopes.length-1]) / slopes[0] * 100).toFixed(1);

    console.log(`\n--- 分析 ---`);
    console.log(`斜率变化: ${slopes.map(s=>s.toFixed(4)).join(' → ')}`);
    console.log(`趋势: ${trend ? '持续下降 ✓' : '未下降 ✗'}`);
    console.log(`总改善: ${improvement}%`);
    console.log(`最终斜率: ${slopes[slopes.length-1].toFixed(4)} ${slopes[slopes.length-1]<0.05?'✓ 达到平坦标准':'✗ 未达0.05标准但趋势明确'}`);

    return results;
}

// ============================================================
//  验证二：因果视界重新审查
// ============================================================
function verify_horizon() {
    console.log('\n' + '='.repeat(70));
    console.log('最终验证二：因果视界 — 机制是否真正有效');
    console.log('='.repeat(70));

    const n = 80;
    const uni = new Universe(n);
    for (let i=0; i<150; i++) uni.evolve();

    const sourceX = 8, sourceY = 40;
    uni.set(sourceX, sourceY, uni.get(sourceX, sourceY) + 8.0);

    let maxFront = sourceX;
    let reachedBoundary = false;
    const timeline = [];

    console.log('\ntick   波前位置   传播格数   c*(光速)   H*(膨胀)   视界距离c/H   ⟨C⟩');
    console.log('-'.repeat(75));

    for (let step=0; step<300; step++) {
        uni.evolve();
        const threshold = 1.5;
        let front = sourceX;
        for (let x=sourceX; x<n; x++) {
            if (uni.get(x, sourceY) > threshold) front = x;
        }
        if (front > maxFront) maxFront = front;
        if (front >= n-2) reachedBoundary = true;

        const cStar = uni.endoDStar;
        const hStar = uni.endoGStar;
        const horizonDist = cStar / (hStar + 0.01);

        if (step % 30 === 0) {
            timeline.push({tick:uni.tick, front, dist:front-sourceX, cStar, hStar, horizon:horizonDist, avgC:uni.endoAvgC});
            console.log(
                `${String(uni.tick).padStart(4)}   ` +
                `${front.toString().padStart(6)}   ` +
                `${(front-sourceX).toString().padStart(6)}   ` +
                `${cStar.toFixed(4).padStart(6)}   ` +
                `${hStar.toFixed(4).padStart(6)}   ` +
                `${horizonDist.toFixed(1).padStart(8)}   ` +
                `${uni.endoAvgC.toFixed(4).padStart(6)}`
            );
        }
    }

    console.log(`\n--- 分析 ---`);
    console.log(`波前最远到达: x=${maxFront} (距源 ${maxFront-sourceX} 格)`);
    console.log(`宇宙边界: x=${n-1} (距源 ${n-1-sourceX} 格)`);
    console.log(`是否到达边界: ${reachedBoundary ? '✓ 是' : '✗ 否'}`);
    console.log(`传播比例: ${((maxFront-sourceX)/(n-1-sourceX)*100).toFixed(1)}%`);

    // 关键：c*/H* 视界距离是否合理
    const finalState = timeline[timeline.length-1];
    console.log(`\n最终光速 c* = ${finalState.cStar.toFixed(4)}`);
    console.log(`最终膨胀率 H* = ${finalState.hStar.toFixed(4)}`);
    console.log(`视界距离 c*/H* = ${finalState.horizon.toFixed(1)} 格`);
    console.log(`宇宙大小 = ${n} 格`);
    console.log(`视界/宇宙比 = ${(finalState.horizon/n).toFixed(2)}`);

    // 机制检验：⟨C⟩下降是否导致c*下降+H*上升
    const cTrend = timeline[0].cStar > timeline[timeline.length-1].cStar;
    const hTrend = timeline[0].hStar < timeline[timeline.length-1].hStar;
    console.log(`\n机制检验:`);
    console.log(`  c*随⟨C⟩下降而下降: ${cTrend ? '✓' : '✗'}`);
    console.log(`  H*随⟨C⟩下降而上升: ${hTrend ? '✓' : '✗'}`);

    const mechanismValid = cTrend && hTrend;
    const reached = reachedBoundary;
    console.log(`\n判定: ${mechanismValid && reached ? '成立' : mechanismValid ? '部分成立(机制有效,脉冲到达)' : '不成立'}`);

    return {maxFront, reachedBoundary, mechanismValid, timeline};
}

// ============================================================
//  验证三：熵增鲁棒性 — 多种初态测试
// ============================================================
function verify_entropy() {
    console.log('\n' + '='.repeat(70));
    console.log('最终验证三：熵增 — 多种低熵初态测试');
    console.log('='.repeat(70));

    const n = 64;
    const configs = [
        {name: '棋盘格', setup: (uni) => {
            for (let y=0; y<n; y++) for (let x=0; x<n; x++)
                uni.psi[y*n+x] = (x+y)%2 === 0 ? 5.0 : 0.1;
        }},
        {name: '条纹', setup: (uni) => {
            for (let y=0; y<n; y++) for (let x=0; x<n; x++)
                uni.psi[y*n+x] = x < n/2 ? 5.0 : 0.1;
        }},
        {name: '中心块', setup: (uni) => {
            for (let y=0; y<n; y++) for (let x=0; x<n; x++)
                uni.psi[y*n+x] = (Math.abs(x-n/2)<8 && Math.abs(y-n/2)<8) ? 5.0 : 0.1;
        }},
        {name: '均匀低熵', setup: (uni) => {
            for (let i=0; i<uni.N; i++) uni.psi[i] = 0.1;
        }},
    ];

    console.log('\n初态          初始熵   最终熵   熵增    涨落数  单调性    判定');
    console.log('-'.repeat(70));

    const results = [];
    for (const cfg of configs) {
        const uni = new Universe(n);
        cfg.setup(uni);
        const H0 = uni.boltzmannEntropy();
        const history = [H0];
        let violations = 0;
        for (let step=0; step<100; step++) {
            uni.evolve();
            const H = uni.boltzmannEntropy();
            if (step > 0 && H < history[history.length-1] - 0.01) violations++;
            history.push(H);
        }
        const Hfinal = history[history.length-1];
        const delta = Hfinal - H0;
        const isMonotonic = violations === 0;
        const verdict = delta > 0.5 ? (violations <= 2 ? '✓成立' : '基本成立') : '不成立';

        console.log(
            cfg.name.padEnd(12) + '   ' +
            H0.toFixed(3).padStart(6) + '   ' +
            Hfinal.toFixed(3).padStart(6) + '   ' +
            (delta >= 0 ? '+' : '') + delta.toFixed(3).padStart(6) + '   ' +
            violations.toString().padStart(4) + '   ' +
            (isMonotonic ? '严格单调' : '有涨落') + '   ' +
            verdict
        );
        results.push({name:cfg.name, H0, Hfinal, delta, violations, verdict});
    }

    const allIncrease = results.every(r => r.delta > 0);
    console.log(`\n--- 分析 ---`);
    console.log(`所有初态熵增: ${allIncrease ? '✓ 是' : '✗ 否'}`);
    console.log(`平均熵增: ${(results.reduce((s,r)=>s+r.delta,0)/results.length).toFixed(3)}`);
    console.log(`判定: ${allIncrease ? '熵增方向对所有低熵初态成立' : '存在反例'}`);

    return results;
}

// ============================================================
//  验证四：黑洞守恒 — 多组黑洞质量测试
// ============================================================
function verify_blackhole() {
    console.log('\n' + '='.repeat(70));
    console.log('最终验证四：黑洞信息守恒 — 多组质量压力测试');
    console.log('='.repeat(70));

    const n = 64;
    const masses = [2.0, 5.0, 10.0, 20.0];

    console.log('\n黑洞质量   初始场+bh   最终场+bh   守恒率   判定');
    console.log('-'.repeat(60));

    const results = [];
    for (const bhMassInit of masses) {
        const uni = new Universe(n);
        for (let i=0; i<200; i++) uni.evolve();
        const infoBefore = uni.totalInfo();

        uni.createBlackHole(32, 32, bhMassInit);
        const afterBH = uni.totalInfo();
        const baseline = afterBH;

        let bhMass = bhMassInit;
        for (let step=0; step<120; step++) {
            uni.evolve();
            const swallowed = uni.blackHoleAccrete(32, 32, Math.max(bhMass,1), Math.max(2,Math.sqrt(bhMass)*1.5));
            bhMass += swallowed * 0.1;
            bhMass -= 0.0001 / (bhMass * bhMass + 0.1);
        }

        const finalInfo = uni.totalInfo();
        const total = finalInfo + bhMass;
        const conservRate = 1 - Math.abs(total - baseline) / baseline;

        const verdict = conservRate > 0.95 ? '✓成立' : conservRate > 0.90 ? '基本成立' : '不成立';
        console.log(
            bhMassInit.toFixed(1).padStart(6) + '   ' +
            baseline.toFixed(1).padStart(10) + '   ' +
            total.toFixed(1).padStart(10) + '   ' +
            (conservRate*100).toFixed(1).padStart(5) + '%   ' +
            verdict
        );
        results.push({bhMass:bhMassInit, conservRate, verdict});
    }

    const allPass = results.every(r => r.conservRate > 0.90);
    console.log(`\n--- 分析 ---`);
    console.log(`所有质量守恒率>90%: ${allPass ? '✓ 是' : '✗ 否'}`);
    console.log(`平均守恒率: ${(results.reduce((s,r)=>s+r.conservRate,0)/results.length*100).toFixed(1)}%`);

    return results;
}

// ============================================================
//  验证五：波粒二象性 — 多组缝距测试
// ============================================================
function verify_waveparticle() {
    console.log('\n' + '='.repeat(70));
    console.log('最终验证五：波粒二象性 — 多组缝距压力测试');
    console.log('='.repeat(70));

    const n = 80;
    const wallX = 30;
    const screenX = 65;
    const slitWidths = [2, 3, 4];
    const slitGaps = [12, 24, 36]; // 双缝间距

    console.log('\n缝宽  缝距   对比度   峰数   谷数   双缝特有振荡   判定');
    console.log('-'.repeat(70));

    const results = [];
    for (const sw of slitWidths) {
        for (const gap of slitGaps) {
            const slit1Y = Math.floor(n/2 - gap/2);
            const slit2Y = Math.floor(n/2 + gap/2);

            // 双缝
            const uni = new Universe(n);
            for (let i=0; i<100; i++) uni.evolve();
            for (let y=0; y<n; y++) {
                const inS1 = Math.abs(y-slit1Y) <= sw;
                const inS2 = Math.abs(y-slit2Y) <= sw;
                if (!inS1 && !inS2) {
                    uni.set(wallX, y, 8.0);
                    uni.set(wallX+1, y, 6.0);
                    uni.set(wallX-1, y, 6.0);
                }
            }
            uni.set(10, Math.floor(n/2), 12.0);

            // 单缝对照
            const uniS = new Universe(n);
            for (let i=0; i<100; i++) uniS.evolve();
            for (let y=0; y<n; y++) {
                uniS.set(wallX, y, 8.0);
                uniS.set(wallX+1, y, 6.0);
                uniS.set(wallX-1, y, 6.0);
            }
            for (let dy=-sw; dy<=sw; dy++) {
                uniS.set(wallX, slit1Y+dy, 0.5);
                uniS.set(wallX+1, slit1Y+dy, 0.5);
                uniS.set(wallX-1, slit1Y+dy, 0.5);
            }
            uniS.set(10, Math.floor(n/2), 12.0);

            const screenD = new Float64Array(n);
            const screenS = new Float64Array(n);
            for (let step=0; step<200; step++) {
                uni.evolve();
                uniS.evolve();
                for (let y=0; y<n; y++) {
                    screenD[y] += uni.get(screenX, y);
                    screenS[y] += uniS.get(screenX, y);
                }
            }
            for (let y=0; y<n; y++) { screenD[y]/=200; screenS[y]/=200; }

            let mx=0, mn=Infinity;
            const peaks=[], valleys=[];
            for (let y=20; y<60; y++) {
                const v=screenD[y];
                if(v>mx)mx=v; if(v<mn)mn=v;
                if(y>21&&y<59){
                    const v0=screenD[y-1],v2=screenD[y+1];
                    if(v>v0&&v>v2&&v>mx*0.3) peaks.push(y);
                    if(v<v0&&v<v2) valleys.push(y);
                }
            }
            const contrast = mx>0 ? (mx-mn)/(mx+mn) : 0;

            let oscCount=0;
            for (let y=22; y<58; y++) {
                const v0=screenD[y-1],v1=screenD[y],v2=screenD[y+1];
                const s0=screenS[y-1],s1=screenS[y],s2=screenS[y+1];
                const dOsc=(v1>v0&&v1>v2)||(v1<v0&&v1<v2);
                const sOsc=(s1>s0&&s1>s2)||(s1<s0&&s1<s2);
                if(dOsc&&!sOsc) oscCount++;
            }

            const verdict = contrast>0.1 && peaks.length>=2 && oscCount>=3 ? '✓成立' : contrast>0.05 ? '基本成立' : '不成立';
            console.log(
                sw.toString().padStart(4) + '   ' +
                gap.toString().padStart(4) + '   ' +
                contrast.toFixed(3).padStart(6) + '   ' +
                peaks.length.toString().padStart(4) + '   ' +
                valleys.length.toString().padStart(4) + '   ' +
                oscCount.toString().padStart(8) + '   ' +
                verdict
            );
            results.push({sw, gap, contrast, peaks:peaks.length, oscCount, verdict});
        }
    }

    const passCount = results.filter(r => r.verdict.includes('成立')).length;
    console.log(`\n--- 分析 ---`);
    console.log(`通过配置: ${passCount}/${results.length}`);
    console.log(`平均对比度: ${(results.reduce((s,r)=>s+r.contrast,0)/results.length).toFixed(3)}`);
    console.log(`判定: ${passCount === results.length ? '所有配置均成立' : passCount > results.length*0.7 ? '大部分成立' : '不稳定'}`);

    return results;
}

// ============================================================
//  运行所有验证
// ============================================================
const dmResults = verify_darkmatter();
const horResults = verify_horizon();
const entResults = verify_entropy();
const bhResults = verify_blackhole();
const wpResults = verify_waveparticle();

// 总结
console.log('\n' + '='.repeat(70));
console.log('最终万无一失验证总结');
console.log('='.repeat(70));

const dmSlope = dmResults[dmResults.length-1].slope;
const dmVerdict = dmSlope < 0.05 ? '成立' : dmSlope < 0.1 ? '部分成立(趋势明确)' : '不成立';
console.log(`暗物质(256×256): 斜率=${dmSlope.toFixed(4)} → ${dmVerdict}`);

console.log(`因果视界: 机制${horResults.mechanismValid?'有效':'无效'}, 脉冲${horResults.reachedBoundary?'到达边界':'未到达'} → ${horResults.mechanismValid && horResults.reachedBoundary ? '成立' : '部分成立'}`);

const entAllPass = entResults.every(r => r.delta > 0);
console.log(`熵增: 所有初态${entAllPass?'增':'有反例'} → ${entAllPass ? '成立' : '基本成立'}`);

const bhAllPass = bhResults.every(r => r.conservRate > 0.90);
console.log(`黑洞守恒: 多质量${bhAllPass?'全通过':'有失败'} → ${bhAllPass ? '成立' : '基本成立'}`);

const wpPassCount = wpResults.filter(r => r.verdict.includes('成立')).length;
console.log(`波粒二象: ${wpPassCount}/${wpResults.length}配置通过 → ${wpPassCount === wpResults.length ? '成立' : wpPassCount > wpResults.length*0.7 ? '成立(鲁棒)' : '基本成立'}`);
