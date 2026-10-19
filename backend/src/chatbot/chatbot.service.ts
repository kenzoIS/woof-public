import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';
import axios from 'axios';
import { SupabaseService } from '../common/supabase/supabase.service';
import { LlmService } from '../llm/llm.service';

type DashboardIntent =
  | 'total_revenue'
  | 'total_orders'
  | 'total_quantity'
  | 'average_order_value'
  | 'top_items'
  | 'sector_breakdown'
  | 'channel_breakdown'
  | 'best_sector'
  | 'best_channel'
  | 'forecast_overview'
  | 'cross_sell_overview'
  | 'out_of_scope';

type RangeKey =
  | 'today'
  | 'yesterday'
  | 'last_7_days'
  | 'this_month'
  | 'custom'
  | 'all';

type AnswerMode = 'compute' | 'clarify' | 'unsupported';
type NarrativeGoal =
  | 'direct_answer'
  | 'business_explanation'
  | 'comparison'
  | 'diagnostic'
  | 'recommendation'
  | 'verification'
  | 'follow_up'
  | 'no_data'
  | 'out_of_scope';

interface QueryPlan {
  intent: DashboardIntent;
  metric?: 'netSales' | 'orders' | 'quantity' | 'avgOrderValue';
  dateRange: RangeKey;
  sector?: 'Cafe' | 'Retail' | 'Services';
  channel?: 'POS' | 'Shopee' | 'TikTok Shop' | 'PetHub';
  limit?: number;
  dateStart?: string;
  dateEnd?: string;
  classifier?: 'claude' | 'fallback';
  answerMode?: AnswerMode;
  narrativeGoal?: NarrativeGoal;
  includeComparison?: boolean;
  needsClarification?: boolean;
  clarificationQuestion?: string;
  analysisSteps?: string[];
  warnings?: string[];
}

interface ChatHistoryItem {
  sender?: string;
  text?: string;
}

interface WarehouseFilters {
  dateStart?: string;
  dateEnd?: string;
  sector?: QueryPlan['sector'];
  channel?: QueryPlan['channel'];
}

interface WarehouseRow {
  net_sales?: number | string | null;
  quantity_sold?: number | string | null;
  transaction_id?: string | null;
  product_id?: string | null;
  service_id?: string | null;
  channel_dim?: { channel_name?: string | null } | null;
  date_dim?: { full_date?: string | null } | null;
  business_segment_dim?: { segment_name?: string | null } | null;
}

interface VerifiedFactPack {
  source: 'supabase_warehouse';
  method: 'backend_validated_analytics_retrieval';
  dateRange: { start: string | null; end: string | null; label: string };
  filters: { sector: string | null; channel: string | null };
  intent: DashboardIntent;
  metrics: Record<string, unknown>;
  comparisons?: Record<string, unknown>;
  audit: {
    tablesUsed: string[];
    aggregations: string[];
    rowsUsed?: number;
    confidence: 'verified' | 'limited' | 'unsupported';
  };
}

const OUT_OF_SCOPE_MESSAGE =
  'I am built for WOOF dashboard analytics, so I cannot help with that one. I can still help you check sales, orders, quantity sold, channels, sectors, top items, forecasts, and bundle recommendations.';

const MONTHS: Record<string, number> = {
  january: 0,
  february: 1,
  march: 2,
  april: 3,
  may: 4,
  june: 5,
  july: 6,
  august: 7,
  september: 8,
  sept: 8,
  october: 9,
  oct: 9,
  november: 10,
  nov: 10,
  december: 11,
  dec: 11,
  jan: 0,
  feb: 1,
  mar: 2,
  apr: 3,
  jun: 5,
  jul: 6,
  aug: 7,
};

const MONTH_ALIASES: Record<string, string> = {
  enero: 'january',
  pebrero: 'february',
  marso: 'march',
  abril: 'april',
  mayo: 'may',
  hunyo: 'june',
  hulyo: 'july',
  agosto: 'august',
  setyembre: 'september',
  oktubre: 'october',
  nobyembre: 'november',
  disyembre: 'december',
};

@Injectable()
export class ChatbotService {
  constructor(
    private readonly supabaseService: SupabaseService,
    private readonly llmService: LlmService,
  ) {}

  async answer(
    question: string,
    history: ChatHistoryItem[] = [],
  ): Promise<any> {
    const cleanedQuestion = String(question || '').trim();
    if (!cleanedQuestion) {
      throw new BadRequestException('Question is required.');
    }

    const conversationContext = this.buildConversationContext(history);
    const conversationalAnswer = this.getConversationalAnswer(
      cleanedQuestion,
      conversationContext,
    );
    if (conversationalAnswer) {
      return {
        answer: conversationalAnswer,
        scope: 'dashboard_conversation',
        queryPlan: {
          intent: 'out_of_scope',
          dateRange: 'all',
          answerMode: 'unsupported',
          classifier: 'fallback',
          analysisSteps: ['Handled as conversational WOOF assistant turn'],
        },
        confidence: 'high',
      };
    }

    if (this.hasUnsupportedEntityScope(cleanedQuestion)) {
      return {
        answer:
          'I can only answer questions using WOOF dashboard data. Branch-, store-, location-, or external brand-specific data is not available in the current WOOF dataset, so I cannot compute that accurately.',
        scope: 'out_of_scope',
        queryPlan: {
          intent: 'out_of_scope',
          dateRange: 'all',
          answerMode: 'unsupported',
          classifier: 'backend_scope_guard',
          analysisSteps: ['Detected unsupported entity or location scope'],
        },
        confidence: 'high',
      };
    }

    const questionForPlanning = this.resolveFollowUpQuestion(
      cleanedQuestion,
      conversationContext,
    );
    let plan = await this.planQuestion(
      questionForPlanning,
      conversationContext,
    );
    const fallbackClarification = this.getClarificationQuestion(
      questionForPlanning,
      plan,
    );
    if (
      fallbackClarification &&
      plan.intent !== 'out_of_scope' &&
      plan.answerMode !== 'unsupported'
    ) {
      plan = {
        ...plan,
        answerMode: 'clarify',
        needsClarification: true,
        clarificationQuestion:
          plan.clarificationQuestion || fallbackClarification,
        analysisSteps: plan.analysisSteps || this.defaultAnalysisSteps(plan),
      };
    }
    if (plan.intent === 'out_of_scope') {
      return {
        answer: OUT_OF_SCOPE_MESSAGE,
        scope: 'out_of_scope',
        queryPlan: plan,
        confidence: 'high',
      };
    }
    if (plan.needsClarification || plan.answerMode === 'clarify') {
      return {
        answer:
          plan.clarificationQuestion ||
          'I can answer that from the dashboard, but I need one more detail first. Which date range or metric should I use?',
        scope: 'dashboard',
        queryPlan: plan,
        confidence: 'needs_clarification',
      };
    }
    if (plan.answerMode === 'unsupported') {
      return {
        answer:
          plan.clarificationQuestion ||
          'That is related to WOOF, but this chatbot can only compute metrics that are already available through the dashboard data. Please ask about sales, orders, quantity sold, sectors, channels, top items, forecasts, or bundle recommendations.',
        scope: 'dashboard',
        queryPlan: plan,
        confidence: 'unsupported',
      };
    }

    const latestDate = await this.getLatestTransactionDate();
    if (!latestDate) {
      return {
        answer:
          'There is no uploaded transaction data yet, so I cannot compute a dashboard answer.',
        scope: 'dashboard',
        queryPlan: plan,
        confidence: 'high',
      };
    }

    const baseMatch = this.buildWarehouseFilters(plan, latestDate);

    const result = await this.executePlan(plan, baseMatch);
    const factualAnswer = this.renderAnswer(plan, result, latestDate);
    const factPack = await this.buildVerifiedFactPack(
      plan,
      result,
      baseMatch,
      latestDate,
    );
    return {
      answer: await this.humanizeAnswer({
        question: cleanedQuestion,
        questionForPlanning,
        factualAnswer,
        factPack,
        plan,
        result,
        latestDate,
        history: conversationContext,
      }),
      scope: 'dashboard',
      queryPlan: {
        ...plan,
        analyticsApproach:
          'NLP intent understanding with backend-validated Supabase warehouse facts and generative business narration.',
      },
      verifiedFacts: factPack,
      data: result,
      confidence: 'high',
    };
  }

