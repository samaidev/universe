#!/bin/bash
# push.sh - 推送虚拟宇宙引擎到 GitHub 仓库 samaidev/universe
#
# !!! 安全提醒 !!!
# 1. 请先吊销之前在对话中泄露的旧 Token
# 2. 在 https://github.com/settings/tokens 生成新 Token (repo 权限)
# 3. 不要把 Token 写进任何文件，用环境变量传入
#
# 用法:
#   export GH_TOKEN="你的新Token"
#   ./push.sh
#
# 或交互式输入:
#   ./push.sh   (会提示输入)

set -e

REPO="samaidev/universe"
REMOTE_URL="https://github.com/${REPO}.git"

# 获取 Token
if [ -z "$GH_TOKEN" ]; then
    echo "未检测到 GH_TOKEN 环境变量"
    echo "请在 https://github.com/settings/tokens 生成新 Token (repo 权限)"
    read -s -p "粘贴新 Token: " GH_TOKEN
    echo ""
fi

echo "正在推送到 ${REPO} ..."

# 用 Token 设置远程地址（不会写入磁盘配置）
git remote remove origin 2>/dev/null || true
git remote add origin "https://${GH_TOKEN}@github.com/${REPO}.git"

# 推送
git push -u origin main

# 清理：移除带 Token 的 remote，避免 Token 残留在 .git/config
git remote remove origin
echo ""
echo "推送成功。已清理 remote 中的凭证缓存。"
echo "仓库地址: https://github.com/${REPO}"
