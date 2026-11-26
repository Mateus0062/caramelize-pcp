/**
 * Erro de regra de negócio. A mensagem é escrita para o usuário final e pode
 * ser devolvida ao navegador com segurança (HTTP 400).
 */
export class DomainError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DomainError";
  }
}

/**
 * Erro HTTP com status e mensagem seguros para o cliente
 * (401 não autenticado, 403 sem permissão, 429 limite de tentativas...).
 */
export class HttpError extends Error {
  readonly status: number;
  readonly code?: string;
  readonly headers?: Record<string, string>;

  constructor(
    status: number,
    message: string,
    options: { code?: string; headers?: Record<string, string> } = {},
  ) {
    super(message);
    this.name = "HttpError";
    this.status = status;
    this.code = options.code;
    this.headers = options.headers;
  }
}
