/**
 * Error thrown by the remote driver when the Admin API responds with a non-2xx
 * status. Parsed from the API's `{ error: { code, message } }` envelope.
 */
export class AuthkitApiError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = 'AuthkitApiError';
    this.status = status;
    this.code = code;
  }
}
