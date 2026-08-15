/*
 * scaling.c - 现实物理量纲映射实现
 */
#include "scaling.h"
#include <stdio.h>

scaling_result_t scaling_from_k(field_t kx, field_t kt)
{
    scaling_result_t s;
    s.k_x = kx;
    s.k_t = kt;
    s.l_p_star_real = kx * (field_t)REAL_L_P;
    s.t_p_star_real = kt * (field_t)REAL_T_P;
    s.c_star_real   = (kx / kt) * (field_t)REAL_C;
    s.h_star_real   = s.c_star_real * s.l_p_star_real * s.l_p_star_real;
    return s;
}

scaling_result_t scaling_from_dx(field_t desired_dx_m, int fix_c_to_real)
{
    field_t kx = desired_dx_m / (field_t)REAL_L_P;
    field_t kt;
    if (fix_c_to_real) {
        /* 固定 c* = c  →  k_t = k_x */
        kt = kx;
    } else {
        /* 保持 Δt = Δx 的无量纲关系（Δt_real = (kx·l_P)/c 的另一种选择）*/
        kt = kx;
    }
    return scaling_from_k(kx, kt);
}

void scaling_print(const scaling_result_t *s, FILE *out)
{
    fprintf(out, "=== 现实量纲映射 ===\n");
    fprintf(out, "  k_x (长度缩放)        = %.*g\n",   FIELD_DIGITS, (double)s->k_x);
    fprintf(out, "  k_t (时间缩放)        = %.*g\n",   FIELD_DIGITS, (double)s->k_t);
    fprintf(out, "  l*_P_real (虚拟普朗克长度) = %.*e m\n",  FIELD_DIGITS, (double)s->l_p_star_real);
    fprintf(out, "  t*_P_real (虚拟普朗克时间) = %.*e s\n",  FIELD_DIGITS, (double)s->t_p_star_real);
    fprintf(out, "  c*_real   (等效光速)     = %.*e m/s\n",FIELD_DIGITS, (double)s->c_star_real);
    fprintf(out, "  h*_real   (等效普朗克常数)= %.*e J·s\n",FIELD_DIGITS, (double)s->h_star_real);
    fprintf(out, "  闭环验证:\n");
    fprintf(out, "    c* = Δx/Δt = (k_x·l_P)/(k_t·t_P) = %.*e m/s\n",
            FIELD_DIGITS,
            (double)(s->l_p_star_real / s->t_p_star_real));
    fprintf(out, "    h* ≈ c*·(l*_P)^2                     = %.*e J·s\n",
            FIELD_DIGITS,
            (double)(s->c_star_real * s->l_p_star_real * s->l_p_star_real));
}
