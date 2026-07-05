# OpenClaw Install And Schema Cache Design

## Scope

Version 0.5.0 improves OpenClaw installation and northwest-company schema stability.

It adds:

- A local schema cache for northwest-company app/form/widget metadata.
- MCP tools to refresh, inspect, and clear that cache.
- A small CLI helper for installer-facing diagnostics and config output.
- A shell installer helper and concise OpenClaw installation guide.

## Cache

The cache stores only metadata returned by read-only Jiandaoyun app/form/widget APIs. It does not store API keys or record data.

Default path:

```text
~/.jiandaoyun-mcp/cache/northwest-schema.json
```

The path can be overridden with `JIANDAOYUN_SCHEMA_CACHE_PATH`.

## Tools

- `jdy_northwest_refresh_schema`: fetch forms/widgets for northwest-company apps and write the cache.
- `jdy_northwest_schema_status`: report cache path, existence, timestamp, app count, form count, and widget count.
- `jdy_northwest_clear_schema_cache`: delete the cache.

## CLI

The new `jiandaoyun-openclaw` command supports:

- `doctor`: check Node version, environment variables, and command availability.
- `print-config`: print an OpenClaw MCP config snippet.
- `install-template`: print the recommended `openclaw mcp add` command.

The CLI does not write secrets or mutate OpenClaw config directly.

## Out Of Scope

Dangerous-tool protection, OAuth, and a native OpenClaw channel plugin remain out of scope.
