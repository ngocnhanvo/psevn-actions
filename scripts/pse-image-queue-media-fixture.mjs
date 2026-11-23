/** Offline comparison of Pages batch scheduling and the deployed worker queue.
 *
 * Synthetic cold-media latency only: no WordPress, image or hosting requests.
 * Import the exact Astro master implementation; never reproduce it locally.
 */
import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { runBoundedTasks } from '../source/src/lib/wordpress/pages/runBoundedTasks.ts';

const imageCount = 24;
const slowIndices = new Set([0, 8, 16]);
const latency = index => slowIndices.has(index) ? 180 : 8;
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));

function makeTasks(limit) {
  let active = 0;
  let peak = 0;
  const tasks = Array.from({ length: imageCount }, (_, index) => [
    index,
    async () => {
      active++;
      peak = Math.max(active, peak);
      assert.ok(active <= limit, 'Image concurrency exceeded configured ceiling');
      try {
        await pause(latency(index));
        return 'media-' + index;
      } finally {
        active--;
      }
    },
  ]);
  return {tasks, state: () => ({active, peak})};
}

async function oldBatches(tasks, limit) {
  const result = new Map();
  for (let offset = 0; offset < tasks.length; offset += limit) {
    const current = tasks.slice(offset, offset + limit);
    const items = await Promise.all(current.map(async ([key, task]) => [key, await task()]));
    for (const [key, value] of items) result.set(key, value);
  }
  return result;
}

async function measure(label, concurrency) {
  const {tasks, state} = makeTasks(concurrency);
  const started = performance.now();
  const output = label === 'batches'
    ? await oldBatches(tasks, concurrency)
    : await runBoundedTasks(tasks, concurrency);
  const elapsed = performance.now() - started;
  assert.equal(state().active, 0, 'A media task leaked after completion');
  assert.ok(state().peak <= concurrency);
  assert.equal(output.size, imageCount);
  assert.deepEqual([...output.keys()], Array.from({length:imageCount}, (_,i) => i));
  assert.deepEqual([...output.values()], Array.from({length:imageCount}, (_,i) => 'media-'+i));
  return {method:label, concurrent:concurrency, elapsed_ms:Math.round(elapsed), peak:state().peak};
}

const results=[];
for (const limit of [2,4,6,8]) {
  const batches = await measure('batches',limit);
  const queue = await measure('continuous-queue',limit);
  results.push(batches,queue);
  // No timing-based gate: GitHub runner scheduling can fluctuate. Tests above
  // assert functional output, absence of lost media and maximum concurrency.
  console.log('PSE_SYNTHETIC_MEDIA_SCHEDULE '+JSON.stringify({
    concurrency:limit, batch_ms:batches.elapsed_ms,
    queue_ms:queue.elapsed_ms, peak_concurrency:queue.peak,
  }));
}
assert.equal(results.length,8);
console.log('PSE_IMAGE_QUEUE_OFFLINE_FIXTURE=PASS cases=8 images=24 slow_images=3 no_wp_fetch=true no_build=true no_ftp=true');
