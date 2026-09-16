import { CheckCircle2, Loader2, PlayCircle, RotateCcw, Trash2, UserRoundCheck } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { describeError } from '../services/apiClient';
import type { Agent, Ticket, TicketInput, TicketUpdate } from '../types/api';
import { cn } from '../utils/cn';
import { PRIORITY_LABELS, SLA_POLICY_LABELS } from '../utils/labels';
import { formatTimestamp, isTicketOverdue } from '../utils/time';
import { OverdueBadge, PriorityBadge, StatusBadge } from './Badges';
import { Dialog } from './Dialog';
import { SlaIndicator } from './SlaIndicator';
import { TicketForm } from './TicketForm';

interface TicketDrawerProps {
  ticket: Ticket | null;
  agents: readonly Agent[];
  currentAgent: Agent | null;
  now: number;
  onClose: () => void;
  onUpdate: (id: string, changes: TicketUpdate) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}

type PendingAction = 'quick' | 'delete' | null;

const EDITABLE_FIELDS: readonly (keyof TicketInput)[] = [
  'customerName',
  'title',
  'description',
  'priority',
  'status',
  'assignedAgentId',
];

function diffTicket(ticket: Ticket, values: TicketInput): TicketUpdate {
  const changes: Record<string, unknown> = {};
  for (const field of EDITABLE_FIELDS) {
    if (values[field] !== ticket[field]) changes[field] = values[field];
  }
  return changes as TicketUpdate;
}

function toFormValues(ticket: Ticket): TicketInput {
  return {
    customerName: ticket.customerName,
    title: ticket.title,
    description: ticket.description,
    priority: ticket.priority,
    status: ticket.status,
    assignedAgentId: ticket.assignedAgentId,
  };
}

export function TicketDrawer({ ticket, agents, currentAgent, now, onClose, onUpdate, onDelete }: TicketDrawerProps) {
  return (
    <Dialog
      open={ticket !== null}
      onClose={onClose}
      variant="drawer"
      title={ticket?.title ?? ''}
      description={ticket?.customerName}
    >
      {ticket && (
        <TicketDetails
          key={ticket.id}
          ticket={ticket}
          agents={agents}
          currentAgent={currentAgent}
          now={now}
          onClose={onClose}
          onUpdate={onUpdate}
          onDelete={onDelete}
        />
      )}
    </Dialog>
  );
}

