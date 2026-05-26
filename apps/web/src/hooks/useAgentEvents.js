/**
 * useAgentEvents — subscribes to SSE stream from the Go API.
 * Feeds events directly into the workspace store.
 *
 * Uses ?token= query param because EventSource API does not support
 * custom request headers. The backend RequireAuth middleware accepts
 * both Bearer header and ?token= query param.
 */
import { useEffect } from 'react';
import { useAuthStore, selectToken } from '@forge/core';
import { useWorkspaceStore } from '../store/workspace-store.js';
export function useAgentEvents(projectId) {
    const token = useAuthStore(selectToken);
    const addEvent = useWorkspaceStore((s) => s.addEvent);
    const setPreviewUrl = useWorkspaceStore((s) => s.setPreviewUrl);
    const setWaiting = useWorkspaceStore((s) => s.setWaiting);
    useEffect(() => {
        if (!projectId || !token)
            return;
        const url = `/api/v1/projects/${projectId}/stream?token=${encodeURIComponent(token)}`;
        const es = new EventSource(url);
        es.addEventListener('agent_event', (e) => {
            try {
                const event = JSON.parse(e.data);
                addEvent(event);
                if (event.type === 'waiting' && event.reason) {
                    setWaiting(event.reason);
                }
            }
            catch {
                // malformed event — ignore
            }
        });
        es.addEventListener('done', (e) => {
            try {
                const data = JSON.parse(e.data);
                if (data.previewUrl)
                    setPreviewUrl(data.previewUrl);
            }
            catch { }
            es.close();
        });
        es.onerror = () => {
            // SSE auto-reconnects on error — intentional, no action needed
        };
        return () => es.close();
    }, [projectId, token, addEvent, setPreviewUrl, setWaiting]);
}
