import { useCallback, useEffect, useRef } from 'react';
import { useAppStore } from '../../store/useAppStore';
import { getZyncThemePayload } from '../../lib/themePayload';
import { isDebugThemePayloadEnabled } from '../../lib/debugFlags';
import { confirmPluginTerminalAction } from '../../features/plugins/confirmPluginTerminalAction';

interface PluginPanelProps {
    html: string;
    panelId: string;
    pluginId: string;
    connectionId: string | null;
}

/**
 * Renders a plugin panel inside a sandboxed iframe.
 * Provides a postMessage bridge so the panel can still call zync.terminal.send(), etc.
 */
export function PluginPanel({ html, panelId, pluginId, connectionId }: PluginPanelProps) {
    const iframeRef = useRef<HTMLIFrameElement>(null);
    const theme = useAppStore(s => s.settings.theme);
    const accentColor = useAppStore(s => s.settings.accentColor);

    const sendTheme = useCallback(() => {
        if (!iframeRef.current || !iframeRef.current.contentWindow) return;
        const payload = getZyncThemePayload(theme);
        if (isDebugThemePayloadEnabled()) {
            // eslint-disable-next-line no-console
            console.debug('[Zync PluginPanel] theme payload', payload);
        }
        iframeRef.current.contentWindow.postMessage({
            type: 'zync:theme:update',
            // Back-compat: include the previous `theme` string field as well.
            payload: { theme, ...payload }
        }, '*');
    }, [theme, accentColor]);

    // Broadcast theme changes to the iframe natively
    useEffect(() => {
        sendTheme();
    }, [sendTheme]);

    // Listen for messages FROM the iframe (plugin panel calling zync.*)
    useEffect(() => {
        let active = true;
        const handler = async (e: MessageEvent) => {
            const sourceWindow = iframeRef.current?.contentWindow;
            if (!sourceWindow || e.source !== sourceWindow) return;
            const { type, payload } = e.data || {};
            if (!type) return;

            if (type === 'zync:terminal:send') {
                if (typeof payload?.text !== 'string' || !payload.text) return;
                const confirmed = await confirmPluginTerminalAction(pluginId, 'send terminal input', payload.text);
                if (!active || iframeRef.current?.contentWindow !== sourceWindow || !confirmed) return;
                window.dispatchEvent(new CustomEvent('zync:terminal:send', { detail: { text: payload.text, connectionId } }));
            } else if (type === 'zync:terminal:opentab') {
                if (typeof payload?.command === 'string' && payload.command) {
                    const confirmed = await confirmPluginTerminalAction(pluginId, 'open a terminal and run', payload.command);
                    if (!active || iframeRef.current?.contentWindow !== sourceWindow || !confirmed) return;
                }
                window.dispatchEvent(new CustomEvent('ssh-ui:new-terminal-tab', { detail: { connectionId, command: payload.command } }));
            } else if (type === 'zync:statusbar:set') {
                window.dispatchEvent(new CustomEvent('zync:statusbar:set', { detail: payload }));
            } else if (type === 'zync:ui:notify') {
                window.dispatchEvent(new CustomEvent('zync:ui:notify', { detail: payload }));
            } else if (type === 'zync:ui:confirm') {
                import('../../store/useAppStore').then(({ useAppStore }) => {
                    useAppStore.getState().showConfirmDialog({
                        title: payload.title || 'Confirm',
                        message: payload.message || 'Are you sure?',
                        confirmText: payload.confirmText,
                        cancelText: payload.cancelText,
                        variant: payload.variant
                    }).then((confirmed) => {
                        iframeRef.current?.contentWindow?.postMessage({
                            type: 'zync:ui:confirm:response',
                            payload: { requestId: payload.requestId, confirmed }
                        }, '*');
                    });
                });
            } else if (type === 'zync:ssh:exec') {
                if (!connectionId) {
                    iframeRef.current?.contentWindow?.postMessage({
                        type: 'zync:ssh:exec:response',
                        payload: { requestId: payload.requestId, error: 'No active connection' }
                    }, '*');
                    return;
                }
                if (typeof payload?.command !== 'string') {
                    iframeRef.current?.contentWindow?.postMessage({
                        type: 'zync:ssh:exec:response',
                        payload: {
                            requestId: payload?.requestId,
                            error: { code: 'SSH_EXEC_INVALID_COMMAND', message: 'SSH command must be a string.' }
                        }
                    }, '*');
                    return;
                }

                const confirmed = await confirmPluginTerminalAction(
                    pluginId,
                    `run an SSH command on connection "${connectionId}"`,
                    payload.command,
                );
                if (!active || iframeRef.current?.contentWindow !== sourceWindow) return;
                if (!confirmed) {
                    iframeRef.current?.contentWindow?.postMessage({
                        type: 'zync:ssh:exec:response',
                        payload: {
                            requestId: payload.requestId,
                            error: { code: 'SSH_EXEC_DENIED', message: 'SSH command was not approved by the user.' }
                        }
                    }, '*');
                    return;
                }

                try {
                    const { ipcRenderer } = await import('../../lib/tauri-ipc');
                    if (!active || iframeRef.current?.contentWindow !== sourceWindow) return;
                    const result = await ipcRenderer.invoke('ssh_exec', { connectionId, command: payload.command });
                    iframeRef.current?.contentWindow?.postMessage({
                        type: 'zync:ssh:exec:response',
                        payload: { requestId: payload.requestId, result }
                    }, '*');
                } catch (error) {
                    iframeRef.current?.contentWindow?.postMessage({
                        type: 'zync:ssh:exec:response',
                        payload: { requestId: payload.requestId, error: String(error) }
                    }, '*');
                }
            }
        };

        window.addEventListener('message', handler);
        return () => {
            active = false;
            window.removeEventListener('message', handler);
        };
    }, [panelId, pluginId, connectionId]);

    // Inject the zync shim into the panel HTML
    const shimScript = `
<script>
window.zync = {
    terminal: {
        send: function(text) {
            window.parent.postMessage({ type: 'zync:terminal:send', payload: { text } }, '*');
        },
        newTab: function(opts) {
            window.parent.postMessage({ type: 'zync:terminal:opentab', payload: opts }, '*');
        }
    },
    statusBar: {
        set: function(id, text) {
            window.parent.postMessage({ type: 'zync:statusbar:set', payload: { id, text } }, '*');
        }
    },
    ui: {
        notify: function(opts) {
            window.parent.postMessage({ type: 'zync:ui:notify', payload: opts }, '*');
        },
        confirm: function(opts) {
            return new Promise((resolve) => {
                const reqId = Math.random().toString(36).substr(2, 9);
                
                const listener = (event) => {
                    const { type, payload } = event.data || {};
                    if (type === 'zync:ui:confirm:response' && payload.requestId === reqId) {
                        window.removeEventListener('message', listener);
                        resolve(payload.confirmed);
                    }
                };
                window.addEventListener('message', listener);
                
                window.parent.postMessage({ 
                    type: 'zync:ui:confirm', 
                    payload: { ...opts, requestId: reqId } 
                }, '*');
            });
        }
    },
    ssh: {
        exec: function(command) {
            return new Promise((resolve, reject) => {
                const reqId = Math.random().toString(36).substr(2, 9);
                
                const listener = (event) => {
                    const { type, payload } = event.data || {};
                    if (type === 'zync:ssh:exec:response' && payload.requestId === reqId) {
                        window.removeEventListener('message', listener);
                        if (payload.error) {
                            const error = new Error(typeof payload.error === 'string' ? payload.error : payload.error.message);
                            if (typeof payload.error === 'object') Object.assign(error, payload.error);
                            reject(error);
                        }
                        else resolve(payload.result);
                    }
                };
                window.addEventListener('message', listener);
                
                window.parent.postMessage({ 
                    type: 'zync:ssh:exec', 
                    payload: { command, requestId: reqId } 
                }, '*');
            });
        }
    }
};
</script>
`;

    const fullHtml = html.replace('<head>', `<head>\n${shimScript}`) || `<html><head>${shimScript}</head><body>${html}</body></html>`;

    return (
        <div className="absolute inset-0 z-10 bg-app-bg flex flex-col">
            <iframe
                ref={iframeRef}
                srcDoc={fullHtml}
                onLoad={sendTheme}
                sandbox="allow-scripts allow-modals"
                className="flex-1 w-full border-0 bg-transparent"
                title={`Plugin Panel: ${panelId}`}
            />
        </div>
    );
}
