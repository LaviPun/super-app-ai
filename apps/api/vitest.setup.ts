/** V2 API route tests expect /v1 handlers unless rollout gating is under test. */
process.env.FASTIFY_API_ENABLED = process.env.FASTIFY_API_ENABLED ?? 'true';
