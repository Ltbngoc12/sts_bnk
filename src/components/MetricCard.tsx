'use client';

import React from 'react';
import Link from 'next/link';
import {
  DashboardPeriod,
  PERIOD_LABELS,
  PERIOD_OPTIONS,
} from '@/lib/dashboardPeriod';

export type MetricTone = 'neutral' | 'info' | 'danger' | 'warning' | 'success' | 'primary';

export interface MetricSlot {
  /** Metric name shown above/below the number, e.g. "Unclosed Incidents". */
  label: string;
  value: number | string;
  /** Qualifier under the number, e.g. "as of now" or "(This Week)". */
  qualifier: string;
  tone?: MetricTone;
  /** Where clicking this number navigates. */
  href?: string;
  /** Warning tint when the value is non-zero (Unclosed / Overdue metrics). */
  alertWhenPositive?: boolean;
  /** Optional hover tooltip carrying the definition of the metric. */
  title?: string;
}

interface MetricCardProps {
  /** Card heading, e.g. "Total Incident". */
  title: string;
  /** Domain icon */
  iconType?: 'cases' | 'incidents' | 'faults' | 'tasks' | 'nops';
  /** Accent-stripe key; maps to `.metric-card-v2.accent-*` rule in globals.css. */
  accent: 'info' | 'critical' | 'high' | 'review' | 'primary';
  metrics: MetricSlot[];
  /** Present only on period-based cards (Total Incident / Total Fault). */
  period?: DashboardPeriod;
  onPeriodChange?: (period: DashboardPeriod) => void;
  /** Renders the whole card as an upcoming module placeholder (e.g. Active NOPs). */
  disabled?: boolean;
  disabledNote?: string;
  /** Optional overall card navigation link */
  cardHref?: string;
}

function renderDomainIcon(type?: string) {
  switch (type) {
    case 'cases':
      return (
        <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
        </svg>
      );
    case 'incidents':
      return (
        <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polygon points="7.86 2 16.14 2 22 7.86 22 16.14 16.14 22 7.86 22 2 16.14 2 7.86 7.86 2" />
          <line x1="12" y1="8" x2="12" y2="12" />
          <line x1="12" y1="16" x2="12.01" y2="16" />
        </svg>
      );
    case 'faults':
      return (
        <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
        </svg>
      );
    case 'tasks':
      return (
        <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M9 11l3 3L22 4" />
          <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
        </svg>
      );
    case 'nops':
      return (
        <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
          <line x1="3" y1="9" x2="21" y2="9" />
          <line x1="9" y1="21" x2="9" y2="9" />
        </svg>
      );
    default:
      return null;
  }
}

function toneClass(tone: MetricTone | undefined, alert: boolean): string {
  if (alert) return 'metric-slot-alert';
  switch (tone) {
    case 'info': return 'text-info';
    case 'danger': return 'text-danger';
    case 'warning': return 'text-warning';
    case 'success': return 'text-success';
    case 'primary': return 'text-primary';
    default: return '';
  }
}

export const MetricCard: React.FC<MetricCardProps> = ({
  title,
  iconType,
  accent,
  metrics,
  period,
  onPeriodChange,
  disabled = false,
  disabledNote,
  cardHref,
}) => {
  const isSingleMetric = metrics.length === 1;

  return (
    <div
      className={`metric-card-v2 glass accent-${accent}${disabled ? ' metric-card-disabled' : ''}${cardHref ? ' card-interactive' : ''}`}
      aria-disabled={disabled || undefined}
    >
      <div className="metric-card-accent-bar" />

      {/* Header */}
      <div className="metric-card-head">
        <div className="metric-card-title-group">
          {iconType && (
            <span className={`metric-card-icon icon-${accent}`}>
              {renderDomainIcon(iconType)}
            </span>
          )}
          <h3>{title}</h3>
        </div>

        {period && onPeriodChange && !disabled && (
          <div className="metric-period-wrapper" onClick={e => e.stopPropagation()}>
            <select
              className="metric-period-select"
              value={period}
              onChange={e => onPeriodChange(e.target.value as DashboardPeriod)}
              aria-label={`${title} reporting period`}
            >
              {PERIOD_OPTIONS.map(opt => (
                <option key={opt} value={opt}>{PERIOD_LABELS[opt]}</option>
              ))}
            </select>
          </div>
        )}

        {cardHref && !period && !disabled && (
          <Link href={cardHref} className="metric-card-arrow" title={`View ${title}`}>
            <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M5 12h14" />
              <path d="M12 5l7 7-7 7" />
            </svg>
          </Link>
        )}
      </div>

      {/* Body */}
      {disabled ? (
        <div className="metric-card-body metric-card-disabled-body">
          <div className="metric-disabled-placeholder">
            <span className="metric-disabled-badge">UPCOMING MODULE</span>
            <div className="metric-disabled-text">
              <span>{disabledNote || 'NOP Module (In Development)'}</span>
            </div>
          </div>
        </div>
      ) : (
        <div className={`metric-card-body ${isSingleMetric ? 'slots-1' : 'slots-2'}`}>
          {metrics.map((slot, idx) => {
            const isAlert = !!slot.alertWhenPositive && Number(slot.value) > 0;
            const content = (
              <div className="metric-slot-inner">
                <div className="metric-slot-label-row">
                  <span className="metric-slot-label" title={slot.label}>
                    {slot.label}
                  </span>
                  {isAlert && <span className="metric-alert-dot" title="Requires attention" />}
                </div>

                <div className="metric-slot-val-row">
                  <span className={`metric-slot-value ${toneClass(slot.tone, isAlert)}`}>
                    {slot.value}
                  </span>
                </div>

                <div className="metric-slot-meta-row">
                  <span className="metric-slot-qualifier">{slot.qualifier}</span>
                </div>
              </div>
            );

            const slotClass = `metric-slot${isAlert ? ' metric-slot-alert-bg' : ''}`;

            if (!slot.href) {
              return (
                <div key={idx} className={slotClass} title={slot.title}>
                  {content}
                </div>
              );
            }

            return (
              <Link
                key={idx}
                href={slot.href}
                className={`${slotClass} metric-slot-link`}
                title={slot.title || `Navigate to ${slot.label}`}
              >
                {content}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default MetricCard;