  private async planQuestion(
    question: string,
    history: ChatHistoryItem[] = [],
  ): Promise<QueryPlan> {
    const fallback = this.classifyQuestion(question);
    try {
      const response = await this.llmService.generate({
        feature: 'business_assistant',
        prompt: this.buildPlannerPrompt(question, history),
      });
      if (!response.configured || response.provider === 'fallback')
        return this.enrichFallbackPlan(fallback, question);
      const parsed = this.parseJsonObject(response.text);
      return this.validateClaudePlan(parsed, fallback, question);
    } catch {
      return this.enrichFallbackPlan(fallback, question);
    }
  }

  private enrichFallbackPlan(plan: QueryPlan, question: string): QueryPlan {
    const narrativeGoal =
      plan.narrativeGoal || this.inferNarrativeGoal(question, plan.intent);
    return {
      ...plan,
      narrativeGoal,
      includeComparison:
        plan.includeComparison ??
        this.shouldIncludeComparison(question, narrativeGoal),
      classifier: 'fallback',
    };
  }

  private buildPlannerPrompt(
    question: string,
    history: ChatHistoryItem[] = [],
  ): string {
    const recentContext = history.length
      ? history
          .map(
            (item) =>
              `${item.sender === 'user' ? 'User' : 'WOOF'}: ${item.text}`,
          )
          .join('\n')
      : 'None';
    return [
      'Think through the user question as a controlled WOOF dashboard analyst, then convert it into a safe analytics intent plan.',
      'Do not reveal private chain-of-thought. Return only the required JSON with short public analysisSteps.',
      'The chatbot is only allowed to answer WOOF dashboard questions about sales, revenue, orders, quantity sold, average order value, top items, sector breakdown, channel breakdown, forecasts, and bundle recommendations.',
      'Classify by meaning, not keywords. Do not require trigger words such as "sales" when the user clearly continues a previous dashboard question.',
      'Use the recent chat context to resolve follow-ups, corrections, confirmations, pronouns, and elliptical prompts.',
      'If the user asks whether the previous answer is accurate, recompute the same dashboard query plan instead of marking it out_of_scope.',
      'If the user gives only a new date, sector, channel, or range, inherit the previous dashboard metric and filters, then replace only the newly mentioned part.',
      'Set intent to "out_of_scope" only when the latest message cannot be mapped to a WOOF dashboard metric even after using recent context.',
      'Before selecting an analytics capability, decide whether the question is answerable, ambiguous, unsupported, or needs a clarification question.',
      'Use answerMode "compute" only when the metric, dashboard domain, and date/range are clear enough to compute.',
      'Use answerMode "clarify" when the user mentions a month without year, asks "best" without enough context, asks a correction/follow-up without usable prior context, or asks for a vague metric that cannot be mapped to the allowed dashboard metrics.',
      'Use answerMode "unsupported" when the topic is WOOF-related but not computable from the current dashboard aggregations.',
      'Allowed intents: total_revenue, total_orders, total_quantity, average_order_value, top_items, sector_breakdown, channel_breakdown, best_sector, best_channel, forecast_overview, cross_sell_overview, out_of_scope.',
      'Allowed narrativeGoal values: direct_answer, business_explanation, comparison, diagnostic, recommendation, verification, follow_up, no_data, out_of_scope.',
      'Allowed dateRange values: today, yesterday, last_7_days, this_month, custom, all.',
      'For explicit dates, months, or years, set dateRange to "custom" and return dateStart/dateEnd in YYYY-MM-DD. Example: April 2025 means dateStart "2025-04-01" and dateEnd "2025-04-30".',
      'For exact dates, set dateStart and dateEnd to the same date. Example: April 13, 2023 means dateStart "2023-04-13" and dateEnd "2023-04-13".',
      'Allowed sectors: Cafe, Retail, Services.',
      'Allowed channels: POS, Shopee, TikTok Shop, PetHub.',
      'Allowed metrics: netSales, orders, quantity, avgOrderValue.',
      'Do not generate SQL. The backend will select safe Supabase warehouse retrieval logic from the validated analytics intent.',
      'Set includeComparison true when the user asks why, how it performed, if it is good/bad, if it is accurate, asks for insight, or when a short comparison would make the answer more useful.',
      'analysisSteps must be 2 to 4 short audit-friendly phrases, not hidden reasoning. Example: ["Detected revenue question", "Resolved exact date", "Use sales summary capability"].',
      'Return exactly this JSON shape:',
      JSON.stringify({
        answerMode: 'compute',
        intent: 'total_revenue',
        metric: 'netSales',
        narrativeGoal: 'business_explanation',
        includeComparison: true,
        dateRange: 'today',
        dateStart: null,
        dateEnd: null,
        sector: null,
        channel: null,
        limit: 5,
        needsClarification: false,
        clarificationQuestion: null,
        analysisSteps: [
          'Detected revenue question',
          'Resolved date range',
          'Use backend sales summary capability',
        ],
        warnings: [],
      }),
      'Recent chat context:',
      recentContext,
      `User question: ${question}`,
    ].join('\n');
  }

  private validateClaudePlan(
    value: Record<string, unknown>,
    fallback: QueryPlan,
    question: string,
  ): QueryPlan {
    const intent = this.allowedIntent(value.intent)
      ? value.intent
      : fallback.intent;
    const dateRange = this.allowedRange(value.dateRange)
      ? value.dateRange
      : fallback.dateRange;
    const explicitRange = this.extractExplicitDateRange(question);
    const dateStart =
      explicitRange?.dateStart ||
      this.safeIsoDate(value.dateStart) ||
      fallback.dateStart;
    const dateEnd =
      explicitRange?.dateEnd ||
      this.safeIsoDate(value.dateEnd) ||
      fallback.dateEnd;
    const normalizedDateRange = dateStart && dateEnd ? 'custom' : dateRange;
    const metric = this.allowedMetric(value.metric)
      ? value.metric
      : fallback.metric;
    const sector = this.allowedSector(value.sector)
      ? value.sector
      : fallback.sector;
    const channel = this.allowedChannel(value.channel)
      ? value.channel
      : fallback.channel;
    const limit =
      typeof value.limit === 'number'
        ? Math.min(Math.max(Math.round(value.limit), 1), 10)
        : fallback.limit;
    const answerMode = this.allowedAnswerMode(value.answerMode)
      ? value.answerMode
      : intent === 'out_of_scope'
        ? 'unsupported'
        : 'compute';
    const narrativeGoal = this.allowedNarrativeGoal(value.narrativeGoal)
      ? value.narrativeGoal
      : this.inferNarrativeGoal(question, intent);
    const includeComparison =
      typeof value.includeComparison === 'boolean'
        ? value.includeComparison
        : this.shouldIncludeComparison(question, narrativeGoal);
    const analysisSteps = Array.isArray(value.analysisSteps)
      ? value.analysisSteps
          .filter((item): item is string => typeof item === 'string')
          .map((item) => item.trim().slice(0, 140))
          .filter(Boolean)
          .slice(0, 4)
      : this.defaultAnalysisSteps({
          intent,
          metric,
          dateRange: normalizedDateRange,
          sector,
          channel,
          dateStart,
          dateEnd,
        });
    const warnings = Array.isArray(value.warnings)
      ? value.warnings
          .filter((item): item is string => typeof item === 'string')
          .map((item) => item.trim().slice(0, 160))
          .filter(Boolean)
          .slice(0, 4)
      : [];
    const clarificationFromClaude =
      typeof value.clarificationQuestion === 'string'
        ? value.clarificationQuestion.trim().slice(0, 240)
        : undefined;
    const backendClarification = this.getClarificationQuestion(question, {
      intent,
      metric,
      dateRange: normalizedDateRange,
      sector,
      channel,
      limit,
      dateStart,
      dateEnd,
      answerMode,
      needsClarification: Boolean(value.needsClarification),
    });
    const needsClarification =
      Boolean(backendClarification) ||
      Boolean(value.needsClarification) ||
      answerMode === 'clarify';

    return {
      intent,
      metric,
      dateRange: normalizedDateRange,
      sector,
      channel,
      limit,
      dateStart,
      dateEnd,
      answerMode: needsClarification ? 'clarify' : answerMode,
      narrativeGoal,
      includeComparison,
      needsClarification,
      clarificationQuestion: backendClarification || clarificationFromClaude,
      analysisSteps,
      warnings,
      classifier: 'claude',
    };
  }

