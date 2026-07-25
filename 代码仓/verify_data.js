// 严格数据验证：对比HTML报告数据与真实运行结果JSON
const fs = require('fs');

console.log('='.repeat(70));
console.log('数据一致性验证：HTML报告 vs 真实运行结果');
console.log('='.repeat(70));

// 读取真实运行结果
const honest = JSON.parse(fs.readFileSync('/data/user/work/honest_results.json', 'utf8'));
const unc = JSON.parse(fs.readFileSync('/data/user/work/uncertainty_honest.json', 'utf8'));

// ===== 1. 黑洞数据验证 =====
console.log('\n--- 1. 黑洞信息守恒 ---');
console.log('HTML报告数据:');
console.log('  黑洞实验-全局信息: [13614,13461,13412,13358,13290,13202]');
console.log('  对照组(无黑洞):    [13687,13686,13686,13687,13686,13688]');
console.log('真实运行数据(honest_results.json):');
const bh = honest.blackHole;
bh.forEach(d => {
    console.log(`  t${d.tick}: infoNow=${d.infoNow.toFixed(2)}, ctrlNow=${d.ctrlNow.toFixed(2)}`);
});
const htmlBH = [13614,13461,13412,13358,13290,13202];
const htmlCtrl = [13687,13686,13686,13687,13686,13688];
let bhMatch = true;
bh.forEach((d, i) => {
    const diff1 = Math.abs(Math.round(d.infoNow) - htmlBH[i]);
    const diff2 = Math.abs(Math.round(d.ctrlNow) - htmlCtrl[i]);
    if (diff1 > 1 || diff2 > 1) { bhMatch = false; console.log(`  ✗ t${d.tick}: 差异 infoNow=${diff1}, ctrlNow=${diff2}`); }
});
console.log(bhMatch ? '  ✓ 黑洞数据一致(四舍五入)' : '  ✗ 黑洞数据不一致');

// ===== 2. 不确定性数据验证 =====
console.log('\n--- 2. 不确定性原理 ---');
console.log('HTML报告scatter数据:');
const htmlUnc = [
    {x:13.09,y:0.128},{x:10.47,y:0.172},{x:7.07,y:0.260},{x:4.95,y:0.375},
    {x:3.54,y:0.533},{x:2.83,y:0.677},{x:2.12,y:0.927},{x:1.41,y:1.449},
    {x:1.06,y:1.937},{x:0.71,y:2.401},{x:0.46,y:2.022}
];
console.log(`  共${htmlUnc.length}个点`);
console.log('  δx范围:', Math.min(...htmlUnc.map(p=>p.x)), '~', Math.max(...htmlUnc.map(p=>p.x)));
console.log('  δp范围:', Math.min(...htmlUnc.map(p=>p.y)).toFixed(3), '~', Math.max(...htmlUnc.map(p=>p.y)).toFixed(3));

console.log('\n真实运行数据(uncertainty_honest.json):');
console.log(`  共${unc.length}个点`);
console.log('  width  δx      δp      δx·δp');
unc.forEach(d => {
    console.log(`  ${String(d.width).padStart(5)}  ${d.dx.toFixed(3).padStart(7)}  ${d.dp.toFixed(3).padStart(7)}  ${d.product.toFixed(3).padStart(7)}`);
});
console.log('  δx范围:', Math.min(...unc.map(p=>p.dx)).toFixed(3), '~', Math.max(...unc.map(p=>p.dx)).toFixed(3));
console.log('  δp范围:', Math.min(...unc.map(p=>p.dp)).toFixed(3), '~', Math.max(...unc.map(p=>p.dp)).toFixed(3));

// 严重不匹配检测
console.log('\n  ⚠ 关键差异:');
console.log(`  HTML报告δx最小值: ${Math.min(...htmlUnc.map(p=>p.x))} (递减到0.46)`);
console.log(`  真实数据δx最小值: ${Math.min(...unc.map(p=>p.dx)).toFixed(3)} (在width=5处)`);
console.log(`  HTML报告δx趋势: 单调递减`);
console.log(`  真实数据δx趋势: 先减后增(U形)`);
console.log(`  HTML报告δx·δp比值(最大/最小): ${(Math.max(...htmlUnc.map(p=>p.x*p.y))/Math.min(...htmlUnc.map(p=>p.x*p.y))).toFixed(2)}`);
console.log(`  真实数据δx·δp比值(最大/最小): ${(Math.max(...unc.map(p=>p.product))/Math.min(...unc.map(p=>p.product))).toFixed(2)}`);

