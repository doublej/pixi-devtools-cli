import { connect, evaluate, listTargets, type CDPClient, type CDPOptions, type ConsoleMessage, type LogEntry } from './cdp.js';
import { INJECT_SCRIPT } from './inject.js';

export interface PixiInfo {
  version: string;
  majorVersion: string;
  hasApp: boolean;
  hasStage: boolean;
  hasRenderer: boolean;
}

export interface SceneNode {
  id: string;
  name: string;
  type: string;
  visible: boolean;
  alpha: number;
  position: { x: number; y: number };
  scale: { x: number; y: number };
  rotation: number;
  pivot: { x: number; y: number };
  anchor: { x: number; y: number } | null;
  width: number;
  height: number;
  worldVisible: boolean;
  worldAlpha: number;
  zIndex: number;
  sortableChildren: boolean;
  interactive: boolean;
  depth: number;
  children: SceneNode[];
  texture?: string | null;
  tint?: number;
  blendMode?: string;
  text?: string;
}

export interface SceneStats {
  total: number;
  container?: number;
  sprite?: number;
  graphics?: number;
  mesh?: number;
  text?: number;
  bitmaptext?: number;
  htmltext?: number;
  animatedsprite?: number;
  nineslicesprite?: number;
  tilingsprite?: number;
  particlecontainer?: number;
  filters?: number;
  masks?: number;
}

export interface RenderingInfo {
  type: 'webgl' | 'webgl2' | 'webgpu';
  width: number;
  height: number;
  resolution: number;
  background: string | null;
  backgroundAlpha: number;
  antialias: boolean;
  clearBeforeRender: boolean;
  roundPixels: boolean;
}

export interface TextureInfo {
  label: string;
  width: number;
  height: number;
  pixelWidth: number;
  pixelHeight: number;
  format: string;
  mipLevelCount: number;
  autoGenerateMipmaps: boolean;
  alphaMode: string;
  antialias: boolean;
  destroyed: boolean;
  isPowerOfTwo: boolean;
  autoGarbageCollect: boolean;
}

export interface RenderInstruction {
  type: string;
  action: string;
  blendMode?: string;
  size?: number;
  start?: number;
}

export interface InstructionData {
  count: number;
  instructions: RenderInstruction[];
}

export interface FullDebugData {
  info: PixiInfo;
  sceneGraph: SceneNode;
  stats: SceneStats;
  rendering: RenderingInfo;
  textures: TextureInfo[];
  instructions: InstructionData | null;
}

export interface CaptureData {
  renderTime: {
    avg: number;
    min: number;
    max: number;
    samples: number;
  };
  drawCalls: number;
  instructionCount: number;
  memory: {
    usedJSHeapSize: number;
    totalJSHeapSize: number;
    jsHeapSizeLimit: number;
  } | null;
  sceneComplexity: {
    totalNodes: number;
    visibleNodes: number;
  };
  canvas: {
    width: number;
    height: number;
    resolution: number;
  };
}

export interface BenchmarkData {
  duration: number;
  frameCount: number;
  fps: number;
  frameTime: {
    avg: number;
    min: number;
    max: number;
    p50: number;
    p95: number;
    p99: number;
  };
}

export class PixiDebugger {
  private client: CDPClient | null = null;
  private injected = false;

  async connect(options: CDPOptions = {}): Promise<void> {
    this.client = await connect(options);
    await this.inject();
  }

  async disconnect(): Promise<void> {
    if (this.client) {
      await this.client.close();
      this.client = null;
      this.injected = false;
    }
  }

  private async inject(): Promise<void> {
    if (!this.client || this.injected) return;
    await evaluate(this.client, INJECT_SCRIPT);
    this.injected = true;
  }

  async getInfo(): Promise<PixiInfo> {
    this.ensureConnected();
    return evaluate<PixiInfo>(this.client!, 'window.__PIXI_CLI_DEBUG__.getInfo()');
  }

