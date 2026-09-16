import type { TicketCounts } from '../types/api';
import { cn } from '../utils/cn';

interface SummaryCardsProps {
  counts: TicketCounts | null;
}

const CARDS: { key: keyof TicketCounts; label: string; alert?: boolean }[] = [
  { key: 'total', label: 'Total tickets' },
  { key: 'overdue', label: 'Overdue', alert: true },
  { key: 'open', label: 'Open' },
  { key: 'inProgress', label: 'In progress' },
  { key: 'resolved', label: 'Resolved' },
];

export function SummaryCards({ counts }: SummaryCardsProps) {
  return (
    <section aria-label="Queue summary">
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {CARDS.map(({ key, label, alert }) => {
          const value = counts?.[key];
          const highlighted = alert === true && (value ?? 0) > 0;
          return (
            <div
              key={key}
              className={cn(
                'rounded-lg border bg-white px-4 py-3 shadow-xs',
                highlighted ? 'border-red-300 bg-red-50' : 'border-slate-200',
              )}
            >
              <dt className={cn('text-xs font-medium uppercase tracking-wide', highlighted ? 'text-red-700' : 'text-slate-500')}>
                {label}
              </dt>
              <dd className={cn('mt-1 text-2xl font-semibold tabular-nums', highlighted ? 'text-red-700' : 'text-slate-900')}>
                {value === undefined ? (
                  <span className="inline-block h-7 w-10 animate-pulse rounded bg-slate-200">
                    <span className="sr-only">Loading</span>
                  </span>
                ) : (
                  value
                )}
              </dd>
            </div>
          );
        })}
      </dl>
    </section>
  );
}
