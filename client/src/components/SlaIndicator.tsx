import { AlarmClock, CheckCircle2, Clock, Hourglass } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { Ticket } from '../types/api';
import { cn } from '../utils/cn';
import { formatTimestamp, getSlaStatus, type SlaState } from '../utils/time';

const STATE_STYLES: Record<SlaState, { className: string; icon: LucideIcon }> = {
  overdue: { className: 'text-red-700 font-semibold', icon: AlarmClock },
  'due-soon': { className: 'text-amber-800 font-semibold', icon: Hourglass },
  'on-track': { className: 'text-slate-700', icon: Clock },
  resolved: { className: 'text-slate-500', icon: CheckCircle2 },
};

interface SlaIndicatorProps {
  ticket: Pick<Ticket, 'status' | 'slaDeadline'>;
  now: number;
  className?: string;
}

export function SlaIndicator({ ticket, now, className }: SlaIndicatorProps) {
  const { state, label } = getSlaStatus(ticket, now);
  const { className: stateClass, icon: Icon } = STATE_STYLES[state];
  return (
    <span
      className={cn('inline-flex items-center gap-1.5 text-sm tabular-nums', stateClass, className)}
      title={`SLA deadline: ${formatTimestamp(ticket.slaDeadline)}`}
    >
      <Icon aria-hidden className="size-4 shrink-0" />
      {label}
    </span>
  );
}
