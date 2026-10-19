import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import axios from 'axios';

export type LlmFeature =
  | 'descriptive_explanation'
  | 'predictive_explanation'
  | 'prescriptive_explanation'
  | 'manual_bundle_explanation'
  | 'business_assistant'
  | 'forecast_explanation'
  | 'recommendation_explanation'
  | 'report_summary'
  | 'home_executive_insight';

export interface LlmRequest {
  feature: LlmFeature;
  prompt: string;
  context?: Record<string, unknown>;
  history?: Array<{ role: 'user' | 'assistant'; content: string }>;
}

export interface LlmResponse {
  feature: LlmFeature;
  provider: 'glm' | 'qwen' | 'fallback';
  model: string;
  text: string;
  configured: boolean;
}

type Provider = 'glm' | 'qwen';

@Injectable()
export class LlmService {
  private readonly routing: Record<LlmFeature, Provider> = {
    descriptive_explanation: 'glm',
    predictive_explanation: 'glm',
    prescriptive_explanation: 'glm',
    manual_bundle_explanation: 'glm',
    business_assistant: 'qwen',
    forecast_explanation: 'glm',
    recommendation_explanation: 'glm',
    report_summary: 'glm',
    home_executive_insight: 'glm',
  };

  async generate(request: LlmRequest): Promise<LlmResponse> {
    const provider = this.routing[request.feature];
    const config = this.getProviderConfig(provider);
    if (!config.apiKey) {
      return {
        feature: request.feature,
        provider: 'fallback',
        model: config.model,
        configured: false,
        text: this.fallback(request),
      };
    }

    try {
      const response = await axios.post(
        `${config.baseUrl.replace(/\/$/, '')}/chat/completions`,
        {
          model: config.model,
          temperature: request.feature === 'business_assistant' ? 0.3 : 0.1,
          max_tokens: provider === 'glm' ? 1600 : 700,
          ...(provider === 'glm' ? { reasoning_effort: 'low' } : {}),
          messages: [
            {
              role: 'system',
              content: this.systemPrompt(request.feature),
            },
            ...(request.history || []).slice(-8),
            {
              role: 'user',
              content: [
                request.prompt,
                request.context
                  ? `Verified WOOF context JSON:\n${JSON.stringify(request.context)}`
                  : '',
              ]
                .filter(Boolean)
                .join('\n\n'),
            },
          ],
        },
        {
          headers: {
            Authorization: `Bearer ${config.apiKey}`,
            'Content-Type': 'application/json',
          },
          timeout: 20000,
        },
      );
      const choice = response.data?.choices?.[0];
      const message = choice?.message;
      const content = message?.content;
      const text = Array.isArray(content)
        ? content
            .filter((block: any) => block?.type === 'text' && typeof block.text === 'string')
            .map((block: any) => block.text)
            .join('\n')
        : typeof content === 'string'
          ? content
          : typeof message?.refusal === 'string'
            ? message.refusal
            : '';
      if (!text.trim()) {
        const finishReason = String(choice?.finish_reason || 'unknown');
        const completionTokens = Number(response.data?.usage?.completion_tokens);
        throw new Error(
          `Provider returned no visible text (finish_reason=${finishReason}${Number.isFinite(completionTokens) ? `, completion_tokens=${completionTokens}` : ''})`,
        );
      }
      return {
        feature: request.feature,
        provider,
        model: config.model,
        configured: true,
        text: text.trim(),
      };
    } catch (error) {
      if (process.env.LLM_STRICT === 'true') {
        throw new ServiceUnavailableException(
          `${provider} LLM request failed: ${error instanceof Error ? error.message : 'unknown error'}`,
        );
      }
      return {
        feature: request.feature,
        provider: 'fallback',
        model: config.model,
        configured: true,
        text: 'AI generation is currently unavailable because the configured provider request failed. Please try again after provider access is restored.',
      };
    }
  }

  private getProviderConfig(provider: Provider) {
    const defaults = {
      glm: {
        apiKey: process.env.GLM_API_KEY,
        baseUrl:
          process.env.GLM_BASE_URL || 'https://openrouter.ai/api/v1',
        model: process.env.GLM_MODEL || 'z-ai/glm-5.3-flash',
      },
      qwen: {
        apiKey: process.env.QWEN_API_KEY,
        baseUrl:
          process.env.QWEN_BASE_URL || 'https://openrouter.ai/api/v1',
        model: process.env.QWEN_MODEL || 'qwen/qwen3-14b',
      },
    } as const;
    return defaults[provider];
  }

