# Project instructions

## Frontend approach

- This is a legacy frontend. Recover and improve as much of it as practical; the current structure is not fixed or sacred.
- Reuse existing code where it is suitable. Where architecture, components, CSS, naming, or file organization obstruct quality or development, refactor or rewrite them as needed for the task.
- Perform necessary refactoring and structural changes autonomously, and explain them in the final report. Keep changes relevant to the requested task.
- For relevant decisions, treat the existing documentation in `docs/` as the source of truth. Read the applicable documents and the root `README.md` before making those decisions. Explicit user instructions take precedence.
- Before every change, inspect the related code and consider its effects on other parts of the application.
- Keep the UI responsive, RTL, and consistent with the product design unless the task explicitly requires otherwise.

## Validation

- Before completing each task, run the relevant TypeScript checks, lint, tests, and build as far as practical. Choose validation appropriate to the change; report any failures or checks that could not be completed.
- Verify the result on localhost when applicable to the task.

## Git and communication

- Work on the current `frontend-arad` branch. Do not work on `main` unless the user requests it.
- Do not commit or push unless the user explicitly asks.
- Ask questions only when a significant ambiguity could fundamentally change the result. Otherwise, make the best technical decision and proceed.
