/*
 * universe.h - 信息场演化引擎核心接口（内生相互作用版）
 *
 * 连续信息场 Ψ(ℳ) 在带分辨截断的网格上离散演化。
 *
 * 核心约束（内生，非外部参数）：
 *   - 因果上限：信息单步最多跨越 1 网格（c* = Δx/Δt = 1）
 *   - 分辨阈值：场变化 |ΔΨ| < δΨ 视为不可区分，被截断归零
 *   - 守恒律：全域信息测度守恒（A2）
 *
 * 内生演化原理（无外部 D、g 参数）：
 *   1. 计算相邻单元对的关联函数 C[ρi,ρj] 和迹距离 D(ρi,ρj)
 *   2. 动态阈值 C_th = <C>（全局平均关联度，由系统状态涌现）
 *   3. 仅 C > C_th 的链接为活跃链接，参与信息流动
 *   4. 涌现扩散系数 D* = <C>（不再是外部参数）
 *   5. 非线性反馈内嵌于关联函数：高密度→低关联→链接断开→孤立（引力效应）
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
    /* 注意：diff_coef 和 coupling 已移除，相互作用完全内生 */
} universe_config_t;

/* 内生相互作用参数（由系统状态涌现）*/
typedef struct {
    field_t c_th;        /* 动态相变阈值 = <C>          */
    field_t d_star;      /* 涌现扩散系数 = <C>         */
    long    active_links; /* 活跃链接数               */
    long    isolated;    /* 孤立单元数                 */
    field_t avg_c;       /* 全局平均关联度             */
} endogenous_t;

/* 演化引擎状态 */
typedef struct {
    universe_config_t cfg;
    universe_constants_t consts;
    endogenous_t endo;           /* 内生相互作用参数       */
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
 */
void universe_seed_random(universe_t *u, field_t amplitude, unsigned int seed);

/*
 * 在指定位置注入信息扰动（种子点，模拟早期密度涨落）。
 */
void universe_inject(universe_t *u, int x, int y, int z, field_t value);

/*
 * 执行 n 步内生演化。
 * 每步：
 *   1. 计算所有相邻单元对的关联函数 C 和迹距离 D
 *   2. 动态阈值 C_th = <C>（内生涌现）
 *   3. 关联加权信息流动（仅活跃链接参与）
 *   4. 分辨阈值截断（|ΔΨ| < δΨ → 归零）
 *   5. 全域守恒修正
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
