// Public API exports
export { PixiDebugger } from './debugger.js';
export type {
  PixiInfo,
  SceneNode,
  SceneStats,
  RenderingInfo,
  TextureInfo,
  RenderInstruction,
  InstructionData,
  FullDebugData,
  CaptureData,
  BenchmarkData,
  TransportType,
  DebuggerOptions,
} from './debugger.js';
export type { CDPOptions } from './cdp.js';

// Transport layer exports
export { CDPTransport } from './cdp.js';
export { ClaudeBridgeTransport } from './claude-bridge.js';
export type { DebugTransport, TransportOptions, TransportTarget } from './transport.js';
