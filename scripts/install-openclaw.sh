#!/usr/bin/env bash
set -euo pipefail

PACKAGE_TGZ="${1:-./jiandaoyun-mcp-plugin-0.5.4.tgz}"

echo "== Jiandaoyun OpenClaw installer helper =="

if ! command -v node >/dev/null 2>&1; then
  echo "ERROR: node is not installed or not in PATH." >&2
  exit 1
fi

NODE_MAJOR="$(node -p "Number(process.versions.node.split('.')[0])")"
if [ "$NODE_MAJOR" -lt 20 ]; then
  echo "ERROR: Node.js >= 20 is required. Current: $(node -v)" >&2
  exit 1
fi

if ! command -v npm >/dev/null 2>&1; then
  echo "ERROR: npm is not installed or not in PATH." >&2
  exit 1
fi

if [ ! -f "$PACKAGE_TGZ" ]; then
  echo "ERROR: package file not found: $PACKAGE_TGZ" >&2
  exit 1
fi

echo "Installing package globally: $PACKAGE_TGZ"
npm install -g "$PACKAGE_TGZ"

echo
echo "Installed commands:"
command -v jiandaoyun-mcp || true
command -v jiandaoyun-openclaw || true

echo
echo "Local prerequisite check:"
jiandaoyun-openclaw doctor || true

echo
echo "OpenClaw package validation:"
npm explore -g jiandaoyun-mcp-plugin -- npm run validate:openclaw || true

echo
echo "Recommended OpenClaw command:"
jiandaoyun-openclaw install-template

echo
echo "After adding the MCP server in OpenClaw, ask the agent to run:"
echo "  jdy_openclaw_doctor"
