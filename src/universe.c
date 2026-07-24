/*
 * universe.c - 信息场演化引擎核心实现
 */
#include "universe.h"
#include <stdlib.h>
#include <stdio.h>
#include <string.h>
#include <math.h>

/* ---- 内部辅助 ---- */

static inline int idx(const universe_t *u, int x, int y, int z)
{
    const int nx = u->cfg.nx, ny = u->cfg.ny;
    /* 周期边界 */
    x = (x % nx + nx) % nx;
    y = (y % ny + ny) % ny;
    z = (z % u->cfg.nz + u->cfg.nz) % u->cfg.nz;
    return (z * ny + y) * nx + x;
}

static inline field_t laplacian(const universe_t *u, int x, int y, int z)
{
    /* 七点拉普拉斯，单位网格间距 dx=1 */
    field_t c = universe_get(u, x, y, z);
    field_t sum =
        universe_get(u, x+1, y, z) + universe_get(u, x-1, y, z) +
        universe_get(u, x, y+1, z) + universe_get(u, x, y-1, z) +
        universe_get(u, x, y, z+1) + universe_get(u, x, y, z-1);
    return sum - (field_t)6.0 * c;
}

/* ---- 公开接口 ---- */

universe_t *universe_create(universe_config_t cfg)
{
    universe_t *u = (universe_t *)calloc(1, sizeof(universe_t));
    if (!u) return NULL;

    /* 填充默认值 */
    u->cfg = cfg;
    if (u->cfg.nx <= 0) u->cfg.nx = GRID_NX_DEFAULT;
    if (u->cfg.ny <= 0) u->cfg.ny = GRID_NY_DEFAULT;
    if (u->cfg.nz <= 0) u->cfg.nz = GRID_NZ_DEFAULT;
    if (u->cfg.dx == (field_t)0) u->cfg.dx = DELTA_X;
    if (u->cfg.dy == (field_t)0) u->cfg.dy = DELTA_X;
    if (u->cfg.dz == (field_t)0) u->cfg.dz = DELTA_X;
    if (u->cfg.dt == (field_t)0) u->cfg.dt = DELTA_T;
    if (u->cfg.c_star == (field_t)0) u->cfg.c_star = u->cfg.dx / u->cfg.dt;
    if (u->cfg.delta_psi == (field_t)0) u->cfg.delta_psi = DELTA_PSI;
    if (u->cfg.diff_coef == (field_t)0) u->cfg.diff_coef = (field_t)0.12;
    if (u->cfg.coupling == (field_t)0) u->cfg.coupling = (field_t)0.3;

    size_t total = (size_t)u->cfg.nx * u->cfg.ny * u->cfg.nz;
    u->psi      = (field_t *)calloc(total, sizeof(field_t));
    u->psi_next = (field_t *)calloc(total, sizeof(field_t));
    if (!u->psi || !u->psi_next) {
        free(u->psi); free(u->psi_next); free(u);
        return NULL;
    }

    u->consts = constants_default();
    u->tick = 0;
    return u;
}

void universe_destroy(universe_t *u)
{
    if (!u) return;
    free(u->psi);
    free(u->psi_next);
    free(u);
}

void universe_seed_random(universe_t *u, field_t amplitude, unsigned int seed)
{
    /* 简单线性同余生成器，保证可复现 */
    unsigned int state = seed;
    size_t total = (size_t)u->cfg.nx * u->cfg.ny * u->cfg.nz;
    for (size_t i = 0; i < total; ++i) {
        state = state * 1103515245u + 12345u;
        field_t r = (field_t)((state >> 8) & 0xFFFFFF) / (field_t)0x1000000;
        r = r * (field_t)2.0 - (field_t)1.0;   /* [-1, 1) */
        u->psi[i] = r * amplitude;
    }
    universe_stats(u);
}

void universe_inject(universe_t *u, int x, int y, int z, field_t value)
{
    u->psi[idx(u, x, y, z)] = value;
}

