/*
 * universe.c - 信息场演化引擎核心实现（内生相互作用版）
 *
 * 无外部 D、g 参数。相互作用完全由关联函数 C[ρi,ρj] 内生涌现。
 */
#include "universe.h"
#include <stdlib.h>
#include <stdio.h>
#include <string.h>
#include <math.h>

/* ---- 原生信息函数（无几何依赖）---- */

/* 迹距离 D(ρ_i, ρ_j): 衡量两组态可区分程度，取值 [0,1] */
static inline field_t trace_distance(field_t a, field_t b)
{
    field_t diff = fabs(a - b);
    field_t norm = fabs(a) + fabs(b) + DELTA_PSI;
    field_t d = diff / norm;
    return (d > (field_t)1) ? (field_t)1 : d;
}

/* 关联函数 C[ρ_i, ρ_j]: 衡量相位联动强度，取值 [0,1]
   C = 1 - D（关联度 = 迹距离的补）*/
static inline field_t correlation(field_t a, field_t b)
{
    return (field_t)1 - trace_distance(a, b);
}

/* ---- 内部辅助 ---- */

static inline int idx3d(const universe_t *u, int x, int y, int z)
{
    const int nx = u->cfg.nx, ny = u->cfg.ny;
    x = (x % nx + nx) % nx;
    y = (y % ny + ny) % ny;
    z = (z % u->cfg.nz + u->cfg.nz) % u->cfg.nz;
    return (z * ny + y) * nx + x;
}

/* 6邻居方向表 */
static const int DX[6] = {1,-1, 0, 0, 0, 0};
static const int DY[6] = {0, 0, 1,-1, 0, 0};
static const int DZ[6] = {0, 0, 0, 0, 1,-1};
#define N_NEIGHBORS 6

/* ---- 公开接口 ---- */

universe_t *universe_create(universe_config_t cfg)
{
    universe_t *u = (universe_t *)calloc(1, sizeof(universe_t));
    if (!u) return NULL;

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
    /* diff_coef 和 coupling 已移除 — 相互作用完全内生 */

    size_t total = (size_t)u->cfg.nx * u->cfg.ny * u->cfg.nz;
    u->psi      = (field_t *)calloc(total, sizeof(field_t));
    u->psi_next = (field_t *)calloc(total, sizeof(field_t));
    if (!u->psi || !u->psi_next) {
        free(u->psi); free(u->psi_next); free(u);
        return NULL;
    }

    u->consts = constants_default();
    u->endo.c_th = (field_t)1;
    u->endo.d_star = (field_t)1;
    u->endo.active_links = 0;
    u->endo.isolated = 0;
    u->endo.avg_c = (field_t)1;
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
    unsigned int state = seed;
    size_t total = (size_t)u->cfg.nx * u->cfg.ny * u->cfg.nz;
    for (size_t i = 0; i < total; ++i) {
        state = state * 1103515245u + 12345u;
        field_t r = (field_t)((state >> 8) & 0xFFFFFF) / (field_t)0x1000000;
        r = r * (field_t)2.0 - (field_t)1.0;
        u->psi[i] = r * amplitude;
    }
    universe_stats(u);
}

void universe_inject(universe_t *u, int x, int y, int z, field_t value)
{
    u->psi[idx3d(u, x, y, z)] = value;
}

