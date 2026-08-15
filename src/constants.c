/*
 * constants.c - 无量纲闭环物理常数推导实现
 */
#include "constants.h"
#include <math.h>
#include <stdio.h>

universe_constants_t constants_derive(field_t dx, field_t dt, field_t rho)
{
    universe_constants_t c;
    c.l_p_star = dx;                      /* 虚拟普朗克长度 = Δx           */
    c.t_p_star = dt;                      /* 虚拟普朗克时间 = Δt           */
    c.c_star   = dx / dt;                 /* 因果上限，由截断几何直接导出   */
    c.h_star   = rho * dx * dx * dx / dt; /* 等效普朗克常数                 */
    c.rho      = rho;
    return c;
}

universe_constants_t constants_default(void)
{
    return constants_derive(DELTA_X, DELTA_T, RHO_BASE);
}

int constants_check(const universe_constants_t *c)
{
    /* c* = Δx / Δt */
    field_t expected_c = c->l_p_star / c->t_p_star;
    if (fabs(c->c_star - expected_c) > FIELD_EPS * fabs(expected_c)) {
        return -1;
    }
    /* h* = ρ · c* · (l*_P)^2 */
    field_t expected_h = c->rho * c->c_star * c->l_p_star * c->l_p_star;
    if (fabs(c->h_star - expected_h) > FIELD_EPS * fabs(expected_h)) {
        return -2;
    }
    /* Planck scale closure check:
       l_P = sqrt(h * G / c cubed)
       With G_star = 1 in dimensionless units, verify l_P_star. */
    field_t c3 = c->c_star * c->c_star * c->c_star;
    field_t lp_from_h = (field_t)sqrt((double)(c->h_star / c3));
    if (fabs(lp_from_h - c->l_p_star) > FIELD_EPS) {
        return -3;
    }
    return 0;
}

void constants_print(const universe_constants_t *c, FILE *out)
{
    fprintf(out, "=== 虚拟宇宙无量纲常数表 ===\n");
    fprintf(out, "  l*_P (虚拟普朗克长度) = %.*g\n",  FIELD_DIGITS, (double)c->l_p_star);
    fprintf(out, "  t*_P (虚拟普朗克时间) = %.*g\n",  FIELD_DIGITS, (double)c->t_p_star);
    fprintf(out, "  c*   (等效光速)       = %.*g\n",  FIELD_DIGITS, (double)c->c_star);
    fprintf(out, "  h*   (等效普朗克常数) = %.*g\n",  FIELD_DIGITS, (double)c->h_star);
    fprintf(out, "  ρ    (基准能量密度)   = %.*g\n",  FIELD_DIGITS, (double)c->rho);
    fprintf(out, "  c* = Δx/Δt            = %.*g\n",  FIELD_DIGITS,
            (double)(c->l_p_star / c->t_p_star));
    fprintf(out, "  h* = ρ·c*·(l*_P)^2     = %.*g\n",  FIELD_DIGITS,
            (double)(c->rho * c->c_star * c->l_p_star * c->l_p_star));
}
