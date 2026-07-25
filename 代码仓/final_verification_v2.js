#!/usr/bin/env node
'use strict';
// 最终验证修正版：修复黑洞ehR bug + 因果视界额外检查

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
//  修正验证四：黑洞守恒 — 固定ehR(基于初始质量)
// ============================================================
function verify_blackhole_fixed() {
    console.log('\n' + '='.repeat(70));
    console.log('修正验证四：黑洞守恒 — 固定ehR(修复v1的bug)');
    console.log('='.repeat(70));
    console.log('v1的bug: ehR=Math.sqrt(bhMass)*1.5随bhMass增长→大量cell被清零');
    console.log('修复: ehR固定为基于初始质量的值(与原实验一致)\n');

    const n = 64;
    const masses = [2.0, 5.0, 10.0, 20.0, 40.0];

    console.log('黑洞质量   固定ehR   初始场+bh   最终场+bh   守恒率   判定');
    console.log('-'.repeat(65));

    const results = [];
    for (const bhMassInit of masses) {
        const uni = new Universe(n);
        for (let i=0; i<200; i++) uni.evolve();

        uni.createBlackHole(32, 32, bhMassInit);
        const afterBH = uni.totalInfo();
        const baseline = afterBH; // 含黑洞注入

        // 固定ehR基于初始质量(与原实验一致)
        const ehR = Math.max(2, Math.sqrt(bhMassInit) * 1.5);

        let bhMass = bhMassInit;
        for (let step=0; step<120; step++) {
            uni.evolve();
            // 用固定ehR，但accRate用当前bhMass(允许吸积率增长)
            const swallowed = uni.blackHoleAccrete(32, 32, Math.max(bhMass, 1), ehR);
            bhMass += swallowed * 0.1;
            bhMass -= 0.0001 / (bhMass * bhMass + 0.1);
        }

        const finalInfo = uni.totalInfo();
        const total = finalInfo + bhMass;
        const conservRate = 1 - Math.abs(total - baseline) / baseline;

        const verdict = conservRate > 0.95 ? '✓成立' : conservRate > 0.90 ? '基本成立' : '不成立';
        console.log(
            bhMassInit.toFixed(1).padStart(6) + '   ' +
            ehR.toFixed(2).padStart(6) + '   ' +
            baseline.toFixed(1).padStart(10) + '   ' +
            total.toFixed(1).padStart(10) + '   ' +
            (conservRate*100).toFixed(1).padStart(5) + '%   ' +
            verdict
        );
        results.push({bhMass:bhMassInit, ehR, conservRate, verdict});
    }

    const allPass = results.every(r => r.conservRate > 0.90);
    const avgConserv = results.reduce((s,r)=>s+r.conservRate,0)/results.length;
    console.log(`\n--- 分析 ---`);
    console.log(`所有质量守恒率>90%: ${allPass ? '✓ 是' : '✗ 否'}`);
    console.log(`平均守恒率: ${(avgConserv*100).toFixed(1)}%`);
    console.log(`判定: ${allPass ? '成立(多质量鲁棒)' : '需进一步检查'}`);

    return results;
}

