export interface AnalysisResult {
  analysis: string;
}

export interface DeepAnalysisResult {
  analysis: string;
}

const SYSTEM_PROMPT = '你是一个学术论文快速评估专家。你擅长从论文摘要中精准提炼关键信息，并给出严格、客观的质量评估。使用 Markdown 格式输出，语言简洁，避免空洞的修饰词。数学公式使用 LaTeX 格式，行内公式用 $...$，独立公式用 $$...$$。';

/**
 * Extract JSON from LLM response, handling ```json code blocks.
 */
export class LLMClient {
  private apiKey: string;
  private model: string;
  private baseUrl: string;
  private temperature: number;

  constructor(apiKey: string, model: string, baseUrl: string, temperature: number) {
    this.apiKey = apiKey;
    this.model = model;
    this.baseUrl = baseUrl;
    this.temperature = temperature;
  }

  private buildUrl(): string {
    return `${this.baseUrl.replace(/\/+$/, '')}/chat/completions`;
  }

  private async doFetch(url: string, body: string, signal?: AbortSignal): Promise<Response> {
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body,
        signal,
      });
      if (!response.ok) {
        const resBody = await response.text().catch(() => '');
        const statusMsg = response.status === 401
          ? 'API Key 无效或已过期 (HTTP 401)'
          : response.status === 429
            ? '请求频率过高 (HTTP 429)'
            : response.status === 500
              ? '服务端内部错误 (HTTP 500)'
              : `HTTP ${response.status}`;
        throw new Error(`${statusMsg}: ${resBody.slice(0, 200)}`);
      }
      return response;
    } catch (e) {
      if (e instanceof Error && e.message.startsWith('HTTP ')) throw e;
      if (e instanceof DOMException && e.name === 'TimeoutError') {
        throw new Error('请求超时');
      }
      throw new Error(`连接失败: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  private async parseResponse(response: Response): Promise<string> {
    let chatResp: { choices?: { message?: { content?: string } }[] };
    try {
      chatResp = await response.json();
    } catch (e) {
      throw new Error(`响应解析失败: ${e}`);
    }
    const content = chatResp.choices?.[0]?.message?.content;
    if (!content) {
      throw new Error('返回了空响应');
    }
    return content.trim();
  }

  /**
   * Analyze a paper using the LLM.
   */
  async analyzePaper(title: string, abstractText: string, topics: string[], signal?: AbortSignal): Promise<AnalysisResult> {
    const topicsStr = topics.join(', ');
    const prompt = `请分析以下学术论文，主要关注文章的关键问题、主要方法、指标效果，并评估文章的创新性。

要求：
1. 每个要点控制在1-3句以内，直击要点，不要铺垫。
2. 不要使用括号进行备注，不允许使用列表和表格。
3. 如果摘要中未提及某方面的信息，直接说明"摘要中未提及"，不要臆造内容。

输出格式：
**1. 关键问题**

[概括论文解决的核心问题]

**2. 主要方法**

[概括核心技术方法或框架]

**3. 指标效果**

[概括主要实验结果和关键性能数据]

**4. 创新性评估**

**评分：[较差|一般|较好|优秀]**

**评估依据：**[具体说明优点和不足]

创新性评分标准：
- 较差：增量改进，仅在已有方法上做微调或组合，无实质性新贡献，甚至方法有明显错误
- 一半：有一定创新，提出新视角或改进方案，但整体框架仍是常规思路
- 较好：显著创新，提出新方法、架构或理论，且有扎实实验支撑
- 优秀：突破性工作，开辟新研究方向或解决长期悬而未决的核心难题

注意：针对文章的优缺点进行客观的评价，不要因发表在顶级会议就给高分。

以下是论文的信息：

论文标题：${title}

论文摘要：${abstractText}

相关话题：${topicsStr}`;

    const request = {
      model: this.model,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: prompt },
      ],
      temperature: this.temperature,
    };
    const url = this.buildUrl();
    const requestJson = JSON.stringify(request);
    const timeoutSignal = AbortSignal.timeout(120000);
    const combinedSignal = signal
      ? AbortSignal.any([signal, timeoutSignal])
      : timeoutSignal;

    const response = await this.doFetch(url, requestJson, combinedSignal);
    const content = await this.parseResponse(response);

    return { analysis: content };
  }

  /**
   * Test connection by sending a simple "Hello" message.
   */
  async testConnection(): Promise<string> {
    const request = {
      model: this.model,
      messages: [{ role: 'user', content: 'Hello' }],
      temperature: 1.0,
    };
    const url = this.buildUrl();

    await this.doFetch(url, JSON.stringify(request), AbortSignal.timeout(30000));
    return 'Connection successful';
  }

  /**
   * Deep-analyze a full paper (title + extracted PDF text).
   */
  async analyzeFullPaper(title: string, fullText: string, signal?: AbortSignal): Promise<DeepAnalysisResult> {
    const prompt = `请对以下学术论文进行深度分析。要求内容具体、有据可依，引用论文中的具体方法、数据和结论，而非泛泛而谈。

输出模板：

## 1. 核心问题与动机

[论文解决的具体问题是什么？现有方法有哪些局限性促使了这项工作？]

## 2. 方法细节

[详细描述技术方案：架构、关键组件、损失函数、训练策略。做了哪些设计选择，为什么？]

## 3. 实验结论

[使用了哪些基准、对比了哪些基线、关键定量结果。改进在不同数据集/任务上是否一致？是否包含消融实验？]

## 4. 优势

[新颖贡献、实用价值、泛化能力。哪些内容如果不读这篇论文很难想到？]

## 5. 不足

[局限性、缺乏支撑的结论、缺失的基线对比、评估中的潜在偏差。方法在什么条件下可能失效？]

## 6. 总结

[核心发现、结论是否有充分证据支撑、未来方向建议。]

论文标题：${title}

全文：
${fullText}`;

    const request = {
      model: this.model,
      messages: [
        { role: 'system', content: '你是一位学术论文深度分析专家。请仔细阅读论文全文，提供严谨、客观的分析。重点关注技术合理性、实验严谨性和实际意义。使用 Markdown 格式输出，语言简洁。数学公式使用 LaTeX 格式，行内公式用 $...$，独立公式用 $$...$$。避免不必要的数学公式以简化内容。' },
        { role: 'user', content: prompt },
      ],
      temperature: this.temperature,
    };
    const url = this.buildUrl();
    const requestJson = JSON.stringify(request);
    const timeoutSignal = AbortSignal.timeout(300000);
    const combinedSignal = signal
      ? AbortSignal.any([signal, timeoutSignal])
      : timeoutSignal;

    const response = await this.doFetch(url, requestJson, combinedSignal);
    const content = await this.parseResponse(response);

    return { analysis: content };
  }
}
