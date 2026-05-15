import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock electron net.fetch
vi.mock('electron', () => ({
  net: {
    fetch: vi.fn(),
  },
}));

import { net } from 'electron';
import { classifyDirectNetworkError, netFetch } from '../net-fetch.js';

const mockNetFetch = vi.mocked(net.fetch);

describe('classifyDirectNetworkError', () => {
  it('classifies TimeoutError', () => {
    const err = new DOMException('The operation was aborted due to timeout', 'TimeoutError');
    const result = classifyDirectNetworkError(err);
    expect(result.message).toBe('网络请求超时');
  });

  it('classifies unknown error', () => {
    const result = classifyDirectNetworkError(new Error('unknown'));
    expect(result.message).toBe('网络连接失败');
  });
});

describe('netFetch', () => {
  beforeEach(() => {
    mockNetFetch.mockReset();
  });

  it('returns body and status code on success', async () => {
    const body = new TextEncoder().encode('hello');
    mockNetFetch.mockResolvedValue({
      ok: true,
      status: 200,
      arrayBuffer: async () => body.buffer,
    });

    const result = await netFetch('https://example.com/api');
    expect(result.statusCode).toBe(200);
    expect(result.body).toBeInstanceOf(Buffer);
    expect(result.body.toString()).toBe('hello');
  });

  it('passes headers to net.fetch', async () => {
    mockNetFetch.mockResolvedValue({
      ok: true,
      status: 200,
      arrayBuffer: async () => new ArrayBuffer(0),
    });

    await netFetch('https://example.com/api', {
      headers: { 'X-Custom': 'value' },
    });

    expect(mockNetFetch).toHaveBeenCalledWith('https://example.com/api', {
      signal: undefined,
      headers: { 'X-Custom': 'value' },
    });
  });

  it('passes signal to net.fetch', async () => {
    const controller = new AbortController();
    mockNetFetch.mockResolvedValue({
      ok: true,
      status: 200,
      arrayBuffer: async () => new ArrayBuffer(0),
    });

    await netFetch('https://example.com/api', { signal: controller.signal });

    expect(mockNetFetch).toHaveBeenCalledWith('https://example.com/api', {
      signal: controller.signal,
      headers: undefined,
    });
  });

  it('throws on HTTP 429', async () => {
    mockNetFetch.mockResolvedValue({
      ok: false,
      status: 429,
    });

    await expect(netFetch('https://example.com/api')).rejects.toThrow('请求频率过高');
  });

  it('throws on HTTP 503', async () => {
    mockNetFetch.mockResolvedValue({
      ok: false,
      status: 503,
    });

    await expect(netFetch('https://example.com/api')).rejects.toThrow('服务暂时不可用');
  });

  it('throws on other HTTP errors', async () => {
    mockNetFetch.mockResolvedValue({
      ok: false,
      status: 500,
    });

    await expect(netFetch('https://example.com/api')).rejects.toThrow('HTTP 500');
  });

  it('classifies network errors from fetch failure', async () => {
    mockNetFetch.mockRejectedValue(new Error('network failure'));

    await expect(netFetch('https://example.com/api')).rejects.toThrow('网络连接失败');
  });

  it('classifies timeout errors from fetch failure', async () => {
    mockNetFetch.mockRejectedValue(
      new DOMException('The operation was aborted due to timeout', 'TimeoutError'),
    );

    await expect(netFetch('https://example.com/api')).rejects.toThrow('网络请求超时');
  });
});
