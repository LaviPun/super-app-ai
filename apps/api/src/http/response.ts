export type HandlerResult = {
  status: number;
  body: unknown;
  headers?: Record<string, string>;
};

export function toJsonResponse(result: HandlerResult): Response {
  if (typeof result.body === 'string') {
    return new Response(result.body, {
      status: result.status,
      headers: result.headers,
    });
  }

  return Response.json(result.body, {
    status: result.status,
    headers: result.headers,
  });
}
