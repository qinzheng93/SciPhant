import { describe, it, expect, vi, beforeEach } from 'vitest';
import { LLMClient } from '../llm-client.js';

function mockResponse(body: object, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(JSON.stringify(body)),
  } as unknown as Response;
}

describe('LLMClient', () => {
  let client: LLMClient;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    client = new LLMClient('test-key', 'gpt-4', 'https://api.example.com/v1/', 0.7);
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });

  describe('constructor', () => {
    it('stores properties and passes them into requests', async () => {
      const c = new LLMClient('key', 'my-model', 'http://url/', 0.5);
      fetchMock.mockResolvedValue(
        mockResponse({ choices: [{ message: { content: 'hi' } }] })
      );
      // Use analyzePaper so temperature from constructor is used
      await c.analyzePaper('T', 'A', []);
      const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
      expect(body.model).toBe('my-model');
      expect(body.temperature).toBe(0.5);
    });
  });

  describe('testConnection', () => {
    it('returns "Connection successful" on ok response', async () => {
      fetchMock.mockResolvedValue(
        mockResponse({ choices: [{ message: { content: 'Hi there' } }] })
      );
      const result = await client.testConnection();
      expect(result).toBe('Connection successful');
    });

    it('throws on HTTP 401 with "连接失败" wrapping API Key message', async () => {
      fetchMock.mockResolvedValue(mockResponse({ error: 'unauthorized' }, 401));
      await expect(client.testConnection()).rejects.toThrow('连接失败');
      await expect(client.testConnection()).rejects.toThrow('API Key 无效或已过期');
    });

    it('throws on HTTP 429 with "连接失败" wrapping rate limit message', async () => {
      fetchMock.mockResolvedValue(mockResponse({ error: 'rate limited' }, 429));
      await expect(client.testConnection()).rejects.toThrow('连接失败');
      await expect(client.testConnection()).rejects.toThrow('请求频率过高');
    });

    it('throws on HTTP 500 with "连接失败" wrapping internal error message', async () => {
      fetchMock.mockResolvedValue(mockResponse({ error: 'crash' }, 500));
      await expect(client.testConnection()).rejects.toThrow('连接失败');
      await expect(client.testConnection()).rejects.toThrow('服务端内部错误');
    });

    it('throws on other HTTP error with generic status message', async () => {
      fetchMock.mockResolvedValue(mockResponse({ error: 'bad' }, 403));
      // Generic HTTP errors (not 401/429/500) are re-thrown directly (message starts with "HTTP ")
      await expect(client.testConnection()).rejects.toThrow('HTTP 403');
    });

    it('throws on network error with "连接失败" message', async () => {
      fetchMock.mockRejectedValue(new Error('network down'));
      await expect(client.testConnection()).rejects.toThrow('连接失败: network down');
    });
  });

  describe('analyzePaper', () => {
    it('sends prompt with title, abstract, and topics', async () => {
      fetchMock.mockResolvedValue(
        mockResponse({ choices: [{ message: { content: 'analysis result' } }] })
      );
      await client.analyzePaper('Test Title', 'Test Abstract', ['topic1', 'topic2']);
      const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
      const userMsg = body.messages.find((m: { role: string }) => m.role === 'user').content;
      expect(userMsg).toContain('Test Title');
      expect(userMsg).toContain('Test Abstract');
      expect(userMsg).toContain('topic1, topic2');
    });

    it('returns trimmed analysis content from response', async () => {
      fetchMock.mockResolvedValue(
        mockResponse({ choices: [{ message: { content: '  detailed analysis  ' } }] })
      );
      const result = await client.analyzePaper('T', 'A', []);
      expect(result).toEqual({ analysis: 'detailed analysis' });
    });

    it('throws on empty response content', async () => {
      fetchMock.mockResolvedValue(
        mockResponse({ choices: [{ message: { content: '' } }] })
      );
      await expect(client.analyzePaper('T', 'A', [])).rejects.toThrow('返回了空响应');
    });
  });

  describe('analyzeFullPaper', () => {
    it('sends deep analysis prompt with title and full text, returns content', async () => {
      fetchMock.mockResolvedValue(
        mockResponse({ choices: [{ message: { content: 'deep analysis' } }] })
      );
      const result = await client.analyzeFullPaper('Paper Title', 'Full paper text here');
      expect(result).toEqual({ analysis: 'deep analysis' });
      const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
      const userMsg = body.messages.find((m: { role: string }) => m.role === 'user').content;
      expect(userMsg).toContain('Paper Title');
      expect(userMsg).toContain('Full paper text here');
      // Deep analysis prompt contains detailed analysis instructions
      expect(userMsg).toContain('核心问题与动机');
    });
  });

  describe('buildUrl', () => {
    it('strips trailing slashes from baseUrl', async () => {
      const trailingClient = new LLMClient('k', 'm', 'https://api.example.com/v1///', 0.5);
      fetchMock.mockResolvedValue(
        mockResponse({ choices: [{ message: { content: 'ok' } }] })
      );
      await trailingClient.testConnection();
      const calledUrl = fetchMock.mock.calls[0][0] as string;
      expect(calledUrl).toBe('https://api.example.com/v1/chat/completions');
      expect(calledUrl).not.toContain('///');
    });
  });

  describe('request body structure', () => {
    it('includes correct headers, model, temperature, and message roles', async () => {
      fetchMock.mockResolvedValue(
        mockResponse({ choices: [{ message: { content: 'result' } }] })
      );
      await client.analyzePaper('T', 'A', ['x']);
      const [url, options] = fetchMock.mock.calls[0];
      expect(url).toBe('https://api.example.com/v1/chat/completions');
      expect(options.method).toBe('POST');
      expect(options.headers.Authorization).toBe('Bearer test-key');
      expect(options.headers['Content-Type']).toBe('application/json');
      const body = JSON.parse(options.body as string);
      expect(body.model).toBe('gpt-4');
      expect(body.temperature).toBe(0.7);
      expect(body.messages).toHaveLength(2);
      expect(body.messages[0].role).toBe('system');
      expect(body.messages[1].role).toBe('user');
    });
  });
});
