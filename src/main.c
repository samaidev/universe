/*
 * main.c - 虚拟宇宙引擎演示入口
 *
 * 运行流程：
 *   1. 导出无量纲闭环常数（c*, h* 由 Δx, Δt 内生导出）
 *   2. 校验浮点约束（δΨ ≫ ε_mach）
 *   3. 映射现实量纲（k_x, k_t 缩放）
 *   4. 创建信息场引擎并演化若干步
 *   5. 打印状态与场切片
 */
#include <stdio.h>
#include <stdlib.h>
#include "constants.h"
#include "float_check.h"
#include "scaling.h"
#include "universe.h"

int main(int argc, char **argv)
{
    int steps = STEPS_DEFAULT;
    if (argc > 1) {
        steps = atoi(argv[1]);
        if (steps <= 0) steps = STEPS_DEFAULT;
    }

    printf("╔══════════════════════════════════════════════╗\n");
    printf("║   东山信息宇宙学 · 虚拟宇宙演化引擎 v0.1    ║\n");
    printf("║   浮点离散截断映射 · 无量纲闭环常数          ║\n");
    printf("╚══════════════════════════════════════════════╝\n\n");

    /* ---------- 1. 无量纲闭环常数 ---------- */
    universe_constants_t c = constants_default();
    constants_print(&c, stdout);
    printf("\n");
    int chk = constants_check(&c);
    printf("常数闭环自洽校验: %s\n\n", chk == 0 ? "✓ 自洽" : "✗ 违反");

    /* ---------- 2. 浮点约束校验 ---------- */
    field_t psi_max = (field_t)10.0;   /* 假设场最大幅值 */
    float_check_result_t fcr = float_check(psi_max, DELTA_PSI);
    float_check_print(&fcr, stdout);
    printf("\n");
    if (!fcr.passed) {
        printf("⚠ 浮点约束未通过，仿真结果不可信。终止。\n");
        return 1;
    }

    /* ---------- 3. 现实量纲映射 ---------- */
    scaling_result_t sc = scaling_from_dx((field_t)1.0e-30, 1);
    scaling_print(&sc, stdout);
    printf("\n");

    /* ---------- 4. 创建引擎并演化 ---------- */
    universe_config_t cfg = {0};
    universe_t *u = universe_create(cfg);
    if (!u) {
        fprintf(stderr, "引擎创建失败\n");
        return 1;
    }

    /* 播种：随机相位涨落（模拟原始连续相位场）*/
    universe_seed_random(u, (field_t)1.0, 42u);

    /* 注入若干高密度种子点（早期密度涨落）*/
    universe_inject(u, u->cfg.nx/2, u->cfg.ny/2, u->cfg.nz/2, (field_t)5.0);
    universe_inject(u, u->cfg.nx/4, u->cfg.ny/4, u->cfg.nz/4, (field_t)3.0);

    universe_status(u, stdout);
    printf("\n开始演化 %d 步...\n\n", steps);

    universe_evolve(u, steps);

    universe_status(u, stdout);
    printf("\n");
    universe_dump_slice(u, stdout);

    universe_destroy(u);
    printf("\n演化完成。\n");
    return 0;
}
