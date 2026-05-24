/**
 * useAgentStream — subscribes to SSE events from the Go API
 * which proxies real-time progress from the Agent Service.
 *
 * Events mirror ProgressEvent in apps/agent/src/agents/types.ts
 */

import { useEffect, useState } from "react";

export type AgentEvent =
  | { type: "agent_start"; agent: string; message: string }
  | { type: "agent_thinking"; agent: string; content: string }
  | { type: "agent_tool_use"; agent: string; tool: string }
  | { type: "agent_file_write"; agent: string; file: string }
  | { type: "agent_done"; agent: string; summary: string }
  | { type: "agent_error"; agent: string; error: string }
  | { type: "state_change"; state: string }
  | { type: "waiting"; reason: string };

export function useAgentStream(taskId: string | null) {
  const [events, setEvents] = useState<AgentEvent[]>([]);
  const [state, setState] = useState<string>("idle");

  useEffect(() => {
    if (!taskId) return;

    const es = new EventSource(`/api/tasks/${taskId}/stream`);

    es.onmessage = (e) => {
      const event = JSON.parse(e.data) as AgentEvent;
      setEvents((prev) => [...prev, event]);
      if (event.type === "state_change") setState(event.state);
    };

    return () => es.close();
  }, [taskId]);

  return { events, state };
}
