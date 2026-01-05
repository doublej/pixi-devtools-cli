/**
 * Transport abstraction for browser communication.
 * Allows switching between CDP (Chrome DevTools Protocol) and Claude-in-Chrome bridge.
 */

export interface TransportOptions {
  host?: string;
  port?: number;
  target?: string;
}

export interface DebugTransport {
  connect(options: TransportOptions): Promise<void>;
  evaluate<T>(expression: string): Promise<T>;
  disconnect(): Promise<void>;
  listTargets(): Promise<TransportTarget[]>;
}

export interface TransportTarget {
  id: string;
  title: string;
  url: string;
  type: string;
}
