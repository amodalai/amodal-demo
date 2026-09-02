/**
 * A one-at-a-time queue.
 *
 * Analyzing a submission runs the underwriting-reviewer subagent, so firing a
 * whole desk at once opens as many model calls as there are rows and the
 * runtime works through them in an order the UI cannot show. Serialized, each
 * row lights up in turn. A rejected task does not stop the queue: the failure
 * belongs to that row.
 */
export function serial() {
  let tail: Promise<void> = Promise.resolve();
  return (task: () => Promise<void>): Promise<void> =>
    (tail = tail.then(task).catch(() => {}));
}