  async getSceneGraph(): Promise<SceneNode> {
    this.ensureConnected();
    return evaluate<SceneNode>(this.client!, 'window.__PIXI_CLI_DEBUG__.getSceneGraph()');
  }

  async getStats(): Promise<SceneStats> {
    this.ensureConnected();
    return evaluate<SceneStats>(this.client!, 'window.__PIXI_CLI_DEBUG__.getStats()');
  }

  async getRendering(): Promise<RenderingInfo> {
    this.ensureConnected();
    return evaluate<RenderingInfo>(this.client!, 'window.__PIXI_CLI_DEBUG__.getRendering()');
  }

  async getTextures(): Promise<TextureInfo[]> {
    this.ensureConnected();
    return evaluate<TextureInfo[]>(this.client!, 'window.__PIXI_CLI_DEBUG__.getTextures()');
  }

  async getInstructions(): Promise<InstructionData | null> {
    this.ensureConnected();
    return evaluate<InstructionData | null>(this.client!, 'window.__PIXI_CLI_DEBUG__.getInstructions()');
  }

  async getAll(): Promise<FullDebugData> {
    this.ensureConnected();
    return evaluate<FullDebugData>(this.client!, 'window.__PIXI_CLI_DEBUG__.getAll()');
  }

  async capture(): Promise<CaptureData> {
    this.ensureConnected();
    return evaluate<CaptureData>(this.client!, 'window.__PIXI_CLI_DEBUG__.capture()');
  }

  async benchmark(durationMs = 3000): Promise<BenchmarkData> {
    this.ensureConnected();
    return evaluate<BenchmarkData>(this.client!, `window.__PIXI_CLI_DEBUG__.benchmark(${durationMs})`);
  }

  async watchStats(intervalMs = 1000, callback: (stats: SceneStats & { fps?: number }) => void): Promise<() => void> {
    let running = true;

    const poll = async () => {
      while (running) {
        const stats = await this.getStats();
        const fps = await evaluate<number>(this.client!, 'window.__PIXI_CLI_DEBUG__.getFps()');
        callback({ ...stats, fps });
        await new Promise(resolve => setTimeout(resolve, intervalMs));
      }
    };

    poll().catch(() => {});

    return () => { running = false; };
  }

  private ensureConnected(): void {
    if (!this.client) {
      throw new Error('Not connected. Call connect() first.');
    }
  }

  async watchConsole(
    callback: (entry: { level: string; message: string; timestamp: number; source?: string }) => void,
    levels?: string[]
  ): Promise<() => void> {
    this.ensureConnected();

    const levelSet = levels ? new Set(levels.map(l => l.toLowerCase())) : null;

    const consoleHandler = (params: unknown) => {
      const msg = params as ConsoleMessage;
      const level = msg.type.toLowerCase();
      if (levelSet && !levelSet.has(level)) return;

      const message = msg.args
        .map(arg => arg.value !== undefined ? String(arg.value) : arg.description || '')
        .join(' ');

      callback({ level, message, timestamp: msg.timestamp });
    };

    const logHandler = (params: unknown) => {
      const entry = params as { entry: LogEntry };
      const level = entry.entry.level.toLowerCase();
      if (levelSet && !levelSet.has(level)) return;

      callback({
        level,
        message: entry.entry.text,
        timestamp: entry.entry.timestamp,
        source: entry.entry.url,
      });
    };

    await this.client!.Runtime.enable();
    await this.client!.Log.enable();

    this.client!.on('Runtime.consoleAPICalled', consoleHandler);
    this.client!.on('Log.entryAdded', logHandler);

    return () => {
      this.client!.off('Runtime.consoleAPICalled', consoleHandler);
      this.client!.off('Log.entryAdded', logHandler);
    };
  }

  async clearConsole(): Promise<void> {
    this.ensureConnected();
    await this.client!.Log.clear();
  }

  static async listTargets(options: CDPOptions = {}): Promise<Array<{ id: string; title: string; url: string; type: string }>> {
    return listTargets(options);
  }
}
