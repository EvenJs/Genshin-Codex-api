#!/bin/bash
#
# Genshin Codex 数据更新脚本
#
# 用法:
#   ./update_data.sh              # 更新所有数据
#   ./update_data.sh --all        # 更新所有数据
#   ./update_data.sh --characters # 仅更新角色数据
#   ./update_data.sh --achievements # 仅更新成就数据
#   ./update_data.sh --artifacts  # 仅更新圣遗物数据
#

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# 检查 Python 是否可用
if command -v python3 &> /dev/null; then
    PYTHON_CMD="python3"
elif command -v python &> /dev/null; then
    PYTHON_CMD="python"
else
    echo "错误: 未找到 Python，请先安装 Python 3"
    exit 1
fi

# 检查 Python 版本
PYTHON_VERSION=$($PYTHON_CMD -c 'import sys; print(f"{sys.version_info.major}.{sys.version_info.minor}")')
MAJOR_VERSION=$($PYTHON_CMD -c 'import sys; print(sys.version_info.major)')

if [ "$MAJOR_VERSION" -lt 3 ]; then
    echo "错误: 需要 Python 3，当前版本为 $PYTHON_VERSION"
    exit 1
fi

echo "使用 Python: $PYTHON_CMD (版本 $PYTHON_VERSION)"
echo ""

# 执行 Python 脚本
$PYTHON_CMD "$SCRIPT_DIR/update_data.py" "$@"
