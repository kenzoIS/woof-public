import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Schema } from 'mongoose';
import { AuditService } from '../audit/audit.service';

export const PreferenceSchema = new Schema(
  {
    ownerId: { type: String, required: true, unique: true },
    values: { type: Schema.Types.Mixed, required: true },
    updatedAt: Date,
  },
  { collection: 'dashboard_preferences', versionKey: false },
);
const allowed: Record<string, string[]> = {
  businessProfile: [
    'businessName',
    'branchName',
    'location',
    'timezone',
    'currency',
    'openingTime',
    'closingTime',
  ],
  notifications: ['alerts', 'suggestions', 'reports', 'system'],
  dashboard: [
    'compactKpiCards',
    'showDemoControls',
    'showTooltips',
    'sidebarCollapsedByDefault',
  ],
  security: ['sessionTimeoutMinutes'],
  customTheme: ['primary', 'accent', 'surface'],
};
@Injectable()
export class PreferenceStoreService {
  constructor(
    @InjectModel('DashboardPreferences')
    private readonly preferences: Model<any>,
    private readonly audit: AuditService,
  ) {}
  async get(ownerId: string) {
    const row: any = await this.preferences.findOne({ ownerId }).lean();
    return row?.values || null;
  }
  async save(ownerId: string, input: Record<string, unknown>) {
    const values: Record<string, any> = {};
    for (const [key, fields] of Object.entries(allowed)) {
      const group = input?.[key];
      if (!group || typeof group !== 'object' || Array.isArray(group)) continue;
      values[key] = {};
      for (const field of fields) {
        const value = group[field];
        if (!['string', 'boolean', 'number'].includes(typeof value)) continue;
        if (typeof value === 'string' && value.length > 200)
          throw new BadRequestException('Preference value is too long');
        if (
          key === 'security' &&
          (!Number.isInteger(value) || value < 1 || value > 120)
        )
          throw new BadRequestException(
            'Session timeout must be 1–120 minutes',
          );
        values[key][field] = value;
      }
    }
    if (['light', 'dark'].includes(String(input?.theme)))
      values.theme = input.theme;
    if (
      ['pink', 'ocean', 'mint', 'slate', 'custom'].includes(
        String(input?.colorTheme),
      )
    )
      values.colorTheme = input.colorTheme;
    const previous = (await this.get(ownerId)) || {};
    const merged = { ...previous, ...values };
    for (const key of Object.keys(allowed)) {
      if (values[key]) merged[key] = { ...previous[key], ...values[key] };
    }
    const changed = Object.keys(values).filter(
      (key) => JSON.stringify(previous[key]) !== JSON.stringify(merged[key]),
    );
    if (!changed.length) return merged;
    await this.preferences.updateOne(
      { ownerId },
      { $set: { values: merged, updatedAt: new Date() } },
      { upsert: true },
    );
    await this.audit.record({
      actor: 'Owner',
      actorType: 'user',
      module: 'system_settings',
      category: 'workflow',
      action: 'Updated Dashboard Preferences',
      target: ownerId,
      status: 'success',
      metadata: { changedSections: changed },
    });
    return merged;
  }
}