// ===== 3. 重新计算统计指标 =====
console.log('\n--- 3. 重新计算统计指标(真实数据) ---');

// 全部10个点
const allDx = unc.map(p=>p.dx);
const allDp = unc.map(p=>p.dp);
const allProd = unc.map(p=>p.product);

const mean = arr => arr.reduce((a,b)=>a+b,0)/arr.length;
const std = arr => { const m=mean(arr); return Math.sqrt(mean(arr.map(x=>(x-m)**2))); };
const corr = (a,b) => {
    const ma=mean(a), mb=mean(b);
    const sa=std(a), sb=std(b);
    return mean(a.map((x,i)=>(x-ma)*(b[i]-mb)))/(sa*sb);
};

console.log(`\n  全部${unc.length}个点(width=1~20):`);
console.log(`  δx·δp 范围: ${Math.min(...allProd).toFixed(3)} ~ ${Math.max(...allProd).toFixed(3)}`);
console.log(`  δx·δp 比值(最大/最小): ${(Math.max(...allProd)/Math.min(...allProd)).toFixed(2)}`);
console.log(`  δx·δp 均值: ${mean(allProd).toFixed(3)}`);
console.log(`  δx-δp 相关系数: ${corr(allDx, allDp).toFixed(3)}`);

// 仅宽波包(width>=5, 5个点)
const wideIdx = unc.filter(p=>p.width>=5);
const wideDx = wideIdx.map(p=>p.dx);
const wideDp = wideIdx.map(p=>p.dp);
const wideProd = wideIdx.map(p=>p.product);
console.log(`\n  宽波包(width>=5, ${wideIdx.length}个点):`);
console.log(`  δx·δp 范围: ${Math.min(...wideProd).toFixed(3)} ~ ${Math.max(...wideProd).toFixed(3)}`);
console.log(`  δx·δp 比值: ${(Math.max(...wideProd)/Math.min(...wideProd)).toFixed(2)}`);
console.log(`  δx-δp 相关系数: ${corr(wideDx, wideDp).toFixed(3)}`);

// 窄波包(width<5)
const narrowIdx = unc.filter(p=>p.width<5);
const narrowDx = narrowIdx.map(p=>p.dx);
const narrowDp = narrowIdx.map(p=>p.dp);
const narrowProd = narrowIdx.map(p=>p.product);
console.log(`\n  窄波包(width<5, ${narrowIdx.length}个点):`);
console.log(`  δx·δp 范围: ${Math.min(...narrowProd).toFixed(3)} ~ ${Math.max(...narrowProd).toFixed(3)}`);
console.log(`  δx·δp 比值: ${(Math.max(...narrowProd)/Math.min(...narrowProd)).toFixed(2)}`);
console.log(`  δx-δp 相关系数: ${corr(narrowDx, narrowDp).toFixed(3)}`);

// ===== 4. 判定 =====
console.log('\n--- 4. 修正后判定 ---');
const fullCorr = corr(allDx, allDp);
const fullRatio = Math.max(...allProd)/Math.min(...allProd);
const wideCorr = corr(wideDx, wideDp);
const wideRatio = Math.max(...wideProd)/Math.min(...wideProd);

console.log(`\n  全部点: 相关系数=${fullCorr.toFixed(3)}, δx·δp比值=${fullRatio.toFixed(2)}`);
console.log(`  → 相关系数${fullCorr>0?'正':'负'}相关, |r|=${Math.abs(fullCorr).toFixed(3)}`);
console.log(`  → δx·δp${fullRatio>3?'不':'近'}守恒`);

console.log(`\n  宽波包(≥5): 相关系数=${wideCorr.toFixed(3)}, δx·δp比值=${wideRatio.toFixed(2)}`);
console.log(`  → 相关系数${wideCorr>0?'正':'负'}相关, |r|=${Math.abs(wideCorr).toFixed(3)}`);
console.log(`  → δx·δp${wideRatio>3?'不':'近'}守恒`);

console.log('\n' + '='.repeat(70));
console.log('最终判定:');
if (Math.abs(fullCorr) > 0.7 && fullRatio < 3) {
    console.log('  ✓ 不确定性原理: 成立(全范围)');
} else if (Math.abs(wideCorr) > 0.7 && wideRatio < 3) {
    console.log('  ~ 不确定性原理: 仅宽波包范围部分成立');
    console.log('    全范围失败: |r|='+Math.abs(fullCorr).toFixed(3)+', 比值='+fullRatio.toFixed(2));
} else {
    console.log('  ✗ 不确定性原理: 不成立');
}
console.log('='.repeat(70));
