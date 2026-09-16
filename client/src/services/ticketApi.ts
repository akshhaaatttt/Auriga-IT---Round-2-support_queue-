import type { Agent, QueueSummary, Ticket, TicketInput, TicketPage, TicketQuery, TicketUpdate } from '../types/api';
import { apiRequest } from './apiClient';

export function buildTicketSearchParams(query: TicketQuery): URLSearchParams {
  const params = new URLSearchParams({ page: String(query.page), limit: String(query.limit) });
  if (query.search) params.set('search', query.search);
  if (query.overdue !== undefined) params.set('overdue', String(query.overdue));
  if (query.assignedTo) params.set('assignedTo', query.assignedTo);
  if (query.statuses && query.statuses.length > 0) params.set('status', query.statuses.join(','));
  return params;
}

export const ticketApi = {
  list: (query: TicketQuery, signal?: AbortSignal) =>
    apiRequest<TicketPage>(`/api/tickets?${buildTicketSearchParams(query).toString()}`, { signal }),

  summary: (signal?: AbortSignal) => apiRequest<QueueSummary>('/api/tickets/summary', { signal }),

  create: (input: TicketInput) =>
    apiRequest<Ticket>('/api/tickets', { method: 'POST', body: JSON.stringify(input) }),

  update: (id: string, changes: TicketUpdate) =>
    apiRequest<Ticket>(`/api/tickets/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify(changes),
    }),

  remove: (id: string) => apiRequest<null>(`/api/tickets/${encodeURIComponent(id)}`, { method: 'DELETE' }),
};

export const agentApi = {
  list: (signal?: AbortSignal) => apiRequest<{ agents: Agent[] }>('/api/agents', { signal }),
};
