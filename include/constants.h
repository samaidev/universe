/*
 * constants.h - 无量纲闭环物理常数推导模块
 *
 * 由仿真截断（Δx, Δt）内生导出虚拟宇宙三大常数：
 *   c* = Δx / Δt            （因果传播上限，非自由参数）
 *   l*_P = Δx               （虚拟普朗克长度）
 *   t*_P = Δt               （虚拟普朗克时间）
 *   h* ~ ρ · (Δx)^3 / Δt     （虚拟普朗克常数，零自由参数）
 *
 * 归一化 ρ=1 时：h* ~ c* · (Δx)^2
 */
#ifndef UNIVERSE_CONSTANTS_H
#define UNIVERSE_CONSTANTS_H

#include <stdio.h>
#include "params.h"

/* 虚拟宇宙无量纲常数集合 */
typedef struct {
    field_t l_p_star;   /* 虚拟普朗克长度 = Δx                   */
    field_t t_p_star;   /* 虚拟普朗克时间 = Δt                   */
    field_t c_star;     /* 等效光速 = Δx / Δt                    */
    field_t h_star;     /* 等效普朗克常数 ~ c* · (l*_P)^2 · ρ    */
    field_t rho;        /* 场基准能量密度（创世参数）             */
} universe_constants_t;

/*
 * 由仿真截断参数内生导出全套无量纲常数。
 *
 *   c* = Δx / Δt
 *   h* = ρ · (Δx)^3 / Δt = ρ · c* · (Δx)^2
 *
 * 输入：dx - 网格间距 Δx
 *       dt - 时序步长 Δt
 *       rho - 场基准能量密度（无量纲取 1.0）
 * 返回：填充后的常数集合
 */
universe_constants_t constants_derive(field_t dx, field_t dt, field_t rho);

/*
 * 使用 params.h 默认参数（Δx=Δt=1, ρ=1）导出常数。
 */
universe_constants_t constants_default(void);

/*
 * 校验常数闭环自洽性：
 *   c* == Δx / Δt
 *   h* ≈ c* · (l*_P)^2 · ρ
 * 返回 0 表示自洽，非 0 表示违反。
 */
int constants_check(const universe_constants_t *c);

/*
 * 打印常数表到流。
 */
void constants_print(const universe_constants_t *c, FILE *out);

#endif /* UNIVERSE_CONSTANTS_H */
