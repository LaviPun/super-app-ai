import { getPrisma } from '~/db.server';
import {
  parseConnectorTestJobPayload,
  runConnectorTestJob,
  type ConnectorTestJobDeps,
} from '~/services/connectors/connector-test-job.server';

type ConnectorWorkerJobRow = {
  id: string;
  type: string;
  payload: string | null;
};

export async function runConnectorWorkerJob(
  job: ConnectorWorkerJobRow,
  deps: ConnectorTestJobDeps = {},
): Promise<unknown> {
  if (job.type !== 'CONNECTOR_TEST') {
    throw new Error(`Unsupported connector worker job type: ${job.type}`);
  }
  if (!job.payload) throw new Error('Connector worker job is missing payload');

  return runConnectorTestJob(job.id, JSON.parse(job.payload), deps);
}

export async function runNextConnectorWorkerJob(deps: ConnectorTestJobDeps = {}): Promise<unknown | null> {
  const prisma = getPrisma();
  const job = await prisma.job.findFirst({
    where: { type: 'CONNECTOR_TEST', status: 'QUEUED' },
    orderBy: { createdAt: 'asc' },
  });

  if (!job) return null;
  parseConnectorTestJobPayload(JSON.parse(job.payload ?? 'null'));
  return runConnectorWorkerJob(job, deps);
}
