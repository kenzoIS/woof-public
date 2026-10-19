import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { ConfigService } from '@nestjs/config';
import { spawn } from 'child_process';
import { existsSync } from 'fs';
import * as path from 'path';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import {
  Transaction,
  TransactionDocument,
} from '../csv/schemas/transaction.schema';

import { SupabaseService } from '../common/supabase/supabase.service';
import { LlmService } from '../llm/llm.service';
import { AuditService } from '../audit/audit.service';

@Injectable()
export class SmartReportsService {
  private supabase: SupabaseClient;

  constructor(
    private supabaseService: SupabaseService,
    private configService: ConfigService,
    private llmService: LlmService,
    @Optional() private auditService?: AuditService,
  ) {
    this.supabase = this.supabaseService.client;
  }

  private resolvePythonCommand(): string {
    const localPython = path.join(
      process.cwd(),
      '.venv',
      process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python',
    );
    const configuredPython = this.configService
      .get<string>('PYTHON_PATH')
      ?.trim();
    const configuredLooksLikePath = Boolean(
      configuredPython &&
      (configuredPython.includes('/') ||
        configuredPython.includes('\\') ||
        configuredPython.startsWith('.')),
    );
    const configuredPath =
      configuredLooksLikePath && configuredPython
        ? path.resolve(process.cwd(), configuredPython)
        : null;

    if (
      configuredPython &&
      (!configuredLooksLikePath ||
        (configuredPath && existsSync(configuredPath)))
    ) {
      return configuredPath || configuredPython;
    }

    return existsSync(localPython)
      ? localPython
      : process.platform === 'win32'
        ? 'python'
        : 'python3';
  }

  private runPython<T>(
    scriptName: string,
    inputData: Record<string, unknown>,
  ): Promise<T> {
    const scriptPath = path.join(
      process.cwd(),
      'src',
      'smart-reports',
      'python',
      scriptName,
    );

    return new Promise((resolve, reject) => {
      const pythonCommand = this.resolvePythonCommand();
      const pythonProcess = spawn(pythonCommand, [scriptPath]);

      let stdoutData = '';
      let stderrData = '';

      pythonProcess.stdout.on('data', (data) => {
        stdoutData += data.toString();
      });

      pythonProcess.stderr.on('data', (data) => {
        stderrData += data.toString();
      });

      pythonProcess.on('error', (error) => {
        reject(
          new InternalServerErrorException(
            `Unable to start Python using "${pythonCommand}": ${error.message}`,
          ),
        );
      });

      pythonProcess.on('close', (code) => {
        if (code !== 0) {
          reject(
            new InternalServerErrorException(
              `Python script exited with code ${code}. Error: ${stderrData}`,
            ),
          );
          return;
        }

        try {
          const parsed = JSON.parse(stdoutData.trim());
          resolve(parsed as T);
        } catch (e) {
          reject(
            new InternalServerErrorException(
              `Failed to parse Python script stdout as JSON: ${e.message}. Raw output: ${stdoutData}`,
            ),
          );
        }
      });

      // Write parameters to stdin
      try {
        pythonProcess.stdin.write(JSON.stringify(inputData));
        pythonProcess.stdin.end();
      } catch (err) {
        reject(
          new InternalServerErrorException(
            `Failed to write input to Python stdin: ${err.message}`,
          ),
        );
      }
    });
  }

  private async getRealFeedbackNotes(
    startDateStr: string,
    endDateStr: string,
  ): Promise<string[]> {
    try {
      const { data } = await this.supabase
        .from('recommendation_feedback')
        .select('feedback_notes, created_at')
        .gte('created_at', startDateStr)
        .lte('created_at', endDateStr + 'T23:59:59Z')
        .not('feedback_notes', 'is', null)
        .neq('feedback_notes', '')
        .order('created_at', { ascending: false })
        .limit(10);

      const notes = (data || [])
        .map((row: any) => row.feedback_notes as string)
        .filter(Boolean);

      return notes;
    } catch {
      return [];
    }
  }

