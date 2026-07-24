/*
 * scaling.h - 现实物理量纲映射模块
 *
 * 将虚拟宇宙无量纲内部单位映射到现实 SI 单位：
 *
 *   Δx = k_x · l_P,   Δt = k_t · t_P
 *
 * 若要求 c*_real = c（与现实光速相等），则 k_t = k_x。
 *
 * 例：虚拟 1 网格 = 1e-30 m
 *   k_x = 1e-30 / 1.616e-35 ≈ 6.19e4
 *   k_t = k_x  →  Δt = 6.19e4 · 5.391e-44 ≈ 3.34e-39 s
 *   c*  = c    = 2.998e8 m/s
 */
#ifndef UNIVERSE_SCALING_H
#define UNIVERSE_SCALING_H

#include <stdio.h>
#include "params.h"
#include "constants.h"

/* 现实量纲映射配置 */
typedef struct {
    field_t k_x;           /* 长度缩放系数 = Δx_real / l_P           */
    field_t k_t;            /* 时间缩放系数 = Δt_real / t_P            */
    /* 映射后的现实量纲常数 */
    field_t l_p_star_real;  /* 虚拟普朗克长度 (m)  = k_x · l_P         */
    field_t t_p_star_real;  /* 虚拟普朗克时间 (s)  = k_t · t_P         */
    field_t c_star_real;    /* 等效光速 (m/s)      = (k_x/k_t) · c      */
    field_t h_star_real;    /* 等效普朗克常数 (J·s) ≈ c · (l*_P_real)^2 */
} scaling_result_t;

/*
 * 由期望的虚拟网格现实长度推映射参数。
 *
 * 输入：desired_dx_m - 期望虚拟 1 网格对应的现实长度 (m)
 *       fix_c_to_real - 是否固定 c* = c（现实光速）。若为 1，则 k_t = k_x。
 * 返回：映射结果结构体
 */
scaling_result_t scaling_from_dx(field_t desired_dx_m, int fix_c_to_real);

/*
 * 直接使用缩放系数 k_x, k_t 计算映射。
 */
scaling_result_t scaling_from_k(field_t kx, field_t kt);

/*
 * 打印映射结果到流。
 */
void scaling_print(const scaling_result_t *s, FILE *out);

#endif /* UNIVERSE_SCALING_H */
