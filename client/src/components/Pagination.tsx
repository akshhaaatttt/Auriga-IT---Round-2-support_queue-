import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { Pagination as PaginationInfo } from '../types/api';

export const PAGE_SIZE_OPTIONS = [10, 20, 50, 100] as const;

interface PaginationProps {
  pagination: PaginationInfo;
  disabled: boolean;
  onPageChange: (page: number) => void;
  onLimitChange: (limit: number) => void;
}

const BUTTON_CLASS =
  'inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 shadow-xs hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50';

export function Pagination({ pagination, disabled, onPageChange, onLimitChange }: PaginationProps) {
  const { page, limit, total, totalPages } = pagination;
  const first = total === 0 ? 0 : (page - 1) * limit + 1;
  const last = Math.min(page * limit, total);
  const lastPage = Math.max(totalPages, 1);

  return (
    <nav
      aria-label="Queue pagination"
      className="flex flex-col gap-3 border-t border-slate-200 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
    >
      <p className="text-sm text-slate-600" aria-live="polite">
        Showing <span className="font-medium tabular-nums">{first}</span>–
        <span className="font-medium tabular-nums">{last}</span> of{' '}
        <span className="font-medium tabular-nums">{total}</span>
      </p>

      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2 text-sm text-slate-600">
          <label htmlFor="page-size">Per page</label>
          <select
            id="page-size"
            value={limit}
            disabled={disabled}
            onChange={(event) => onLimitChange(Number(event.target.value))}
            className="rounded-md border border-slate-300 bg-white py-1 pl-2 pr-7 text-sm"
          >
            {PAGE_SIZE_OPTIONS.map((size) => (
              <option key={size} value={size}>
                {size}
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            className={BUTTON_CLASS}
            disabled={disabled || page <= 1}
            onClick={() => onPageChange(page - 1)}
          >
            <ChevronLeft aria-hidden className="size-4" />
            Previous
          </button>
          <span className="px-1 text-sm text-slate-700 tabular-nums" aria-current="page">
            Page {page} of {lastPage}
          </span>
          <button
            type="button"
            className={BUTTON_CLASS}
            disabled={disabled || page >= lastPage}
            onClick={() => onPageChange(page + 1)}
          >
            Next
            <ChevronRight aria-hidden className="size-4" />
          </button>
        </div>
      </div>
    </nav>
  );
}
