#!/usr/bin/env bash
set -euo pipefail

VERSION="0.5.4"
EXPECTED_SHA256="618e148c915e28b4121e2688e4350f806c6dc417f808e69d898305d53635dfc5"
GITHUB_RAW_BASE="${JIANDAOYUN_GITHUB_RAW_BASE:-https://raw.githubusercontent.com/yantian-dot/jiandaoyun/main}"
SCRIPT_SOURCE="${BASH_SOURCE[0]:-$0}"
if SCRIPT_DIR="$(cd "$(dirname "${SCRIPT_SOURCE}")" 2>/dev/null && pwd)"; then
  :
else
  SCRIPT_DIR="$(pwd)"
fi
PACKAGE_TGZ="${1:-${SCRIPT_DIR}/jiandaoyun-mcp-plugin-${VERSION}.tgz}"
WORK_DIR="$(mktemp -d)"

cleanup() {
  rm -rf "${WORK_DIR}"
}
trap cleanup EXIT

download_file() {
  local url="$1"
  local output="$2"
  if command -v curl >/dev/null 2>&1; then
    curl -fL --retry 3 --connect-timeout 10 -o "${output}" "${url}"
  elif command -v wget >/dev/null 2>&1; then
    wget -O "${output}" "${url}"
  else
    echo "Neither curl nor wget is available; upload jiandaoyun-mcp-plugin-${VERSION}.tgz manually." >&2
    exit 1
  fi
}

if [[ ! -f "${PACKAGE_TGZ}" ]]; then
  PACKAGE_TGZ="${WORK_DIR}/jiandaoyun-mcp-plugin-${VERSION}.tgz"
  echo "Package not found locally; downloading ${VERSION} package from GitHub raw..."
  download_file "${GITHUB_RAW_BASE}/jiandaoyun-mcp-plugin-${VERSION}.tgz" "${PACKAGE_TGZ}"
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

tar -xzf "${PACKAGE_TGZ}" -C "${WORK_DIR}" package/scripts/install-on-server.sh
export JIANDAOYUN_PACKAGE_SHA256="${EXPECTED_SHA256}"
exec bash "${WORK_DIR}/package/scripts/install-on-server.sh" "${PACKAGE_TGZ}"
