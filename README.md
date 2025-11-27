# pixi-devtools-cli

CLI debugger for PixiJS applications via Chrome DevTools Protocol (CDP).

## Background

This CLI was built on top of the [PixiJS DevTools Chrome Extension](https://github.com/pixijs/devtools). The Chrome extension provides a visual panel for debugging PixiJS applications - this CLI exposes the same debugging capabilities for terminal-based workflows, automation, and AI-assisted development.

The injection script and data extraction logic are derived from the Chrome extension's backend, adapted to work via CDP's `Runtime.evaluate` instead of Chrome extension messaging.

## Requirements

- **Node.js** >= 18
- **Chrome/Chromium** with remote debugging enabled

## Quick Start

```bash
# Launch Chrome with debugging + PixiJS DevTools extension (macOS)
pixi-debug launch http://localhost:3000

# Or start Chrome manually with debugging enabled
/Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome --remote-debugging-port=9222

# Then run commands
pixi-debug info
pixi-debug stats
pixi-debug capture
```

## Installation

```bash
npm install -g @pixi/devtools-cli
# or
npx @pixi/devtools-cli <command>
```

## Commands

### launch

Launch Chrome with debugging enabled and the PixiJS DevTools extension loaded:

```bash
pixi-debug launch [url]
pixi-debug launch http://localhost:3000
pixi-debug launch -p 9333 http://localhost:3000  # custom port
pixi-debug launch --no-extension                  # without extension
```

### capture

Full frame capture with render pipeline profiling:

```bash
pixi-debug capture
```

Returns render time, draw calls per pipe, pipe timings, instruction tree with shader code/textures, scene totals, and memory usage.

### inspect

Inspect individual render instructions:

```bash
pixi-debug inspect                    # list all instructions
pixi-debug inspect --filter batch     # filter by type
pixi-debug inspect 0                  # details for instruction 0
```

Instruction types: filter (shader code), batch (textures), mask, mesh (geometry), graphics.

### console

Watch browser console output in real-time:

```bash
pixi-debug console                          # all levels
pixi-debug console --level error            # errors only
pixi-debug console --level warn --level error
pixi-debug console --json                   # JSON output
pixi-debug console --clear                  # clear first
```

### info

```bash
pixi-debug info
```

```json
{
  "version": "8.5.0",
  "majorVersion": "8",
  "hasApp": true,
  "hasStage": true,
  "hasRenderer": true
}
```

### scene

```bash
pixi-debug scene          # tree format
pixi-debug scene --flat   # flat list
```

### stats

```bash
pixi-debug stats                        # one-shot
pixi-debug stats --watch --interval 500 # continuous
```

### rendering

```bash
pixi-debug rendering
```

### textures

```bash
pixi-debug textures
pixi-debug textures --sort width
```

### instructions

```bash
pixi-debug instructions   # PixiJS v8 only
```

### query

```bash
pixi-debug query "player"           # find by name
pixi-debug query ".*" --type Sprite # filter by type
pixi-debug query "*Button*"         # glob pattern
```

### all

```bash
pixi-debug all > debug-snapshot.json
```

## Global Options

| Option | Description | Default |
|--------|-------------|---------|
| `-H, --host` | CDP host | localhost |
| `-p, --port` | CDP port | 9222 |
| `-t, --target` | Target page ID or URL | auto-detect |

## Programmatic Usage

```typescript
import { PixiDebugger } from '@pixi/devtools-cli';

const debugger_ = new PixiDebugger();
await debugger_.connect({ port: 9222 });

const info = await debugger_.getInfo();
const stats = await debugger_.getStats();
const capture = await debugger_.capture();

// Watch console
const stop = await debugger_.watchConsole((entry) => {
  console.log(entry.level, entry.message);
}, ['error', 'warn']);

// Watch stats
const stopStats = await debugger_.watchStats(1000, (stats) => {
  console.log('FPS:', stats.fps);
});

await debugger_.disconnect();
```

## Output

All commands output JSON to stdout:

```bash
pixi-debug stats | jq
pixi-debug textures | jq '.[].label'
pixi-debug capture > frame.json
```

## License

MIT
