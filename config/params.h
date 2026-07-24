/*
 * params.h - 虚拟宇宙工程参数表（双精度热点区配置）
 *
 * 依据《东山逻辑一元论信息宇宙学》浮点离散截断映射框架
 * 所有参数为无量纲内部单位，可经 scaling 模块映射到现实物理量纲
 */
#ifndef UNIVERSE_PARAMS_H
#define UNIVERSE_PARAMS_H

#include <float.h>

/* ------------------------------------------------------------------ *
 *  1. 浮点精度配置
 * ------------------------------------------------------------------ */

/* 浮点类型选择：double / float。热点精细区使用 double */
#define UNIVERSE_USE_DOUBLE 1

#if defined(UNIVERSE_USE_DOUBLE) && UNIVERSE_USE_DOUBLE
    typedef double field_t;
    #define FIELD_EPS     DBL_EPSILON      /* ≈ 2.220446e-16 */
    #define FIELD_EPS_STR "2.220446e-16"
    #define FIELD_DIGITS  15              /* 十进制有效位数 */
#else
    typedef float field_t;
    #define FIELD_EPS     FLT_EPSILON      /* ≈ 1.192093e-07 */
    #define FIELD_EPS_STR "1.192093e-07"
    #define FIELD_DIGITS  6
#endif

/* ------------------------------------------------------------------ *
 *  2. 仿真截断（虚拟宇宙内禀分辨阈值）
 * ------------------------------------------------------------------ */

/* 网格间距 = 虚拟普朗克长度 l*_P（内部长度单位）*/
#define DELTA_X            ((field_t)1.0)

/* 时序最小迭代步 = 虚拟普朗克时间 t*_P（内部时间单位）*/
#define DELTA_T            ((field_t)1.0)

/* ------------------------------------------------------------------ *
 *  3. 信息分辨阈值（硬性判定条件：δΨ ≫ ε_mach）
 * ------------------------------------------------------------------ */

/*
 * 场信号最小可分辨梯度，必须远大于浮点舍入噪声。
 * 双精度下取 1e-12，安全裕度约 4 个数量级。
 *
 *   约束： δΨ ≫ ε_mach
 *   双精度: 1e-12 ≫ 2.22e-16   ✓
 *   单精度: 1e-5  ≫ 1.19e-7     ✓ （仅限粗粒虚空区）
 */
#define DELTA_PSI_DOUBLE   ((field_t)1.0e-12)
#define DELTA_PSI_FLOAT    ((field_t)1.0e-5)

#if defined(UNIVERSE_USE_DOUBLE) && UNIVERSE_USE_DOUBLE
    #define DELTA_PSI      DELTA_PSI_DOUBLE
#else
    #define DELTA_PSI      DELTA_PSI_FLOAT
#endif

/* ------------------------------------------------------------------ *
 *  4. 网格规模（默认配置，可运行时覆盖）
 * ------------------------------------------------------------------ */

#define GRID_NX_DEFAULT    64
#define GRID_NY_DEFAULT    64
#define GRID_NZ_DEFAULT    64

/* 默认演化步数 */
#define STEPS_DEFAULT      256

/* 场基准能量密度（全局归一化常数，创世参数；无量纲取 ρ=1）*/
#define RHO_BASE           ((field_t)1.0)

/* ------------------------------------------------------------------ *
 *  5. 现实物理常数（用于 scaling 模块对标，单位：SI）
 * ------------------------------------------------------------------ */

#define REAL_L_P           1.616255e-35   /* 现实普朗克长度 (m)        */
#define REAL_T_P           5.391247e-44    /* 现实普朗克时间 (s)        */
#define REAL_C             2.99792458e8    /* 现实光速 (m/s)            */
#define REAL_HBAR          1.054571817e-34 /* 现实约化普朗克常数 (J·s)  */

#endif /* UNIVERSE_PARAMS_H */
