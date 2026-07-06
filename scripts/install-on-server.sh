#!/usr/bin/env bash
set -euo pipefail

VERSION="0.5.4"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PACKAGE_TGZ="${1:-${SCRIPT_DIR}/jiandaoyun-mcp-plugin-${VERSION}.tgz}"
OPENCLAW_USER="${OPENCLAW_USER:-openclaw}"
OPENCLAW_SERVICE="${OPENCLAW_SERVICE:-openclaw-main-gateway.service}"
EXPECTED_SHA256="${JIANDAOYUN_PACKAGE_SHA256:-}"
REMOTE_TGZ="/tmp/jiandaoyun-mcp-plugin-${VERSION}.tgz"

if [[ ! -f "${PACKAGE_TGZ}" ]]; then
  echo "Package not found: ${PACKAGE_TGZ}" >&2
  echo "Usage: $0 /path/to/jiandaoyun-mcp-plugin-${VERSION}.tgz" >&2
  exit 1
fi

if [[ -n "${EXPECTED_SHA256}" ]]; then
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
fi

sudo install -m 0644 "${PACKAGE_TGZ}" "${REMOTE_TGZ}"

echo "Installing jiandaoyun-mcp-plugin ${VERSION} for user ${OPENCLAW_USER}..."
sudo -H -u "${OPENCLAW_USER}" bash -c "set -euxo pipefail; PATH=\"\$HOME/.local/bin:/usr/local/bin:/usr/bin:/bin:/usr/local/sbin:/usr/sbin:/sbin:/snap/bin\"; ls -lh '${REMOTE_TGZ}'; tar -tzf '${REMOTE_TGZ}' >/dev/null; node -v; npm -v; npm install -g '${REMOTE_TGZ}'; npm list -g --depth=0 jiandaoyun-mcp-plugin; command -v jiandaoyun-mcp"

echo "Validating installed OpenClaw package metadata..."
sudo -H -u "${OPENCLAW_USER}" bash -c 'set -euo pipefail; PATH="$HOME/.local/bin:/usr/local/bin:/usr/bin:/bin:/usr/local/sbin:/usr/sbin:/sbin:/snap/bin"; npm explore -g jiandaoyun-mcp-plugin -- npm run validate:openclaw'

echo "Linking Jiandaoyun skill into OpenClaw plugin-skills..."
sudo -H -u "${OPENCLAW_USER}" bash -c 'set -euo pipefail; PATH="$HOME/.local/bin:/usr/local/bin:/usr/bin:/bin:/usr/local/sbin:/usr/sbin:/sbin:/snap/bin"; pkg_dir="$(npm root -g)/jiandaoyun-mcp-plugin"; skill_src="$pkg_dir/openclaw/skills/jiandaoyun-openclaw-tools"; skill_dst="$HOME/.openclaw-main/plugin-skills/jiandaoyun-openclaw-tools"; test -f "$skill_src/SKILL.md"; mkdir -p "$HOME/.openclaw-main/plugin-skills"; ln -sfn "$skill_src" "$skill_dst"; test -f "$skill_dst/SKILL.md"; ls -l "$skill_dst"'

echo "Writing business-required field rules..."
sudo -H -u "${OPENCLAW_USER}" bash -c 'set -euo pipefail; mkdir -p "$HOME/.openclaw-main"; cat > "$HOME/.openclaw-main/jiandaoyun-required-fields.json" <<'"'"'JSON'"'"'
{
  "西北-中卫维抢修中心/机械队发电统计": ["启机原因", "作业位置", "启动设备", "开始时间", "作业详情"],
  "669501b6c47c535dfe561619/6743d2b19d81b4a42b36e4d9": ["启机原因", "作业位置", "启动设备", "开始时间", "作业详情"]
}
JSON
chmod 600 "$HOME/.openclaw-main/jiandaoyun-required-fields.json"; cat "$HOME/.openclaw-main/jiandaoyun-required-fields.json"'

echo "Ensuring creator map file exists without adding secrets or personal data..."
sudo -H -u "${OPENCLAW_USER}" bash -c 'set -euo pipefail; mkdir -p "$HOME/.openclaw-main"; if [[ ! -f "$HOME/.openclaw-main/jiandaoyun-user-map.json" ]]; then printf "%s\n" "{}" > "$HOME/.openclaw-main/jiandaoyun-user-map.json"; fi; chmod 600 "$HOME/.openclaw-main/jiandaoyun-user-map.json"; ls -l "$HOME/.openclaw-main/jiandaoyun-user-map.json"'

echo "Updating OpenClaw MCP env references and tool deny policy..."
sudo -H -u "${OPENCLAW_USER}" bash -c 'set -euo pipefail; node -e '"'"'
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
servers.jiandaoyun.env.JIANDAOYUN_USER_MAP_FILE = `${process.env.HOME}/.openclaw-main/jiandaoyun-user-map.json`;
servers.jiandaoyun.env.JIANDAOYUN_TIMEOUT_MS = servers.jiandaoyun.env.JIANDAOYUN_TIMEOUT_MS || "30000";
servers.jiandaoyun.env.JIANDAOYUN_CREATOR_POLICY = "locked";
delete servers.jiandaoyun.env.JIANDAOYUN_DEFAULT_DATA_CREATOR;
if (json.tools && Array.isArray(json.tools.deny)) {
  json.tools.deny = json.tools.deny.filter((item) => item !== "jiandaoyun__*");
  if (json.tools.deny.length === 0) delete json.tools.deny;
}
fs.copyFileSync(path, `${path}.bak.jiandaoyun-${Date.now()}`);
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
sudo -H -u "${OPENCLAW_USER}" bash -c 'set -euo pipefail; PATH="$HOME/.local/bin:/usr/local/bin:/usr/bin:/bin:/usr/local/sbin:/usr/sbin:/sbin:/snap/bin"; npm list -g --depth=0 jiandaoyun-mcp-plugin; test -f "$HOME/.openclaw-main/plugin-skills/jiandaoyun-openclaw-tools/SKILL.md"; if [[ -f "$HOME/.openclaw-main/.env" ]]; then set -a; . "$HOME/.openclaw-main/.env"; set +a; fi; openclaw mcp show jiandaoyun || true; openclaw mcp probe jiandaoyun | sed -n "1,160p"'

echo
echo "After install, send /reset to the WeACT assistant before testing."
echo "Submitter policy is locked. Fill $HOME/.openclaw-main/jiandaoyun-user-map.json with SenderId/open_id to Jiandaoyun username mappings before write tests."
