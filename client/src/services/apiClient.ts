import type { ApiErrorBody, FieldIssue } from '../types/api';

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly details: readonly FieldIssue[] = [],
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

const NETWORK_ERROR_MESSAGE = 'Could not reach the server. Check that the API is running and try again.';

function isApiErrorBody(value: unknown): value is ApiErrorBody {
  return (
    typeof value === 'object' &&
    value !== null &&
    'error' in value &&
    typeof (value as ApiErrorBody).error?.message === 'string'
  );
}

async function parseBody(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ApiError(`Unexpected response from server (HTTP ${response.status})`, response.status);
  }
}

export async function apiRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, {
      ...init,
      headers: { Accept: 'application/json', 'Content-Type': 'application/json', ...init.headers },
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error;
    throw new ApiError(NETWORK_ERROR_MESSAGE, 0);
  }

  const body = await parseBody(response);
  if (!response.ok) {
    if (isApiErrorBody(body)) {
      throw new ApiError(body.error.message, response.status, body.error.details);
    }
    throw new ApiError(`Request failed (HTTP ${response.status})`, response.status);
  }
  return body as T;
}

export function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError';
}

export function describeError(error: unknown): string {
  if (error instanceof ApiError) {
    const details = error.details.map((detail) => detail.message).join('. ');
    return details ? `${error.message}: ${details}` : error.message;
  }
  return error instanceof Error ? error.message : 'Something went wrong';
}