  private classifyQuestion(question: string): QueryPlan {
    const q = this.normalizeQuestion(question);
    if (!this.isDashboardQuestion(q)) {
      return {
        intent: 'out_of_scope',
        dateRange: 'all',
        answerMode: 'unsupported',
      };
    }

    const dateRange = this.extractRange(q);
    const sector = this.extractSector(q);
    const channel = this.extractChannel(q);
    const limit = this.extractLimit(q);
    const explicitRange = this.extractExplicitDateRange(q) || {};
    const filters = { dateRange, sector, channel, ...explicitRange };

    if (
      /\b(forecast|predict|projection|projected|tomorrow|next week)\b/.test(q)
    ) {
      return { intent: 'forecast_overview', answerMode: 'compute', ...filters };
    }
    if (
      /\b(bundle|cross[- ]?sell|market basket|pair|recommendation)\b/.test(q)
    ) {
      return {
        intent: 'cross_sell_overview',
        answerMode: 'compute',
        ...filters,
      };
    }
    if (/\btop|best selling|highest selling|most sold|popular\b/.test(q)) {
      return { intent: 'top_items', answerMode: 'compute', ...filters, limit };
    }
    if (
      /\bsector|cafe|retail|service|services\b/.test(q) &&
      /\bbreakdown|mix|compare|by\b/.test(q)
    ) {
      return { intent: 'sector_breakdown', answerMode: 'compute', ...filters };
    }
    if (
      /\bchannel|pos|shopee|tiktok|pethub\b/.test(q) &&
      /\bbreakdown|mix|compare|by\b/.test(q)
    ) {
      return { intent: 'channel_breakdown', answerMode: 'compute', ...filters };
    }
    if (/\b(best|highest|leading|top)\b/.test(q) && /\bsector\b/.test(q)) {
      return { intent: 'best_sector', answerMode: 'compute', ...filters };
    }
    if (/\b(best|highest|leading|top)\b/.test(q) && /\bchannel\b/.test(q)) {
      return { intent: 'best_channel', answerMode: 'compute', ...filters };
    }
    if (/\b(order|orders|transaction|transactions)\b/.test(q)) {
      return {
        intent: 'total_orders',
        metric: 'orders',
        answerMode: 'compute',
        ...filters,
      };
    }
    if (/\b(quantity|qty|units|sold)\b/.test(q)) {
      return {
        intent: 'total_quantity',
        metric: 'quantity',
        answerMode: 'compute',
        ...filters,
      };
    }
    if (/\b(aov|average order|avg order)\b/.test(q)) {
      return {
        intent: 'average_order_value',
        metric: 'avgOrderValue',
        answerMode: 'compute',
        ...filters,
      };
    }
    return {
      intent: 'total_revenue',
      metric: 'netSales',
      answerMode: 'compute',
      ...filters,
    };
  }

  private isDashboardQuestion(q: string): boolean {
    const allowedTerms = [
      'sale',
      'sales',
      'revenue',
      'make',
      'made',
      'earn',
      'earned',
      'order',
      'orders',
      'transaction',
      'transactions',
      'quantity',
      'sold',
      'item',
      'items',
      'product',
      'products',
      'sector',
      'channel',
      'cafe',
      'retail',
      'service',
      'services',
      'pos',
      'shopee',
      'tiktok',
      'pethub',
      'forecast',
      'demand',
      'predict',
      'projection',
      'bundle',
      'cross-sell',
      'market basket',
      'dashboard',
      'today',
      'yesterday',
      'week',
      'month',
      ...Object.keys(MONTHS),
    ];
    return allowedTerms.some((term) => q.includes(term));
  }

  private hasUnsupportedEntityScope(question: string): boolean {
    const q = this.normalizeQuestion(question);
    return /\b(branch|branches|location|locations|store|stores|outlet|outlets|city|municipality|address|barangay|mall|restaurant|franchise|brand|jollibee|mcdonalds|starbucks)\b/.test(
      q,
    );
  }

  private allowedIntent(value: unknown): value is DashboardIntent {
    return [
      'total_revenue',
      'total_orders',
      'total_quantity',
      'average_order_value',
      'top_items',
      'sector_breakdown',
      'channel_breakdown',
      'best_sector',
      'best_channel',
      'forecast_overview',
      'cross_sell_overview',
      'out_of_scope',
    ].includes(String(value));
  }

  private allowedRange(value: unknown): value is RangeKey {
    return [
      'today',
      'yesterday',
      'last_7_days',
      'this_month',
      'custom',
      'all',
    ].includes(String(value));
  }

  private allowedAnswerMode(value: unknown): value is AnswerMode {
    return ['compute', 'clarify', 'unsupported'].includes(String(value));
  }

  private allowedNarrativeGoal(value: unknown): value is NarrativeGoal {
    return [
      'direct_answer',
      'business_explanation',
      'comparison',
      'diagnostic',
      'recommendation',
      'verification',
      'follow_up',
      'no_data',
      'out_of_scope',
    ].includes(String(value));
  }

  private allowedMetric(value: unknown): value is QueryPlan['metric'] {
    return ['netSales', 'orders', 'quantity', 'avgOrderValue'].includes(
      String(value),
    );
  }

  private allowedSector(value: unknown): value is QueryPlan['sector'] {
    return ['Cafe', 'Retail', 'Services'].includes(String(value));
  }

  private allowedChannel(value: unknown): value is QueryPlan['channel'] {
    return ['POS', 'Shopee', 'TikTok Shop', 'PetHub'].includes(String(value));
  }

