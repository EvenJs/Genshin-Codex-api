#!/usr/bin/env python3
"""
Genshin Codex 数据更新脚本

用法:
    python update_data.py              # 更新所有数据并导入数据库
    python update_data.py --all        # 更新所有数据并导入数据库
    python update_data.py --no-seed    # 仅更新数据文件，不导入数据库
    python update_data.py --characters # 仅更新角色数据
    python update_data.py --achievements # 仅更新成就数据
    python update_data.py --artifacts  # 仅更新圣遗物数据
    python update_data.py --help       # 显示帮助

可以组合使用:
    python update_data.py --characters --artifacts
    python update_data.py --characters --no-seed
"""

import argparse
import subprocess
import sys
import time
from pathlib import Path

SCRIPT_DIR = Path(__file__).parent.resolve()

# 定义所有数据类型及其脚本（按执行顺序）
DATA_SCRIPTS = {
    "characters": [
        ("fetch_characters.py", "获取角色列表"),
        ("fetch_character_details.py", "获取角色详情"),
    ],
    "achievements": [
        ("fetch_achievement_categories.py", "获取成就分类"),
        ("fetch_achievements.py", "获取成就列表"),
    ],
    "artifacts": [
        ("fetch_artifact_sets.py", "获取圣遗物套装"),
    ],
}


def print_header(text: str):
    """打印带格式的标题"""
    print()
    print("=" * 60)
    print(f"  {text}")
    print("=" * 60)


def print_step(step: int, total: int, text: str):
    """打印步骤信息"""
    print(f"\n[{step}/{total}] {text}")
    print("-" * 40)


def run_script(script_name: str, description: str) -> bool:
    """运行单个脚本并返回是否成功"""
    script_path = SCRIPT_DIR / script_name

    if not script_path.exists():
        print(f"  错误: 脚本不存在 - {script_path}")
        return False

    print(f"  执行: {script_name}")
    print(f"  描述: {description}")
    print()

    try:
        result = subprocess.run(
            [sys.executable, str(script_path)],
            cwd=str(SCRIPT_DIR),
            capture_output=False,
            text=True,
        )

        if result.returncode != 0:
            print(f"  状态: 失败 (退出码: {result.returncode})")
            return False

        print(f"  状态: 成功")
        return True

    except Exception as e:
        print(f"  状态: 异常 - {e}")
        return False


def update_data(categories: list[str]) -> dict:
    """
    更新指定类型的数据

    返回: {"success": [...], "failed": [...]}
    """
    results = {"success": [], "failed": []}

    # 收集所有要执行的脚本
    scripts_to_run = []
    for category in categories:
        if category in DATA_SCRIPTS:
            for script_info in DATA_SCRIPTS[category]:
                scripts_to_run.append((category, script_info[0], script_info[1]))

    if not scripts_to_run:
        print("没有找到要执行的脚本")
        return results

    total = len(scripts_to_run)

    print_header("开始更新游戏数据")
    print(f"更新类型: {', '.join(categories)}")
    print(f"脚本数量: {total}")

    start_time = time.time()

    for idx, (category, script_name, description) in enumerate(scripts_to_run, 1):
        print_step(idx, total, f"{category.upper()}: {description}")

        success = run_script(script_name, description)

        if success:
            results["success"].append(script_name)
        else:
            results["failed"].append(script_name)

        # 在脚本之间稍作等待，避免请求过快
        if idx < total:
            time.sleep(1)

    elapsed = time.time() - start_time

    # 打印汇总
    print_header("更新完成")
    print(f"总耗时: {elapsed:.1f} 秒")
    print(f"成功: {len(results['success'])} 个脚本")
    print(f"失败: {len(results['failed'])} 个脚本")

    if results["failed"]:
        print(f"\n失败的脚本:")
        for script in results["failed"]:
            print(f"  - {script}")

    return results


def run_db_seed() -> bool:
    """运行 prisma db seed 将数据导入数据库"""
    print_header("导入数据到数据库")
    print("  执行: npm run db:seed")
    print()

    try:
        result = subprocess.run(
            ["npm", "run", "db:seed"],
            cwd=str(SCRIPT_DIR.parent),
            capture_output=False,
            text=True,
        )

        if result.returncode != 0:
            print(f"  状态: 失败 (退出码: {result.returncode})")
            return False

        print(f"  状态: 成功")
        return True

    except FileNotFoundError:
        print("  错误: 未找到 npm 命令，请确保已安装 Node.js")
        return False
    except Exception as e:
        print(f"  状态: 异常 - {e}")
        return False


def main():
    parser = argparse.ArgumentParser(
        description="Genshin Codex 游戏数据更新脚本",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
示例:
  python update_data.py              更新所有数据并导入数据库
  python update_data.py --no-seed    仅更新数据文件，不导入数据库
  python update_data.py --characters 仅更新角色数据并导入数据库
  python update_data.py --achievements --artifacts 更新成就和圣遗物数据
        """,
    )

    parser.add_argument(
        "--all",
        action="store_true",
        help="更新所有数据 (默认行为)",
    )
    parser.add_argument(
        "--characters",
        action="store_true",
        help="更新角色数据 (角色列表 + 角色详情)",
    )
    parser.add_argument(
        "--achievements",
        action="store_true",
        help="更新成就数据 (成就分类 + 成就列表)",
    )
    parser.add_argument(
        "--artifacts",
        action="store_true",
        help="更新圣遗物套装数据",
    )
    parser.add_argument(
        "--seed",
        action="store_true",
        help="更新数据后自动运行 prisma db seed 导入数据库",
    )
    parser.add_argument(
        "--no-seed",
        action="store_true",
        help="不运行数据库 seed (默认会运行)",
    )

    args = parser.parse_args()

    # 确定要更新的类型
    categories = []

    if args.characters:
        categories.append("characters")
    if args.achievements:
        categories.append("achievements")
    if args.artifacts:
        categories.append("artifacts")

    # 如果没有指定任何选项或指定了 --all，则更新全部
    if not categories or args.all:
        categories = list(DATA_SCRIPTS.keys())

    # 执行更新
    results = update_data(categories)

    # 判断是否需要运行 db seed
    # 默认运行 seed，除非指定了 --no-seed
    should_seed = not args.no_seed

    if should_seed and not results["failed"]:
        seed_success = run_db_seed()
        if not seed_success:
            return 1
    elif results["failed"]:
        print("\n由于数据更新失败，跳过数据库导入")

    # 返回状态码
    return 1 if results["failed"] else 0


if __name__ == "__main__":
    sys.exit(main())
