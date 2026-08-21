/** Apply a queued cancel to a connect that is just registering its attemptId. */
export function registerConnectAttempt(args: {
  connectionId: string;
  attemptId: string;
  pending: Set<string>;
  cancelledAttempts: Set<string>;
}): boolean {
  if (args.pending.delete(args.connectionId)) {
    args.cancelledAttempts.add(args.attemptId);
    return true;
  }
  args.cancelledAttempts.delete(args.attemptId);
  return false;
}

/** Record cancel for the running attempt, and for a queued connect if one exists. */
export function recordConnectCancellation(args: {
  connectionId: string;
  activeAttemptId: string | undefined;
  hasQueuedConnect: boolean;
  hasSerializedConnect: boolean;
  pending: Set<string>;
  cancelledAttempts: Set<string>;
}): void {
  if (args.activeAttemptId) {
    args.cancelledAttempts.add(args.activeAttemptId);
    if (args.hasQueuedConnect) {
      args.pending.add(args.connectionId);
    }
    return;
  }
  if (args.hasSerializedConnect) {
    args.pending.add(args.connectionId);
  }
}

/** Clear the running attempt's cancel flag without touching queued pending cancels. */
export function clearCancelledConnectAttempt(
  cancelledAttempts: Set<string>,
  attemptId: string,
): boolean {
  return cancelledAttempts.delete(attemptId);
}
