import { AlertCircle, Loader2 } from 'lucide-react';
import { useId, useState, type FormEvent, type ReactNode } from 'react';
import { ApiError, describeError } from '../services/apiClient';
import type { Agent, Priority, TicketInput } from '../types/api';
import { PRIORITIES, TICKET_STATUSES } from '../types/api';
import { cn } from '../utils/cn';
import { PRIORITY_LABELS, SLA_POLICY_LABELS, STATUS_LABELS } from '../utils/labels';
import { PriorityBadge } from './Badges';

export const FIELD_LIMITS = { customerName: 120, title: 200, description: 5000 } as const;

type FieldName = keyof TicketInput;
type FieldErrors = Partial<Record<FieldName, string>>;

const FORM_FIELDS: readonly string[] = ['customerName', 'title', 'description', 'priority', 'status', 'assignedAgentId'];
/** Fields in visual order, used to move focus to the first problem after a failed submit. */
const FIELD_ORDER: readonly FieldName[] = ['customerName', 'title', 'description', 'priority', 'assignedAgentId', 'status'];

function isFormField(field: string): field is FieldName {
  return FORM_FIELDS.includes(field);
}

/** Ascending order reads naturally when choosing a level. */
const PRIORITY_CHOICES: readonly Priority[] = [...PRIORITIES].reverse();

interface TicketFormProps {
  initialValues: TicketInput;
  agents: readonly Agent[];
  submitLabel: string;
  onSubmit: (values: TicketInput) => Promise<void>;
  onCancel?: () => void;
  /**
   * `full` edits every field (create). `details` edits only the descriptive fields; priority,
   * status and assignment are changed from the ticket's properties panel instead.
   */
  mode?: 'full' | 'details';
  /** Called whenever the user edits a field. */
  onEdit?: () => void;
}

function validateLocally(values: TicketInput): FieldErrors {
  const errors: FieldErrors = {};
  if (!values.customerName.trim()) errors.customerName = 'Enter the customer or company name.';
  if (!values.title.trim()) errors.title = 'Add a short summary of the problem.';
  return errors;
}

function toFieldErrors(error: unknown): FieldErrors {
  if (!(error instanceof ApiError)) return {};
  const errors: FieldErrors = {};
  for (const detail of error.details) {
    if (isFormField(detail.field)) errors[detail.field] = detail.message;
  }
  return errors;
}

