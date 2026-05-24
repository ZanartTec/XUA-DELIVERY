import { enqueueInternalJob } from './apps/api/src/infra/queue/internal-jobs.producer';
import { INTERNAL_JOB_NAMES } from './apps/api/src/infra/queue/contracts';
import { closeQueueInfra } from './apps/api/src/infra/queue/queues';

async function run() {
  const start = performance.now();
  try {
    console.log('Enqueuing job...');
    const result = await enqueueInternalJob({
      jobName: INTERNAL_JOB_NAMES.noop,
      source: 'ops',
    });
    const end = performance.now();
    console.log('Result:', JSON.stringify(result, null, 2));
    const elapsed = (end - start).toFixed(2);
    console.log('Elapsed time: ' + elapsed + 'ms');
  } catch (error) {
    console.error('Error enqueuing job:', error);
    process.exit(1);
  } finally {
    await closeQueueInfra();
  }
}

run().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
