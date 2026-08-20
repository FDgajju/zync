import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { ipcRenderer } from '../lib/tauri-ipc';
import { registerThemePluginModes } from '../lib/themeModeRegistry';
import { notify } from '../features/notifications';
import { parsePluginUiNotify } from '../features/notifications/pluginNotify';
import {
    createPluginNotifyActionRequestId,
    rejectAllPendingPluginNotifyActions,
    rejectPendingPluginNotifyActionsForPlugin,
    resolvePluginNotifyActionResponse,
    waitForPluginNotifyActionResult,
} from '../features/notifications/pluginNotifyAction';
import { useAppStore } from '../store/useAppStore';
import { confirmPluginTerminalAction } from '../features/plugins/confirmPluginTerminalAction';
import {
    filterUnsupportedHostThemes,
    filterTrustedBuiltinThemeChoices,
    handleWorkerTerminalCommand,
    isTrustedBuiltinTheme,
    postCurrentWorkerResponse,
    resetPluginWorkers,
} from '../features/plugins/pluginCommandBridge';

export interface EditorProviderManifest {
    entry?: string;
    displayName?: string;
    priority?: number;
    defaultFor?: string[];
    supports?: string[];
    fileExtensions?: string[];
    largeFileLimitMb?: number;
}

export interface Plugin {
    path: string;
    manifest: {
        id: string;
        name: string;
        version: string;
        main?: string;
        style?: string;
        mode?: string;
        preview_bg?: string;
        icon?: string;
        type?: string;
        /** Icon pack folder (camelCase from IPC JSON) */
        iconsPath?: string;
        icons_path?: string;
        editor?: EditorProviderManifest;
    };
    script?: string;
    style?: string;
    editorHtml?: string;
    enabled: boolean;
}

interface PluginCommand {
    id: string;
    title: string;
    pluginId: string;
}

interface PluginPanel {
    id: string;
    title: string;
    html: string;
    pluginId: string;
}

interface PluginContextType {
    plugins: Plugin[];
    editorProviders: Plugin[];
    loaded: boolean;
    commands: PluginCommand[];
    panels: PluginPanel[];
    executeCommand: (id: string) => void;
}

const PluginContext = createContext<PluginContextType>({
    plugins: [],
    editorProviders: [],
    loaded: false,
    commands: [],
    panels: [],
    executeCommand: () => { }
});

export const usePlugins = () => useContext(PluginContext);

/** Host-generated fallback ids for plugin notifies with actions (unique within process). */
let pluginNotifySeq = 0;
/** Prevents double-click concurrent RPC for the same notification action. */
const pluginNotifyActionsInFlight = new Set<string>();

