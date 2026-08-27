import { useEffect, useState } from 'react';

const FADE_MS = 220;

export type ConnectionStage = 'connecting' | 'error';

/** Lags overlay unmount so connecting → live can cross-fade instead of hard-cutting. */
export function useConnectionStageOverlay(isConnecting: boolean, isError: boolean) {
  const [stage, setStage] = useState<ConnectionStage | null>(
    isConnecting ? 'connecting' : isError ? 'error' : null,
  );
  const [visible, setVisible] = useState(Boolean(isConnecting || isError));

  useEffect(() => {
    if (isConnecting) {
      setStage('connecting');
      setVisible(true);
      return;
    }
    if (isError) {
      setStage('error');
      setVisible(true);
      return;
    }

    setVisible(false);
    const timer = window.setTimeout(() => setStage(null), FADE_MS);
    return () => window.clearTimeout(timer);
  }, [isConnecting, isError]);

  return {
    stage,
    visible,
    showWorkspace: !isConnecting && !isError,
  };
}
