# MCP Debugger

References:
-  https://microsoft.github.io/debug-adapter-protocol/

## Using Bun

Requires Bun. Install from `https://bun.sh`.

Commands:
- Install deps: `bun install`
- Dev (watch): `bun run dev`
- Start: `bun run start`
- Build: `bun run build`


```json
    "mcpServers": {
    "debugger": {
        "type": "stdio",
        "command": "/Users/andrew/.bun/bin/bun",
        "args": [
        "run",
        "--hot",
        "/Users/andrew/Developer/ML/mcp-debugger/src/index.ts"
        ],
        "env": {}
    }
    },
```