// The code that runs INSIDE the Web Worker
// We use a template literal to inject it securely
const WORKER_BOOTSTRAP = `
const zync = {
    callbacks: {},
    commandHandlers: {},
    pendingRequests: {},
    
    on: (event, callback) => {
        if (!zync.callbacks[event]) zync.callbacks[event] = [];
        zync.callbacks[event].push(callback);
    },

    emit: (event, data) => {
        if (zync.callbacks[event]) {
            zync.callbacks[event].forEach(cb => cb(data));
        }
    },

    // Generic Request helper
    request: (type, payload) => {
        return new Promise((resolve, reject) => {
             const requestId = Math.random().toString(36).substring(7);
             zync.pendingRequests[requestId] = { resolve, reject };
             self.postMessage({ type, payload: { ...payload, requestId } });
        });
    },

    ui: {
        /**
         * Show a host toast / inbox notification.
         * JSON-only options (no functions). Host tags source as plugin:<id>.
         * Supported: type, message|body|title, duration, persist, silent, history,
         * channel ('auto'|'toast'|'inbox'|'both'), id, actions: [{ id, label, dismiss? }].
         * Action clicks are delivered back as api:ui:notify:action (or zync.ui.onNotifyAction).
         */
        notify: async (opts) => {
            self.postMessage({ type: 'api:ui:notify', payload: opts });
        },
        /**
         * Register a handler for notification action button clicks.
         * payload: { requestId, pluginId, actionId, notificationId?, message, type }
         * Handler may be async and may return { ok: false, error: '...' } to fail the action.
         * Returns an unsubscribe function.
         */
        onNotifyAction: (callback) => {
            if (typeof callback !== 'function') return () => {};
            if (!zync.callbacks['ui:notify:action']) zync.callbacks['ui:notify:action'] = [];
            zync.callbacks['ui:notify:action'].push(callback);
            return () => {
                const list = zync.callbacks['ui:notify:action'] || [];
                zync.callbacks['ui:notify:action'] = list.filter(cb => cb !== callback);
            };
        },
    },

    fs: {
        readFile: (path) => zync.request('api:fs:read', { path }),
        writeFile: (path, content) => zync.request('api:fs:write', { path, content }),
        ls: (path) => zync.request('api:fs:list', { path }),
        exists: (path) => zync.request('api:fs:exists', { path }),
        mkdir: (path) => zync.request('api:fs:mkdir', { path }),
    },

    commands: {
        register: (id, title, handler) => {
            zync.commandHandlers[id] = handler;
            self.postMessage({ type: 'api:commands:register', payload: { id, title } });
        }
    },
    
    theme: {
        set: (themeName) => {
            self.postMessage({ type: 'api:theme:set', payload: { theme: themeName } });
        }
    },

    terminal: {
        send: (text) => {
            self.postMessage({ type: 'api:terminal:send', payload: { text } });
        }
    },

    statusBar: {
        set: (id, text) => {
            self.postMessage({ type: 'api:statusbar:set', payload: { id, text } });
        },
        clear: (id) => {
            self.postMessage({ type: 'api:statusbar:set', payload: { id, text: '' } });
        }
    },

    panel: {
        register: (id, title, html) => {
            self.postMessage({ type: 'api:panel:register', payload: { id, title, html } });
        }
    },

    window: {
        showQuickPick: (items, options) => {
            return zync.request('api:window:showQuickPick', { items, options });
        },
        create: (options) => {
            return zync.request('api:window:create', options);
        }
    },

    plugins: {
        list: () => zync.request('api:plugins:load', {})
    },

    logger: {
        log: (msg) => {
            self.postMessage({ type: 'api:log', payload: msg });
        }
    }
};

self.onmessage = async (e) => {
    const { type, payload } = e.data;
    
    // Handle Responses
    if (type.endsWith(':response')) {
         const { requestId, result, error } = payload;
         // Special handling for Quick Pick legacy format (optional, but good for robust)
         // Actually, if we standardized zync.request, we use zync.pendingRequests
         
         const handler = zync.pendingRequests[requestId];
         if (handler) {
             if (error) handler.reject(error);
             else handler.resolve(result); // Result might be selectedItem or file content
             delete zync.pendingRequests[requestId];
         }
         return;
    }
    
    if (type === 'init') {
        zync.emit('ready');
    } else if (type === 'command:execute') {
        const handler = zync.commandHandlers[payload.id];
        if (handler) await handler();
    } else if (type === 'api:ui:notify:action') {
        const requestId = payload && payload.requestId;
        const respond = (result, error) => {
            if (!requestId) return;
            self.postMessage({
                type: 'api:ui:notify:action:response',
                payload: error
                    ? { requestId, error: String(error) }
                    : { requestId, result: result ?? { ok: true } },
            });
        };
        try {
            const callbacks = zync.callbacks['ui:notify:action'] || [];
            let lastResult = { ok: true };
            for (const cb of callbacks) {
                const out = await cb(payload);
                if (out && typeof out === 'object') {
                    lastResult = out;
                }
            }
            if (lastResult && lastResult.ok === false) {
                respond(lastResult, lastResult.error || 'Action failed');
            } else {
                respond(lastResult || { ok: true });
            }
        } catch (err) {
            respond(null, err && err.message ? err.message : String(err || 'Action failed'));
        }
    }
};

// Expose zync globally to the user script
self.zync = zync;
`;

