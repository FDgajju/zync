export function resolveShellExitConnectionId(
  termId: string,
  cacheConnectionId: string | undefined,
  terminals: Record<string, Array<{ id: string }> | undefined>,
): string | undefined {
  if (cacheConnectionId && terminals[cacheConnectionId]?.some((tab) => tab.id === termId)) {
    return cacheConnectionId;
  }
  return Object.keys(terminals).find((connectionId) =>
    terminals[connectionId]?.some((tab) => tab.id === termId),
  );
}
