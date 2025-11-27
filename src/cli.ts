#!/usr/bin/env node

import { Command } from 'commander';
import { spawn, execSync } from 'child_process';
import { existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { PixiDebugger } from './debugger.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

const program = new Command();

program
  .name('pixi-debug')
  .description('CLI debugger for PixiJS applications via Chrome DevTools Protocol')
  .version('1.0.0')
  .option('-H, --host <host>', 'CDP host', 'localhost')
  .option('-p, --port <port>', 'CDP port', '9222')
  .option('-t, --target <target>', 'Target page ID or URL');

program
  .command('launch [url]')
  .description(`Launch Chrome with debugging enabled and PixiJS DevTools extension:
    - Opens Chrome with remote debugging port
    - Loads PixiJS DevTools extension automatically
    - Uses minimal temp profile (no data copying)
    - Auto-builds extension if not found`)
  .option('-p, --port <port>', 'CDP port', '9222')
  .option('--no-extension', 'Launch without loading the extension')
  .action(async (url, cmdOpts) => {
    const port = cmdOpts.port;
    const chromePath = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
    const tmpDir = process.env.TMPDIR || '/tmp';
    const dataDir = `${tmpDir}/chrome-pixi-debug-${port}`;

    // Find extension path (relative to cli package)
    const extensionDist = resolve(__dirname, '../../devtool-chrome/dist/chrome');
    const extensionSrc = resolve(__dirname, '../../devtool-chrome');

    const args = [
      `--remote-debugging-port=${port}`,
      `--user-data-dir=${dataDir}`,
    ];

    // Build and load extension if requested
    if (cmdOpts.extension !== false) {
      if (!existsSync(extensionDist)) {
        console.log('Extension not built, building now...');
        const monorepoRoot = resolve(__dirname, '../../..');
        const viteBin = resolve(monorepoRoot, 'node_modules/.bin/vite');
        execSync(`"${viteBin}" build --config vite.chrome.config.ts`, { cwd: extensionSrc, stdio: 'inherit' });
        execSync(`"${viteBin}" build --config vite.inject.config.ts`, { cwd: extensionSrc, stdio: 'inherit' });
      }

      if (existsSync(extensionDist)) {
        args.push(`--load-extension=${extensionDist}`);
        console.log(`Loading extension from: ${extensionDist}`);
      } else {
        console.warn('Warning: Extension build failed, launching without it');
      }
    }

    if (url) {
      args.push(url);
    }

    console.log(`Launching Chrome on port ${port}...`);
    console.log(`Data directory: ${dataDir}`);

    const chrome = spawn(chromePath, args, {
      detached: true,
      stdio: 'ignore',
    });

    chrome.unref();
    console.log(`Chrome launched (PID: ${chrome.pid})`);
  });

program
  .command('targets')
  .description('List available browser targets')
  .action(async () => {
    const opts = program.opts();
    const targets = await PixiDebugger.listTargets({
      host: opts.host,
      port: parseInt(opts.port),
    });

    const pages = targets.filter(t => t.type === 'page');
    console.log(JSON.stringify(pages, null, 2));
  });

program
  .command('info')
  .description('Get PixiJS application info')
  .action(async () => {
    const debugger_ = await createDebugger();
    const info = await debugger_.getInfo();
    console.log(JSON.stringify(info, null, 2));
    await debugger_.disconnect();
  });

program
  .command('scene')
  .description('Export scene graph as JSON')
  .option('-d, --depth <depth>', 'Max depth to traverse', '100')
  .option('-f, --flat', 'Output flat node list instead of tree')
  .action(async (cmdOpts) => {
    const debugger_ = await createDebugger();
    const sceneGraph = await debugger_.getSceneGraph();

    if (cmdOpts.flat) {
      const flat = flattenSceneGraph(sceneGraph);
      console.log(JSON.stringify(flat, null, 2));
    } else {
      console.log(JSON.stringify(sceneGraph, null, 2));
    }

    await debugger_.disconnect();
  });

program
  .command('stats')
  .description('Get scene statistics')
  .option('-w, --watch', 'Watch mode - continuously output stats')
  .option('-i, --interval <ms>', 'Watch interval in milliseconds', '1000')
  .action(async (cmdOpts) => {
    const debugger_ = await createDebugger();

    if (cmdOpts.watch) {
      process.on('SIGINT', async () => {
        await debugger_.disconnect();
        process.exit(0);
      });

      const stop = await debugger_.watchStats(parseInt(cmdOpts.interval), (stats) => {
        console.log(JSON.stringify(stats));
      });

      process.on('SIGINT', () => {
        stop();
      });
    } else {
      const stats = await debugger_.getStats();
      console.log(JSON.stringify(stats, null, 2));
      await debugger_.disconnect();
    }
  });

program
  .command('rendering')
  .description('Get renderer configuration and status')
  .action(async () => {
    const debugger_ = await createDebugger();
    const rendering = await debugger_.getRendering();
    console.log(JSON.stringify(rendering, null, 2));
    await debugger_.disconnect();
  });

program
  .command('textures')
  .description('List GPU textures')
  .option('-s, --sort <field>', 'Sort by field (width, height, label)')
  .action(async (cmdOpts) => {
    const debugger_ = await createDebugger();
    let textures = await debugger_.getTextures();

    if (cmdOpts.sort) {
      textures = textures.sort((a, b) => {
        const field = cmdOpts.sort as keyof typeof a;
        if (typeof a[field] === 'number' && typeof b[field] === 'number') {
          return (b[field] as number) - (a[field] as number);
        }
        return String(a[field]).localeCompare(String(b[field]));
      });
    }

    console.log(JSON.stringify(textures, null, 2));
    await debugger_.disconnect();
  });

program
  .command('instructions')
  .description('Get render instructions (PixiJS v8 only)')
  .action(async () => {
    const debugger_ = await createDebugger();
    const instructions = await debugger_.getInstructions();
    console.log(JSON.stringify(instructions, null, 2));
    await debugger_.disconnect();
  });

program
  .command('all')
  .description('Get all debug data')
  .action(async () => {
    const debugger_ = await createDebugger();
    const all = await debugger_.getAll();
    console.log(JSON.stringify(all, null, 2));
    await debugger_.disconnect();
  });

program
  .command('capture')
  .description(`Full frame capture with render pipeline profiling:
    - Render time measurement
    - Draw calls per pipe (batch, filter, mask, etc.)
    - Pipe timings breakdown
    - Full instruction tree with shader code, textures, renderables
    - Scene totals (sprites, containers, filters)
    - Memory usage statistics`)
  .action(async () => {
    const debugger_ = await createDebugger();
    const capture = await debugger_.capture();
    console.log(JSON.stringify(capture, null, 2));
    await debugger_.disconnect();
  });

program
  .command('benchmark')
  .description('Run performance benchmark')
  .option('-d, --duration <ms>', 'Benchmark duration in milliseconds', '3000')
  .action(async (cmdOpts) => {
    const debugger_ = await createDebugger();
    const benchmark = await debugger_.benchmark(parseInt(cmdOpts.duration));
    console.log(JSON.stringify(benchmark, null, 2));
    await debugger_.disconnect();
  });

program
  .command('inspect [index]')
  .description(`Inspect individual render instructions from the pipeline:
    - List all instructions (summary): pixi-debug inspect --summary
    - Filter by type: pixi-debug inspect --filter batch
    - Get full details: pixi-debug inspect 0

    Instruction types include:
    - filter: shader code (vertex/fragment), state, renderables
    - batch: textures, blend mode, size
    - mask: mask renderable data
    - mesh: geometry (vertex/index count), texture, shader
    - graphics: renderable properties`)
  .option('-s, --summary', 'Show instruction summary list only')
  .option('-f, --filter <type>', 'Filter instructions by type (batch, filter, mask, etc.)')
  .action(async (index, cmdOpts) => {
    const debugger_ = await createDebugger();
    const capture = await debugger_.capture();

    if ('error' in capture) {
      console.log(JSON.stringify(capture, null, 2));
      await debugger_.disconnect();
      return;
    }

    let instructions = (capture as unknown as { instructions: Array<{ index: number; type: string; action: string; depth: number }> }).instructions;

    // Filter by type if specified
    if (cmdOpts.filter) {
      const filterPattern = new RegExp(cmdOpts.filter, 'i');
      instructions = instructions.filter(i => filterPattern.test(i.type));
    }

    if (cmdOpts.summary || index === undefined) {
      // Show summary list
      const summary = instructions.map(i => ({
        index: i.index,
        type: i.type,
        action: i.action,
        depth: i.depth
      }));
      console.log(JSON.stringify(summary, null, 2));
    } else {
      // Show specific instruction
      const idx = parseInt(index);
      const instruction = instructions.find(i => i.index === idx);
      if (instruction) {
        console.log(JSON.stringify(instruction, null, 2));
      } else {
        console.log(JSON.stringify({ error: `Instruction ${idx} not found` }, null, 2));
      }
    }

    await debugger_.disconnect();
  });

program
  .command('console')
  .description(`Watch browser console output in real-time:
    - Filter by level: pixi-debug console --level error
    - Multiple levels: pixi-debug console --level warn --level error
    - JSON output: pixi-debug console --json
    - Clear console: pixi-debug console --clear

    Levels: log, info, warn, error, debug`)
  .option('-l, --level <level...>', 'Filter by log level(s)')
  .option('-j, --json', 'Output as JSON')
  .option('-c, --clear', 'Clear console before watching')
  .action(async (cmdOpts) => {
    const debugger_ = await createDebugger();

    if (cmdOpts.clear) {
      await debugger_.clearConsole();
    }

    const levelColors: Record<string, string> = {
      error: '\x1b[31m',   // red
      warn: '\x1b[33m',    // yellow
      info: '\x1b[36m',    // cyan
      log: '\x1b[0m',      // default
      debug: '\x1b[90m',   // gray
    };
    const reset = '\x1b[0m';

    console.log('Watching console... (Ctrl+C to stop)\n');

    const stop = await debugger_.watchConsole((entry) => {
      if (cmdOpts.json) {
        console.log(JSON.stringify(entry));
      } else {
        const color = levelColors[entry.level] || levelColors.log;
        const time = new Date(entry.timestamp).toISOString().slice(11, 23);
        const levelPad = entry.level.toUpperCase().padEnd(5);
        console.log(`${color}[${time}] ${levelPad}${reset} ${entry.message}`);
      }
    }, cmdOpts.level);

    process.on('SIGINT', async () => {
      stop();
      await debugger_.disconnect();
      process.exit(0);
    });
  });

program
  .command('query <selector>')
  .description('Find nodes by name/type pattern (glob: *Filter*, regex with -r)')
  .option('-t, --type <type>', 'Filter by node type (Sprite, Container, etc.)')
  .option('-r, --regex', 'Treat selector as regex instead of glob')
  .action(async (selector, cmdOpts) => {
    const debugger_ = await createDebugger();
    const sceneGraph = await debugger_.getSceneGraph();
    const flat = flattenSceneGraph(sceneGraph);

    const pattern = cmdOpts.regex
      ? new RegExp(selector, 'i')
      : new RegExp(globToRegex(selector), 'i');
    let matches = flat.filter(node => pattern.test(node.name) || pattern.test(node.id));

    if (cmdOpts.type) {
      const typePattern = cmdOpts.regex
        ? new RegExp(cmdOpts.type, 'i')
        : new RegExp(globToRegex(cmdOpts.type), 'i');
      matches = matches.filter(node => typePattern.test(node.type));
    }

    console.log(JSON.stringify(matches, null, 2));
    await debugger_.disconnect();
  });

async function createDebugger(): Promise<PixiDebugger> {
  const opts = program.opts();
  const debugger_ = new PixiDebugger();

  let target = opts.target;

  // Auto-select first non-devtools page if no target specified
  if (!target) {
    const targets = await PixiDebugger.listTargets({
      host: opts.host,
      port: parseInt(opts.port),
    });
    const page = targets.find(t =>
      t.type === 'page' &&
      !t.url.startsWith('devtools://') &&
      !t.url.startsWith('chrome://')
    );
    if (page) {
      target = page.id;
    }
  }

  try {
    await debugger_.connect({
      host: opts.host,
      port: parseInt(opts.port),
      target,
    });
  } catch (err) {
    const error = err as Error & { code?: string };
    if (error.code === 'ECONNREFUSED') {
      console.error(JSON.stringify({
        error: 'Connection refused',
        message: `Cannot connect to Chrome at ${opts.host}:${opts.port}`,
        hint: 'Start Chrome with: chrome --remote-debugging-port=9222'
      }, null, 2));
      process.exit(1);
    }
    throw err;
  }

  return debugger_;
}

interface FlatNode {
  id: string;
  name: string;
  type: string;
  path: string;
  depth: number;
  visible: boolean;
  alpha: number;
  position: { x: number; y: number };
}

function flattenSceneGraph(
  node: { id: string; name: string; type: string; visible: boolean; alpha: number; position: { x: number; y: number }; depth: number; children?: unknown[] },
  path = '',
  result: FlatNode[] = []
): FlatNode[] {
  const currentPath = path ? `${path}/${node.name}` : node.name;

  result.push({
    id: node.id,
    name: node.name,
    type: node.type,
    path: currentPath,
    depth: node.depth,
    visible: node.visible,
    alpha: node.alpha,
    position: node.position,
  });

  if (node.children && Array.isArray(node.children)) {
    for (const child of node.children) {
      flattenSceneGraph(child as typeof node, currentPath, result);
    }
  }

  return result;
}

function globToRegex(glob: string): string {
  return glob
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')  // escape regex special chars except * and ?
    .replace(/\*/g, '.*')                   // * -> .*
    .replace(/\?/g, '.');                   // ? -> .
}

program.parse();
