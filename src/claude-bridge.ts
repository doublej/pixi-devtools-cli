/**
 * Claude-in-Chrome bridge transport.
 * Uses Claude Code SDK to execute JavaScript in Chrome via the Claude-in-Chrome extension.
 *
 * This allows PixiJS debugging without special Chrome launch flags.
 * Requires: Claude-in-Chrome extension installed in user's browser.
 */

import type { DebugTransport, TransportOptions, TransportTarget } from './transport.js';

export interface ClaudeBridgeOptions extends TransportOptions {
  tabId?: number;
}

/**
 * Transport that uses Claude-in-Chrome extension for browser communication.
 *
 * Architecture:
 * ┌─────────────┐    Claude Code SDK    ┌───────────────────┐
 * │ pixi-debug  │ ───────────────────►  │ Claude-in-Chrome  │
 * │ CLI         │   MCP tools           │ Extension         │
 * └─────────────┘                       └─────────┬─────────┘
 *                                                 │ Extension APIs
 *                                                 ▼
 *                                       ┌─────────────────┐
 *                                       │ Chrome          │
 *                                       │ (normal launch) │
 *                                       └─────────────────┘
 *
 * The bridge uses these MCP tools from Claude-in-Chrome:
 * - tabs_context_mcp: List available tabs
 * - javascript_tool: Execute JS in page context (like Runtime.evaluate)
 */
export class ClaudeBridgeTransport implements DebugTransport {
  private tabId: number | null = null;
  private connected = false;

  async connect(options: ClaudeBridgeOptions = {}): Promise<void> {
    // If tabId provided, use it; otherwise will select first tab on evaluate
    if (options.tabId) {
      this.tabId = options.tabId;
    }

    // Verify connection by getting tab context
    const tabs = await this.listTargets();
    if (tabs.length === 0) {
      throw new Error('No browser tabs available. Is Claude-in-Chrome running?');
    }

    // Auto-select first non-chrome tab if no tabId specified
    if (!this.tabId) {
      const target = tabs.find(t =>
        !t.url.startsWith('chrome://') &&
        !t.url.startsWith('devtools://')
      );
      if (target) {
        this.tabId = parseInt(target.id);
      }
    }

    this.connected = true;
  }

  async evaluate<T>(expression: string): Promise<T> {
    if (!this.connected) {
      throw new Error('Not connected. Call connect() first.');
    }

    if (!this.tabId) {
      throw new Error('No tab selected. Provide tabId or ensure tabs are available.');
    }

    // Execute via Claude-in-Chrome's javascript_tool
    const result = await this.executeInBrowser(expression);
    return result as T;
  }

  async disconnect(): Promise<void> {
    this.tabId = null;
    this.connected = false;
  }

  async listTargets(): Promise<TransportTarget[]> {
    // Get tabs from Claude-in-Chrome
    const tabs = await this.getTabContext();
    return tabs.map(tab => ({
      id: String(tab.tabId),
      title: tab.title,
      url: tab.url,
      type: 'page',
    }));
  }

  /**
   * Execute JavaScript in the browser via Claude-in-Chrome.
   * This is the core bridge method that will use the Claude Code SDK
   * to call the mcp__claude-in-chrome__javascript_tool.
   */
  private async executeInBrowser(expression: string): Promise<unknown> {
    // TODO: Implement via Claude Code SDK
    // The SDK allows calling MCP tools programmatically:
    //
    // import { Claude } from '@anthropic-ai/claude-code';
    // const claude = new Claude();
    // const result = await claude.tool('mcp__claude-in-chrome__javascript_tool', {
    //   action: 'javascript_exec',
    //   tabId: this.tabId,
    //   text: expression
    // });
    //
    // For now, throw an error indicating this needs the SDK

    throw new Error(
      'ClaudeBridgeTransport requires Claude Code SDK integration.\n' +
      'Install with: npm install @anthropic-ai/claude-code\n' +
      'Or use CDP transport: pixi-debug --transport cdp'
    );
  }

  /**
   * Get available tabs from Claude-in-Chrome.
   */
  private async getTabContext(): Promise<Array<{ tabId: number; title: string; url: string }>> {
    // TODO: Implement via Claude Code SDK
    // const claude = new Claude();
    // const result = await claude.tool('mcp__claude-in-chrome__tabs_context_mcp', {
    //   createIfEmpty: true
    // });
    // return result.availableTabs;

    throw new Error(
      'ClaudeBridgeTransport requires Claude Code SDK integration.\n' +
      'Install with: npm install @anthropic-ai/claude-code'
    );
  }

  getTabId(): number | null {
    return this.tabId;
  }
}