  private inferNarrativeGoal(
    question: string,
    intent: DashboardIntent,
  ): NarrativeGoal {
    const q = this.normalizeQuestion(question);
    if (intent === 'out_of_scope') return 'out_of_scope';
    if (
      /\b(is this accurate|is that accurate|accurate ba|tama ba|verify|check that|check this|sure ka|are you sure)\b/.test(
        q,
      )
    ) {
      return 'verification';
    }
    if (
      /^(how about|what about|and|then|next|same for|paano naman|eh yung|yung|for)\b/.test(
        q,
      )
    ) {
      return 'follow_up';
    }
    if (/\b(why|bakit|reason|cause|diagnose|explain)\b/.test(q)) {
      return 'diagnostic';
    }
    if (
      /\b(recommend|suggest|what should|ano dapat|action|campaign|promo)\b/.test(
        q,
      )
    ) {
      return 'recommendation';
    }
    if (
      /\b(compare|versus|vs\.?|difference|growth|increase|decrease|trend|better|worse)\b/.test(
        q,
      )
    ) {
      return 'comparison';
    }
    if (
      /\b(insight|overview|performance|performing|kumusta|status)\b/.test(q)
    ) {
      return 'business_explanation';
    }
    return 'direct_answer';
  }

  private shouldIncludeComparison(
    question: string,
    narrativeGoal: NarrativeGoal,
  ): boolean {
    if (
      [
        'business_explanation',
        'comparison',
        'diagnostic',
        'recommendation',
        'verification',
      ].includes(narrativeGoal)
    ) {
      return true;
    }
    return /\b(insight|performance|performing|compare|trend|accurate|good|bad|higher|lower|why|bakit)\b/.test(
      this.normalizeQuestion(question),
    );
  }

  private extractRange(q: string): RangeKey {
    if (this.extractExplicitDateRange(q)) return 'custom';
    if (/\byesterday\b/.test(q)) return 'yesterday';
    if (/\blast\s*7|7 days|week|weekly\b/.test(q)) return 'last_7_days';
    if (/\bmonth|monthly\b/.test(q)) return 'this_month';
    if (/\btoday|daily|now\b/.test(q)) return 'today';
    return 'last_7_days';
  }

  private extractExplicitDateRange(
    question: string,
  ): Pick<QueryPlan, 'dateStart' | 'dateEnd'> | null {
    const q = this.normalizeQuestion(question);
    const monthNames = Object.keys(MONTHS).join('|');
    const quarter = q.match(/\bq([1-4])\s+(20\d{2})\b/);
    if (quarter) {
      const quarterIndex = Number(quarter[1]) - 1;
      const year = Number(quarter[2]);
      const startMonth = quarterIndex * 3;
      return {
        dateStart: this.isoDate(new Date(year, startMonth, 1)),
        dateEnd: this.isoDate(new Date(year, startMonth + 3, 0)),
      };
    }

    const monthRange = q.match(
      new RegExp(
        `\\b(${monthNames})\\s+(?:to|until|through|hanggang|-)\\s+(${monthNames})\\s+(20\\d{2})\\b`,
      ),
    );
    if (monthRange) {
      const startMonth = MONTHS[monthRange[1]];
      const endMonth = MONTHS[monthRange[2]];
      const year = Number(monthRange[3]);
      return {
        dateStart: this.isoDate(new Date(year, startMonth, 1)),
        dateEnd: this.isoDate(new Date(year, endMonth + 1, 0)),
      };
    }

    const monthYear = q.match(
      new RegExp(`\\b(${monthNames})\\s+(20\\d{2})\\b`),
    );
    if (monthYear) {
      const month = MONTHS[monthYear[1]];
      const year = Number(monthYear[2]);
      return {
        dateStart: this.isoDate(new Date(year, month, 1)),
        dateEnd: this.isoDate(new Date(year, month + 1, 0)),
      };
    }

    const monthDayYear = q.match(
      new RegExp(
        `\\b(${monthNames})\\s*(\\d{1,2})(?:st|nd|rd|th)?[,]?\\s+(20\\d{2})\\b`,
      ),
    );
    if (monthDayYear) {
      const month = MONTHS[monthDayYear[1]];
      const day = Number(monthDayYear[2]);
      const year = Number(monthDayYear[3]);
      const iso = this.validIsoDate(year, month, day);
      if (iso) {
        return { dateStart: iso, dateEnd: iso };
      }
    }

    const dayMonthYear = q.match(
      new RegExp(
        `\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+(${monthNames})[,]?\\s+(20\\d{2})\\b`,
      ),
    );
    if (dayMonthYear) {
      const day = Number(dayMonthYear[1]);
      const month = MONTHS[dayMonthYear[2]];
      const year = Number(dayMonthYear[3]);
      const iso = this.validIsoDate(year, month, day);
      if (iso) {
        return { dateStart: iso, dateEnd: iso };
      }
    }

    const isoRange = q.match(
      /\b(20\d{2}-\d{2}-\d{2})\b.*\b(20\d{2}-\d{2}-\d{2})\b/,
    );
    if (isoRange) {
      return {
        dateStart: isoRange[1],
        dateEnd: isoRange[2],
      };
    }

    const isoDate = q.match(/\b(20\d{2}-\d{2}-\d{2})\b/);
    if (isoDate) {
      return {
        dateStart: isoDate[1],
        dateEnd: isoDate[1],
      };
    }

    const yearOnly = q.match(/\b(20\d{2})\b/);
    if (yearOnly) {
      const year = Number(yearOnly[1]);
      return {
        dateStart: `${year}-01-01`,
        dateEnd: `${year}-12-31`,
      };
    }

    return null;
  }

  private normalizeQuestion(question: string): string {
    let normalized = question.toLowerCase();
    Object.entries(MONTH_ALIASES).forEach(([local, english]) => {
      normalized = normalized.replace(
        new RegExp(`\\b${local}\\b`, 'g'),
        english,
      );
    });
    return normalized
      .replace(/\bbenta\b/g, 'sales')
      .replace(/\bkita\b/g, 'revenue')
      .replace(/\bkinita\b/g, 'revenue')
      .replace(/\bkumita\b/g, 'revenue')
      .replace(/\bmagkano\b/g, 'revenue')
      .replace(/\bilan\b/g, 'count')
      .replace(/\bngayon\b/g, 'today')
      .replace(/\bkahapon\b/g, 'yesterday')
      .replace(/\blinggo\b/g, 'week')
      .replace(/\bbuwan\b/g, 'month')
      .replace(/\btaon\b/g, 'year');
  }

  private safeIsoDate(value: unknown): string | undefined {
    if (typeof value !== 'string') return undefined;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return undefined;
    return value;
  }

  private validIsoDate(
    year: number,
    monthIndex: number,
    day: number,
  ): string | null {
    const date = new Date(year, monthIndex, day);
    if (
      date.getFullYear() !== year ||
      date.getMonth() !== monthIndex ||
      date.getDate() !== day
    ) {
      return null;
    }
    return this.isoDate(date);
  }

  private isoDate(date: Date): string {
    return date.toISOString().slice(0, 10);
  }

  private extractSector(q: string): QueryPlan['sector'] {
    if (/\bcafe\b/.test(q)) return 'Cafe';
    if (/\bretail\b/.test(q)) return 'Retail';
    if (/\bservice|services\b/.test(q)) return 'Services';
    return undefined;
  }

  private extractChannel(q: string): QueryPlan['channel'] {
    if (/\bpos\b/.test(q)) return 'POS';
    if (/\bshopee\b/.test(q)) return 'Shopee';
    if (/\btiktok|tik tok\b/.test(q)) return 'TikTok Shop';
    if (/\bpethub|pet hub\b/.test(q)) return 'PetHub';
    return undefined;
  }

  private extractLimit(q: string): number {
    const match = q.match(/\btop\s+(\d+)/);
    const parsed = match ? Number(match[1]) : 5;
    return Math.min(Math.max(parsed || 5, 1), 10);
  }