  private analyzeTaglishSentiment(reviews: string[]): {
    score: number;
    label: 'POSITIVE' | 'NEGATIVE' | 'NEUTRAL';
  } {
    let positiveCount = 0;
    let negativeCount = 0;

    const posKeywords = [
      'maganda',
      'mahusay',
      'mabango',
      'masarap',
      'gusto',
      'recommend',
      'mabilis',
      'friendly',
      'bait',
      'perfect',
      'love',
      'great',
      'good',
      'happy',
      'satisfied',
      'sulit',
      'sarap',
    ];
    const negKeywords = [
      'mabagal',
      'matagal',
      'late',
      'pangit',
      'mahal',
      'bad',
      'poor',
      'sira',
      'disappointed',
      'worst',
      'delay',
      'rude',
      'dumi',
      'marumi',
    ];

    reviews.forEach((review) => {
      const words = review.toLowerCase().split(/\s+/);
      words.forEach((word) => {
        const cleanWord = word.replace(/[.,\/#!$%\^&\*;:{}=\-_`~()]/g, '');
        if (posKeywords.includes(cleanWord)) positiveCount++;
        if (negKeywords.includes(cleanWord)) negativeCount++;
      });
    });

    const total = positiveCount + negativeCount;
    if (total === 0) return { score: 0, label: 'NEUTRAL' };
    const score = (positiveCount - negativeCount) / total;

    let label: 'POSITIVE' | 'NEGATIVE' | 'NEUTRAL' = 'NEUTRAL';
    if (score > 0.05) label = 'POSITIVE';
    else if (score < -0.05) label = 'NEGATIVE';

    return { score, label };
  }

  async generateReport(
    title: string,
    startDateStr: string,
    endDateStr: string,
    sectors: ('Cafe' | 'Retail' | 'Services')[],
  ): Promise<any> {
    const start = new Date(startDateStr);
    const end = new Date(endDateStr);
    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      throw new BadRequestException('Invalid date format provided');
    }
    if (start > end) {
      throw new BadRequestException('Start date cannot be later than end date');
    }
    const diffDays = Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
    if (diffDays > 31) {
      throw new BadRequestException('Date range cannot exceed 31 days. Trend forecast model is calibrated for 30-31 day windows.');
    }

    // 1. Map Sectors to PostgreSQL naming standard (Services -> Service)
    const pgSectors = sectors.map((s) => (s === 'Services' ? 'Service' : s));

    // 2. Fetch product and service dimensions in memory
    const { data: products } = await this.supabase
      .from('product_dim')
      .select('product_id, category');
    const { data: services } = await this.supabase
      .from('service_dim')
      .select('service_id, service_type');

    const itemCategoryMap = new Map<string, string>();
    products?.forEach((p) => itemCategoryMap.set(p.product_id, p.category));
    services?.forEach((s) => itemCategoryMap.set(s.service_id, s.service_type));

    // 3. Query PostgreSQL star schema fact table via Supabase client
    const { data: factRows, error: factErr } = await this.supabase
      .from('fact_cross_channel_transactions')
      .select(
        `
        net_sales,
        gross_profit,
        cost_of_goods,
        transaction_id,
        product_id,
        service_id,
        channel_dim:channel_id!inner(channel_name),
        date_dim:date_id!inner(full_date, avg_temperature_celsius, rainfall_mm, is_holiday),
        business_segment_dim:segment_id!inner(segment_name)
      `,
      )
      .gte('date_dim.full_date', startDateStr)
      .lte('date_dim.full_date', endDateStr)
      .in('business_segment_dim.segment_name', pgSectors);

    if (factErr) {
      throw new InternalServerErrorException(
        `Supabase query failed: ${factErr.message}`,
      );
    }

    if (!factRows || factRows.length === 0) {
      throw new NotFoundException(
        'No transactions found in the specified date range and sectors',
      );
    }

    // 4. In-Memory descriptive aggregation & Data Completeness evaluation
    let totalRevenue = 0;
    let totalGrossProfit = 0;
    let totalCost = 0;
    let completeCount = 0;
    const transactionIds = new Set<string>();

    const channelRevenue: Record<string, number> = {};
    const categorySales: Record<string, number> = {};
    const dailyHistoryMap = new Map<string, any>();

    factRows.forEach((row: any) => {
      const netSales = Number(row.net_sales || 0);
      const grossProfit = Number(row.gross_profit || 0);
      const costOfGoods = Number(row.cost_of_goods || 0);

      totalRevenue += netSales;
      totalGrossProfit += grossProfit;
      totalCost += costOfGoods;
      transactionIds.add(row.transaction_id);

      // SQA Metric: Data Completeness audit
      const isComplete =
        row.net_sales !== null &&
        row.gross_profit !== null &&
        row.cost_of_goods !== null &&
        row.date_dim?.full_date !== null &&
        row.channel_dim?.channel_name !== null;

      if (isComplete) {
        completeCount++;
      }

      const channelName = row.channel_dim?.channel_name || 'Unknown';
      channelRevenue[channelName] =
        (channelRevenue[channelName] || 0) + netSales;

      const itemId = row.product_id || row.service_id;
      const category = itemCategoryMap.get(itemId) || 'Uncategorized';
      categorySales[category] = (categorySales[category] || 0) + netSales;

      const dateStr = row.date_dim?.full_date;
      if (dateStr) {
        if (!dailyHistoryMap.has(dateStr)) {
          dailyHistoryMap.set(dateStr, {
            date: dateStr,
            value: 0,
            avg_temperature: row.date_dim.avg_temperature_celsius ?? 28,
            rainfall: row.date_dim.rainfall_mm ?? 0,
            is_holiday: row.date_dim.is_holiday ? 1 : 0,
          });
        }
        const entry = dailyHistoryMap.get(dateStr);
        entry.value += netSales;
      }
    });

    const dataCompleteness =
      factRows.length > 0
        ? Math.round((completeCount / factRows.length) * 100)
        : 100;
    const averageMargin =
      totalRevenue > 0
        ? Math.round((totalGrossProfit / totalRevenue) * 100)
        : 0;

    const history = Array.from(dailyHistoryMap.values()).sort((a, b) =>
      a.date.localeCompare(b.date),
    );

    // 5. Fetch future 30 days exogenous variables from date_dim
    const endDate = new Date(endDateStr);
    const futureStartDate = new Date(endDate);
    futureStartDate.setDate(futureStartDate.getDate() + 1);
    const futureEndDate = new Date(endDate);
    futureEndDate.setDate(futureEndDate.getDate() + 30);

    const futureStartDateStr = futureStartDate.toISOString().slice(0, 10);
    const futureEndDateStr = futureEndDate.toISOString().slice(0, 10);

    const { data: futureExoRows } = await this.supabase
      .from('date_dim')
      .select('full_date, avg_temperature_celsius, rainfall_mm, is_holiday')
      .gte('full_date', futureStartDateStr)
      .lte('full_date', futureEndDateStr)
      .order('full_date', { ascending: true });

    const futureExogenous = (futureExoRows || []).map((row: any) => ({
      date: row.full_date,
      avg_temperature: row.avg_temperature_celsius ?? 28,
      rainfall: row.rainfall_mm ?? 0,
      is_holiday: row.is_holiday ? 1 : 0,
    }));

    // 6. Context-Aware Trend Extrapolation via Python Script
    const extrapolationResult = await this.runPython<{
      projectedRevenue: number[];
      dates: string[];
      trendDirection: 'UPWARD' | 'DOWNWARD' | 'STABLE';
      projectedGrowthRate: number;
    }>('extrapolate_trends.py', {
      history,
      future_exogenous: futureExogenous,
      horizon: 30,
    });

    // 7. Perform real Customer Feedback sentiment audit from recommendation_feedback table
    const sortedCategories = Object.entries(categorySales).sort(
      (a, b) => b[1] - a[1],
    );
    const topCategory = sortedCategories[0]?.[0] || 'Uncategorized';
    const realFeedbackNotes = await this.getRealFeedbackNotes(
      startDateStr,
      endDateStr,
    );
    const hasFeedback = realFeedbackNotes.length > 0;
    const sentimentData = hasFeedback
      ? this.analyzeTaglishSentiment(realFeedbackNotes)
      : null;

    // 8. Parameterized NLG (Natural Language Generation) — returns structured sections
    const deterministicSections = this.generateNlgSections(
      title,
      startDateStr,
      endDateStr,
      sectors,
      Math.round(totalRevenue),
      Math.round(totalGrossProfit),
      averageMargin,
      channelRevenue,
      categorySales,
      extrapolationResult.trendDirection,
      extrapolationResult.projectedGrowthRate,
      extrapolationResult.projectedRevenue,
      sentimentData,
      realFeedbackNotes,
      dataCompleteness,
    );
    const deterministicSummary = deterministicSections
      .map((s) => s.content)
      .join('\n\n');
    const llmSummary = await this.llmService.generate({
      feature: 'report_summary',
      prompt:
        'Write the executive summary for this verified WOOF report. Preserve every number exactly and separate observations from recommendations.',
      context: {
        title,
        dateRange: { start: startDateStr, end: endDateStr },
        sectors,
        totalRevenue: Math.round(totalRevenue),
        totalGrossProfit: Math.round(totalGrossProfit),
        averageMargin,
        channelRevenue,
        categorySales,
        trendDirection: extrapolationResult.trendDirection,
        projectedGrowthRate: extrapolationResult.projectedGrowthRate,
        dataCompleteness,
      },
    });
    const nlgSummary = llmSummary.configured
      ? llmSummary.text
      : deterministicSummary;

    // Determine if data is partial (only POS channel active)
    const activeChannels = Object.keys(channelRevenue).filter(
      (c) => channelRevenue[c] > 0,
    );
    const isPartialData =
      activeChannels.length === 1 && activeChannels[0] === 'POS';

    // 9. Persist report to Supabase
    const dailyHistorySummary = history.map((h) => ({
      date: h.date,
      value: Math.round(h.value),
    }));

    const payload = {
      title,
      date_range: { start: startDateStr, end: endDateStr },
      sectors,
      aggregated_data: {
        totalRevenue: Math.round(totalRevenue),
        totalGrossProfit: Math.round(totalGrossProfit),
        averageMargin,
        channelRevenue,
        categorySales,
        dailyHistory: dailyHistorySummary,
      },
      extrapolated_trends: {
        horizonDays: 30,
        dates: extrapolationResult.dates,
        projectedRevenue: extrapolationResult.projectedRevenue,
        projectedGrowthRate: extrapolationResult.projectedGrowthRate,
        trendDirection: extrapolationResult.trendDirection,
      },
      data_completeness: dataCompleteness,
      uat_feedback: {
        accuracyRating: null,
        usefulnessRating: null,
        ownerApproved: false,
        feedbackText: null,
        reviewedAt: null,
      },
      nlg_summary: nlgSummary,
    };

    const { data: newReport, error: saveErr } = await this.supabase
      .from('smart_reports')
      .insert(payload)
      .select()
      .single();

    if (saveErr) {
      throw new InternalServerErrorException(
        `Failed to save report: ${saveErr.message}`,
      );
    }

    if (this.auditService) {
      void this.auditService.record({
        action: `Generated Smart Executive Report: ${title}`,
        module: 'smart_reports',
        category: 'ai_system',
        target: `${title} (${startDateStr} to ${endDateStr})`,
        actor: 'Owner',
        actorType: 'user',
        status: 'success',
        stateBefore: 'none',
        stateAfter: 'generated',
        metadata: {
          reportId: newReport.id,
          startDate: startDateStr,
          endDate: endDateStr,
          sectors,
          totalRevenue: Math.round(totalRevenue),
          trendDirection: extrapolationResult.trendDirection,
          projectedGrowthRate: extrapolationResult.projectedGrowthRate,
        },
      });
    }

    // Attach computed fields that are not persisted as DB columns
    return {
      ...this.mapToCamelCase(newReport),
      isPartialData,
      nlgSections: deterministicSections,
    };
  }

  private mapToCamelCase(report: any): any {
    return {
      ...report,
      _id: report.id,
      dateRange: report.date_range,
      aggregatedData: report.aggregated_data,
      extrapolatedTrends: report.extrapolated_trends,
      dataCompleteness: report.data_completeness,
      // isPartialData and nlgSections are computed in-memory on generate; not stored in DB
      isPartialData: false,
      nlgSections: null,
      uatFeedback: report.uat_feedback,
      nlgSummary: report.nlg_summary,
      generatedAt: new Date(report.generated_at),
    };
  }

  private generateNlgSections(
    title: string,
    start: string,
    end: string,
    sectors: string[],
    revenue: number,
    profit: number,
    margin: number,
    channelRevenue: Record<string, number>,
    categorySales: Record<string, number>,
    trend: 'UPWARD' | 'DOWNWARD' | 'STABLE',
    growthRate: number,
    projections: number[],
    sentiment: { score: number; label: 'POSITIVE' | 'NEGATIVE' | 'NEUTRAL' } | null,
    feedbackNotes: string[],
    dataCompleteness: number,
  ): { title: string; content: string }[] {
    const formattedRevenue = new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'PHP',
      maximumFractionDigits: 0,
    }).format(revenue);
    const formattedProfit = new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'PHP',
      maximumFractionDigits: 0,
    }).format(profit);

    // Find top channel
    let topChannel = 'N/A';
    let topChannelRevenue = 0;
    Object.entries(channelRevenue).forEach(([ch, rev]) => {
      if (rev > topChannelRevenue) {
        topChannelRevenue = rev;
        topChannel = ch;
      }
    });
    const channelShare =
      revenue > 0 ? Math.round((topChannelRevenue / revenue) * 100) : 0;
    const formattedTopChannelRevenue = new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'PHP',
      maximumFractionDigits: 0,
    }).format(topChannelRevenue);

    // Find top category
    const topCategory = Object.keys(categorySales)[0] || 'Uncategorized';

    // Projections summary
    const totalProjected = projections.reduce((a, b) => a + b, 0);
    const formattedProjected = new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'PHP',
      maximumFractionDigits: 0,
    }).format(totalProjected);

    const sectorList = sectors.length > 0 ? sectors.join(', ') : 'all';

    const sections: { title: string; content: string }[] = [];

    // Section 1: Executive Performance Summary
    sections.push({
      title: 'Executive Performance Summary',
      content: `For the period starting from ${start} to ${end}, sales across the ${sectorList} business segment(s) yielded a total net revenue of ${formattedRevenue} and a gross profit of ${formattedProfit}, maintaining a healthy average profit margin of ${margin}%. Growth was primarily anchored by the ${topCategory} category. Channel distribution shows that ${topChannel} was the top performing channel, contributing ${formattedTopChannelRevenue} — approximately ${channelShare}% of total gross performance. This report carries a Data Completeness rating of ${dataCompleteness}%.`,
    });

    // Section 2: Trend Analysis & Forecasts
    sections.push({
      title: 'Trend Analysis & Forecasts',
      content: `A context-aware multivariate linear trend analysis fitted over the historical window indicates a ${trend.toLowerCase()} trajectory for the upcoming 30–31 day forecast horizon. Daily revenue is projected to move with a calculated period growth rate of ${growthRate}%. The overall estimated sales outlook for this forecast period totals ${formattedProjected}.`,
    });

    // Section 3: Customer Sentiment Analysis — only if real feedback exists
    if (sentiment && feedbackNotes.length > 0) {
      const sampleQuote = feedbackNotes[0];
      sections.push({
        title: 'Customer Sentiment Analysis',
        content: `Analysis of ${feedbackNotes.length} real customer feedback note(s) within the selected period indicates a predominantly ${sentiment.label.toLowerCase()} signal (sentiment score: ${sentiment.score.toFixed(2)}). A representative sample: "${sampleQuote}"`,
      });
    }

    // Section 4: Strategic Advisory & Recommendations
    let advisory = '';
    if (trend === 'UPWARD') {
      advisory = `Given the upward trajectory in sales, we recommend scaling up inventory stocking levels for the high-performing ${topCategory} category to prevent potential supply gaps. Marketing should double-down on promoting top-performing offerings on the ${topChannel} channel to maximize current momentum and accelerate transaction size.`;
    } else if (trend === 'DOWNWARD') {
      advisory = `In light of the downward trend in revenue, it is critical to conduct operational cost reviews, recalibrate discount structures on ${topCategory}, and deploy targeted marketing campaigns or loyalty points boosters on ${topChannel} to help stabilize margins and arrest the decline.`;
    } else {
      advisory = `With transaction patterns demonstrating stable and flat demand, focus should shift toward average order value (AOV) optimization through cross-selling and product bundling. We advise setting up automated alerts for customer feedback loops to identify and solve micro-bottlenecks in service delivery.`;
    }
    sections.push({
      title: 'Strategic Advisory & Recommendations',
      content: advisory,
    });

    return sections;
  }

  async getAllReports(): Promise<any[]> {
    const { data, error } = await this.supabase
      .from('smart_reports')
      .select('*')
      .order('generated_at', { ascending: false });

    if (error) throw new InternalServerErrorException(error.message);
    return (data || []).map(this.mapToCamelCase);
  }

  async getReportById(id: string): Promise<any> {
    const { data, error } = await this.supabase
      .from('smart_reports')
      .select('*')
      .eq('id', id)
      .single();

    if (error || !data) {
      throw new NotFoundException(`Smart Report with ID "${id}" not found`);
    }
    return this.mapToCamelCase(data);
  }

  async deleteReport(id: string): Promise<void> {
    const report = await this.getReportById(id).catch(() => null);
    const { count, error } = await this.supabase
      .from('smart_reports')
      .delete({ count: 'exact' })
      .eq('id', id);

    if (error) throw new InternalServerErrorException(error.message);
    if (count === 0) {
      throw new NotFoundException(`Smart Report with ID "${id}" not found`);
    }

    if (this.auditService) {
      void this.auditService.record({
        action: `Deleted Smart Report: ${report?.title || id}`,
        module: 'smart_reports',
        category: 'workflow',
        target: report?.title || id,
        actor: 'Owner',
        actorType: 'user',
        status: 'success',
        stateBefore: 'active',
        stateAfter: 'deleted',
        metadata: {
          reportId: id,
          title: report?.title,
        },
      });
    }
  }

  async submitFeedback(
    id: string,
    dto: {
      accuracyRating: number;
      usefulnessRating: number;
      ownerApproved: boolean;
      feedbackText?: string;
    },
  ): Promise<any> {
    const report = await this.getReportById(id);

    const updatedFeedback = {
      ...report.uatFeedback,
      accuracyRating: dto.accuracyRating,
      usefulnessRating: dto.usefulnessRating,
      ownerApproved: dto.ownerApproved,
      feedbackText: dto.feedbackText || null,
      reviewedAt: new Date().toISOString(),
    };

    const { data, error } = await this.supabase
      .from('smart_reports')
      .update({ uat_feedback: updatedFeedback })
      .eq('id', id)
      .select()
      .single();

    if (error || !data) {
      throw new InternalServerErrorException(error?.message || 'Update failed');
    }

    if (this.auditService) {
      void this.auditService.record({
        action: 'Submitted Smart Report Feedback',
        module: 'smart_reports',
        category: 'workflow',
        target: report.title,
        actor: 'Owner',
        actorType: 'user',
        status: 'success',
        stateBefore: 'pending_review',
        stateAfter: dto.ownerApproved ? 'approved' : 'reviewed',
        metadata: {
          reportId: id,
          title: report.title,
          accuracyRating: dto.accuracyRating,
          usefulnessRating: dto.usefulnessRating,
          ownerApproved: dto.ownerApproved,
        },
      });
    }

    return this.mapToCamelCase(data);
  }
}
