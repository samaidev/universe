#!/usr/bin/env node
'use strict';
// ============================================================
//  BUG审查二：暗物质旋转曲线
//  怀疑：80×80网格太小，外缘信息仍均匀→M(r)∝r²→v∝√r
//  测试：更大网格(128) + 更大黑洞 + 更大测量范围
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
        this.tick=0; this.endoAvgC=1.0;
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
        this.endoAvgC=avgC;
        this.tick++;
    }
    get(x,y){return this.psi[idx(x,y,this.n)];}
    set(x,y,v){this.psi[idx(x,y,this.n)]=v;}
    createBlackHole(cx,cy,mass){
        const r=Math.ceil(Math.max(2,Math.sqrt(mass)*1.5));
        for (let dy=-r;dy<=r;dy++) for (let dx=-r;dx<=r;dx++) {
            const dist=Math.sqrt(dx*dx+dy*dy);
            if (dist>r) continue;
            const x=((cx+dx)%this.n+this.n)%this.n;
            const y=((cy+dy)%this.n+this.n)%this.n;
            const i=y*this.n+x;
            if (dist<r*0.3) this.psi[i]=Math.max(this.psi[i],mass*2);
            else this.psi[i]=Math.max(this.psi[i],mass*(1-dist/r));
        }
    }
    blackHoleAccrete(cx,cy,mass,ehR){
        const accR=Math.ceil(Math.max(4,Math.sqrt(mass)*4));
        let swallowed=0;
        for (let dy=-accR;dy<=accR;dy++) for (let dx=-accR;dx<=accR;dx++) {
            const dist=Math.sqrt(dx*dx+dy*dy);
            if (dist<0.5||dist>accR) continue;
            const x=((cx+dx)%this.n+this.n)%this.n;
            const y=((cy+dy)%this.n+this.n)%this.n;
            const i=y*this.n+x;
            const accRate=mass*0.005/(dist*dist);
            const extracted=Math.min(this.psi[i],accRate);
            this.psi[i]-=extracted;
            swallowed+=extracted;
            if (dist<ehR){swallowed+=this.psi[i];this.psi[i]=0.01;}
        }
        return swallowed;
    }
}

// ============================================================
//  测试1：原80×80网格，检查信息密度分布
// ============================================================
console.log('='.repeat(70));
console.log('BUG审查二：暗物质旋转曲线 — 为什么v(r)持续上升?');
console.log('='.repeat(70));

function measureRotationCurve(n, steps, bhMass, bhSteps, maxR) {
    const uni = new Universe(n);
    for (let i=0; i<steps; i++) uni.evolve();
    const cx=Math.floor(n/2), cy=Math.floor(n/2);
    uni.createBlackHole(cx, cy, bhMass);
    for (let i=0; i<bhSteps; i++) uni.evolve();

    // 先测量信息密度分布
    console.log(`\n信息密度分布 (n=${n}, 黑洞质量=${bhMass}):`);
    console.log('半径r   平均密度   M(r)     M(r)/r   v(r)    effG    密度趋势');
    console.log('-'.repeat(75));

    const data = [];
    for (let r=4; r<=maxR; r+=2) {
        let mass=0, count=0;
        for (let dy=-r; dy<=r; dy++) {
            for (let dx=-r; dx<=r; dx++) {
                if (dx*dx+dy*dy<=r*r) {
                    mass += uni.get(cx+dx, cy+dy);
                    count++;
                }
            }
        }
        const avgDensity = mass / count;

        // 信息密度变化率
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
        data.push({r, v, mass, effG, avgDensity, massOverR: mass/r});

        const prev = data.length > 1 ? data[data.length-2] : null;
        const densityTrend = prev ? (avgDensity > prev.avgDensity ? '↑' : avgDensity < prev.avgDensity*0.99 ? '↓' : '→') : '-';

        console.log(
            `${r.toString().padStart(4)}   ` +
            `${avgDensity.toFixed(3).padStart(7)}   ` +
            `${mass.toFixed(0).padStart(7)}   ` +
            `${(mass/r).toFixed(1).padStart(7)}   ` +
            `${v.toFixed(3).padStart(6)}   ` +
            `${effG.toFixed(3).padStart(6)}   ` +
            `${densityTrend}`
        );
    }

    // 外缘斜率
    const outer = data.filter(d => d.r >= maxR*0.7);
    let sX=0,sY=0,sXY=0,sX2=0,cnt=0;
    for (const d of outer) { sX+=d.r; sY+=d.v; sXY+=d.r*d.v; sX2+=d.r*d.r; cnt++; }
    const slope = (cnt*sXY-sX*sY)/(cnt*sX2-sX*sX);

    // M(r)/r是否趋于常数？
    const outerMassOverR = outer.map(d=>d.massOverR);
    const mOrRatio = Math.max(...outerMassOverR)/Math.min(...outerMassOverR);

    console.log(`\n外缘(r>=${Math.floor(maxR*0.7)}):`);
    console.log(`  v(r)斜率: ${slope.toFixed(4)} ${slope<0.05?'✓平坦':'✗上升'}`);
    console.log(`  M(r)/r比值(外缘): ${mOrRatio.toFixed(2)} ${mOrRatio<1.3?'✓趋常数(暗物质特征)':'✗不趋常数'}`);

    // 信息密度趋势
    const densities = data.map(d=>d.avgDensity);
    const innerD = densities.slice(0, 3).reduce((a,b)=>a+b,0)/3;
    const outerD = densities.slice(-3).reduce((a,b)=>a+b,0)/3;
    console.log(`  信息密度: 内缘=${innerD.toFixed(3)}, 外缘=${outerD.toFixed(3)}, 衰减比=${(outerD/innerD).toFixed(3)}`);
    console.log(`  ${outerD < innerD*0.5 ? '✓ 外缘密度显著衰减' : '✗ 外缘密度未衰减(网格太小或均匀)'}`);

    return {slope, mOrRatio, data};
}

console.log('\n--- 测试1: 原80×80网格 ---');
const t1 = measureRotationCurve(80, 200, 8.0, 50, 36);

console.log('\n--- 测试2: 128×128网格(更大范围) ---');
const t2 = measureRotationCurve(128, 300, 15.0, 80, 60);

console.log('\n--- 测试3: 128×128, 更强黑洞(30), 更长演化 ---');
const t3 = measureRotationCurve(128, 400, 30.0, 150, 60);

console.log('\n' + '='.repeat(70));
console.log('综合结论:');
console.log(`  80×80: v(r)斜率=${t1.slope.toFixed(4)}, M(r)/r比值=${t1.mOrRatio.toFixed(2)}`);
console.log(`  128×128: v(r)斜率=${t2.slope.toFixed(4)}, M(r)/r比值=${t2.mOrRatio.toFixed(2)}`);
console.log(`  128×128(强BH): v(r)斜率=${t3.slope.toFixed(4)}, M(r)/r比值=${t3.mOrRatio.toFixed(2)}`);

if (t3.slope < t1.slope) {
    console.log(`\n→ 更大网格+更强黑洞使斜率从${t1.slope.toFixed(4)}降到${t3.slope.toFixed(4)}`);
    console.log(`→ 暗物质"不成立"可能是网格太小导致的实现限制，不是理论问题`);
} else {
    console.log(`\n→ 网格增大未改善斜率，v(r)上升可能是更根本的问题`);
}
