/*
 * float_check.h - 浮点精度约束校验模块
 *
 * 核心硬性判定条件（必须满足，否则仿真失效）：
 *
 *   ε_mach · Ψ_max ≪ δΨ
 *
 * 即：浮点舍入噪声不能超过宇宙本身能识别的最小信息差。
 *
 *   双精度: ε_mach ≈ 2.22e-16, δΨ = 1e-12   → 安全裕度 ~1e4
 *   单精度: ε_mach ≈ 1.19e-7,  δΨ = 1e-5    → 安全裕度 ~1e2
 *
 * 不满足 → 浮点噪声压倒物理涨落，无法诞生自复制结构。
 */
#ifndef UNIVERSE_FLOAT_CHECK_H
#define UNIVERSE_FLOAT_CHECK_H

#include <stdio.h>
#include "params.h"

/* 浮点校验结果 */
typedef struct {
    field_t eps_mach;        /* 机器 epsilon                         */
    field_t delta_psi;       /* 信息分辨阈值 δΨ                     */
    field_t psi_max;        /* 场最大幅值                           */
    field_t noise_floor;    /* 浮点噪声基底 = ε_mach · Ψ_max        */
    int     passed;          /* 1=通过, 0=失败                      */
    field_t safety_margin;  /* 安全裕度 = δΨ / noise_floor          */
} float_check_result_t;

/*
 * 校验浮点约束：ε_mach · Ψ_max ≪ δΨ
 *
 * 输入：psi_max - 场最大幅值 Ψ_max
 *       delta_psi - 信息分辨阈值 δΨ
 * 返回：校验结果结构体
 */
float_check_result_t float_check(field_t psi_max, field_t delta_psi);

/*
 * 打印校验结果到流。
 */
void float_check_print(const float_check_result_t *r, FILE *out);

#endif /* UNIVERSE_FLOAT_CHECK_H */
