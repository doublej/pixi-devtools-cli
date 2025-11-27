# @pixi/devtools-cli

CLI debugger for PixiJS applications via Chrome DevTools Protocol (CDP).

## Prerequisites

Start Chrome/Chromium with remote debugging enabled:

```bash
# macOS
/Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome --remote-debugging-port=9222

# Linux
google-chrome --remote-debugging-port=9222

# Windows
chrome.exe --remote-debugging-port=9222
```

## Installation

```bash
npm install @pixi/devtools-cli
# or
npx @pixi/devtools-cli <command>
```

## Commands

### List browser targets

```bash
pixi-debug targets
```

### Get PixiJS info

```bash
pixi-debug info
```

Output:
```json
{
  "version": "8.5.0",
  "majorVersion": "8",
  "hasApp": true,
  "hasStage": true,
  "hasRenderer": true
}
```

### Export scene graph

```bash
# Tree format
pixi-debug scene

# Flat list format
pixi-debug scene --flat
```

### Get scene statistics

```bash
# One-shot
pixi-debug stats

# Watch mode (continuous output)
pixi-debug stats --watch --interval 500
```

Output:
```json
{
  "total": 150,
  "container": 45,
  "sprite": 80,
  "text": 20,
  "graphics": 5,
  "filters": 3,
  "masks": 2
}
```

### Get renderer info

```bash
pixi-debug rendering
```

Output:
```json
{
  "type": "webgl2",
  "width": 1920,
  "height": 1080,
  "resolution": 2,
  "background": "#000000",
  "antialias": true
}
```

### List GPU textures

```bash
# Default
pixi-debug textures

# Sorted by width
pixi-debug textures --sort width
```

### Get render instructions (v8 only)

```bash
pixi-debug instructions
```

### Get all debug data

```bash
pixi-debug all > debug-snapshot.json
```

### Query nodes

```bash
# Find by name pattern
pixi-debug query "player"

# Filter by type
pixi-debug query ".*" --type Sprite
```

## Options

| Option | Description | Default |
|--------|-------------|---------|
| `-H, --host` | CDP host | localhost |
| `-p, --port` | CDP port | 9222 |
| `-t, --target` | Target page ID or URL | auto |

## Programmatic Usage

```typescript
import { PixiDebugger } from '@pixi/devtools-cli';

const debugger = new PixiDebugger();
await debugger.connect({ port: 9222 });

const info = await debugger.getInfo();
const sceneGraph = await debugger.getSceneGraph();
const stats = await debugger.getStats();
const textures = await debugger.getTextures();

// Watch stats continuously
const stop = await debugger.watchStats(1000, (stats) => {
  console.log('FPS:', stats.fps, 'Total nodes:', stats.total);
});

// Stop watching
stop();

await debugger.disconnect();
```

## Features Extracted from DevTools

| Feature | CLI Command | Description |
|---------|-------------|-------------|
| Scene Graph | `scene` | Full scene hierarchy with node properties |
| Statistics | `stats` | Node counts by type, filters, masks |
| Rendering | `rendering` | Renderer config, canvas size, WebGL version |
| Textures | `textures` | GPU texture inventory with metadata |
| Instructions | `instructions` | Render pipeline instructions (v8) |
| Query | `query` | Search nodes by name/type patterns |

## Output

All commands output JSON to stdout, making it easy to pipe to other tools:

```bash
# Save to file
pixi-debug all > snapshot.json

# Pretty print with jq
pixi-debug stats | jq

# Extract specific data
pixi-debug textures | jq '.[].label'
```
