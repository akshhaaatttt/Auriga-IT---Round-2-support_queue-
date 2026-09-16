import { AlarmClockOff, CheckCircle2, Clock, Hourglass } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { Ticket } from '../types/api';
import { cn } from '../utils/cn';
import { formatDuration, formatTimestamp, getSlaStatus, type SlaState } from '../utils/time';

const STATE_STYLES: Record<SlaState, { tone: string; icon: LucideIcon; prefix: string }> = {
  overdue: { tone: 'text-danger-strong', icon: AlarmClockOff, prefix: 'Overdue by' },
  'due-soon': { tone: 'text-due', icon: Hourglass, prefix: 'Due in' },
  'on-track': { tone: 'text-ink-muted', icon: Clock, prefix: 'Due in' },
  resolved: { tone: 'text-ink-subtle', icon: CheckCircle2, prefix: 'Resolved' },
};

interface SlaIndicatorProps {
  ticket: Pick<Ticket, 'status' | 'slaDeadline'>;
  now: number;
  /** Adds the absolute deadline beneath the countdown. */
  showDeadline?: boolean;
  size?: 'sm' | 'lg';
  className?: string;
}

/**
 * SLA countdown. The duration is set in the monospace face so digits align between rows and
 * stay legible at a glance; the words carry the meaning, the colour only reinforces it.
 */
export function SlaIndicator({ ticket, now, showDeadline = false, size = 'sm', className }: SlaIndicatorProps) {
  const { state, label } = getSlaStatus(ticket, now);
  const { tone, icon: Icon, prefix } = STATE_STYLES[state];
  const duration = state === 'resolved' ? null : formatDuration(Date.parse(ticket.slaDeadline) - now);

  return (
    <span className={cn('inline-flex min-w-0 flex-col', className)} title={`SLA deadline ${formatTimestamp(ticket.slaDeadline)}`}>
      <span className={cn('inline-flex items-center gap-1.5 whitespace-nowrap', tone, size === 'lg' ? 'text-base' : 'text-sm')}>
        <Icon aria-hidden className={cn('shrink-0', size === 'lg' ? 'size-5' : 'size-4')} />
        <span className="sr-only">{label}</span>
        <span aria-hidden className={cn(state === 'overdue' || state === 'due-soon' ? 'font-semibold' : 'font-medium')}>
          {prefix}
          {duration && <span className="ml-1 tabular-nums">{duration}</span>}
        </span>
      </span>
      {showDeadline && state !== 'resolved' && (
        <span className="mt-0.5 pl-5.5 text-xs whitespace-nowrap text-ink-subtle">
          {state === 'overdue' ? 'was due' : 'by'} {formatTimestamp(ticket.slaDeadline)}
        </span>
      )}
    </span>
  );
}