int universe_evolve(universe_t *u, int n_steps)
{
    const field_t D    = u->cfg.diff_coef;
    const field_t g    = u->cfg.coupling;
    const field_t dpsi = u->cfg.delta_psi;
    const int nx = u->cfg.nx, ny = u->cfg.ny, nz = u->cfg.nz;

    for (int step = 0; step < n_steps; ++step) {
        field_t info_before = (field_t)0;
        for (size_t i = 0; i < (size_t)nx*ny*nz; ++i)
            info_before += fabs(u->psi[i]);

        for (int z = 0; z < nz; ++z)
        for (int y = 0; y < ny; ++y)
        for (int x = 0; x < nx; ++x) {
            int i = idx(u, x, y, z);
            field_t cur = u->psi[i];
            field_t lap = laplacian(u, x, y, z);

            /* 扩散项（因果传播：c*=1 限制单步 1 网格）*/
            field_t delta = D * lap;

            /* 非线性自耦合：V(Ψ) = -½g·Ψ²  →  V'(Ψ) = -g·Ψ
               信息密度反馈：高密度区压缩扩散 */
            delta -= g * cur * (cur * cur - (field_t)1.0) * (field_t)0.5;

            field_t next = cur + u->cfg.dt * delta;

            /* 分辨阈值截断：|ΔΨ| < δΨ 视为不可区分 */
            if (fabs(next - cur) < dpsi) {
                next = cur;
            }

            u->psi_next[i] = next;
        }

        /* 交换缓冲区 */
        field_t *tmp = u->psi;
        u->psi = u->psi_next;
        u->psi_next = tmp;

        /* 全域守恒修正（A2）：补偿截断导致的微小泄漏 */
        field_t info_after = (field_t)0;
        for (size_t i = 0; i < (size_t)nx*ny*nz; ++i)
            info_after += fabs(u->psi[i]);
        if (info_after > (field_t)0) {
            field_t scale = info_before / info_after;
            for (size_t i = 0; i < (size_t)nx*ny*nz; ++i)
                u->psi[i] *= scale;
        }

        u->tick++;
    }

    universe_stats(u);
    return n_steps;
}

field_t universe_get(const universe_t *u, int x, int y, int z)
{
    return u->psi[idx(u, x, y, z)];
}

void universe_stats(universe_t *u)
{
    size_t total = (size_t)u->cfg.nx * u->cfg.ny * u->cfg.nz;
    u->psi_max = u->psi[0];
    u->psi_min = u->psi[0];
    u->total_info = (field_t)0;
    for (size_t i = 0; i < total; ++i) {
        field_t v = u->psi[i];
        if (v > u->psi_max) u->psi_max = v;
        if (v < u->psi_min) u->psi_min = v;
        u->total_info += fabs(v);
    }
}

void universe_status(const universe_t *u, FILE *out)
{
    fprintf(out, "=== 引擎状态 (tick=%ld) ===\n", u->tick);
    fprintf(out, "  网格规模      : %d × %d × %d = %zu 单元\n",
            u->cfg.nx, u->cfg.ny, u->cfg.nz,
            (size_t)u->cfg.nx * u->cfg.ny * u->cfg.nz);
    fprintf(out, "  Δx (网格间距) : %g\n", (double)u->cfg.dx);
    fprintf(out, "  Δt (时序步长) : %g\n", (double)u->cfg.dt);
    fprintf(out, "  c* (因果上限) : %g\n", (double)u->cfg.c_star);
    fprintf(out, "  δΨ (分辨阈值) : %g\n", (double)u->cfg.delta_psi);
    fprintf(out, "  D* (扩散系数) : %g\n", (double)u->cfg.diff_coef);
    fprintf(out, "  Ψ_max         : %g\n", (double)u->psi_max);
    fprintf(out, "  Ψ_min         : %g\n", (double)u->psi_min);
    fprintf(out, "  全域信息测度   : %g\n", (double)u->total_info);
}

void universe_dump_slice(const universe_t *u, FILE *out)
{
    int z = u->cfg.nz / 2;
    const char *ramp = " .:-=+*#%@";
    int n = 9;
    fprintf(out, "=== 场切片 z=%d (tick=%ld) ===\n", z, u->tick);
    for (int y = 0; y < u->cfg.ny; ++y) {
        for (int x = 0; x < u->cfg.nx; ++x) {
            field_t v = universe_get(u, x, y, z);
            field_t norm = (u->psi_max > u->psi_min)
                ? (v - u->psi_min) / (u->psi_max - u->psi_min)
                : (field_t)0.5;
            int k = (int)(norm * (field_t)(n-1) + (field_t)0.5);
            if (k < 0) k = 0;
            if (k >= n) k = n-1;
            fputc(ramp[k], out);
        }
        fputc('\n', out);
    }
}
