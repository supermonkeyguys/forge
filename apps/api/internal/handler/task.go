package handler

// TaskHandler handles project task lifecycle:
// - POST /api/projects/:id/tasks  — dispatch a new generation task
// - GET  /api/projects/:id/tasks/:taskId — get task status
// - GET  /api/projects/:id/tasks/:taskId/stream — SSE stream for real-time updates

// Task states mirror the Orchestrator state machine in the agent service:
// idle → analyzing → planning → building → validating → done | waiting | failed

// TODO: implement after DB schema is defined