export const PluginProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [plugins, setPlugins] = useState<Plugin[]>([]);
    const [loaded, setLoaded] = useState(false);
    const [commands, setCommands] = useState<PluginCommand[]>([]);
    const [panels, setPanels] = useState<PluginPanel[]>([]);
    const workers = useRef<Map<string, Worker>>(new Map());
    const trustedBuiltinThemes = useRef<Plugin[]>([]);
    const editorProviders = useMemo(
        () => plugins.filter((plugin) => plugin.enabled && plugin.manifest.type === 'editor-provider'),
        [plugins]
    );

    useEffect(() => {
        loadPlugins();
        return () => {
            // Cleanup workers
            rejectAllPendingPluginNotifyActions('Plugins shutting down');
            workers.current.forEach(w => w.terminate());
            workers.current.clear();
            trustedBuiltinThemes.current = [];
            document.querySelectorAll('style[data-zync-builtin-theme]').forEach(style => style.remove());
        };
    }, []);

    const loadPlugins = async () => {
        try {
            const loadedPlugins: Plugin[] = await ipcRenderer.invoke('plugins:load');
            console.log('[Plugins] Discovered:', loadedPlugins);

            // Only app-owned built-in themes may style the host document or start a theme runtime.
            const hostCompatiblePlugins = filterUnsupportedHostThemes(loadedPlugins);
            const enabledPlugins = hostCompatiblePlugins.filter(plugin => plugin.enabled);
            trustedBuiltinThemes.current = enabledPlugins.filter(isTrustedBuiltinTheme);
            const enabledPluginIds = new Set(enabledPlugins.map(plugin => plugin.manifest.id));
            const runnablePlugins = resetPluginWorkers(
                hostCompatiblePlugins,
                workers.current,
                pluginId => rejectPendingPluginNotifyActionsForPlugin(pluginId, 'Plugin reloaded'),
            );

            document.querySelectorAll('style[data-zync-builtin-theme]').forEach(style => style.remove());
            enabledPlugins.forEach(plugin => {
                if (!isTrustedBuiltinTheme(plugin) || !plugin.style) return;
                const style = document.createElement('style');
                style.dataset.zyncBuiltinTheme = plugin.manifest.id;
                style.textContent = plugin.style;
                document.head.appendChild(style);
            });

            // Third-party manifest.style is never injected. Editor styles remain inside
            // EditorPluginFrame; builtin:// theme CSS is trusted app-owned content.
            registerThemePluginModes(enabledPlugins);
            window.dispatchEvent(new CustomEvent('zync:theme-registry-ready'));
            setPlugins(loadedPlugins);
            setCommands(previous => previous.filter(command => enabledPluginIds.has(command.pluginId)));
            setPanels(previous => previous.filter(panel => enabledPluginIds.has(panel.pluginId)));

            // Initialize Workers
            runnablePlugins.forEach(plugin => {
                try {
                    // Combine bootstrap + user script
                    const blobContent = [WORKER_BOOTSTRAP, '\n\n// USER SCRIPT START\n\n', plugin.script];
                    const blob = new Blob(blobContent, { type: 'application/javascript' });
                    const workerUrl = URL.createObjectURL(blob);

                    const worker = new Worker(workerUrl);
                    URL.revokeObjectURL(workerUrl);

                    // Handle messages FROM the worker
                    worker.onmessage = (e) => {
                        const { type, payload } = e.data;
                        handlePluginMessage(plugin.manifest.id, type, payload, worker);
                    };

                    worker.onerror = (e) => {
                        console.error(`[Plugin Error] ${plugin.manifest.id}:`, e.message);
                    };

                    // Start it
                    worker.postMessage({ type: 'init' });

                    workers.current.set(plugin.manifest.id, worker);

                } catch (err) {
                    console.error(`[Plugin] Failed to start ${plugin.manifest.id}:`, err);
                }
            });

            setLoaded(true);
        } catch (err) {
            console.error('[Plugins] Failed to load:', err);
        }
    };

    const respond = (requester: Worker, pluginId: string, type: string, payload: Record<string, unknown>) => {
        postCurrentWorkerResponse(
            requester,
            candidate => workers.current.get(pluginId) === candidate,
            type,
            payload,
        );
    };

    const handlePluginMessage = async (pluginId: string, type: string, payload: any, requester: Worker) => {
        if (workers.current.get(pluginId) !== requester) return;
        if (type === 'api:terminal:send' && await handleWorkerTerminalCommand({
            type,
            payload,
            pluginId,
            requester,
            isCurrent: candidate => workers.current.get(pluginId) === candidate,
            confirm: confirmPluginTerminalAction,
            getActiveConnectionId: () => useAppStore.getState().activeConnectionId,
            dispatch: (eventType, detail) => window.dispatchEvent(new CustomEvent(eventType, { detail })),
        })) return;

        // API Implementation Bridge
        switch (type) {
            case 'api:panel:register':
                setPanels(prev => {
                    if (prev.some(p => p.id === payload.id)) return prev;
                    return [...prev, { id: payload.id, title: payload.title, html: payload.html, pluginId }];
                });
                // Also dispatch a DOM event so other components can react immediately
                window.dispatchEvent(new CustomEvent('zync:panel:register', { detail: { id: payload.id, title: payload.title, pluginId } }));
                break;
            case 'api:ui:notify': {
                const parsed = parsePluginUiNotify(pluginId, payload);
                const options = { ...parsed.options };
                // Collision-resistant host id when the plugin did not supply one.
                if (parsed.actionSpecs.length > 0 && !options.id) {
                    pluginNotifySeq += 1;
                    options.id = `plugin-notify-${pluginId}-${Date.now().toString(36)}-${pluginNotifySeq.toString(36)}`;
                }
                if (parsed.actionSpecs.length > 0) {
                    options.actions = parsed.actionSpecs.map((spec) => {
                        // Host waits for RPC before dismiss; preserve caller's dismiss intent for success.
                        const dismissOnSuccess = spec.dismiss !== false;
                        return {
                            ...spec,
                            dismiss: false,
                            onClick: () => {
                                const worker = requester;
                                if (workers.current.get(pluginId) !== worker) {
                                    notify.error('Plugin is not running', {
                                        source: `plugin:${pluginId}`,
                                    });
                                    return;
                                }
                                const notificationId = options.id;
                                const flightKey = `${pluginId}:${notificationId ?? ''}:${spec.id}`;
                                if (pluginNotifyActionsInFlight.has(flightKey)) return;
                                pluginNotifyActionsInFlight.add(flightKey);

                                const requestId = createPluginNotifyActionRequestId();
                                const wait = waitForPluginNotifyActionResult(requestId, pluginId);
                                worker.postMessage({
                                    type: 'api:ui:notify:action',
                                    payload: {
                                        requestId,
                                        pluginId,
                                        actionId: spec.id,
                                        notificationId,
                                        message: parsed.message,
                                        type: parsed.type,
                                    },
                                });
                                void wait
                                    .then((result) => {
                                        if (workers.current.get(pluginId) !== worker) return;
                                        if (!result.ok) {
                                            notify.error(result.error || 'Plugin action failed', {
                                                source: `plugin:${pluginId}`,
                                                history: true,
                                            });
                                            return;
                                        }
                                        if (dismissOnSuccess && notificationId) {
                                            useAppStore.getState().removeNotification(notificationId);
                                        }
                                    })
                                    .catch((error: unknown) => {
                                        if (workers.current.get(pluginId) !== worker) return;
                                        const message = error instanceof Error
                                            ? error.message
                                            : 'Plugin action failed';
                                        notify.error(message, {
                                            source: `plugin:${pluginId}`,
                                            history: true,
                                        });
                                    })
                                    .finally(() => {
                                        pluginNotifyActionsInFlight.delete(flightKey);
                                    });
                            },
                        };
                    });
                }
                notify.emit(parsed.type, parsed.message, options);
                break;
            }
            case 'api:ui:notify:action:response': {
                resolvePluginNotifyActionResponse(payload);
                break;
            }
            case 'api:ui:confirm':
                const confirmed = await useAppStore.getState().showConfirmDialog({
                    title: payload.title || 'Confirm',
                    message: payload.message || 'Are you sure?',
                    confirmText: payload.confirmText,
                    cancelText: payload.cancelText,
                    variant: payload.variant
                });
                respond(requester, pluginId, type, { requestId: payload.requestId, confirmed });
                break;
            case 'api:statusbar:set':
                window.dispatchEvent(new CustomEvent('zync:statusbar:set', { detail: { id: payload.id, text: payload.text } }));
                break;
            case 'api:log':
                console.log(`[Plugin Log]`, payload);
                break;
            case 'api:commands:register':
                setCommands(prev => {
                    if (prev.some(cmd => cmd.id === payload.id)) return prev;
                    return [...prev, {
                        id: payload.id,
                        title: payload.title,
                        pluginId
                    }];
                });
                break;
            case 'api:theme:set':
                console.log('[PluginContext] Theme set requested:', payload.theme);
                useAppStore.getState().updateSettings({ theme: payload.theme });
                notify.success(`Theme changed to ${payload.theme}`, { source: `plugin:${pluginId}` });
                break;
            case 'api:window:showQuickPick':
                // Dispatch event for CommandPalette to handle
                window.dispatchEvent(new CustomEvent('zync:quick-pick', {
                    detail: {
                        items: pluginId === 'com.zync.theme.manager'
                            ? filterTrustedBuiltinThemeChoices(payload.items, trustedBuiltinThemes.current)
                            : payload.items,
                        options: payload.options,
                        requestId: payload.requestId,
                        pluginId,
                        requester,
                    }
                }));
                break;
            case 'api:plugins:load':
                try {
                    const list = await ipcRenderer.invoke('plugins:load');
                    respond(requester, pluginId, 'api:plugins:load', {
                        requestId: payload.requestId,
                        result: filterUnsupportedHostThemes(list)
                    });
                } catch (e) {
                    console.error('[PluginContext] Failed to load plugins for worker:', e);
                    respond(requester, pluginId, 'api:plugins:load', {
                        requestId: payload.requestId,
                        result: [],
                        error: String(e)
                    });
                }
                break;

            // File System Bridge
            case 'api:fs:read':
                try {
                    const content = await ipcRenderer.invoke('plugin_fs_read', { path: payload.path });
                    respond(requester, pluginId, type, { requestId: payload.requestId, result: content });
                } catch (e: any) {
                    respond(requester, pluginId, type, { requestId: payload.requestId, error: e.toString() });
                }
                break;
            case 'api:fs:write':
                try {
                    await ipcRenderer.invoke('plugin_fs_write', { path: payload.path, content: payload.content });
                    respond(requester, pluginId, type, { requestId: payload.requestId, result: true });
                } catch (e: any) {
                    respond(requester, pluginId, type, { requestId: payload.requestId, error: e.toString() });
                }
                break;
            case 'api:fs:list':
                try {
                    const entries = await ipcRenderer.invoke('plugin_fs_list', { path: payload.path });
                    respond(requester, pluginId, type, { requestId: payload.requestId, result: entries });
                } catch (e: any) {
                    respond(requester, pluginId, type, { requestId: payload.requestId, error: e.toString() });
                }
                break;
            case 'api:fs:exists':
                try {
                    const exists = await ipcRenderer.invoke('plugin_fs_exists', { path: payload.path });
                    respond(requester, pluginId, type, { requestId: payload.requestId, result: exists });
                } catch (e: any) {
                    respond(requester, pluginId, type, { requestId: payload.requestId, error: e.toString() });
                }
                break;
            case 'api:fs:mkdir':
                try {
                    await ipcRenderer.invoke('plugin_fs_create_dir', { path: payload.path });
                    respond(requester, pluginId, type, { requestId: payload.requestId, result: true });
                } catch (e: any) {
                    respond(requester, pluginId, type, { requestId: payload.requestId, error: e.toString() });
                }
                break;
            case 'api:window:create':
                try {
                    await ipcRenderer.invoke('plugin_window_create', payload);
                    respond(requester, pluginId, type, { requestId: payload.requestId, result: true });
                } catch (e: any) {
                    respond(requester, pluginId, type, { requestId: payload.requestId, error: e.toString() });
                }
                break;
        }
    };

    const executeCommand = (id: string) => {
        const cmd = commands.find(c => c.id === id);
        if (!cmd) return;

        const worker = workers.current.get(cmd.pluginId);
        if (worker) {
            worker.postMessage({ type: 'command:execute', payload: { id } });
        }
    };

    // Listen for Quick Pick selections from UI
    useEffect(() => {
        const handleQuickPickSelect = (e: any) => {
            const { requestId, pluginId, selectedItem, requester = workers.current.get(pluginId) } = e.detail;
            if (!requester) return;
            postCurrentWorkerResponse(
                requester,
                (candidate: Worker) => workers.current.get(pluginId) === candidate,
                'api:window:showQuickPick',
                { requestId, result: selectedItem },
            );
        };

        window.addEventListener('zync:quick-pick-select', handleQuickPickSelect);
        return () => window.removeEventListener('zync:quick-pick-select', handleQuickPickSelect);
    }, []);

    return (
        <PluginContext.Provider value={{ plugins, editorProviders, loaded, commands, panels, executeCommand }}>
            {children}
        </PluginContext.Provider>
    );
};