int universe_evolve(universe_t *u, int n_steps)
{
    const field_t dpsi = u->cfg.delta_psi;
    const int nx = u->cfg.nx, ny = u->cfg.ny, nz = u->cfg.nz;
    const size_t N = (size_t)nx * ny * nz;

    for (int step = 0; step < n_steps; ++step) {
        /* 守恒基准 */
        field_t sum_before = (field_t)0;
        for (size_t i = 0; i < N; ++i)
            sum_before += u->psi[i];

        /* Pass 1: 计算所有邻居对的关联 C[i,j]，求和得到 <C> */
        field_t *c_arr = (field_t *)malloc(N * N_NEIGHBORS * sizeof(field_t));
        if (!c_arr) return step;

        int *nbr_idx = (int *)malloc(N * N_NEIGHBORS * sizeof(int));
        if (!nbr_idx) { free(c_arr); return step; }

        field_t sum_c = (field_t)0;
        long c_count = 0;

        for (int z = 0; z < nz; ++z)
        for (int y = 0; y < ny; ++y)
        for (int x = 0; x < nx; ++x) {
            int i = idx3d(u, x, y, z);
            for (int d = 0; d < N_NEIGHBORS; ++d) {
                int j = idx3d(u, x+DX[d], y+DY[d], z+DZ[d]);
                nbr_idx[i * N_NEIGHBORS + d] = j;
                field_t c = correlation(u->psi[i], u->psi[j]);
                c_arr[i * N_NEIGHBORS + d] = c;
                sum_c += c;
                c_count++;
            }
        }

        /* 动态阈值 C_th = <C>（内生涌现）*/
        field_t avg_c = sum_c / (field_t)c_count;
        field_t c_th = avg_c;
        /* 涌现扩散系数 D* = <C> */
        field_t d_star = avg_c;

        /* Pass 2: 基于活跃链接的关联加权演化 */
        long active_links = 0;
        long isolated = 0;

        for (size_t i = 0; i < N; ++i) {
            field_t cur = u->psi[i];
            field_t weighted_diff = (field_t)0;
            field_t weight_sum = (field_t)0;

            for (int d = 0; d < N_NEIGHBORS; ++d) {
                field_t c = c_arr[i * N_NEIGHBORS + d];
                /* 仅关联度高于阈值的链接为活跃链接 */
                if (c > c_th) {
                    int j = nbr_idx[i * N_NEIGHBORS + d];
                    weighted_diff += c * (u->psi[j] - cur);
                    weight_sum += c;
                    active_links++;
                }
            }

            field_t delta = (field_t)0;
            if (weight_sum > (field_t)0) {
                /* 涌现扩散：D* * sum(C_ij * (psi_j - psi_i)) / sum(C_ij)
                   非线性反馈已内嵌：高密度→低C→链接断开→无扩散 */
                delta = d_star * weighted_diff / weight_sum;
            } else {
                /* 无活跃链接 → 单元孤立 → 不演化 */
                isolated++;
            }

            field_t next = cur + u->cfg.dt * delta;
            /* 分辨阈值截断（A4） */
            if (fabs(next - cur) < dpsi) next = cur;
            /* 限幅防发散 */
            if (next > (field_t)10) next = (field_t)10;
            if (next < (field_t)-10) next = (field_t)-10;
            u->psi_next[i] = next;
        }

        free(c_arr);
        free(nbr_idx);

        /* 交换缓冲区 */
        field_t *tmp = u->psi;
        u->psi = u->psi_next;
        u->psi_next = tmp;

        /* 全域守恒修正（A2）：均值漂移校正 */
        field_t sum_after = (field_t)0;
        for (size_t i = 0; i < N; ++i)
            sum_after += u->psi[i];
        field_t drift = (sum_before - sum_after) / (field_t)N;
        if (fabs(drift) > (field_t)1e-15) {
            for (size_t i = 0; i < N; ++i)
                u->psi[i] += drift;
        }

        /* 更新内生参数 */
        u->endo.c_th = c_th;
        u->endo.d_star = d_star;
        u->endo.active_links = active_links;
        u->endo.isolated = isolated;
        u->endo.avg_c = avg_c;
        u->tick++;
    }

    universe_stats(u);
    return n_steps;
}

field_t universe_get(const universe_t *u, int x, int y, int z)
{
    return u->psi[idx3d(u, x, y, z)];
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
    long total_links = (long)u->cfg.nx * u->cfg.ny * u->cfg.nz * N_NEIGHBORS;
    fprintf(out, "=== 引擎状态 (tick=%ld) ===\n", u->tick);
    fprintf(out, "  网格规模      : %d x %d x %d = %zu 单元\n",
            u->cfg.nx, u->cfg.ny, u->cfg.nz,
            (size_t)u->cfg.nx * u->cfg.ny * u->cfg.nz);
    fprintf(out, "  dx (网格间距) : %g\n", (double)u->cfg.dx);
    fprintf(out, "  dt (时序步长) : %g\n", (double)u->cfg.dt);
    fprintf(out, "  c* (因果上限) : %g\n", (double)u->cfg.c_star);
    fprintf(out, "  dPsi (分辨阈值): %g\n", (double)u->cfg.delta_psi);
    fprintf(out, "  --- 内生参数 (无外部输入) ---\n");
    fprintf(out, "  C_th (动态阈值): %.6f\n", (double)u->endo.c_th);
    fprintf(out, "  D*   (涌现扩散): %.6f\n", (double)u->endo.d_star);
    fprintf(out, "  <C>  (平均关联): %.6f\n", (double)u->endo.avg_c);
    fprintf(out, "  活跃链接数     : %ld / %ld (%.1f%%)\n",
            u->endo.active_links, total_links,
            total_links > 0 ? (double)u->endo.active_links / total_links * 100 : 0);
    fprintf(out, "  孤立单元数     : %ld\n", u->endo.isolated);
    fprintf(out, "  Psi_max        : %g\n", (double)u->psi_max);
    fprintf(out, "  Psi_min        : %g\n", (double)u->psi_min);
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
