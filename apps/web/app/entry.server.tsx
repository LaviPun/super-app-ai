import { PassThrough } from 'node:stream';
import { renderToPipeableStream } from 'react-dom/server';
import { RemixServer } from '@remix-run/react';
import { createReadableStreamFromReadable } from '@remix-run/node';
import type { EntryContext } from '@remix-run/node';
import { isbot } from 'isbot';
import { applySecurityHeaders, isInternalRouteMatch } from '~/security-headers.server';

export const streamTimeout = 5000;

export default async function handleRequest(
  request: Request,
  responseStatusCode: number,
  responseHeaders: Headers,
  remixContext: EntryContext,
) {
  // Derive "is /internal" from the router's own matched routes (not a
  // hand-rolled URL parse) so this can never disagree with what Remix
  // actually resolved the request to — see security-headers.server.ts.
  applySecurityHeaders(
    request,
    responseHeaders,
    isInternalRouteMatch(remixContext.staticHandlerContext.matches),
  );

  const userAgent = request.headers.get('user-agent');
  const callbackName = isbot(userAgent ?? '') ? 'onAllReady' : 'onShellReady';

  return new Promise((resolve, reject) => {
    const { pipe, abort } = renderToPipeableStream(
      <RemixServer context={remixContext} url={request.url} abortDelay={streamTimeout} />,
      {
        [callbackName]: () => {
          const body = new PassThrough();
          const stream = createReadableStreamFromReadable(body);
          responseHeaders.set('Content-Type', 'text/html');
          resolve(
            new Response(stream, {
              headers: responseHeaders,
              status: responseStatusCode,
            }),
          );
          pipe(body);
        },
        onShellError(error: unknown) {
          reject(error);
        },
        onError(error: unknown) {
          responseStatusCode = 500;
          console.error(error);
        },
      },
    );
    // Abort the render 1s after the stream timeout so the rejection above wins.
    setTimeout(abort, streamTimeout + 1000);
  });
}
