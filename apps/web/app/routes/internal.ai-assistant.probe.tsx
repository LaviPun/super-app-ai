import { json, type LoaderFunctionArgs } from '@remix-run/node';
import { requireInternalAdmin } from '~/internal-admin/session.server';
import { AppError } from '~/services/errors/app-error.server';
import { enforceInternalAiRateLimit } from '~/services/security/rate-limit.server';
import { probeAssistantTargets } from '~/services/ai/assistant-probe-route.server';

export async function loader({ request }: LoaderFunctionArgs) {
  await requireInternalAdmin(request);
  try {
    await enforceInternalAiRateLimit(request, 'probe');
  } catch (error) {
    if (error instanceof AppError && error.code === 'RATE_LIMITED') {
      const retryAfterSec = Number(error.details?.retryAfterSec ?? 60);
      return json(
        { error: error.message },
        { status: 429, headers: { 'Cache-Control': 'no-store', 'Retry-After': String(retryAfterSec) } },
      );
    }
    throw error;
  }
  const result = await probeAssistantTargets();
  return json(result, {
    headers: { 'Cache-Control': 'no-store' },
  });
}

export async function action({ request }: LoaderFunctionArgs) {
  await requireInternalAdmin(request);
  try {
    await enforceInternalAiRateLimit(request, 'probe');
  } catch (error) {
    if (error instanceof AppError && error.code === 'RATE_LIMITED') {
      const retryAfterSec = Number(error.details?.retryAfterSec ?? 60);
      return json(
        { error: error.message },
        { status: 429, headers: { 'Cache-Control': 'no-store', 'Retry-After': String(retryAfterSec) } },
      );
    }
    throw error;
  }
  const result = await probeAssistantTargets();
  return json(result, {
    headers: { 'Cache-Control': 'no-store' },
  });
}