  private getClarificationQuestion(
    question: string,
    plan: QueryPlan,
  ): string | undefined {
    const q = this.normalizeQuestion(question);
    const monthNames = Object.keys(MONTHS).join('|');
    const mentionsMonth = new RegExp(`\\b(${monthNames})\\b`).test(q);
    const mentionsYear = /\b20\d{2}\b/.test(q);
    const hasExplicitRange = Boolean(this.extractExplicitDateRange(q));
    if (mentionsMonth && !mentionsYear && !hasExplicitRange) {
      return 'Which year should I use for that month? For example, April 2023 or April 2026.';
    }

    if (
      /\b(performance|performing|kumusta|status|insight|overview)\b/.test(q) &&
      !/\b(sale|sales|revenue|order|orders|transaction|transactions|quantity|units|aov|average order|top|best|forecast|demand|bundle|breakdown)\b/.test(
        q,
      )
    ) {
      return 'Which dashboard metric should I check: sales/revenue, orders, quantity sold, average order value, top items, sector breakdown, channel breakdown, forecasts, or bundle recommendations?';
    }

    if (
      /\b(compare|versus|vs\.?|difference|growth|increase|decrease|trend)\b/.test(
        q,
      ) &&
      !/\b(breakdown|by sector|by channel)\b/.test(q)
    ) {
      return 'I can compute one dashboard metric at a time right now. Which exact comparison do you want, and what date ranges should I compare?';
    }

    if (
      plan.intent === 'top_items' &&
      /\b(top|best|popular)\b/.test(q) &&
      !/\b(item|items|product|products|selling|sold)\b/.test(q)
    ) {
      return 'When you say top or best, do you mean top-selling items, best sector, or best channel?';
    }

    return undefined;
  }

  private defaultAnalysisSteps(plan: QueryPlan): string[] {
    const steps = [`Mapped question to ${plan.intent.replace(/_/g, ' ')}`];
    if (plan.dateRange === 'custom' && plan.dateStart && plan.dateEnd) {
      steps.push(`Resolved date range ${plan.dateStart} to ${plan.dateEnd}`);
    } else {
      steps.push(`Using dashboard range ${plan.dateRange.replace(/_/g, ' ')}`);
    }
    if (plan.sector) steps.push(`Applied sector filter ${plan.sector}`);
    if (plan.channel) steps.push(`Applied channel filter ${plan.channel}`);
    steps.push('Use backend-validated dashboard aggregation');
    return steps.slice(0, 4);
  }

  private async executePlan(plan: QueryPlan, match: WarehouseFilters) {
    if (plan.intent === 'top_items') {
      return this.getTopItems(match, plan.limit || 5);
    }
    if (plan.intent === 'sector_breakdown' || plan.intent === 'best_sector') {
      return this.getBreakdown(match, 'sector');
    }
    if (plan.intent === 'channel_breakdown' || plan.intent === 'best_channel') {
      return this.getBreakdown(match, 'channel');
    }
    if (plan.intent === 'forecast_overview') {
      return {
        message:
          'Forecast answers are limited to the forecast cards in the dashboard. Open Demand Forecasts for model-specific projected values.',
      };
    }
    if (plan.intent === 'cross_sell_overview') {
      return {
        message:
          'Bundle recommendation answers are limited to the Behavioral Bridges and Activation Layer cards.',
      };
    }
    return this.getTotals(match);
  }

  private async getTotals(match: WarehouseFilters) {
    const rows = await this.getWarehouseRows(match);
    const orders = new Set<string>();
    let revenue = 0;
    let quantity = 0;

    rows.forEach((row) => {
      revenue += Number(row.net_sales) || 0;
      quantity += Number(row.quantity_sold) || 0;
      if (row.transaction_id) orders.add(row.transaction_id);
    });

    revenue = this.money(revenue);
    const orderCount = orders.size;
    return {
      revenue,
      orders: orderCount,
      quantity: this.money(quantity),
      rows: rows.length,
      avgOrderValue: orderCount ? this.money(revenue / orderCount) : 0,
    };
  }

