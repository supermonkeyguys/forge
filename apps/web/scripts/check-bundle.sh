#!/usr/bin/env bash
set -e
cd "$(dirname "$0")/.."

echo "=== 1/2 构建 ==="
npx vite build 2>&1 | tail -20
echo "✅ Build OK"

echo ""
echo "=== 2/2 Bundle 分析 ==="
echo "--- JS chunks (按大小排序) ---"
find dist/assets -name "*.js" -exec ls -lh {} \; 2>/dev/null \
  | awk '{print $5, $9}' | sort -rh | head -10

LARGEST=$(find dist/assets -name "*.js" -exec ls -l {} \; 2>/dev/null \
  | awk '{print $5}' | sort -rn | head -1)
LARGEST_KB=$((LARGEST / 1024))

echo ""
echo "最大 chunk：${LARGEST_KB} KB"

if [ "$LARGEST_KB" -gt 300 ]; then
  echo "⚠️  超过 300KB 阈值，还需继续优化"
else
  echo "✅ 达标（< 300KB）"
fi

echo ""
echo "--- CSS ---"
find dist/assets -name "*.css" -exec ls -lh {} \; 2>/dev/null | awk '{print $5, $9}'