  private systemPrompt(feature: LlmFeature) {
    const shared =
      'You are a WOOF business intelligence assistant. Use only verified context supplied by the backend. Never invent metrics, weather values, prices, scores, or historical evidence. If data is missing, say so. Keep the response concise and actionable.';
    const featureGuidance: Record<LlmFeature, string> = {
      descriptive_explanation:
        'Explain observed WOOF dashboard performance, patterns, and changes using only the supplied verified data. Do not predict or recommend unless the context explicitly contains a recommendation.',
      predictive_explanation:
        'Explain the forecast direction, confidence, model limitations, and operational meaning. Keep all forecast values exactly as supplied and distinguish projections from historical observations.',
      prescriptive_explanation:
        'Explain why each business recommendation is appropriate using the supplied evidence, expected lift, confidence, and constraints. Make the action clear without inventing a result.',
      manual_bundle_explanation:
        'Explain the manual bundle score, margin fit, generated baseline, and weather/calendar fit in plain business language.',
      business_assistant:
        'Sound like a helpful, thoughtful person having a conversation. Answer the question directly first, then explain only what helps. Use plain, natural language and short paragraphs. When presenting several metrics or rows, use a clear bulleted or numbered list with one item per line; name each metric and keep its value and unit together. Do not pack many numbers into one sentence, repeat the same figures, or add unexplained jargon. Keep all verified numbers, dates, units, and comparisons exactly as supplied. Briefly explain what the figures mean when supported by the data. Separate observed facts from interpretation, never invent a cause, and say clearly when the data cannot answer something. Ask one concise follow-up only when needed.',
      forecast_explanation:
        'Explain forecast direction, confidence or limitations, and the practical business implication without changing numbers.',
      recommendation_explanation:
        'Explain why a bundle recommendation is strong or weak using support, confidence, lift, margin, and context signals.',
      report_summary:
        'Write a short executive summary from the verified report data. Separate observed facts from recommendations.',
      home_executive_insight:
        'You are an executive AI revenue advisor for WOOF Happy Tails. Produce a punchy, 1-2 sentence executive business insight highlighting current channel strength, key revenue driver, and immediate strategic action. Be direct, authoritative, and data-backed. Never invent numbers.',
    };
    const insightStyle = feature === 'business_assistant' ? '' :
      'Use plain English for a store manager. Start with one short summary sentence. When presenting multiple metrics, products, or comparisons, use 2–4 bullet points with one point per line and keep each label, value, and unit together. Do not pack numerical lists into a sentence. Avoid jargon, repeated figures, and a repeated WOOF Insight heading. Separate any supported suggested action from observed facts. Do not infer consistent trends or causes from a short sample. Keep the response under 160 words unless the request requires a detailed report.';
    return `${shared} ${featureGuidance[feature]} ${insightStyle}`;
  }

  private fallback(request: LlmRequest) {
    if (request.feature === 'home_executive_insight') {
      const ctx = request.context as any;
      const topSector = ctx?.topSector || 'Retail';
      const topChannel = ctx?.topChannel || 'Shopee';
      const revFormatted = ctx?.totalRevenueFormatted || '';
      return `${topSector} is anchoring total business revenue${revFormatted ? ` at ${revFormatted}` : ''}, propelled by robust marketplace volume on ${topChannel}. Maintain physical POS cross-promotions while scaling high-demand pet care supplies online.`;
    }
    if (request.feature === 'manual_bundle_explanation') {
      return 'The bundle score is based on its generated-bundle baseline, margin fit, and weather/calendar context. Configure the assigned GLM provider to generate a detailed explanation.';
    }
    if (request.feature === 'descriptive_explanation') {
      return 'This explanation is based on the verified WOOF dashboard data supplied by the backend. Configure the assigned GLM provider for a generated narrative.';
    }
    if (request.feature === 'predictive_explanation') {
      return 'Forecast values are available from the WOOF analytics engine. Configure the assigned GLM provider for a generated narrative.';
    }
    if (request.feature === 'prescriptive_explanation') {
      if (request.context && (request.context.scheduledStaff || request.context.predictedVisits !== undefined)) {
        const ctx = request.context as any;
        const staff = Array.isArray(ctx.scheduledStaff) ? ctx.scheduledStaff.join(', ') : ctx.scheduledStaff || 'Active roster';
        return `At ${ctx.hour || 'this hour'} on ${ctx.dayOfWeek || 'today'}, ${ctx.staffCount || 'scheduled'} staff (${staff}) are on shift for an estimated ${ctx.predictedVisits ?? 0} customer visit${ctx.predictedVisits === 1 ? '' : 's'}. Operational coverage is aligned with current demand.`;
      }
      return 'This recommendation is based on verified WOOF business signals and active staff schedules.';
    }
    if (request.feature === 'forecast_explanation') {
      return 'Forecast values are available from the WOOF analytics engine. Configure the assigned GLM provider to generate a narrative summary.';
    }
    if (request.feature === 'recommendation_explanation') {
      return 'This recommendation is based on WOOF bundle and profitability signals. Configure the assigned GLM provider for a detailed rationale.';
    }
    if (request.feature === 'report_summary') {
      return 'The report was generated from verified WOOF analytics. Configure the assigned GLM provider for an executive narrative.';
    }
    return 'I can help explain WOOF dashboard results, bundles, forecasts, and recommendations once an LLM provider is configured.';
  }
}
