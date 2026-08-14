/*
 * float_check.c - 浮点精度约束校验实现
 */
#include "float_check.h"
#include <stdio.h>

float_check_result_t float_check(field_t psi_max, field_t delta_psi)
{
    float_check_result_t r;
    r.eps_mach   = (field_t)FIELD_EPS;
    r.delta_psi  = delta_psi;
    r.psi_max    = psi_max;
    r.noise_floor = r.eps_mach * psi_max;   /* 浮点噪声基底 */
    r.safety_margin = (r.noise_floor > (field_t)0)
                      ? (delta_psi / r.noise_floor)
                      : (field_t)1e30;
    /* 判定：噪声基底必须远小于分辨阈值（裕度 >= 100 视为安全）*/
    r.passed = (r.noise_floor < delta_psi * (field_t)0.01) ? 1 : 0;
    return r;
}

void float_check_print(const float_check_result_t *r, FILE *out)
{
    fprintf(out, "=== 浮点精度约束校验 ===\n");
    fprintf(out, "  浮点类型            : %s\n",
#if defined(UNIVERSE_USE_DOUBLE) && UNIVERSE_USE_DOUBLE
            "double (64-bit)"
#else
            "float (32-bit)"
#endif
           );
    fprintf(out, "  ε_mach (机器epsilon) : %.*e\n", FIELD_DIGITS, (double)r->eps_mach);
    fprintf(out, "  Ψ_max  (场最大幅值)  : %.*g\n",  FIELD_DIGITS, (double)r->psi_max);
    fprintf(out, "  噪声基底 ε·Ψ_max      : %.*e\n", FIELD_DIGITS, (double)r->noise_floor);
    fprintf(out, "  δΨ    (信息分辨阈值): %.*e\n", FIELD_DIGITS, (double)r->delta_psi);
    fprintf(out, "  安全裕度 δΨ/噪声     : %.*g\n",  FIELD_DIGITS, (double)r->safety_margin);
    fprintf(out, "  约束 ε·Ψ_max ≪ δΨ    : %s\n",
            r->passed ? "✓ 通过" : "✗ 失败（噪声压倒物理涨落）");
}
