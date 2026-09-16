import { AlertTriangle, CheckCircle2, ChevronDown, ChevronsUp, CircleDot, Equal, Timer } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { Priority, TicketStatus } from '../types/api';
import { cn } from '../utils/cn';
import { PRIORITY_LABELS, STATUS_LABELS } from '../utils/labels';

const BADGE_BASE = 'inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-semibold whitespace-nowrap';

const PRIORITY_STYLES: Record<Priority, { className: string; icon: LucideIcon }> = {
  URGENT: { className: 'bg-orange-50 text-orange-800 ring-1 ring-inset ring-orange-300', icon: ChevronsUp },
  NORMAL: { className: 'bg-sky-50 text-sky-800 ring-1 ring-inset ring-sky-200', icon: Equal },
  LOW: { className: 'bg-slate-100 text-slate-600 ring-1 ring-inset ring-slate-200', icon: ChevronDown },
};

const STATUS_STYLES: Record<TicketStatus, { className: string; icon: LucideIcon }> = {
  OPEN: { className: 'bg-white text-slate-700 ring-1 ring-inset ring-slate-300', icon: CircleDot },
  IN_PROGRESS: { className: 'bg-violet-50 text-violet-800 ring-1 ring-inset ring-violet-200', icon: Timer },
  RESOLVED: { className: 'bg-emerald-50 text-emerald-800 ring-1 ring-inset ring-emerald-200', icon: CheckCircle2 },
};

export function PriorityBadge({ priority }: { priority: Priority }) {
  const { className, icon: Icon } = PRIORITY_STYLES[priority];
  return (
    <span className={cn(BADGE_BASE, className)}>
      <Icon aria-hidden className="size-3.5" />
      {PRIORITY_LABELS[priority]}
    </span>
  );
}

export function StatusBadge({ status }: { status: TicketStatus }) {
  const { className, icon: Icon } = STATUS_STYLES[status];
  return (
    <span className={cn(BADGE_BASE, className)}>
      <Icon aria-hidden className="size-3.5" />
      {STATUS_LABELS[status]}
    </span>
  );
}

export function OverdueBadge() {
  return (
    <span className={cn(BADGE_BASE, 'bg-red-600 text-white uppercase tracking-wide')}>
      <AlertTriangle aria-hidden className="size-3.5" />
      Overdue
    </span>
  );
}
