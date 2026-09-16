import { CheckCircle2, Info, Loader2, PlayCircle, RotateCcw, Trash2, TrendingUp, UserRoundCheck } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useId, useState, type ReactNode } from 'react';
import { describeError } from '../services/apiClient';
import type { Agent, Priority, Ticket, TicketInput, TicketStatus, TicketUpdate } from '../types/api';
import { PRIORITIES, TICKET_STATUSES } from '../types/api';
import { cn } from '../utils/cn';
import { formatTicketRef } from '../utils/format';
import { PRIORITY_LABELS, SLA_POLICY_LABELS, STATUS_LABELS } from '../utils/labels';
import { formatRelative, formatTimestamp, isTicketOverdue } from '../utils/time';
import { EscalatedBadge, OverdueBadge, PriorityBadge, StatusBadge } from './Badges';
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

type PendingAction = 'property' | 'delete' | null;

const DETAIL_FIELDS = ['customerName', 'title', 'description'] as const;

/** Only the descriptive fields the user actually changed relative to the snapshot the form started from. */
function diffDetails(base: Ticket, values: TicketInput): TicketUpdate {
  const changes: TicketUpdate = {};
  for (const field of DETAIL_FIELDS) {
    if (values[field] !== base[field]) changes[field] = values[field];
  }
  return changes;
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
      eyebrow={
        ticket && (
          <span className="font-mono text-xs font-medium text-ink-subtle" title={`Ticket ID ${ticket.id}`}>
            Ticket {formatTicketRef(ticket.id)}
          </span>
        )
      }
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
  // While the user is editing, the details form works from a frozen snapshot so that a background
  // update (another agent, or automated escalation) neither wipes their edits nor is reverted by them.
  const [editSnapshot, setEditSnapshot] = useState<Ticket | null>(null);
  const formBase = editSnapshot ?? ticket;
  const changedUnderneath = editSnapshot !== null && editSnapshot.updatedAt !== ticket.updatedAt;
  const overdue = isTicketOverdue(ticket, now);
  const resolved = ticket.status === 'RESOLVED';
  const escalated = ticket.escalationCount > 0;
  const busy = pending !== null;

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

  const updateProperty = (changes: TicketUpdate) => run('property', () => onUpdate(ticket.id, changes));

  const saveDetails = async (values: TicketInput) => {
    const changes = diffDetails(formBase, values);
    if (Object.keys(changes).length > 0) await onUpdate(ticket.id, changes);
    setEditSnapshot(null);
  };

  const canAssignToMe = currentAgent !== null && ticket.assignedAgentId !== currentAgent.id;

  return (
    <div className="space-y-6 pb-6">
      <div className="flex flex-wrap items-center gap-1.5">
        {overdue && <OverdueBadge />}
        <PriorityBadge priority={ticket.priority} />
        <StatusBadge status={ticket.status} />
        {escalated && <EscalatedBadge count={ticket.escalationCount} lastEscalatedAt={ticket.lastEscalatedAt} />}
      </div>

      <section
        aria-label="Service level"
        className={cn('rounded-(--radius-panel) border p-4', overdue ? 'border-danger-line bg-danger-soft/60' : 'border-line bg-surface-hover')}
      >
        <p className="eyebrow">Response SLA</p>
        <SlaIndicator ticket={ticket} now={now} size="lg" className="mt-1.5" />
        <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
          <Meta label="Deadline">{formatTimestamp(ticket.slaDeadline)}</Meta>
          <Meta label="Policy">
            {escalated ? 'Original deadline kept' : `${PRIORITY_LABELS[ticket.priority]} · ${SLA_POLICY_LABELS[ticket.priority]}`}
          </Meta>
          <Meta label="Opened">
            {formatTimestamp(ticket.createdAt)}
            <span className="block text-xs font-normal text-ink-subtle">{formatRelative(ticket.createdAt, now)}</span>
          </Meta>
          <Meta label="Last updated">
            {formatTimestamp(ticket.updatedAt)}
            <span className="block text-xs font-normal text-ink-subtle">{formatRelative(ticket.updatedAt, now)}</span>
          </Meta>
        </dl>
      </section>

      {escalated && (
        <section aria-label="Automatic escalation" className="flex gap-3 rounded-(--radius-panel) border border-escalated-line bg-escalated-soft p-4">
          <TrendingUp aria-hidden className="mt-0.5 size-4 shrink-0 text-escalated" />
          <div className="text-sm">
            <p className="font-semibold text-escalated">Automatically escalated due to SLA breach</p>
            <p className="mt-1 text-ink-muted">
              The escalation check raised this ticket's priority{' '}
              {ticket.escalationCount === 1 ? 'one level' : `${ticket.escalationCount} times, one level per run`}
              {ticket.lastEscalatedAt && <>, most recently {formatTimestamp(ticket.lastEscalatedAt)}</>}. The original
              SLA deadline is kept, so the breach time keeps counting.
            </p>
          </div>
        </section>
      )}

      <section aria-labelledby="ticket-properties-heading">
        <div className="mb-2 flex items-center justify-between">
          <h3 id="ticket-properties-heading" className="eyebrow">
            Properties
          </h3>
          {pending === 'property' && (
            <span role="status" className="inline-flex items-center gap-1.5 text-xs text-ink-subtle">
              <Loader2 aria-hidden className="size-3.5 animate-spin" />
              Saving…
            </span>
          )}
        </div>
        <div className="divide-y divide-line rounded-(--radius-panel) border border-line">
          <PropertyRow
            label="Priority"
            hint={resolved ? undefined : 'Changing priority resets the SLA deadline from the creation time.'}
          >
            {(id, hintId) => (
              <select
                id={id}
                aria-describedby={hintId}
                value={ticket.priority}
                disabled={busy}
                onChange={(event) => updateProperty({ priority: event.target.value as Priority })}
                className="control"
              >
                {PRIORITIES.map((priority) => (
                  <option key={priority} value={priority}>
                    {PRIORITY_LABELS[priority]} — {SLA_POLICY_LABELS[priority]}
                  </option>
                ))}
              </select>
            )}
          </PropertyRow>
          <PropertyRow label="Status">
            {(id) => (
              <select
                id={id}
                value={ticket.status}
                disabled={busy}
                onChange={(event) => updateProperty({ status: event.target.value as TicketStatus })}
                className="control"
              >
                {TICKET_STATUSES.map((status) => (
                  <option key={status} value={status}>
                    {STATUS_LABELS[status]}
                  </option>
                ))}
              </select>
            )}
          </PropertyRow>
          <PropertyRow label="Assignee">
            {(id) => (
              <div className="flex gap-2">
                <select
                  id={id}
                  value={ticket.assignedAgentId ?? ''}
                  disabled={busy}
                  onChange={(event) => updateProperty({ assignedAgentId: event.target.value || null })}
                  className="control min-w-0 flex-1"
                >
                  <option value="">Unassigned</option>
                  {agents.map((agent) => (
                    <option key={agent.id} value={agent.id}>
                      {agent.name}
                    </option>
                  ))}
                </select>
                {canAssignToMe && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => updateProperty({ assignedAgentId: currentAgent.id })}
                    className="btn btn-secondary"
                  >
                    <UserRoundCheck aria-hidden className="size-4" />
                    Assign to me
                  </button>
                )}
              </div>
            )}
          </PropertyRow>
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          {ticket.status === 'OPEN' && (
            <ActionButton icon={PlayCircle} label="Start work" disabled={busy} onClick={() => updateProperty({ status: 'IN_PROGRESS' })} />
          )}
          {resolved ? (
            <ActionButton icon={RotateCcw} label="Reopen ticket" disabled={busy} onClick={() => updateProperty({ status: 'OPEN' })} />
          ) : (
            <ActionButton
              icon={CheckCircle2}
              label="Resolve ticket"
              variant="success"
              disabled={busy}
              onClick={() => updateProperty({ status: 'RESOLVED' })}
            />
          )}
        </div>

        {actionError && (
          <p role="alert" className="mt-3 rounded-md border border-danger-line bg-danger-soft px-3 py-2 text-sm text-danger-strong">
            {actionError}
          </p>
        )}
      </section>

      <section aria-labelledby="ticket-details-heading" className="border-t border-line pt-6">
        <h3 id="ticket-details-heading" className="eyebrow mb-4">
          Details
        </h3>
        {changedUnderneath && (
          <div role="status" className="mb-4 flex flex-wrap items-start gap-2 rounded-md border border-brand-line bg-brand-soft px-3 py-2.5 text-sm text-brand-hover">
            <Info aria-hidden className="mt-0.5 size-4 shrink-0" />
            <p className="min-w-0 flex-1">
              This ticket changed while you were editing (it may have been auto-escalated). Saving only sends the fields you
              changed.
            </p>
            <button type="button" onClick={() => setEditSnapshot(null)} className="font-medium underline underline-offset-2 hover:text-brand">
              Discard my edits
            </button>
          </div>
        )}
        <TicketForm
          key={`${formBase.id}:${formBase.updatedAt}`}
          mode="details"
          initialValues={toFormValues(formBase)}
          agents={agents}
          submitLabel="Save details"
          onSubmit={saveDetails}
          onEdit={() => setEditSnapshot((current) => current ?? ticket)}
        />
      </section>

      <section aria-labelledby="danger-zone-heading" className="rounded-(--radius-panel) border border-danger-line p-4">
        <h3 id="danger-zone-heading" className="text-sm font-semibold text-ink">
          Delete ticket
        </h3>
        <p className="mt-1 text-sm text-ink-muted">Permanently removes the ticket and its history. This cannot be undone.</p>
        {confirmingDelete ? (
          <div role="alertdialog" aria-label="Confirm deletion" className="mt-3 flex flex-wrap items-center gap-2">
            <span className="mr-auto text-sm font-medium text-danger-strong">Delete “{ticket.title}”?</span>
            <button type="button" onClick={() => setConfirmingDelete(false)} className="btn btn-secondary">
              Keep ticket
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() =>
                run('delete', async () => {
                  await onDelete(ticket.id);
                  onClose();
                })
              }
              className="btn btn-danger"
            >
              {pending === 'delete' ? <Loader2 aria-hidden className="size-4 animate-spin" /> : <Trash2 aria-hidden className="size-4" />}
              Delete permanently
            </button>
          </div>
        ) : (
          <button type="button" onClick={() => setConfirmingDelete(true)} className="btn btn-danger-ghost mt-3 -ml-3">
            <Trash2 aria-hidden className="size-4" />
            Delete ticket…
          </button>
        )}
      </section>
    </div>
  );
}

function Meta({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-ink-subtle">{label}</dt>
      <dd className="mt-0.5 font-medium text-ink">{children}</dd>
    </div>
  );
}

function PropertyRow({ label, hint, children }: { label: string; hint?: string; children: (id: string, hintId?: string) => ReactNode }) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  return (
    <div className="grid items-center gap-x-4 gap-y-1.5 px-3 py-2.5 sm:grid-cols-[6.5rem_minmax(0,1fr)]">
      <label htmlFor={id} className="text-sm font-medium text-ink-muted">
        {label}
      </label>
      <div className="min-w-0">
        {children(id, hintId)}
        {hint && (
          <p id={hintId} className="field-hint">
            {hint}
          </p>
        )}
      </div>
    </div>
  );
}

interface ActionButtonProps {
  icon: LucideIcon;
  label: string;
  onClick: () => void;
  disabled: boolean;
  variant?: 'secondary' | 'success';
}

function ActionButton({ icon: Icon, label, onClick, disabled, variant = 'secondary' }: ActionButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn('btn', variant === 'success' ? 'btn-success' : 'btn-secondary')}
    >
      <Icon aria-hidden className="size-4" />
      {label}
    </button>
  );
}
