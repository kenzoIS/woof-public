import { useState } from 'react';
import { useRouter } from 'next/router';
import { toast } from 'sonner';
import { SystemAlert, acknowledgeAlert } from '../lib/api';

interface PriorityAlertBannerProps {
  alerts: SystemAlert[];
  onAlertAcknowledged?: (alertId: string) => void;
}

export function PriorityAlertBanner({
  alerts,
  onAlertAcknowledged,
}: PriorityAlertBannerProps) {
  const router = useRouter();
  const [snoozedIds, setSnoozedIds] = useState<Set<string>>(new Set());
  const [submittingId, setSubmittingId] = useState<string | null>(null);

  const [isExpanded, setIsExpanded] = useState(false);

  const [selectedAlertIndex, setSelectedAlertIndex] = useState(0);

  // Filter out alerts acknowledged in this session
  const visibleAlerts = alerts.filter(
    (a) => a.status === 'active' && !snoozedIds.has(a.id),
  );

  if (visibleAlerts.length === 0) {
    return null;
  }

  // Display the selected alert (defaults to most critical)
  const topAlert = visibleAlerts[selectedAlertIndex] || visibleAlerts[0];

  const handleActionClick = (targetUrl: string) => {
    if (targetUrl.startsWith('action:openIngestionDrawer')) {
      window.dispatchEvent(new CustomEvent('openDataIngestionDrawer'));
      return;
    }
    router.push(targetUrl === '/traffic-optimizer'
      ? '/ai-simulation?tab=traffic-optimizer'
      : targetUrl);
  };

  const handleAcknowledge = async (alertId: string) => {
    try {
      setSubmittingId(alertId);
      const userEmail =
        typeof window !== 'undefined'
          ? localStorage.getItem('userEmail') || 'owner@happytails.com'
          : 'owner@happytails.com';

      await acknowledgeAlert(alertId, {
        userEmail,
        snoozeHours: 12,
        note: 'Acknowledged via Home Dashboard Alert Banner',
      });

      setSnoozedIds((prev) => new Set([...prev, alertId]));
      setSelectedAlertIndex(0);
      if (onAlertAcknowledged) {
        onAlertAcknowledged(alertId);
      }
    } catch (error) {
      toast.error('Alert acknowledgement was not saved', {
        description: error instanceof Error ? error.message : 'Please try again after checking the backend connection.',
      });
    } finally {
      setSubmittingId(null);
    }
  };

  const isCritical = topAlert.severity === 'critical';
  const isWarning = topAlert.severity === 'warning';

  const containerStyles = isCritical
    ? 'border-2 border-[#EF4444] bg-[#FEF2F2] text-[#991B1B]'
    : isWarning
      ? 'border-2 border-[#F59E0B] bg-[#FFFBEB] text-[#92400E]'
      : 'border-2 border-[#0284C7] bg-[#F0F9FF] text-[#075985]';

  const badgeBg = isCritical
    ? 'bg-[#EF4444] text-white'
    : isWarning
      ? 'bg-[#F59E0B] text-white'
      : 'bg-[#0284C7] text-white';

  const actionBtnStyles = isCritical
    ? 'bg-[#991B1B] text-white hover:bg-[#7F1D1D]'
    : isWarning
      ? 'bg-[#92400E] text-white hover:bg-[#78350F]'
      : 'bg-[#075985] text-white hover:bg-[#0C4A6E]';

  const acknowledgeBtnStyles = isCritical
    ? 'border border-[#EF4444]/40 bg-white text-[#991B1B] hover:bg-[#FEF2F2]'
    : isWarning
      ? 'border border-[#F59E0B]/40 bg-white text-[#92400E] hover:bg-[#FFFBEB]'
      : 'border border-[#0284C7]/40 bg-white text-[#075985] hover:bg-[#F0F9FF]';

  return (
    <div className={`rounded-2xl p-5 shadow-lg mb-6 transition-all ${containerStyles}`}>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-current/15 pb-3">
        <div className="flex flex-wrap items-center gap-3">
          <span
            className={`rounded px-2.5 py-0.5 text-[11px] font-black uppercase tracking-wider ${badgeBg}`}
          >
            {topAlert.severity === 'critical'
              ? 'Critical Alert'
              : topAlert.severity === 'warning'
                ? 'Operational Warning'
                : 'Business Advisory'}
          </span>
          <span className="text-xs font-bold uppercase tracking-wider">
            {topAlert.module.toUpperCase()} SECTOR
          </span>
          <span className="text-[11px] font-mono opacity-60">
            [{topAlert.classification}]
          </span>
        </div>
        <div className="flex items-center gap-3">
          {visibleAlerts.length > 1 && (
            <button
              type="button"
              onClick={() => setIsExpanded((prev) => !prev)}
              className="text-[11px] font-bold underline opacity-85 hover:opacity-100 transition-opacity cursor-pointer uppercase tracking-wider text-left"
              aria-label={isExpanded ? 'Collapse active alerts' : 'Expand active alerts'}
            >
              +{visibleAlerts.length - 1} other active alert
              {visibleAlerts.length - 1 > 1 ? 's' : ''}{' '}
              <span className="font-mono">{isExpanded ? '[COLLAPSE]' : '[STACK ALL]'}</span>
            </button>
          )}
          <span className="text-[11px] font-mono opacity-60">
            ID: {topAlert.id}
          </span>
        </div>
      </div>

      {/* Switcher Pills: All active alerts (Predicted Traffic, Peak Congestion, Staleness) are immediately visible & clickable */}
      {visibleAlerts.length > 1 && (
        <div className="flex flex-wrap items-center gap-1.5 pt-3 pb-1 border-b border-current/15">
          <span className="text-[10px] font-black uppercase tracking-wider opacity-70 mr-1">
            Active Alerts ({visibleAlerts.length}):
          </span>
          {visibleAlerts.map((alert, idx) => {
            const isSelected = selectedAlertIndex === idx;
            const isCrit = alert.severity === 'critical';
            const isWarn = alert.severity === 'warning';
            const badgeLabel = isCrit ? '[CRITICAL]' : isWarn ? '[WARNING]' : '[PREDICTED]';
            return (
              <button
                key={alert.id}
                type="button"
                onClick={() => setSelectedAlertIndex(idx)}
                className={`px-2.5 py-1 rounded text-[11px] font-bold transition-all uppercase tracking-wider cursor-pointer ${
                  isSelected
                    ? isCrit
                      ? 'bg-[#991B1B] text-white shadow'
                      : isWarn
                        ? 'bg-[#92400E] text-white shadow'
                        : 'bg-[#075985] text-white shadow'
                    : 'bg-white/80 hover:bg-white text-current border border-current/25'
                }`}
              >
                <span className="font-mono text-[9px] mr-1">{badgeLabel}</span>
                {alert.title.length > 38 ? alert.title.slice(0, 36) + '...' : alert.title}
              </button>
            );
          })}
        </div>
      )}

      <div className="pt-3 pb-4">
        <h3 className="text-base font-extrabold leading-tight">
          {topAlert.title}
        </h3>
        <p className="mt-1.5 text-xs text-[#223047] leading-relaxed max-w-4xl font-normal">
          {topAlert.evidence}
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3 pt-2 border-t border-current/15">
        <button
          onClick={() => handleActionClick(topAlert.targetUrl)}
          className={`rounded-lg px-4 py-2 text-xs font-bold transition-colors ${actionBtnStyles}`}
        >
          {topAlert.actionLabel}
        </button>

        <button
          onClick={() => handleAcknowledge(topAlert.id)}
          disabled={submittingId === topAlert.id}
          className={`rounded-lg px-4 py-2 text-xs font-semibold transition-colors disabled:opacity-50 ${acknowledgeBtnStyles}`}
        >
          {submittingId === topAlert.id
            ? 'SAVING...'
            : 'ACKNOWLEDGE & SNOOZE 12H'}
        </button>

        <button
          onClick={() => router.push('/audit')}
          className="text-xs font-medium text-[#223047]/60 underline hover:text-[#223047] ml-auto"
        >
          View in Audit Log
        </button>
      </div>

      {isExpanded && visibleAlerts.length > 1 && (
        <div className="mt-5 pt-4 border-t border-current/20 space-y-4">
          <div className="text-xs font-black uppercase tracking-wider opacity-80">
            All Other Active Alerts ({visibleAlerts.length - 1})
          </div>
          {visibleAlerts.filter((a) => a.id !== topAlert.id).map((otherAlert) => {
            const isOtherCritical = otherAlert.severity === 'critical';
            const isOtherWarning = otherAlert.severity === 'warning';
            const itemBg = isOtherCritical
              ? 'bg-white/90 border-[#EF4444]/40 text-[#991B1B]'
              : isOtherWarning
                ? 'bg-white/90 border-[#F59E0B]/40 text-[#92400E]'
                : 'bg-white/90 border-[#0284C7]/40 text-[#075985]';
            const itemBadge = isOtherCritical
              ? 'bg-[#EF4444] text-white'
              : isOtherWarning
                ? 'bg-[#F59E0B] text-white'
                : 'bg-[#0284C7] text-white';

            return (
              <div
                key={otherAlert.id}
                className={`rounded-xl p-4 border transition-all shadow-sm ${itemBg}`}
              >
                <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-current/15">
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={`rounded px-2 py-0.5 text-[10px] font-black uppercase tracking-wider ${itemBadge}`}
                    >
                      {otherAlert.severity === 'critical'
                        ? 'Critical Alert'
                        : otherAlert.severity === 'warning'
                          ? 'Operational Warning'
                          : 'Advisory'}
                    </span>
                    <span className="text-xs font-bold uppercase tracking-wider">
                      {otherAlert.module.toUpperCase()} SECTOR
                    </span>
                    <span className="text-[10px] font-mono opacity-70">
                      [{otherAlert.classification}]
                    </span>
                  </div>
                  <span className="text-[10px] font-mono opacity-60">
                    ID: {otherAlert.id}
                  </span>
                </div>

                <div className="pt-2 pb-3">
                  <h4 className="text-sm font-extrabold leading-tight">
                    {otherAlert.title}
                  </h4>
                  <p className="mt-1 text-xs text-[#223047] leading-relaxed font-normal">
                    {otherAlert.evidence}
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-current/15">
                  <button
                    onClick={() => handleActionClick(otherAlert.targetUrl)}
                    className="rounded-md px-3 py-1.5 text-xs font-bold transition-colors bg-[#223047] text-white hover:bg-[#F53799]"
                  >
                    {otherAlert.actionLabel || 'VIEW'}
                  </button>

                  <button
                    onClick={() => handleAcknowledge(otherAlert.id)}
                    disabled={submittingId === otherAlert.id}
                    className="rounded-md px-3 py-1.5 text-xs font-semibold transition-colors border border-current/30 bg-white text-current hover:bg-black/5 disabled:opacity-50"
                  >
                    {submittingId === otherAlert.id
                      ? 'SAVING...'
                      : 'ACKNOWLEDGE & SNOOZE 12H'}
                  </button>

                  <button
                    onClick={() => router.push('/audit')}
                    className="text-xs font-medium text-[#223047]/60 underline hover:text-[#223047] ml-auto"
                  >
                    View in Audit Log
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
