/*
 * universe.h - 信息场演化引擎核心接口
 *
 * 连续信息场 Ψ(ℳ) 在带分辨截断的网格上离散演化。
 *
 * 核心约束（内生，非外部参数）：
 *   - 因果上限：信息单步最多跨越 1 网格（c* = Δx/Δt = 1）
 *   - 分辨阈值：场变化 |ΔΨ| < δΨ 视为不可区分，被截断归零
 *   - 守恒律：全域信息测度守恒（A2）
 *
 * 演化方程（信息场拉普拉斯扩散 + 非线性自耦合）：
 *   Ψ(t+Δt) = Ψ(t) + Δt · [ D*·∇²Ψ - V'(Ψ) ]
 *
 *   D* : 信息扩散系数（退相干率，< 0.5 保证 CFL 稳定）
 *   V'(Ψ) : 自耦合势能梯度，模拟信息关联密度对拓扑的反馈
 */
#ifndef UNIVERSE_H
#define UNIVERSE_H

#include <stdio.h>
#include "params.h"
#include "constants.h"

/* 演化引擎配置 */
typedef struct {
    int     nx, ny, nz;          /* 网格规模               */
    field_t dx, dy, dz;         /* 网格间距（= l*_P）      */
    field_t dt;                  /* 时序步长（= t*_P）      */
    field_t c_star;              /* 因果上限               */
    field_t delta_psi;           /* 信息分辨阈值 δΨ        */
    field_t diff_coef;           /* 信息扩散系数 D*        */
    field_t coupling;            /* 自耦合强度             */
} universe_config_t;

/* 演化引擎状态 */
typedef struct {
    universe_config_t cfg;
    universe_constants_t consts;
    field_t *psi;                /* 当前场 Ψ(t)            */
    field_t *psi_next;           /* 下一时刻场 Ψ(t+Δt)     */
    long    tick;                /* 内部时钟（演化步数）    */
    field_t psi_max;            /* 当前场最大幅值         */
    field_t psi_min;             /* 当前场最小幅值         */
    field_t total_info;         /* 全域信息测度（守恒监控）*/
} universe_t;

/*
 * 创建演化引擎。
 * cfg 中的 dx,dy,dz,dt,delta_psi 置 0 则使用 params.h 默认值。
 * 返回 NULL 表示分配失败。
 */
universe_t *universe_create(universe_config_t cfg);

/*
 * 销毁引擎，释放内存。
 */
void universe_destroy(universe_t *u);

/*
 * 初始化场：随机高斯涨落种子（模拟原始连续相位场）。
 * 幅值范围 [-amplitude, amplitude]。
 */
void universe_seed_random(universe_t *u, field_t amplitude, unsigned int seed);

/*
 * 在指定位置注入信息扰动（种子点，模拟早期密度涨落）。
 */
void universe_inject(universe_t *u, int x, int y, int z, field_t value);

/*
 * 执行 n 步演化。
 * 每步：
 *   1. 拉普拉斯扩散（因果传播，c*=1 限制单步 1 网格）
 *   2. 非线性自耦合（信息密度反馈）
 *   3. 分辨阈值截断（|ΔΨ| < δΨ → 归零）
 *   4. 全域守恒修正
 * 返回实际完成的步数。
 */
int universe_evolve(universe_t *u, int n_steps);

/*
 * 获取场在 (x,y,z) 的值。
 */
field_t universe_get(const universe_t *u, int x, int y, int z);

/*
 * 统计：更新 psi_max, psi_min, total_info。
 */
void universe_stats(universe_t *u);

/*
 * 打印引擎状态摘要到流。
 */
void universe_status(const universe_t *u, FILE *out);

/*
 * 将当前场切片（z 中间层）以 ASCII 热图打印到流。
 */
void universe_dump_slice(const universe_t *u, FILE *out);

#endif /* UNIVERSE_H */
