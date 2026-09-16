import { AlertTriangle, CheckCircle2, CircleDashed, LoaderCircle, TrendingUp } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { Priority, TicketStatus } from '../types/api';
import { cn } from '../utils/cn';
import { PRIORITY_LABELS, STATUS_LABELS } from '../utils/labels';

const PRIORITY_LEVEL: Record<Priority, number> = { LOW: 1, NORMAL: 2, HIGH: 3, URGENT: 4 };

const PRIORITY_TEXT: Record<Priority, string> = {
  URGENT: 'text-priority-urgent',
  HIGH: 'text-priority-high',
  NORMAL: 'text-priority-normal',
  LOW: 'text-priority-low',
};

const PRIORITY_SURFACE: Record<Priority, string> = {
  URGENT: 'bg-priority-urgent-soft',
  HIGH: 'bg-priority-high-soft',
  NORMAL: 'bg-priority-normal-soft',
  LOW: 'bg-priority-low-soft',
};

/** Four ascending bars: the number filled encodes the level, so it reads without colour. */
function PrioritySignal({ priority }: { priority: Priority }) {
  const level = PRIORITY_LEVEL[priority];
  return (
    <svg aria-hidden viewBox="0 0 16 16" className="size-3.5 shrink-0" fill="currentColor">
      {[0, 1, 2, 3].map((index) => (
        <rect
          key={index}
          x={1 + index * 3.75}
          y={11 - index * 3}
          width="2.5"
          height={4 + index * 3}
          rx="0.75"
          opacity={index < level ? 1 : 0.22}
        />
      ))}
    </svg>
  );
}

interface PriorityBadgeProps {
  priority: Priority;
  /** `plain` renders icon + label without a background, for dense table cells. */
  variant?: 'plain' | 'soft';
}

export function PriorityBadge({ priority, variant = 'soft' }: PriorityBadgeProps) {
  return (
    <span
      className={cn(
        'badge',
        PRIORITY_TEXT[priority],
        variant === 'soft' ? PRIORITY_SURFACE[priority] : 'px-0',
        priority === 'URGENT' && 'font-semibold',
      )}
    >
      <PrioritySignal priority={priority} />
      {PRIORITY_LABELS[priority]}
    </span>
  );
}

const STATUS_STYLES: Record<TicketStatus, { className: string; icon: LucideIcon }> = {
  OPEN: { className: 'text-status-open', icon: CircleDashed },
  IN_PROGRESS: { className: 'text-status-progress', icon: LoaderCircle },
  RESOLVED: { className: 'text-status-resolved', icon: CheckCircle2 },
};

export function StatusBadge({ status }: { status: TicketStatus }) {
  const { className, icon: Icon } = STATUS_STYLES[status];
  return (
    <span className={cn('badge border border-line bg-surface', className)}>
      <Icon aria-hidden className="size-3.5" />
      {STATUS_LABELS[status]}
    </span>
  );
}

export function OverdueBadge() {
  return (
    <span className="badge bg-danger font-semibold tracking-wide text-white uppercase">
      <AlertTriangle aria-hidden className="size-3.5" />
      Overdue
    </span>
  );
}

interface EscalatedBadgeProps {
  count: number;
  lastEscalatedAt: string | null;
  /** `compact` shows only the icon and count; the full meaning stays in the accessible name. */
  compact?: boolean;
}

export function EscalatedBadge({ count, lastEscalatedAt, compact = false }: EscalatedBadgeProps) {
  const times = count === 1 ? 'once' : `${count} times`;
  const when = lastEscalatedAt ? `, most recently ${new Date(lastEscalatedAt).toLocaleString()}` : '';
  const description = `Priority raised automatically ${times} after the SLA was breached${when}`;
  return (
    <span
      className={cn(
        'badge border border-escalated-line bg-escalated-soft text-escalated',
        compact && 'h-5 gap-0.5 px-1.5 text-[11px]',
      )}
      title={description}
    >
      <TrendingUp aria-hidden className={compact ? 'size-3' : 'size-3.5'} />
      {!compact && <span aria-hidden>Auto-escalated</span>}
      {count > 1 && <span aria-hidden>×{count}</span>}
      <span className="sr-only">{description}</span>
    </span>
  );
}