function FormSection({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  const headingId = useId();
  return (
    <div
      role="group"
      aria-labelledby={headingId}
      className="grid gap-x-6 gap-y-3 border-t border-line pt-5 first:border-t-0 first:pt-0 sm:grid-cols-[10rem_minmax(0,1fr)]"
    >
      <div className="sm:pt-1">
        <h3 id={headingId} className="text-sm font-semibold text-ink">
          {title}
        </h3>
        {description && <p className="mt-0.5 text-xs text-ink-subtle">{description}</p>}
      </div>
      <div className="min-w-0 space-y-4">{children}</div>
    </div>
  );
}

export function TicketForm({ initialValues, agents, submitLabel, onSubmit, onCancel, mode = 'full', onEdit }: TicketFormProps) {
  const [values, setValues] = useState(initialValues);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const idPrefix = useId();
  const fieldId = (name: FieldName) => `${idPrefix}-${name}`;
  const errorId = (name: FieldName) => `${idPrefix}-${name}-error`;
  const full = mode === 'full';

  function update<K extends FieldName>(name: K, value: TicketInput[K]) {
    onEdit?.();
    setValues((current) => ({ ...current, [name]: value }));
    setErrors((current) => ({ ...current, [name]: undefined }));
  }

  function focusFirstError(fieldErrors: FieldErrors) {
    const first = FIELD_ORDER.find((name) => fieldErrors[name]);
    if (first) document.getElementById(fieldId(first))?.focus();
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const localErrors = validateLocally(values);
    setErrors(localErrors);
    setFormError(null);
    if (Object.keys(localErrors).length > 0) {
      focusFirstError(localErrors);
      return;
    }

    setSubmitting(true);
    try {
      await onSubmit({
        ...values,
        customerName: values.customerName.trim(),
        title: values.title.trim(),
        description: values.description.trim(),
      });
    } catch (error) {
      const fieldErrors = toFieldErrors(error);
      setErrors(fieldErrors);
      setFormError(describeError(error));
      focusFirstError(fieldErrors);
    } finally {
      setSubmitting(false);
    }
  }

  const fieldError = (name: FieldName) =>
    errors[name] ? (
      <p id={errorId(name)} className="field-error">
        <AlertCircle aria-hidden className="size-3.5 shrink-0" />
        {errors[name]}
      </p>
    ) : null;

  const describedBy = (name: FieldName, hintId?: string) =>
    [errors[name] ? errorId(name) : null, hintId].filter(Boolean).join(' ') || undefined;

  const descriptionHintId = `${idPrefix}-description-hint`;
  const remaining = FIELD_LIMITS.description - values.description.length;

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-5">
      {formError && (
        <div role="alert" className="flex items-start gap-2 rounded-md border border-danger-line bg-danger-soft px-3 py-2.5 text-sm text-danger-strong">
          <AlertCircle aria-hidden className="mt-0.5 size-4 shrink-0" />
          <p>{formError}</p>
        </div>
      )}

      <FormSection title="Customer" description={full ? 'Who reported the issue' : undefined}>
        <div>
          <label htmlFor={fieldId('customerName')} className="field-label">
            Customer or company <span className="text-danger">*</span>
          </label>
          <input
            id={fieldId('customerName')}
            value={values.customerName}
            onChange={(event) => update('customerName', event.target.value)}
            maxLength={FIELD_LIMITS.customerName}
            required
            autoComplete="organization"
            placeholder="e.g. Acme Corporation"
            aria-invalid={Boolean(errors.customerName)}
            aria-describedby={describedBy('customerName')}
            className="control"
          />
          {fieldError('customerName')}
        </div>
      </FormSection>

      <FormSection title="Ticket details" description={full ? 'What is going wrong' : undefined}>
        <div>
          <label htmlFor={fieldId('title')} className="field-label">
            Title <span className="text-danger">*</span>
          </label>
          <input
            id={fieldId('title')}
            value={values.title}
            onChange={(event) => update('title', event.target.value)}
            maxLength={FIELD_LIMITS.title}
            required
            placeholder="e.g. Laptop won't boot before client demo"
            aria-invalid={Boolean(errors.title)}
            aria-describedby={describedBy('title')}
            className="control"
          />
          {fieldError('title')}
        </div>
        <div>
          <label htmlFor={fieldId('description')} className="field-label">
            Description <span className="font-normal text-ink-subtle">(optional)</span>
          </label>
          <textarea
            id={fieldId('description')}
            value={values.description}
            onChange={(event) => update('description', event.target.value)}
            maxLength={FIELD_LIMITS.description}
            rows={4}
            placeholder="Symptoms, error messages, what has been tried, deadlines…"
            aria-invalid={Boolean(errors.description)}
            aria-describedby={describedBy('description', descriptionHintId)}
            className="control resize-y"
          />
          {fieldError('description')}
          <p id={descriptionHintId} className={cn('field-hint text-right', remaining < 200 && 'text-due')}>
            {remaining.toLocaleString()} characters left
          </p>
        </div>
      </FormSection>

      {full && (
        <FormSection title="Priority & SLA" description="Sets the response deadline">
          <div role="radiogroup" aria-label="Priority" aria-describedby={describedBy('priority')} id={fieldId('priority')} tabIndex={-1} className="grid grid-cols-2 gap-2 lg:grid-cols-4">
            {PRIORITY_CHOICES.map((priority) => {
              const checked = values.priority === priority;
              return (
                <label
                  key={priority}
                  className={cn(
                    'relative flex cursor-pointer flex-col gap-1 rounded-md border px-3 py-2.5 transition-colors duration-150',
                    'has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-brand',
                    checked ? 'border-brand bg-brand-soft/60 ring-1 ring-brand' : 'border-line-strong hover:border-ink-subtle',
                  )}
                >
                  <input
                    type="radio"
                    name={`${idPrefix}-priority`}
                    value={priority}
                    checked={checked}
                    onChange={() => update('priority', priority)}
                    className="sr-only"
                  />
                  <PriorityBadge priority={priority} variant="plain" />
                  <span className="text-xs text-ink-subtle">{SLA_POLICY_LABELS[priority]}</span>
                  <span className="sr-only">{PRIORITY_LABELS[priority]} priority</span>
                </label>
              );
            })}
          </div>
          {fieldError('priority')}
        </FormSection>
      )}

      {full && (
        <FormSection title="Assignment" description="Owner and starting state">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor={fieldId('assignedAgentId')} className="field-label">
                Assigned agent
              </label>
              <select
                id={fieldId('assignedAgentId')}
                value={values.assignedAgentId ?? ''}
                onChange={(event) => update('assignedAgentId', event.target.value || null)}
                aria-invalid={Boolean(errors.assignedAgentId)}
                aria-describedby={describedBy('assignedAgentId')}
                className="control"
              >
                <option value="">Unassigned</option>
                {agents.map((agent) => (
                  <option key={agent.id} value={agent.id}>
                    {agent.name}
                  </option>
                ))}
              </select>
              {fieldError('assignedAgentId')}
            </div>
            <div>
              <label htmlFor={fieldId('status')} className="field-label">
                Status
              </label>
              <select
                id={fieldId('status')}
                value={values.status}
                onChange={(event) => update('status', event.target.value as TicketInput['status'])}
                aria-invalid={Boolean(errors.status)}
                aria-describedby={describedBy('status')}
                className="control"
              >
                {TICKET_STATUSES.map((status) => (
                  <option key={status} value={status}>
                    {STATUS_LABELS[status]}
                  </option>
                ))}
              </select>
              {fieldError('status')}
            </div>
          </div>
        </FormSection>
      )}

      <div className="sticky bottom-0 -mx-5 flex items-center justify-end gap-2 border-t border-line bg-surface/95 px-5 py-3 backdrop-blur-sm sm:-mx-6 sm:px-6">
        {onCancel && (
          <button type="button" onClick={onCancel} className="btn btn-secondary">
            Cancel
          </button>
        )}
        <button type="submit" disabled={submitting} className="btn btn-primary min-w-28">
          {submitting && <Loader2 aria-hidden className="size-4 animate-spin" />}
          {submitting ? 'Saving…' : submitLabel}
        </button>
      </div>
    </form>
  );
}
