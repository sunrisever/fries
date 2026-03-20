# Sample Data

This directory contains public, sanitized example files for onboarding and UI testing.

Files:

- `subscriptions.example.json`: example runtime state that can be imported from the app UI
- `snapshots/openai-snapshot.example.json`: example OpenAI snapshot record

Rules:

- Do not put real cookies, auth tokens, or personal account exports here
- Keep emails, workspaces, and notes fictional or anonymized
- Use `local/` for anything private
- Keep example data compatible with `npm run check:examples`
