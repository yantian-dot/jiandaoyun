#!/usr/bin/env bash
set -euo pipefail

VERSION="0.5.2"
EXPECTED_SHA256="b57a8dc6df21eb7e8cf741d2d8d21f5d1a59fb056853de2fe822874e612e15e9"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PACKAGE_TGZ="${1:-${SCRIPT_DIR}/jiandaoyun-mcp-plugin-${VERSION}.tgz}"
DEFAULT_CREATOR="${2:-${JIANDAOYUN_DEFAULT_DATA_CREATOR:-}}"
OPENCLAW_USER="${OPENCLAW_USER:-openclaw}"
OPENCLAW_SERVICE="${OPENCLAW_SERVICE:-openclaw-main-gateway.service}"
REMOTE_TGZ="/tmp/jiandaoyun-mcp-plugin-${VERSION}.tgz"

if [[ ! -f "${PACKAGE_TGZ}" ]]; then
  echo "Package not found: ${PACKAGE_TGZ}" >&2
  echo "Usage: $0 /path/to/jiandaoyun-mcp-plugin-${VERSION}.tgz [default_jiandaoyun_creator]" >&2
  exit 1
fi

if command -v sha256sum >/dev/null 2>&1; then
  ACTUAL_SHA256="$(sha256sum "${PACKAGE_TGZ}" | awk '{print $1}')"
elif command -v shasum >/dev/null 2>&1; then
  ACTUAL_SHA256="$(shasum -a 256 "${PACKAGE_TGZ}" | awk '{print $1}')"
else
  echo "Neither sha256sum nor shasum is available." >&2
  exit 1
fi

if [[ "${ACTUAL_SHA256}" != "${EXPECTED_SHA256}" ]]; then
  echo "SHA256 mismatch for ${PACKAGE_TGZ}" >&2
  echo "expected=${EXPECTED_SHA256}" >&2
  echo "actual=${ACTUAL_SHA256}" >&2
  exit 1
fi

sudo install -m 0644 "${PACKAGE_TGZ}" "${REMOTE_TGZ}"

echo "Installing jiandaoyun-mcp-plugin ${VERSION} for user ${OPENCLAW_USER}..."
sudo -H -u "${OPENCLAW_USER}" bash -c "set -euxo pipefail; PATH=\"\$HOME/.local/bin:/usr/local/bin:/usr/bin:/bin:/usr/local/sbin:/usr/sbin:/sbin:/snap/bin\"; ls -lh '${REMOTE_TGZ}'; tar -tzf '${REMOTE_TGZ}' >/dev/null; node -v; npm -v; npm install -g '${REMOTE_TGZ}'; npm list -g --depth=0 jiandaoyun-mcp-plugin; command -v jiandaoyun-mcp"

echo "Writing business-required field rules..."
sudo -H -u "${OPENCLAW_USER}" bash -c 'set -euo pipefail; mkdir -p "$HOME/.openclaw-main"; printf "%s\n" "{" "  \"西北-中卫维抢修中心/机械队发电统计\": [\"启机原因\", \"作业位置\", \"启动设备\", \"开始时间\"]," "  \"669501b6c47c535dfe561619/6743d2b19d81b4a42b36e4d9\": [\"启机原因\", \"作业位置\", \"启动设备\", \"开始时间\"]" "}" > "$HOME/.openclaw-main/jiandaoyun-required-fields.json"; chmod 600 "$HOME/.openclaw-main/jiandaoyun-required-fields.json"; cat "$HOME/.openclaw-main/jiandaoyun-required-fields.json"'

echo "Updating OpenClaw MCP env references if openclaw.json is present..."
sudo -H -u "${OPENCLAW_USER}" env DEFAULT_CREATOR="${DEFAULT_CREATOR}" bash -c 'set -euo pipefail; node -e '"'"'
const fs = require("fs");
const path = `${process.env.HOME}/.openclaw-main/openclaw.json`;
if (!fs.existsSync(path)) {
  console.log(`skip: ${path} not found`);
  process.exit(0);
}
const json = JSON.parse(fs.readFileSync(path, "utf8"));
const servers = json.mcpServers || json.mcp_servers || (json.mcp && json.mcp.servers);
if (!servers || !servers.jiandaoyun) {
  console.log("skip: jiandaoyun MCP server not found in openclaw.json");
  process.exit(0);
}
servers.jiandaoyun.env = servers.jiandaoyun.env || {};
servers.jiandaoyun.env.JIANDAOYUN_REQUIRED_FIELDS_FILE = `${process.env.HOME}/.openclaw-main/jiandaoyun-required-fields.json`;
servers.jiandaoyun.env.JIANDAOYUN_USER_MAP_FILE = servers.jiandaoyun.env.JIANDAOYUN_USER_MAP_FILE || `${process.env.HOME}/.openclaw-main/jiandaoyun-user-map.json`;
if (process.env.DEFAULT_CREATOR && process.env.DEFAULT_CREATOR.trim()) {
  servers.jiandaoyun.env.JIANDAOYUN_DEFAULT_DATA_CREATOR = process.env.DEFAULT_CREATOR.trim();
}
fs.copyFileSync(path, `${path}.bak.${Date.now()}`);
fs.writeFileSync(path, `${JSON.stringify(json, null, 2)}\n`);
console.log(`updated: ${path}`);
'"'"''

echo "Reloading OpenClaw MCP runtime..."
sudo -H -u "${OPENCLAW_USER}" bash -c 'set -euo pipefail; PATH="$HOME/.local/bin:/usr/local/bin:/usr/bin:/bin:/usr/local/sbin:/usr/sbin:/sbin:/snap/bin"; if [[ -f "$HOME/.openclaw-main/.env" ]]; then set -a; . "$HOME/.openclaw-main/.env"; set +a; fi; openclaw mcp reload || true'

if systemctl list-unit-files "${OPENCLAW_SERVICE}" >/dev/null 2>&1; then
  echo "Restarting ${OPENCLAW_SERVICE}..."
  sudo systemctl restart "${OPENCLAW_SERVICE}"
  sudo systemctl --no-pager --full status "${OPENCLAW_SERVICE}" | sed -n '1,18p'
else
  echo "Systemd service ${OPENCLAW_SERVICE} not found; skipping restart."
fi

echo
echo "Verification:"
sudo -H -u "${OPENCLAW_USER}" bash -c 'PATH="$HOME/.local/bin:/usr/local/bin:/usr/bin:/bin:/usr/local/sbin:/usr/sbin:/sbin:/snap/bin"; npm list -g --depth=0 jiandaoyun-mcp-plugin; if [[ -f "$HOME/.openclaw-main/.env" ]]; then set -a; . "$HOME/.openclaw-main/.env"; set +a; fi; openclaw mcp probe jiandaoyun | sed -n "1,120p"'

echo
echo "After install, send /reset to the WeACT assistant before testing."
