## Why

The plugin currently models only a parent-child ownership link, so visibility and communication are tied to one parent session. That prevents intentional collaboration among child agents and among peer orchestrators while making broader access unsafe by default.

## What Changes

- Introduce a general collaboration scope that separates task ownership from participant visibility and communication rights.
- Allow sessions to create, join, discover, and leave explicit collaboration scopes without treating child or peer relationships as separate mechanisms.
- Keep scopes private by default and require explicit authorization before a participant can enumerate tasks or send messages through a scope.
- Define scope lifecycle, revocation, persistence, restart recovery, and behavior when tasks or sessions end.
- Extend task listing and report/message routing to operate through authorized scopes while preserving current parent-child behavior.
- Preserve sender identity and task identity on every cross-session message; never impersonate the recipient or sender.
- Add tool and data contracts for collaboration management and scoped task/message access.
- Specify isolation, authorization, revocation, persistence, concurrency, and compatibility tests.

## Capabilities

### New Capabilities

- `session-collaboration`: Explicit collaboration scopes for controlled task visibility and inter-session communication, including lifecycle, authorization, persistence, and messaging.

### Modified Capabilities

- `asyncagents-task`: Task ownership remains parent-linked, while `bgagent_list`, `bgagent_report`, task completion, and resume behavior gain authorized collaboration-scope compatibility.

## Impact

- Affected domain types and persistence records for task ownership, scope membership, permissions, and message attribution.
- Affected `BackgroundManager` discovery and routing, `bgagent_list`, `bgagent_report`, task lifecycle, restart loading, and existing tool registration.
- New collaboration tool/data surfaces will be specified without prescribing storage or transport implementation.
- Existing parent-child callers remain supported; private-by-default authorization is the compatibility and security baseline.
