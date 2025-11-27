import CDP from 'chrome-remote-interface';

export interface CDPOptions {
  host?: string;
  port?: number;
  target?: string;
}

export interface ConsoleMessage {
  type: string;
  args: Array<{ type: string; value?: unknown; description?: string }>;
  timestamp: number;
  stackTrace?: { callFrames: Array<{ url: string; lineNumber: number; columnNumber: number }> };
}

export interface LogEntry {
  source: string;
  level: string;
  text: string;
  timestamp: number;
  url?: string;
  lineNumber?: number;
}

export interface CDPClient {
  Runtime: {
    evaluate: (params: {
      expression: string;
      returnByValue?: boolean;
      awaitPromise?: boolean;
    }) => Promise<{ result: { value?: unknown; type?: string; description?: string } }>;
    enable: () => Promise<void>;
  };
  Console: {
    enable: () => Promise<void>;
    disable: () => Promise<void>;
  };
  Log: {
    enable: () => Promise<void>;
    disable: () => Promise<void>;
    clear: () => Promise<void>;
  };
  on: (event: string, callback: (params: unknown) => void) => void;
  off: (event: string, callback: (params: unknown) => void) => void;
  close: () => Promise<void>;
}

export async function connect(options: CDPOptions = {}): Promise<CDPClient> {
  const { host = 'localhost', port = 9222, target } = options;

  const client = await CDP({
    host,
    port,
    target,
  }) as unknown as CDPClient;

  return client;
}

export async function evaluate<T>(client: CDPClient, expression: string): Promise<T> {
  const { result } = await client.Runtime.evaluate({
    expression,
    returnByValue: true,
    awaitPromise: true,
  });

  if (result.type === 'undefined') {
    throw new Error('Expression returned undefined - PixiJS may not be loaded');
  }

  return result.value as T;
}

export async function listTargets(options: CDPOptions = {}): Promise<Array<{ id: string; title: string; url: string; type: string }>> {
  const { host = 'localhost', port = 9222 } = options;
  const response = await fetch(`http://${host}:${port}/json`);
  return response.json();
}
