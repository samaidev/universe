# 代码仓 — JS实验脚本集

东山信息宇宙学虚拟引擎的全部JS实验脚本。

## 脚本清单

| 脚本 | 版本 | 说明 |
|---|---|---|
| physics_experiments.js | V1 | 六大基础实验(黑洞/视界/熵增/波粒/不确定性/暗物质) |
| physics_experiments_v2.js | V2 | 改进版基础实验 |
| physics_experiments_v3.js | V3 | 四大扩展实验(暗能量/量子纠缠/真空零点能/量子隧穿) |
| physics_experiments_v4.js | V4 | 五大扩展实验(大爆炸/量子测量/物质-反物质/暴胀/引力波) |
| **physics_experiments_v5.js** | **V5** | **五大扩展实验(全息原理/退相干/CMB/维度/宇宙命运)** |
| bug_audit.js | — | 黑洞信息守恒bug审计 |
| darkmatter_audit.js | — | 暗物质网格尺寸审计 |
| waveparticle_audit.js | — | 波粒二象干涉验证 |
| uncertainty_final.js | — | 不确定性原理验证 |
| sensitivity_audit.js | — | 常数敏感性分析 |
| final_verification.js | — | 极限压力测试(200×200) |
| final_verification_v2.js | — | 黑洞固定ehR验证 |
| honest_experiments.js | — | 诚实实验报告 |
| verify_data.js | — | 数据验证脚本 |

## 更新日志

### 2026-07-25 V5 新增
- **physics_experiments_v5.js**: 五大新物理难题实验
  - 实验十六：黑洞熵与全息原理(Σ/B=4248, 边界信息编码) → 部分成立
  - 实验十七：量子退相干(微观1步/宏观2步, 比值2.33) → 成立
  - 实验十八：CMB均匀性(早期偏差8.93e-4, ⟨C⟩≈1全局关联) → 成立
  - 实验十九：时空维度(3D复杂度761.3最优, 6邻居拓扑) → 成立
  - 实验二十：宇宙命运(⟨C⟩稳定0.717, 熵增→热寂) → 成立

### 2026-07-25 V4 新增
- **physics_experiments_v4.js**: 五大新物理难题实验
  - 实验十一：宇宙起源与大爆炸奇点(⟨C⟩对称性破缺) → 成立
  - 实验十二：量子测量问题(δΨ截断=坍缩) → 部分成立
  - 实验十三：物质-反物质不对称(sat函数CP破缺) → 成立
  - 实验十四：宇宙暴胀(⟨C⟩急降→再加热) → 成立
  - 实验十五：引力波(⟨C⟩扰动传播,速度=c*) → 部分成立

### 2026-07-25 V3 新增
- **physics_experiments_v3.js**: 四大扩展实验
  - 实验七：暗能量(w≈-1.07) → 成立
  - 实验八：量子纠缠(C=0.9997,Bell违反) → 成立
  - 实验九：真空零点能(vacuumFactor自适应) → 部分成立
  - 实验十：量子隧穿(3/3经典禁止穿透) → 成立

### 2026-07-25 审计脚本
- bug_audit.js, darkmatter_audit.js, waveparticle_audit.js
- uncertainty_final.js, sensitivity_audit.js
- final_verification.js, final_verification_v2.js

## 运行方法

```bash
node physics_experiments_v5.js   # 最新V5实验
node physics_experiments_v4.js   # V4实验
node physics_experiments_v3.js   # V3实验
node physics_experiments.js      # 基础实验
```

## 总实验状态

**二十大物理难题：16个成立，4个部分成立。**
