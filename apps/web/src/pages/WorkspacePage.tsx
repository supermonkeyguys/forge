/**
 * Main workspace — three-column layout:
 *
 * [Conversation + History] | [Agent Collaboration Flow] | [App Preview]
 *
 * This is the core UI where users:
 * 1. Describe their app
 * 2. Review PM Agent's amplified requirements
 * 3. Watch agents collaborate in real-time
 * 4. Preview the generated app
 * 5. Iterate with natural language
 */

export function WorkspacePage() {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "320px 1fr 480px", height: "100vh" }}>
      {/* Left: Conversation */}
      <aside>
        <ConversationPanel />
      </aside>

      {/* Center: Agent collaboration visualizer */}
      <main>
        <AgentFlowPanel />
      </main>

      {/* Right: Live preview */}
      <aside>
        <PreviewPanel />
      </aside>
    </div>
  );
}

// --- Sub-panels (stubs, implemented in Phase 1+) ---

function ConversationPanel() {
  return (
    <div>
      <h2>Forge</h2>
      {/* TODO: requirement input, PM review UI, iteration history */}
      <p>Describe what you want to build...</p>
    </div>
  );
}

function AgentFlowPanel() {
  return (
    <div>
      {/* TODO: real-time agent status cards, decisions, file changes */}
      <p>Agent collaboration will appear here</p>
    </div>
  );
}

function PreviewPanel() {
  return (
    <div>
      {/* TODO: iframe pointing to E2B sandbox preview URL */}
      <p>App preview will appear here</p>
    </div>
  );
}
