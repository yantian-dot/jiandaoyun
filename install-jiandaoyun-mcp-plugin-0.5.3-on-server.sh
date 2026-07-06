#!/usr/bin/env bash
set -euo pipefail

VERSION="0.5.3"
EXPECTED_SHA256="7c3ab2ecd7a6ec1ba582f1a3bcb0cf9710b3aed0547da0d8e5cb10b31548bd0e"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PACKAGE_TGZ="${1:-${SCRIPT_DIR}/jiandaoyun-mcp-plugin-${VERSION}.tgz}"
WORK_DIR="$(mktemp -d)"

cleanup() {
  rm -rf "${WORK_DIR}"
}
trap cleanup EXIT

if [[ ! -f "${PACKAGE_TGZ}" ]]; then
  echo "Package not found: ${PACKAGE_TGZ}" >&2
  echo "Upload this installer and jiandaoyun-mcp-plugin-${VERSION}.tgz to the same directory, then run:" >&2
  echo "  bash $0 ./jiandaoyun-mcp-plugin-${VERSION}.tgz" >&2
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

tar -xzf "${PACKAGE_TGZ}" -C "${WORK_DIR}" package/scripts/install-on-server.sh
export JIANDAOYUN_PACKAGE_SHA256="${EXPECTED_SHA256}"
exec bash "${WORK_DIR}/package/scripts/install-on-server.sh" "${PACKAGE_TGZ}"
