/**
 * Resource route for /favicon.ico. Returns 204 when no favicon is configured
 * so the browser does not repeatedly request and log "No route matches".
 */
export async function loader() {
  return new Response(null, { status: 204 });
}
