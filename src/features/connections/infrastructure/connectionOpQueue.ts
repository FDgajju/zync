/** Serializes connect/disconnect per host so reconnect cannot race ahead of disconnect. */

const opChains = new Map<string, Promise<unknown>>();
/** Queued or running connect ops per host (incremented at queue time). */
const connectOpCounts = new Map<string, number>();

/** True while a connect/disconnect op is queued or running for this host. */
export function hasSerializedConnectionOp(connectionId: string): boolean {
  return connectionId !== 'local' && opChains.has(connectionId);
}

/** True while a connect op (not disconnect/transport-lost) is queued or running. */
export function hasSerializedConnectOp(connectionId: string): boolean {
  return connectionId !== 'local' && (connectOpCounts.get(connectionId) ?? 0) > 0;
}

/** True when another connect is waiting behind the currently running one. */
export function hasQueuedSerializedConnectOp(connectionId: string): boolean {
  return connectionId !== 'local' && (connectOpCounts.get(connectionId) ?? 0) > 1;
}

export function runSerializedConnectionOp<T>(
  connectionId: string,
  op: () => Promise<T>,
): Promise<T> {
  if (connectionId === 'local') {
    return op();
  }

  const previous = opChains.get(connectionId) ?? Promise.resolve();
  const next = previous
    .catch(() => {})
    .then(() => op());

  const settled = next.then(
    () => undefined,
    () => undefined,
  );
  opChains.set(connectionId, settled);

  // Cleanup entry once this op settles (if no newer op has overwritten the map entry).
  settled.finally(() => {
    if (opChains.get(connectionId) === settled) {
      opChains.delete(connectionId);
    }
  }).catch(() => {});

  return next;
}

/** Like `runSerializedConnectionOp`, but tracks the op as a connect for cancel pending. */
export function runSerializedConnectOp<T>(
  connectionId: string,
  op: () => Promise<T>,
): Promise<T> {
  if (connectionId === 'local') {
    return op();
  }

  connectOpCounts.set(connectionId, (connectOpCounts.get(connectionId) ?? 0) + 1);
  return runSerializedConnectionOp(connectionId, async () => {
    try {
      return await op();
    } finally {
      const remaining = (connectOpCounts.get(connectionId) ?? 1) - 1;
      if (remaining <= 0) {
        connectOpCounts.delete(connectionId);
      } else {
        connectOpCounts.set(connectionId, remaining);
      }
    }
  });
}
