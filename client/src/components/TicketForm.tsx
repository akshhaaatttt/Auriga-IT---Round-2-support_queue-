import { Loader2 } from 'lucide-react';
import { useId, useState, type FormEvent, type ReactNode } from 'react';
import { ApiError, describeError } from '../services/apiClient';
import type { Agent, TicketInput } from '../types/api';
import { PRIORITIES, TICKET_STATUSES } from '../types/api';
import { cn } from '../utils/cn';
import { PRIORITY_LABELS, SLA_POLICY_LABELS, STATUS_LABELS } from '../utils/labels';

export const FIELD_LIMITS = { customerName: 120, title: 200, description: 5000 } as const;

type FieldErrors = Partial<Record<keyof TicketInput, string>>;

const FORM_FIELDS: readonly string[] = ['customerName', 'title', 'description', 'priority', 'status', 'assignedAgentId'];

function isFormField(field: string): field is keyof TicketInput {
  return FORM_FIELDS.includes(field);
}

interface TicketFormProps {
  initialValues: TicketInput;
  agents: readonly Agent[];
  submitLabel: string;
  onSubmit: (values: TicketInput) => Promise<void>;
  onCancel?: () => void;
  /** Extra guidance rendered beneath the priority field. */
  priorityHint?: (values: TicketInput) => ReactNode;
}

function validateLocally(values: TicketInput): FieldErrors {
  const errors: FieldErrors = {};
  if (!values.customerName.trim()) errors.customerName = 'Customer name is required';
  if (!values.title.trim()) errors.title = 'Title is required';
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

const INPUT_CLASS =
  'mt-1 block w-full rounded-md border bg-white px-3 py-2 text-sm text-slate-900 shadow-xs focus:outline-2 focus:outline-slate-900/10';

function inputClass(hasError: boolean): string {
  return cn(INPUT_CLASS, hasError ? 'border-red-500' : 'border-slate-300 focus:border-slate-500');
}

export function TicketForm({ initialValues, agents, submitLabel, onSubmit, onCancel, priorityHint }: TicketFormProps) {
  const [values, setValues] = useState(initialValues);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const idPrefix = useId();
  const fieldId = (name: keyof TicketInput) => `${idPrefix}-${name}`;
  const errorId = (name: keyof TicketInput) => `${idPrefix}-${name}-error`;

  function update<K extends keyof TicketInput>(name: K, value: TicketInput[K]) {
    setValues((current) => ({ ...current, [name]: value }));
    setErrors((current) => ({ ...current, [name]: undefined }));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const localErrors = validateLocally(values);
    setErrors(localErrors);
    setFormError(null);
    if (Object.keys(localErrors).length > 0) return;

    setSubmitting(true);
    try {
      await onSubmit({
        ...values,
        customerName: values.customerName.trim(),
        title: values.title.trim(),
        description: values.description.trim(),
      });
    } catch (error) {
      setErrors(toFieldErrors(error));
      setFormError(describeError(error));
    } finally {
      setSubmitting(false);
    }
  }

  const fieldError = (name: keyof TicketInput) =>
    errors[name] ? (
      <p id={errorId(name)} className="mt-1 text-xs text-red-700">
        {errors[name]}
      </p>
    ) : null;

  const describedBy = (name: keyof TicketInput) => (errors[name] ? errorId(name) : undefined);

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-4">
      {formError && (
        <div role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {formError}
        </div>
      )}

      <div>
        <label htmlFor={fieldId('customerName')} className="text-sm font-medium text-slate-700">
          Customer <span aria-hidden className="text-red-600">*</span>
        </label>
        <input
          id={fieldId('customerName')}
          value={values.customerName}
          onChange={(event) => update('customerName', event.target.value)}
          maxLength={FIELD_LIMITS.customerName}
          required
          aria-invalid={Boolean(errors.customerName)}
          aria-describedby={describedBy('customerName')}
          className={inputClass(Boolean(errors.customerName))}
        />
        {fieldError('customerName')}
      </div>

      <div>
        <label htmlFor={fieldId('title')} className="text-sm font-medium text-slate-700">
          Title <span aria-hidden className="text-red-600">*</span>
        </label>
        <input
          id={fieldId('title')}
          value={values.title}
          onChange={(event) => update('title', event.target.value)}
          maxLength={FIELD_LIMITS.title}
          required
          aria-invalid={Boolean(errors.title)}
          aria-describedby={describedBy('title')}
          className={inputClass(Boolean(errors.title))}
        />
        {fieldError('title')}
      </div>

      <div>
        <label htmlFor={fieldId('description')} className="text-sm font-medium text-slate-700">
          Description
        </label>
        <textarea
          id={fieldId('description')}
          value={values.description}
          onChange={(event) => update('description', event.target.value)}
          maxLength={FIELD_LIMITS.description}
          rows={4}
          aria-invalid={Boolean(errors.description)}
          aria-describedby={describedBy('description')}
          className={inputClass(Boolean(errors.description))}
        />
        {fieldError('description')}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor={fieldId('priority')} className="text-sm font-medium text-slate-700">
            Priority
          </label>
          <select
            id={fieldId('priority')}
            value={values.priority}
            onChange={(event) => update('priority', event.target.value as TicketInput['priority'])}
            aria-describedby={describedBy('priority')}
            className={inputClass(Boolean(errors.priority))}
          >
            {PRIORITIES.map((priority) => (
              <option key={priority} value={priority}>
                {PRIORITY_LABELS[priority]} — {SLA_POLICY_LABELS[priority]}
              </option>
            ))}
          </select>
          {fieldError('priority')}
          {priorityHint && <div className="mt-1 text-xs text-slate-600">{priorityHint(values)}</div>}
        </div>

        <div>
          <label htmlFor={fieldId('status')} className="text-sm font-medium text-slate-700">
            Status
          </label>
          <select
            id={fieldId('status')}
            value={values.status}
            onChange={(event) => update('status', event.target.value as TicketInput['status'])}
            aria-describedby={describedBy('status')}
            className={inputClass(Boolean(errors.status))}
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

      <div>
        <label htmlFor={fieldId('assignedAgentId')} className="text-sm font-medium text-slate-700">
          Assigned agent
        </label>
        <select
          id={fieldId('assignedAgentId')}
          value={values.assignedAgentId ?? ''}
          onChange={(event) => update('assignedAgentId', event.target.value || null)}
          aria-describedby={describedBy('assignedAgentId')}
          className={inputClass(Boolean(errors.assignedAgentId))}
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

      <div className="flex justify-end gap-2 pt-2">
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Cancel
          </button>
        )}
        <button
          type="submit"
          disabled={submitting}
          className="inline-flex items-center gap-2 rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700 disabled:opacity-60"
        >
          {submitting && <Loader2 aria-hidden className="size-4 animate-spin" />}
          {submitLabel}
        </button>
      </div>
    </form>
  );
}
