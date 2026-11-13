#!/bin/bash
# Run on VPS: bash scripts/vps-c2-check.sh
set -e
cd "$(dirname "$0")/.." || exit 1

echo "========== C2 SESSION TROUBLESHOOT =========="
echo "[1] PM2 process"
pm2 describe fahis-1 2>/dev/null | sed -n '1,20p' || echo "pm2 fahis-1 not found"
echo ""
echo "[2] PM2 env (TCP / BUILD)"
pm2 env fahis-1 2>/dev/null | grep -E '^(TCP_|BUILD_|PORT=|APP_ENV)' || true
echo ""
echo "[3] .env files on disk"
for f in .env.production .env; do
  [ -f "$f" ] && echo "--- $f ---" && grep -E '^(TCP_|BUILD_|PORT=|APP_ENV)' "$f" 2>/dev/null || true
done
echo ""
echo "[4] TCP ports in LISTEN (need 2026 or your TCP_PORT)"
ss -tlnp | grep -E ':5000|:2026|:80|:443' || echo "none matched"
echo ""
echo "[5] Server startup lines (last 40 out)"
pm2 logs fahis-1 --lines 40 --nostream 2>/dev/null | grep -E '\[TCP\]|\[C2\]|\[ENV\]|FATAL|Error' || echo "no TCP/C2 lines — check full: pm2 logs fahis-1"
echo ""
HTTP_PORT=$(grep -E '^PORT=' .env.production .env 2>/dev/null | head -1 | cut -d= -f2)
HTTP_PORT=${HTTP_PORT:-5000}
echo "[6] HTTP C2 status (localhost)"
curl -s "http://127.0.0.1:${HTTP_PORT}/api/c2/status" || echo "curl failed — is PORT correct?"
echo ""
echo "[7] Latest implant build on server (if any)"
if [ -f builds/working/latest-meta.json ]; then
  cat builds/working/latest-meta.json
else
  echo "NO builds/working/latest-meta.json — build on VPS: npm run build:prod-exe"
fi
echo ""
echo "========== FIX CHECKLIST =========="
echo "• EXE host:port MUST match embedTarget from step 6"
echo "• Build on VPS: npm run build:prod-exe (not only npm run build)"
echo "• pm2 start ecosystem.config.cjs --update-env (args: --env=production)"
echo "• Firewall: ufw allow 2026/tcp"
echo "• Router: forward TCP 2026 -> VPS"
echo "• Run EXE, then: pm2 logs fahis-1 | grep 'New client connected'"
