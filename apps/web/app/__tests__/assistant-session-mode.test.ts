import { describe, expect, it } from 'vitest';
import {
  canSendAssistantMessage,
  computeAssistantRouteNavigationOverlayPending,
  computeAssistantSendDisabledReason,
  resolveSearchParamsAfterCreateSession,
  resolveSearchParamsAfterDeleteSession,
  resolveSessionModeForCreate,
} from '~/routes/internal.ai-assistant';

describe('resolveSessionModeForCreate', () => {
  it('defaults to localMachine when no mode is requested', () => {
    expect(resolveSessionModeForCreate(undefined, false)).toBe('localMachine');
  });

  it('allows modalRemote when explicitly requested and local-only is disabled', () => {
    expect(resolveSessionModeForCreate('modalRemote', false)).toBe('modalRemote');
  });

  it('forces localMachine while INTERNAL_AI_LOCAL_ONLY is enabled', () => {
    expect(resolveSessionModeForCreate('modalRemote', true)).toBe('localMachine');
  });
});

describe('session search-param helpers', () => {
  it('sets new sessionId after create without dropping existing query', () => {
    const current = new URLSearchParams('q=errors&sessionId=old-1');
    const next = resolveSearchParamsAfterCreateSession(current, 'new-1');
    expect(next.get('q')).toBe('errors');
    expect(next.get('sessionId')).toBe('new-1');
  });

  it('removes sessionId when deleting active session', () => {
    const current = new URLSearchParams('q=errors&sessionId=active-1');
    const next = resolveSearchParamsAfterDeleteSession(current, 'active-1', 'active-1');
    expect(next.get('q')).toBe('errors');
    expect(next.has('sessionId')).toBe(false);
  });

  it('switches to fallback session when deleting active session', () => {
    const current = new URLSearchParams('q=errors&sessionId=active-1');
    const next = resolveSearchParamsAfterDeleteSession(current, 'active-1', 'active-1', 'next-1');
    expect(next.get('q')).toBe('errors');
    expect(next.get('sessionId')).toBe('next-1');
  });

  it('keeps sessionId when deleting a non-active session', () => {
    const current = new URLSearchParams('q=errors&sessionId=active-1');
    const next = resolveSearchParamsAfterDeleteSession(current, 'other-1', 'active-1');
    expect(next.get('sessionId')).toBe('active-1');
  });
});

describe('canSendAssistantMessage', () => {
  it('returns true for non-empty draft while idle', () => {
    expect(
      canSendAssistantMessage({
        draft: 'hello',
        isStreaming: false,
        activeSessionId: 'sess-1',
      }),
    ).toBe(true);
  });

  it('returns false for whitespace-only drafts', () => {
    expect(
      canSendAssistantMessage({
        draft: '   ',
        isStreaming: false,
        activeSessionId: 'sess-1',
      }),
    ).toBe(false);
  });

  it('returns false while streaming', () => {
    expect(
      canSendAssistantMessage({
        draft: 'hello',
        isStreaming: true,
        activeSessionId: 'sess-1',
      }),
    ).toBe(false);
  });

  it('returns false when session is the unavailable placeholder', () => {
    expect(
      canSendAssistantMessage({
        draft: 'hello',
        isStreaming: false,
        activeSessionId: 'unavailable',
      }),
    ).toBe(false);
  });

  it('returns false while session mutation fetcher is busy', () => {
    expect(
      canSendAssistantMessage({
        draft: 'hello',
        isStreaming: false,
        activeSessionId: 's1',
        sessionMutationBusy: true,
      }),
    ).toBe(false);
  });

  it('returns false while route navigation is pending', () => {
    expect(
      canSendAssistantMessage({
        draft: 'hello',
        isStreaming: false,
        activeSessionId: 's1',
        routeNavigationPending: true,
      }),
    ).toBe(false);
  });

  it('returns false while send is in flight (before streaming state settles)', () => {
    expect(
      canSendAssistantMessage({
        draft: 'hello',
        isStreaming: false,
        activeSessionId: 's1',
        sendInFlight: true,
      }),
    ).toBe(false);
  });
});

describe('computeAssistantRouteNavigationOverlayPending', () => {
  const cur = { pathname: '/internal/ai-assistant', search: '?sessionId=a' };

  it('is false while idle', () => {
    expect(
      computeAssistantRouteNavigationOverlayPending({
        navigationState: 'idle',
        navigationLocation: { pathname: '/internal/ai-assistant', search: '?sessionId=b' },
        currentPathname: cur.pathname,
        currentSearch: cur.search,
      }),
    ).toBe(false);
  });

  it('is true when loading a different query on the assistant route', () => {
    expect(
      computeAssistantRouteNavigationOverlayPending({
        navigationState: 'loading',
        navigationLocation: { pathname: '/internal/ai-assistant', search: '?sessionId=b' },
        currentPathname: cur.pathname,
        currentSearch: cur.search,
      }),
    ).toBe(true);
  });

  it('is false when loading matches current URL (e.g. loader-only revalidation)', () => {
    expect(
      computeAssistantRouteNavigationOverlayPending({
        navigationState: 'loading',
        navigationLocation: { pathname: cur.pathname, search: cur.search },
        currentPathname: cur.pathname,
        currentSearch: cur.search,
      }),
    ).toBe(false);
  });

  it('is false when navigation location is missing', () => {
    expect(
      computeAssistantRouteNavigationOverlayPending({
        navigationState: 'loading',
        navigationLocation: undefined,
        currentPathname: cur.pathname,
        currentSearch: cur.search,
      }),
    ).toBe(false);
  });

  it('is false when next route is outside ai-assistant', () => {
    expect(
      computeAssistantRouteNavigationOverlayPending({
        navigationState: 'loading',
        navigationLocation: { pathname: '/internal/model-setup', search: '' },
        currentPathname: cur.pathname,
        currentSearch: cur.search,
      }),
    ).toBe(false);
  });
});

describe('computeAssistantSendDisabledReason', () => {
  it('returns null when all gates pass', () => {
    expect(
      computeAssistantSendDisabledReason({
        draft: ' hi ',
        isStreaming: false,
        activeSessionId: 'sess-1',
      }),
    ).toBeNull();
  });

  it('returns a stable reason for empty draft', () => {
    expect(
      computeAssistantSendDisabledReason({
        draft: '',
        isStreaming: false,
        activeSessionId: 'sess-1',
      }),
    ).toMatch(/Enter a message/);
  });

  it('prioritizes in-flight / streaming over empty draft', () => {
    expect(
      computeAssistantSendDisabledReason({
        draft: '',
        isStreaming: true,
        activeSessionId: 'sess-1',
      }),
    ).toMatch(/in progress/);
  });
});