function TicketDetails({
  ticket,
  agents,
  currentAgent,
  now,
  onClose,
  onUpdate,
  onDelete,
}: TicketDrawerProps & { ticket: Ticket }) {
  const [pending, setPending] = useState<PendingAction>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const overdue = isTicketOverdue(ticket, now);

  async function run(action: Exclude<PendingAction, null>, task: () => Promise<void>) {
    setPending(action);
    setActionError(null);
    try {
      await task();
    } catch (error) {
      setActionError(describeError(error));
    } finally {
      setPending(null);
    }
  }

  const quickUpdate = (changes: TicketUpdate) => run('quick', () => onUpdate(ticket.id, changes));

  const saveForm = async (values: TicketInput) => {
    const changes = diffTicket(ticket, values);
    if (Object.keys(changes).length === 0) return;
    await onUpdate(ticket.id, changes);
  };

  const canAssignToMe = currentAgent !== null && ticket.assignedAgentId !== currentAgent.id;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-1.5">
        {overdue && <OverdueBadge />}
        <PriorityBadge priority={ticket.priority} />
        <StatusBadge status={ticket.status} />
      </div>

      <section
        aria-label="Service level"
        className={cn('rounded-lg border p-4', overdue ? 'border-red-200 bg-red-50' : 'border-slate-200 bg-slate-50')}
      >
        <SlaIndicator ticket={ticket} now={now} className="text-base" />
        <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
          <Detail label="SLA deadline">{formatTimestamp(ticket.slaDeadline)}</Detail>
          <Detail label="SLA policy">
            {PRIORITY_LABELS[ticket.priority]} · {SLA_POLICY_LABELS[ticket.priority]}
          </Detail>
          <Detail label="Created">{formatTimestamp(ticket.createdAt)}</Detail>
          <Detail label="Last updated">{formatTimestamp(ticket.updatedAt)}</Detail>
          <Detail label="Assignee">{ticket.assignedAgentName ?? 'Unassigned'}</Detail>
          <Detail label="Ticket ID">
            <span className="font-mono text-xs break-all">{ticket.id}</span>
          </Detail>
        </dl>
      </section>

      <section aria-label="Quick actions">
        <div className="flex flex-wrap gap-2">
          {canAssignToMe && (
            <QuickAction
              icon={UserRoundCheck}
              label="Assign to me"
              disabled={pending !== null}
              onClick={() => quickUpdate({ assignedAgentId: currentAgent.id })}
            />
          )}
          {ticket.status === 'OPEN' && (
            <QuickAction
              icon={PlayCircle}
              label="Start work"
              disabled={pending !== null}
              onClick={() => quickUpdate({ status: 'IN_PROGRESS' })}
            />
          )}
          {ticket.status !== 'RESOLVED' ? (
            <QuickAction
              icon={CheckCircle2}
              label="Resolve"
              primary
              disabled={pending !== null}
              onClick={() => quickUpdate({ status: 'RESOLVED' })}
            />
          ) : (
            <QuickAction
              icon={RotateCcw}
              label="Reopen"
              disabled={pending !== null}
              onClick={() => quickUpdate({ status: 'OPEN' })}
            />
          )}
          {pending === 'quick' && (
            <span className="inline-flex items-center gap-1.5 text-sm text-slate-600" role="status">
              <Loader2 aria-hidden className="size-4 animate-spin" />
              Saving…
            </span>
          )}
        </div>
        {actionError && (
          <p role="alert" className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
            {actionError}
          </p>
        )}
      </section>

      <section aria-labelledby="edit-ticket-heading" className="border-t border-slate-200 pt-5">
        <h3 id="edit-ticket-heading" className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
          Edit ticket
        </h3>
        <TicketForm
          key={ticket.updatedAt}
          initialValues={toFormValues(ticket)}
          agents={agents}
          submitLabel="Save changes"
          onSubmit={saveForm}
          priorityHint={(values) =>
            values.priority !== ticket.priority
              ? `Changing priority recalculates the SLA deadline from the creation time (${SLA_POLICY_LABELS[values.priority]}).`
              : null
          }
        />
      </section>

      <section aria-label="Danger zone" className="border-t border-slate-200 pt-5">
        {confirmingDelete ? (
          <div role="alertdialog" aria-label="Confirm deletion" className="rounded-lg border border-red-200 bg-red-50 p-4">
            <p className="text-sm font-medium text-red-900">Delete this ticket permanently? This cannot be undone.</p>
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                disabled={pending !== null}
                onClick={() =>
                  run('delete', async () => {
                    await onDelete(ticket.id);
                    onClose();
                  })
                }
                className="inline-flex items-center gap-1.5 rounded-md bg-red-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-60"
              >
                {pending === 'delete' ? <Loader2 aria-hidden className="size-4 animate-spin" /> : <Trash2 aria-hidden className="size-4" />}
                Delete ticket
              </button>
              <button
                type="button"
                onClick={() => setConfirmingDelete(false)}
                className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Keep ticket
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setConfirmingDelete(true)}
            className="inline-flex items-center gap-1.5 rounded-md px-2 py-1.5 text-sm font-medium text-red-700 hover:bg-red-50"
          >
            <Trash2 aria-hidden className="size-4" />
            Delete ticket
          </button>
        )}
      </section>
    </div>
  );
}

function Detail({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-slate-500">{label}</dt>
      <dd className="font-medium text-slate-900">{children}</dd>
    </div>
  );
}

interface QuickActionProps {
  icon: LucideIcon;
  label: string;
  onClick: () => void;
  disabled: boolean;
  primary?: boolean;
}

function QuickAction({ icon: Icon, label, onClick, disabled, primary = false }: QuickActionProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium shadow-xs disabled:opacity-60',
        primary
          ? 'bg-emerald-700 text-white hover:bg-emerald-800'
          : 'border border-slate-300 bg-white text-slate-700 hover:bg-slate-50',
      )}
    >
      <Icon aria-hidden className="size-4" />
      {label}
    </button>
  );
}