  private async getTopItems(match: WarehouseFilters, limit: number) {
    const rows = await this.getWarehouseRows(match);
    const itemNames = await this.getItemNameMap();
    const grouped = new Map<
      string,
      { name: string; revenue: number; quantity: number; orders: Set<string> }
    >();

    rows.forEach((row) => {
      const itemId = row.product_id || row.service_id || 'unknown';
      const current = grouped.get(itemId) || {
        name: itemNames.get(itemId) || itemId || 'Unknown item',
        revenue: 0,
        quantity: 0,
        orders: new Set<string>(),
      };
      current.revenue += Number(row.net_sales) || 0;
      current.quantity += Number(row.quantity_sold) || 0;
      if (row.transaction_id) current.orders.add(row.transaction_id);
      grouped.set(itemId, current);
    });

    return Array.from(grouped.values())
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, limit)
      .map((item) => ({
        name: item.name,
        revenue: this.money(item.revenue),
        quantity: this.money(item.quantity),
        orderCount: item.orders.size,
      }));
  }

  private async getBreakdown(
    match: WarehouseFilters,
    groupBy: 'sector' | 'channel',
  ) {
    const rows = await this.getWarehouseRows(match);
    const grouped = new Map<
      string,
      { label: string; revenue: number; quantity: number; orders: Set<string> }
    >();

    rows.forEach((row) => {
      const rawLabel =
        groupBy === 'sector'
          ? row.business_segment_dim?.segment_name
          : row.channel_dim?.channel_name;
      const label = this.toDisplaySector(rawLabel || 'Unknown');
      const current = grouped.get(label) || {
        label,
        revenue: 0,
        quantity: 0,
        orders: new Set<string>(),
      };
      current.revenue += Number(row.net_sales) || 0;
      current.quantity += Number(row.quantity_sold) || 0;
      if (row.transaction_id) current.orders.add(row.transaction_id);
      grouped.set(label, current);
    });

    return Array.from(grouped.values())
      .sort((a, b) => b.revenue - a.revenue)
      .map((row) => ({
        label: row.label,
        revenue: this.money(row.revenue),
        orderCount: row.orders.size,
        quantity: this.money(row.quantity),
      }));
  }

  private async buildVerifiedFactPack(
    plan: QueryPlan,
    result: any,
    filters: WarehouseFilters,
    latestDate: Date,
  ): Promise<VerifiedFactPack> {
    const metrics = this.extractMetricsForFacts(plan, result);
    const comparisons =
      plan.includeComparison && this.canCompareIntent(plan.intent)
        ? await this.buildComparisonFacts(filters, result)
        : undefined;

    return {
      source: 'supabase_warehouse',
      method: 'backend_validated_analytics_retrieval',
      intent: plan.intent,
      dateRange: {
        start: filters.dateStart || null,
        end: filters.dateEnd || null,
        label: this.rangeLabel(plan, latestDate),
      },
      filters: {
        sector: filters.sector || null,
        channel: filters.channel || null,
      },
      metrics,
      comparisons,
      audit: {
        tablesUsed: [
          'fact_cross_channel_transactions',
          'date_dim',
          'channel_dim',
          'business_segment_dim',
          ...(plan.intent === 'top_items'
            ? ['product_dim', 'service_dim']
            : []),
        ],
        aggregations: this.getAuditAggregations(plan.intent),
        rowsUsed:
          typeof result?.rows === 'number'
            ? result.rows
            : Array.isArray(result)
              ? result.length
              : undefined,
        confidence:
          plan.intent === 'forecast_overview' ||
          plan.intent === 'cross_sell_overview'
            ? 'limited'
            : 'verified',
      },
    };
  }

  private extractMetricsForFacts(
    plan: QueryPlan,
    result: any,
  ): Record<string, unknown> {
    if (Array.isArray(result)) {
      return {
        rows: result,
        rowCount: result.length,
      };
    }
    if (
      plan.intent === 'forecast_overview' ||
      plan.intent === 'cross_sell_overview'
    ) {
      return {
        message: result?.message || 'Dashboard detail is currently limited.',
      };
    }
    return {
      totalRevenue: result?.revenue ?? null,
      totalOrders: result?.orders ?? null,
      totalQuantity: result?.quantity ?? null,
      averageOrderValue: result?.avgOrderValue ?? null,
      rowsUsed: result?.rows ?? null,
    };
  }

  private canCompareIntent(intent: DashboardIntent): boolean {
    return [
      'total_revenue',
      'total_orders',
      'total_quantity',
      'average_order_value',
    ].includes(intent);
  }

  private async buildComparisonFacts(
    filters: WarehouseFilters,
    result: any,
  ): Promise<Record<string, unknown> | undefined> {
    if (
      !filters.dateStart ||
      !filters.dateEnd ||
      typeof result?.revenue !== 'number'
    ) {
      return undefined;
    }

    const currentStart = new Date(`${filters.dateStart}T00:00:00.000Z`);
    const currentEnd = new Date(`${filters.dateEnd}T00:00:00.000Z`);
    const periodDays = Math.max(
      1,
      Math.round(
        (currentEnd.getTime() - currentStart.getTime()) / (24 * 60 * 60 * 1000),
      ) + 1,
    );

    const previousEnd = new Date(currentStart);
    previousEnd.setDate(previousEnd.getDate() - 1);
    const previousStart = new Date(previousEnd);
    previousStart.setDate(previousStart.getDate() - periodDays + 1);

    const previousFilters = {
      ...filters,
      dateStart: this.isoDate(previousStart),
      dateEnd: this.isoDate(previousEnd),
    };
    const previousTotals = await this.getTotals(previousFilters);

    const averageFilters = {
      ...filters,
      dateStart: this.isoDate(
        new Date(currentStart.getTime() - 7 * 24 * 60 * 60 * 1000),
      ),
      dateEnd: this.isoDate(previousEnd),
    };
    const averageRows = await this.getWarehouseRows(averageFilters);
    const dailyAverageRevenue = this.averageDailyRevenue(averageRows);
    const currentDailyRevenue = result.revenue / periodDays;

    return {
      previousPeriod: {
        dateStart: previousFilters.dateStart,
        dateEnd: previousFilters.dateEnd,
        revenue: previousTotals.revenue,
        orders: previousTotals.orders,
        quantity: previousTotals.quantity,
        revenueChangePercent: this.percentChange(
          result.revenue,
          previousTotals.revenue,
        ),
      },
      trailingSevenDayAverage: {
        revenuePerDay: dailyAverageRevenue,
        requestedRevenuePerDay: this.money(currentDailyRevenue),
        differencePercent: this.percentChange(
          currentDailyRevenue,
          dailyAverageRevenue,
        ),
      },
    };
  }

  private averageDailyRevenue(rows: WarehouseRow[]): number {
    const byDate = new Map<string, number>();
    rows.forEach((row) => {
      const date = row.date_dim?.full_date;
      if (!date) return;
      byDate.set(date, (byDate.get(date) || 0) + (Number(row.net_sales) || 0));
    });
    if (!byDate.size) return 0;
    const total = Array.from(byDate.values()).reduce(
      (sum, value) => sum + value,
      0,
    );
    return this.money(total / byDate.size);
  }

  private percentChange(current: number, baseline: number): number | null {
    if (!Number.isFinite(baseline) || baseline === 0) return null;
    const raw = ((current - baseline) / baseline) * 100;
    return this.money(Math.max(-100, Math.min(100, raw)));
  }

  private getAuditAggregations(intent: DashboardIntent): string[] {
    if (intent === 'top_items') {
      return [
        'GROUP BY product_id/service_id',
        'SUM(net_sales)',
        'SUM(quantity_sold)',
        'COUNT(DISTINCT transaction_id)',
      ];
    }
    if (intent === 'sector_breakdown') {
      return [
        'GROUP BY business_segment_dim.segment_name',
        'SUM(net_sales)',
        'SUM(quantity_sold)',
        'COUNT(DISTINCT transaction_id)',
      ];
    }
    if (intent === 'channel_breakdown') {
      return [
        'GROUP BY channel_dim.channel_name',
        'SUM(net_sales)',
        'SUM(quantity_sold)',
        'COUNT(DISTINCT transaction_id)',
      ];
    }
    return [
      'SUM(net_sales)',
      'SUM(quantity_sold)',
      'COUNT(DISTINCT transaction_id)',
      'SUM(net_sales) / COUNT(DISTINCT transaction_id)',
    ];
  }

  private renderAnswer(plan: QueryPlan, result: any, latestDate: Date): string {
    const rangeLabel = this.rangeLabel(plan, latestDate);
    const filters = this.filterLabel(plan);
    if (
      plan.intent === 'forecast_overview' ||
      plan.intent === 'cross_sell_overview'
    ) {
      return result.message;
    }
    if (plan.intent === 'top_items') {
      if (!result.length)
        return `No item sales found for ${rangeLabel}${filters}.`;
      const items = result
        .slice(0, plan.limit || 5)
        .map(
          (item: any, index: number) =>
            `${index + 1}. ${item.name}: ${this.currency(item.revenue)} revenue, ${item.quantity} units`,
        )
        .join('\n');
      return `Top items for ${rangeLabel}${filters}:\n${items}`;
    }
    if (
      plan.intent === 'sector_breakdown' ||
      plan.intent === 'channel_breakdown'
    ) {
      if (!result.length)
        return `No breakdown data found for ${rangeLabel}${filters}.`;
      return result
        .map(
          (row: any) =>
            `${row.label || 'Unknown'}: ${this.currency(row.revenue)} revenue, ${row.orderCount} orders, ${row.quantity} units`,
        )
        .join('\n');
    }
    if (plan.intent === 'best_sector' || plan.intent === 'best_channel') {
      const best = result[0];
      if (!best) return `No data found for ${rangeLabel}${filters}.`;
      return `The leading ${plan.intent === 'best_sector' ? 'sector' : 'channel'} for ${rangeLabel}${filters} is ${best.label}, with ${this.currency(best.revenue)} revenue, ${best.orderCount} orders, and ${best.quantity} units sold.`;
    }
    if (typeof result?.rows === 'number' && result.rows === 0) {
      return `No matching dashboard records were found for ${rangeLabel}${filters}.`;
    }
    if (plan.intent === 'total_orders') {
      return `For ${rangeLabel}${filters}, there are ${result.orders} orders/transactions.`;
    }
    if (plan.intent === 'total_quantity') {
      return `For ${rangeLabel}${filters}, total quantity sold is ${result.quantity} units.`;
    }
    if (plan.intent === 'average_order_value') {
      return `For ${rangeLabel}${filters}, average order value is ${this.currency(result.avgOrderValue)}.`;
    }
    return `For ${rangeLabel}${filters}, total sales/revenue is ${this.currency(result.revenue)} from ${result.orders} orders and ${result.quantity} units sold.`;
  }

  private async getLatestTransactionDate(): Promise<Date | null> {
    const { data, error } = await this.supabaseService.client
      .from('fact_cross_channel_transactions')
      .select('date_id, date_dim:date_id!inner(full_date)')
      .order('date_id', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      throw new InternalServerErrorException(
        `Failed to read latest warehouse transaction date: ${error.message}`,
      );
    }

    const fullDate = (data as any)?.date_dim?.full_date;
    return fullDate ? new Date(`${fullDate}T00:00:00.000Z`) : null;
  }

  private buildWarehouseFilters(
    plan: QueryPlan,
    latestDate: Date,
  ): WarehouseFilters {
    const range = plan.dateRange;
    const filters: WarehouseFilters = {
      ...(plan.sector ? { sector: plan.sector } : {}),
      ...(plan.channel ? { channel: plan.channel } : {}),
    };
    if (range === 'all') return filters;
    if (range === 'custom' && plan.dateStart && plan.dateEnd) {
      return {
        ...filters,
        dateStart: plan.dateStart,
        dateEnd: plan.dateEnd,
      };
    }
    const end = this.isoDate(latestDate);
    if (range === 'today') {
      return { ...filters, dateStart: end, dateEnd: end };
    }
    if (range === 'yesterday') {
      const yesterday = new Date(latestDate);
      yesterday.setDate(yesterday.getDate() - 1);
      const date = this.isoDate(yesterday);
      return { ...filters, dateStart: date, dateEnd: date };
    }
    if (range === 'this_month') {
      const start = new Date(latestDate);
      start.setDate(1);
      return { ...filters, dateStart: this.isoDate(start), dateEnd: end };
    }
    const start = new Date(latestDate);
    start.setDate(start.getDate() - 6);
    return { ...filters, dateStart: this.isoDate(start), dateEnd: end };
  }

  private async getWarehouseRows(
    filters: WarehouseFilters,
  ): Promise<WarehouseRow[]> {
    const pageSize = 1000;
    const rows: WarehouseRow[] = [];
    let from = 0;

    while (true) {
      let query = this.supabaseService.client
        .from('fact_cross_channel_transactions')
        .select(
          `
          net_sales,
          quantity_sold,
          transaction_id,
          product_id,
          service_id,
          channel_dim:channel_id!inner(channel_name),
          date_dim:date_id!inner(full_date),
          business_segment_dim:segment_id!inner(segment_name)
        `,
        )
        .range(from, from + pageSize - 1);

      if (filters.dateStart) {
        query = query.gte('date_dim.full_date', filters.dateStart);
      }
      if (filters.dateEnd) {
        query = query.lte('date_dim.full_date', filters.dateEnd);
      }
      if (filters.sector) {
        query = query.eq(
          'business_segment_dim.segment_name',
          this.toWarehouseSector(filters.sector),
        );
      }
      if (filters.channel) {
        query = query.eq('channel_dim.channel_name', filters.channel);
      }

      const { data, error } = await query;
      if (error) {
        throw new InternalServerErrorException(
          `Failed to read warehouse transactions: ${error.message}`,
        );
      }

      const batch = (data || []) as WarehouseRow[];
      rows.push(...batch);
      if (batch.length < pageSize) break;
      from += pageSize;
    }

    return rows;
  }

  private async getItemNameMap(): Promise<Map<string, string>> {
    const [productsResult, servicesResult] = await Promise.all([
      this.supabaseService.client
        .from('product_dim')
        .select('product_id, product_name, category'),
      this.supabaseService.client
        .from('service_dim')
        .select('service_id, service_name, service_type'),
    ]);

    const map = new Map<string, string>();
    (productsResult.data || []).forEach((product: any) => {
      map.set(
        product.product_id,
        product.product_name || product.category || product.product_id,
      );
    });
    (servicesResult.data || []).forEach((service: any) => {
      map.set(
        service.service_id,
        service.service_name || service.service_type || service.service_id,
      );
    });
    return map;
  }

  private toWarehouseSector(sector: QueryPlan['sector']): string {
    return sector === 'Services' ? 'Service' : String(sector || '');
  }

  private toDisplaySector(sector: string): string {
    return sector === 'Service' ? 'Services' : sector;
  }

  private rangeLabel(plan: QueryPlan, latestDate: Date): string {
    const range = plan.dateRange;
    const date = latestDate.toISOString().slice(0, 10);
    if (range === 'custom' && plan.dateStart && plan.dateEnd) {
      return `${plan.dateStart} to ${plan.dateEnd}`;
    }
    if (range === 'today') return `the latest dashboard day (${date})`;
    if (range === 'yesterday') return 'the previous dashboard day';
    if (range === 'this_month') return 'the current dashboard month';
    if (range === 'all') return 'all uploaded dashboard data';
    return 'the last 7 dashboard days';
  }

  private filterLabel(plan: QueryPlan): string {
    const filters = [plan.sector, plan.channel].filter(Boolean);
    return filters.length ? ` for ${filters.join(' / ')}` : '';
  }

  private money(value: number): number {
    return Math.round((Number(value) || 0) * 100) / 100;
  }

  private currency(value: number): string {
    return `₱${this.money(value).toLocaleString('en-PH', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  }

  private buildConversationContext(
    history: ChatHistoryItem[],
  ): ChatHistoryItem[] {
    if (!Array.isArray(history)) return [];
    return history
      .filter(
        (item) =>
          (item?.sender === 'user' || item?.sender === 'woof') &&
          typeof item?.text === 'string' &&
          item.text.trim(),
      )
      .slice(-6)
      .map((item) => ({
        sender: item.sender,
        text: String(item.text).trim().slice(0, 500),
      }));
  }

  private getConversationalAnswer(
    question: string,
    history: ChatHistoryItem[],
  ): string | undefined {
    const q = this.normalizeQuestion(question)
      .replace(/[!?.,]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    const hasPriorDashboardContext = history.some(
      (item) =>
        item.sender === 'user' &&
        item.text &&
        this.isDashboardQuestion(this.normalizeQuestion(item.text)),
    );

    if (
      /^(hi|hello|hey|yo|good morning|good afternoon|good evening|kumusta|kamusta|hii+|helloo+)$/.test(
        q,
      )
    ) {
      return hasPriorDashboardContext
        ? 'Hi! I am still here. Want me to check another WOOF metric or continue from the last dashboard result?'
        : "Hi! I am WOOF. You can ask me things like today's sales, orders for a specific date, top items, channel performance, sector breakdowns, forecasts, or bundle recommendations.";
    }

    if (
      /^(thanks|thank you|ty|salamat|thank u|thx|okay thanks|ok thanks|sige thanks)$/.test(
        q,
      )
    ) {
      return 'You got it. I can keep checking the dashboard whenever you need another number.';
    }

    if (/^(ok|okay|sige|copy|noted|got it|gets|ge)$/.test(q)) {
      return 'Got it. Send me the next dashboard question when you are ready.';
    }

    if (/^(bye|goodbye|later|see you|exit|close)$/.test(q)) {
      return 'Alright, I will be here when you need another WOOF dashboard check.';
    }

    if (
      /\b(what can you do|help|guide|sample question|examples?|how do i use you|ano kaya mo|ano pwede itanong|paano gamitin)\b/.test(
        q,
      )
    ) {
      return [
        'You can ask me about the WOOF dashboard in normal language.',
        'For example: "What were the sales on November 11, 2022?", "Which channel performed best this month?", "Top 5 items last week", or "How about Retail?".',
      ].join(' ');
    }

    if (/^(are you there|nandyan ka|online ka|can you hear me|test)$/.test(q)) {
      return 'Yes, I am here. Ask me any WOOF dashboard question and I will check the warehouse data for you.';
    }

    return undefined;
  }

  private resolveFollowUpQuestion(
    question: string,
    history: ChatHistoryItem[],
  ): string {
    const normalized = this.normalizeQuestion(question);
    const previousUserQuestion = this.findPreviousDashboardQuestion(history);
    if (!previousUserQuestion) return question;

    const asksToVerifyPrevious =
      /\b(is this accurate|is that accurate|accurate ba|tama ba|correct ba|sure ka|are you sure|verify|check that|check this)\b/.test(
        normalized,
      );
    if (asksToVerifyPrevious) {
      return `Recompute and verify this previous WOOF dashboard question: ${previousUserQuestion}`;
    }

    const hasExplicitRange = Boolean(this.extractExplicitDateRange(question));
    const hasDashboardMetric =
      /\b(sale|sales|revenue|order|orders|transaction|transactions|quantity|qty|units|sold|aov|average order|top|best|forecast|demand|bundle|item|items|product|products)\b/.test(
        normalized,
      );
    const looksLikeFollowUp =
      /^(how about|what about|and|then|next|same for|paano naman|eh yung|yung|for)\b/.test(
        normalized,
      ) ||
      hasExplicitRange ||
      Boolean(this.extractSector(normalized)) ||
      Boolean(this.extractChannel(normalized));

    if (!looksLikeFollowUp || hasDashboardMetric) return question;

    return [
      question,
      `Use the same WOOF dashboard metric and filters as this previous question: ${previousUserQuestion}`,
      'If the new message includes a date, sector, channel, or range, replace only that part with the new value.',
    ].join('\n');
  }

  private findPreviousDashboardQuestion(
    history: ChatHistoryItem[],
  ): string | undefined {
    return [...history]
      .reverse()
      .find(
        (item) =>
          item.sender === 'user' &&
          item.text &&
          this.isDashboardQuestion(this.normalizeQuestion(item.text)),
      )?.text;
  }

  private async humanizeAnswer(input: {
    question: string;
    questionForPlanning: string;
    factualAnswer: string;
    factPack: VerifiedFactPack;
    plan: QueryPlan;
    result: any;
    latestDate: Date;
    history: ChatHistoryItem[];
  }): Promise<string> {
    const styleDirective = this.getResponseStyleDirective(input);

    try {
      const response = await this.llmService.generate({
        feature: 'business_assistant',
        prompt: [
          'Recent chat context:',
          input.history
            .map(
              (item) =>
                `${item.sender === 'user' ? 'User' : 'WOOF'}: ${item.text}`,
            )
            .join('\n') || 'None',
          `Latest user question: ${input.question}`,
          `Validated planning question: ${input.questionForPlanning}`,
          `Validated backend answer: ${input.factualAnswer}`,
          `Verified fact pack JSON: ${JSON.stringify(input.factPack)}`,
          `Validated intent: ${input.plan.intent}`,
          `Narrative goal: ${input.plan.narrativeGoal || 'direct_answer'}`,
          `Validated date range: ${this.rangeLabel(input.plan, input.latestDate)}`,
          `Response style instruction: ${styleDirective}`,
          'Write the final user-facing answer now.',
        ].join('\n'),
      });
      return response.configured && response.provider !== 'fallback'
        ? response.text
        : this.fallbackStyledAnswer(input.factualAnswer, styleDirective);
    } catch {
      return this.fallbackStyledAnswer(input.factualAnswer, styleDirective);
    }
  }

  private getResponseStyleDirective(input: {
    question: string;
    factualAnswer: string;
    plan: QueryPlan;
    result: any;
  }): string {
    const q = this.normalizeQuestion(input.question);
    const isVerification =
      /\b(is this accurate|is that accurate|accurate ba|tama ba|correct ba|sure ka|are you sure|verify|check that|check this)\b/.test(
        q,
      );
    if (isVerification) {
      return 'Verification: say that WOOF rechecked the Supabase warehouse facts, confirm the result, and briefly mention whether comparison facts support any context.';
    }

    const isFollowUp =
      /^(how about|what about|and|then|next|same for|paano naman|eh yung|yung|for)\b/.test(
        q,
      ) ||
      (Boolean(this.extractExplicitDateRange(input.question)) &&
        !/\b(sale|sales|revenue|order|orders|transaction|transactions|quantity|qty|units|sold|aov|average order|top|best|forecast|demand|bundle|item|items|product|products)\b/.test(
          q,
        )) ||
      (Boolean(this.extractSector(q)) &&
        !/\b(sale|sales|revenue|order|orders|transaction|transactions|quantity|qty|units|sold|aov|average order|top|best|forecast|demand|bundle|item|items|product|products)\b/.test(
          q,
        )) ||
      (Boolean(this.extractChannel(q)) &&
        !/\b(sale|sales|revenue|order|orders|transaction|transactions|quantity|qty|units|sold|aov|average order|top|best|forecast|demand|bundle|item|items|product|products)\b/.test(
          q,
        ));
    if (isFollowUp) {
      return 'Follow-up: briefly acknowledge the requested new date/range/filter, then answer with the verified facts and one useful business interpretation if comparison context exists.';
    }

    if (typeof input.result?.rows === 'number' && input.result.rows === 0) {
      return 'No-data: clearly say no matching Supabase warehouse records were found for the requested scope and suggest trying another date, range, sector, or channel.';
    }

    if (input.plan.intent === 'top_items') {
      return 'Conversational ranked result: answer in a friendly, natural tone; briefly introduce the date/filter scope, then put each ranked item on its own numbered line. Keep each item name, revenue, and units together. Add at most one short takeaway if the verified data supports it.';
    }

    if (
      input.plan.intent === 'sector_breakdown' ||
      input.plan.intent === 'channel_breakdown'
    ) {
      return 'Conversational breakdown: briefly say what is being compared, then show each row as a separate bullet. Keep the label, revenue, orders, and units together; avoid a dense paragraph. Do not invent percentages or causes.';
    }

    if (
      input.plan.intent === 'best_sector' ||
      input.plan.intent === 'best_channel'
    ) {
      return 'Best performer: answer directly with the leading sector/channel and the exact supporting revenue, orders, and units.';
    }

    if (
      input.plan.intent === 'forecast_overview' ||
      input.plan.intent === 'cross_sell_overview'
    ) {
      return 'Unsupported dashboard detail: be friendly but explain the current dashboard limitation briefly.';
    }

    return 'Conversational metric answer: lead with the direct answer in one short sentence. If there are several metrics, use bullets and label every number with its unit. Briefly explain the result only when the verified comparison supports it; avoid long number-heavy sentences.';
  }

  private fallbackStyledAnswer(
    factualAnswer: string,
    styleDirective: string,
  ): string {
    if (styleDirective.startsWith('Verification:')) {
      return `Yes, I rechecked the Supabase warehouse facts. ${factualAnswer}`;
    }
    const lines = factualAnswer.split('\n').map((line) => line.trim()).filter(Boolean);
    if (lines.length > 1 && !lines.every((line) => /^\d+[.)]\s/.test(line))) {
      return `Here is the breakdown:\n${lines.map((line) => `- ${line}`).join('\n')}`;
    }
    return factualAnswer;
  }

  private extractAnthropicText(data: any): string {
    const textBlocks = Array.isArray(data?.content)
      ? data.content
          .filter((block: any) => block?.type === 'text' && block?.text)
          .map((block: any) => block.text)
      : [];
    return textBlocks.join('\n').trim();
  }

  private parseJsonObject(text: string): Record<string, unknown> {
    try {
      return JSON.parse(text);
    } catch {
      const match = text.match(/\{[\s\S]*\}/);
      if (!match) return {};
      try {
        return JSON.parse(match[0]);
      } catch {
        return {};
      }
    }
  }
}
