#!/usr/bin/env node
'use strict';
// 不确定性原理：最终诚实版
// 修复δx测量：用excess(减背景)作为权重

const DELTA_PSI = 1e-12;
function idx(x, y, n) { x=((x%n)+n)%n; y=((y%n)+n)%n; return y*n+x; }

class Uni {
    constructor(n) {
        this.n=n; this.N=n*n; this.psi=new Float64Array(this.N);
        for (let i=0;i<this.N;i++) this.psi[i]=0.1;
    }
    get(x,y){return this.psi[idx(x,y,this.n)];}
    set(x,y,v){this.psi[idx(x,y,this.n)]=v;}
}

function measure(uni, cy, bg) {
    const n = uni.n;
    // δx: 用excess=max(0,ψ-bg)作为权重
    let sum=0, sumX=0, sumX2=0;
    for (let x=0; x<n; x++) {
        const v = Math.max(0, uni.get(x,cy) - bg);
        sum += v; sumX += x*v; sumX2 += x*x*v;
    }
    const meanX = sumX/(sum+DELTA_PSI);
    const varX = sumX2/(sum+DELTA_PSI) - meanX*meanX;
    const dx = Math.sqrt(Math.max(0, varX));

    // δp: 动量不确定度。用excess加权的一阶差分方差
    let sumG=0, sumG2=0;
    for (let x=1; x<n-1; x++) {
        const v = Math.max(0, uni.get(x,cy) - bg);
        const g = (uni.get(x+1,cy)-bg) - (uni.get(x-1,cy)-bg);  // excess的差分
        sumG += v*Math.abs(g);
        sumG2 += v*g*g;
    }
    const meanG = sumG/(sum+DELTA_PSI);
    const varG = sumG2/(sum+DELTA_PSI) - meanG*meanG;
    const dp = Math.sqrt(Math.max(0, varG));
    return {dx, dp, product: dx*dp, total: sum};
}

console.log('不确定性原理：最终诚实版（减背景δx测量）\n');
console.log('宽度w   δx       δp       δx·δp     δp×w(预期常数)');
console.log('-'.repeat(60));

const n=64, cy=32, cx=32, bg=0.1;
const results=[];
for (const w of [20,15,10,7,5,4,3,2,1.5,1,0.7]) {
    const uni = new Uni(n);
    for (let x=0; x<n; x++) {
        const d=x-cx;
        uni.set(x, cy, bg + 5.0*Math.exp(-d*d/(w*w)));
    }
    const m = measure(uni, cy, bg);
    results.push({w, ...m});
    console.log(
        `${w.toString().padStart(5)}   ` +
        `${m.dx.toFixed(3).padStart(7)}   ` +
        `${m.dp.toFixed(4).padStart(7)}   ` +
        `${m.product.toFixed(3).padStart(8)}   ` +
        `${(m.dp*w).toFixed(3).padStart(7)}`
    );
}

// 分析
const prods = results.map(r=>r.product);
const minP = Math.min(...prods), maxP = Math.max(...prods);
console.log(`\nδx·δp范围: [${minP.toFixed(3)}, ${maxP.toFixed(3)}], 比值=${(maxP/minP).toFixed(2)}`);

// 关键检验：δx和δp是否反相关
let sX=0,sP=0,sXP=0,sX2=0,sP2=0,c=0;
for (const r of results) { sX+=r.dx; sP+=r.dp; sXP+=r.dx*r.dp; sX2+=r.dx*r.dx; sP2+=r.dp*r.dp; c++; }
const cov = sXP/c - (sX/c)*(sP/c);
const corr = cov / (Math.sqrt(sX2/c-(sX/c)**2) * Math.sqrt(sP2/c-(sP/c)**2) + DELTA_PSI);
console.log(`δx-δp相关系数: ${corr.toFixed(3)} (负=反相关=不确定性成立)`);

const wide=results[0], narrow=results[results.length-1];
console.log(`\n最宽(w=${wide.w}): δx=${wide.dx.toFixed(2)}, δp=${wide.dp.toFixed(4)}`);
console.log(`最窄(w=${narrow.w}): δx=${narrow.dx.toFixed(2)}, δp=${narrow.dp.toFixed(4)}`);

if (narrow.dx < wide.dx && narrow.dp > wide.dp) {
    console.log(`\n✓ 压缩位置(δx↓)伴随动量展宽(δp↑)——傅里叶对偶定性成立`);
    console.log(`  δx·δp比值${(maxP/minP).toFixed(1)}，${(maxP/minP)<3?'基本守恒':'不守恒（变化'+(maxP/minP).toFixed(1)+'倍）'}`);
} else {
    console.log(`\n✗ 位置压缩与动量展宽的关系不明确`);
}