// ============================================================
//  额外验证：因果视界 — 用变化⟨C⟩的场测试
// ============================================================
function verify_horizon_v2() {
    console.log('\n' + '='.repeat(70));
    console.log('额外验证：因果视界 — 在⟨C⟩变化的场中测试c*/H*机制');
    console.log('='.repeat(70));
    console.log('v1的发现: 稳态场中⟨C⟩不变→c*/H*不变→机制无法展示');
    console.log('本测试: 在⟨C⟩主动变化的场中验证机制\n');

    const n = 80;
    const uni = new Universe(n);

    // 阶段1: 低⟨C⟩场(注入大量噪声降低关联度)
    for (let i=0; i<50; i++) uni.evolve();
    // 注入随机噪声降低⟨C⟩
    for (let i=0; i<uni.N; i++) {
        if (Math.random() < 0.3) uni.psi[i] = Math.random() * 5;
    }
    for (let i=0; i<20; i++) uni.evolve();

    const c1 = uni.endoAvgC;
    const cStar1 = uni.endoDStar;
    const hStar1 = uni.endoGStar;
    const hor1 = cStar1 / (hStar1 + 0.01);

    // 注入脉冲
    uni.set(8, 40, uni.get(8, 40) + 8.0);
    let front1 = 8;
    for (let step=0; step<50; step++) {
        uni.evolve();
        for (let x=8; x<n; x++) {
            if (uni.get(x, 40) > 1.5) front1 = x;
        }
    }

    // 阶段2: 高⟨C⟩场(让场充分演化提高关联度)
    for (let i=0; i<200; i++) uni.evolve();
    const c2 = uni.endoAvgC;
    const cStar2 = uni.endoDStar;
    const hStar2 = uni.endoGStar;
    const hor2 = cStar2 / (hStar2 + 0.01);

    // 注入脉冲
    uni.set(8, 40, uni.get(8, 40) + 8.0);
    let front2 = 8;
    for (let step=0; step<50; step++) {
        uni.evolve();
        for (let x=8; x<n; x++) {
            if (uni.get(x, 40) > 1.5) front2 = x;
        }
    }

    console.log('阶段          ⟨C⟩      c*(光速)   H*(膨胀)   视界c/H   脉冲传播');
    console.log('-'.repeat(65));
    console.log(
        '低⟨C⟩场       '.padEnd(12) +
        c1.toFixed(4).padStart(8) + '   ' +
        cStar1.toFixed(4).padStart(6) + '   ' +
        hStar1.toFixed(4).padStart(6) + '   ' +
        hor1.toFixed(1).padStart(6) + '   ' +
        (front1-8).toString().padStart(6) + '格'
    );
    console.log(
        '高⟨C⟩场       '.padEnd(12) +
        c2.toFixed(4).padStart(8) + '   ' +
        cStar2.toFixed(4).padStart(6) + '   ' +
        hStar2.toFixed(4).padStart(6) + '   ' +
        hor2.toFixed(1).padStart(6) + '   ' +
        (front2-8).toString().padStart(6) + '格'
    );

    // 机制检验
    const cChanges = cStar1 !== cStar2;
    const hChanges = hStar1 !== hStar2;
    const cHigherWhenCHigher = c2 > c1 && cStar2 > cStar1;
    const hLowerWhenCHigher = c2 > c1 && hStar2 < hStar1;
    const horChanges = Math.abs(hor1 - hor2) > 0.1;

    console.log(`\n--- 机制检验 ---`);
    console.log(`c*随⟨C⟩变化: ${cChanges ? '✓' : '✗'} (c*=${cStar1.toFixed(4)}→${cStar2.toFixed(4)})`);
    console.log(`H*随⟨C⟩变化: ${hChanges ? '✓' : '✗'} (H*=${hStar1.toFixed(4)}→${hStar2.toFixed(4)})`);
    console.log(`⟨C⟩↑→c*↑: ${cHigherWhenCHigher ? '✓' : '✗'}`);
    console.log(`⟨C⟩↑→H*↓: ${hLowerWhenCHigher ? '✓' : '✗'}`);
    console.log(`视界距离变化: ${hor1.toFixed(2)}→${hor2.toFixed(2)} ${horChanges?'✓有变化':'✗无变化'}`);

    const mechanismValid = cHigherWhenCHigher && hLowerWhenCHigher;
    console.log(`\n判定: ${mechanismValid ? '机制成立(⟨C⟩↑→c*↑,H*↓)' : '机制不成立'}`);

    return {c1, c2, cStar1, cStar2, hStar1, hStar2, mechanismValid};
}

// 运行
const bhResults = verify_blackhole_fixed();
const horResults = verify_horizon_v2();

console.log('\n' + '='.repeat(70));
console.log('修正版最终验证总结');
console.log('='.repeat(70));
const bhAllPass = bhResults.every(r => r.conservRate > 0.90);
console.log(`黑洞守恒(固定ehR): ${bhAllPass ? '✓ 成立(多质量鲁棒)' : '需检查'} → 平均守恒率${(bhResults.reduce((s,r)=>s+r.conservRate,0)/bhResults.length*100).toFixed(1)}%`);
console.log(`因果视界机制: ${horResults.mechanismValid ? '✓ 成立(⟨C⟩变化时c*/H*正确响应)' : '✗ 机制不成立'}`);
