import { AlarmClockOff, ChevronsUp, Hourglass, Inbox } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { TicketCounts } from '../types/api';
import { cn } from '../utils/cn';

interface QueueSummaryProps {
  counts: TicketCounts | null;
  onShowActive: () => void;
  onShowOverdue: () => void;
  activeMetric: 'active' | 'overdue' | null;
}

interface Metric {
  key: keyof TicketCounts;
  label: string;
  icon: LucideIcon;
  describe: (counts: TicketCounts) => string;
  /** Tone applied only when the value is non-zero, so calm states stay calm. */
  alertTone?: string;
  onClick?: () => void;
  isActive?: boolean;
}

export function QueueSummary({ counts, onShowActive, onShowOverdue, activeMetric }: QueueSummaryProps) {
  const metrics: Metric[] = [
    {
      key: 'active',
      label: 'Open tickets',
      icon: Inbox,
      describe: (c) => `${c.open} open · ${c.inProgress} in progress`,
      onClick: onShowActive,
      isActive: activeMetric === 'active',
    },
    {
      key: 'overdue',
      label: 'SLA breached',
      icon: AlarmClockOff,
      describe: (c) => (c.overdue === 0 ? 'Everything is within SLA' : 'Needs attention now'),
      alertTone: 'text-danger-strong',
      onClick: onShowOverdue,
      isActive: activeMetric === 'overdue',
    },
    {
      key: 'urgent',
      label: 'Urgent',
      icon: ChevronsUp,
      describe: () => 'Unresolved, 2h response',
      alertTone: 'text-priority-urgent',
    },
    {
      key: 'dueSoon',
      label: 'Due within 30 min',
      icon: Hourglass,
      describe: () => 'About to breach',
      alertTone: 'text-due',
    },
  ];

  return (
    <section aria-label="Queue summary">
      <ul className="grid grid-cols-2 gap-px overflow-hidden rounded-(--radius-panel) border border-line bg-line shadow-(--shadow-panel) lg:grid-cols-4">
        {metrics.map(({ key, label, icon: Icon, describe, alertTone, onClick, isActive }) => {
          const value = counts?.[key];
          const tone = value !== undefined && value > 0 && alertTone ? alertTone : 'text-ink';
          const body = (
            <>
              <span className="flex items-center gap-1.5 text-xs font-medium text-ink-muted">
                <Icon aria-hidden className={cn('size-3.5', value !== undefined && value > 0 && alertTone ? alertTone : 'text-ink-subtle')} />
                {label}
              </span>
              <span className="mt-1.5 flex items-baseline gap-2">
                {value === undefined || !counts ? (
                  <span className="inline-block h-7 w-12 animate-pulse rounded bg-surface-muted">
                    <span className="sr-only">Loading</span>
                  </span>
                ) : (
                  <>
                    <span className={cn('font-mono text-2xl leading-none font-semibold tabular-nums', tone)}>{value}</span>
                    <span className="truncate text-xs text-ink-subtle">{describe(counts)}</span>
                  </>
                )}
              </span>
            </>
          );

          return (
            <li key={key} className={cn('relative bg-surface', isActive && 'bg-brand-soft/50')}>
              {isActive && <span aria-hidden className="absolute inset-x-0 top-0 h-0.5 bg-brand" />}
              {onClick ? (
                <button
                  type="button"
                  onClick={onClick}
                  aria-pressed={isActive}
                  className="block w-full px-4 py-3.5 text-left transition-colors duration-150 hover:bg-surface-hover focus-visible:-outline-offset-2"
                >
                  {body}
                </button>
              ) : (
                <div className="px-4 py-3.5">{body}</div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
