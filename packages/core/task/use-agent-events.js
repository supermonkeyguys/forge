/**
 * useAgentEvents — subscribes to SSE stream from Go API.
 * Returns a live list of AgentEvent as the generation progresses.
 */
import { useEffect, useRef, useState } from 'react';
import { useAuthStore, selectToken } from '../auth/auth-store.js';
export function useAgentEvents(projectId) {
    const token = useAuthStore(selectToken);
    const [events, setEvents] = useState([]);
    const [status, setStatus] = useState('idle');
    const [previewUrl, setPreviewUrl] = useState(null);
    const [isConnected, setIsConnected] = useState(false);
    const esRef = useRef(null);
    useEffect(() => {
        if (!projectId || !token)
            return;
        const url = `/api/v1/projects/${projectId}/stream?token=${token}`;
        const es = new EventSource(url);
        esRef.current = es;
        es.onopen = () => setIsConnected(true);
        es.addEventListener('agent_event', (e) => {
            const event = JSON.parse(e.data);
            setEvents((prev) => [...prev, event]);
            if (event.type === 'state_change' && event.state) {
                setStatus(event.state);
            }
        });
        es.addEventListener('done', (e) => {
            const data = JSON.parse(e.data);
            setPreviewUrl(data.previewUrl);
            setStatus('done');
            es.close();
            setIsConnected(false);
        });
        es.onerror = () => {
            setIsConnected(false);
            es.close();
        };
        return () => {
            es.close();
            esRef.current = null;
        };
    }, [projectId, token]);
    return { events, status, previewUrl, isConnected };
}
