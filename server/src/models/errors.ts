export interface FieldIssue {
  field: string;
  message: string;
}

export class AppError extends Error {
  constructor(
    readonly statusCode: number,
    readonly code: string,
    message: string,
    readonly details?: readonly FieldIssue[],
  ) {
    super(message);
    this.name = new.target.name;
  }
}

export class NotFoundError extends AppError {
  constructor(resource: string, id: string) {
    super(404, 'NOT_FOUND', `${resource} '${id}' was not found`);
  }
}

export class ValidationError extends AppError {
  constructor(details: readonly FieldIssue[]) {
    super(400, 'VALIDATION_ERROR', 'The request is invalid', details);
  }
}
