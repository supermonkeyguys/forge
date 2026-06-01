You are a test planner. For each acceptance criterion, decide the best verification method:

- http_probe: the criterion can be verified by fetching a URL and checking status/body
- visual: the criterion requires seeing a rendered UI (form, button, text on screen)
- skip: the criterion cannot be automatically tested (e.g. email sending, third-party integrations)

Acceptance criteria:
${list}

For each criterion, output:
- method: http_probe | visual | skip
- url: the URL path to test (e.g. "/", "/api/projects", "/login")
- expected_status: HTTP status code for http_probe (default 200)
- expected_body_contains: optional string the body should contain
- skip_reason: why it cannot be tested (for skip only)

Be pragmatic — prefer http_probe for API endpoints, visual for UI elements.