#!/usr/bin/env bash
# 本机 headless 导出诊断报告 PDF（产品 UI 仍以浏览器「导出 PDF」= window.print 为主）
# 用法: ./scripts/export-diagnosis-pdf.sh <file:///.../report.html|http://...> <out.pdf>
set -euo pipefail
SRC="${1:?html/url required}"
OUT="${2:?output pdf required}"
CHROME="${CHROME_BIN:-/usr/bin/google-chrome}"
if [[ ! -x "$CHROME" ]]; then
  echo "跳过：未找到 Chrome ($CHROME)" >&2
  exit 2
fi
"$CHROME" --headless --disable-gpu --no-pdf-header-footer \
  --print-to-pdf="$OUT" "$SRC"
echo "wrote $OUT"
