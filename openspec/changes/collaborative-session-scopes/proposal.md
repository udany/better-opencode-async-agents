## Why

The plugin currently treats `BackgroundTask` as if it were a domain task, but it is actually the registry record for an asynchronously managed agent session, its lifecycle, result, and initiating session. Its `parentSessionID` records provenance, while visibility and communication need a separate coordination boundary.

## What Changes

- Establish `AsyncAgent` as the domain direction for the managed asynchronous-agent record; retain existing storage names only as compatibility details during migration.
- Make a coordination group the unit that gathers asynchronous agents and orchestrators for visibility and communication.
- Give every group member an explicit role: `agent` or `orchestrator`. Only orchestrators create groups, add members, and end sessions.
- Keep groups private and isolated by default. An orchestrator may create multiple groups to isolate subsets of agents.
- Give creator-supplied semantic names display meaning only; use immutable technical group IDs for references and deterministic resolution.
- Require `bgagent_list` to name the group. When the group is omitted, fail with the requirement and enumerate only groups in which the caller participates.
- Preserve `bgagent_report` and other messages with sender session, agent, provenance, and literal body attribution when available.
- Automatically migrate each legacy managed-agent record into a deterministic group containing the agent and its initiating orchestrator, without inventing a semantic name chosen by the creator.
- Remove groups when they have no members; reusing a semantic name creates a new group with no prior permissions or history.
- Define persistence, restart recovery, isolation, authorization, lifecycle, concurrency, compatibility, and migration tests.

## Capabilities

### New Capabilities

- `agent-coordination-groups`: On-demand groups that coordinate `AsyncAgent` and orchestrator members, govern visibility and communication, and preserve attributed messaging.

### Modified Capabilities

- `asyncagents-task`: Reframe managed records as asynchronous agents, retain initiating-session provenance, require group-scoped listing, and preserve lifecycle/result/report compatibility.

## Impact

- Affected domain and persisted types currently named `BackgroundTask`/`PersistedTask`, with a direction toward `AsyncAgent` terminology and explicit group membership records.
- Affected `BackgroundManager`, group resolution and authorization, `bgagent_list`, `bgagent_report`, message routing, restart migration, and session lifecycle operations.
- Existing parent-child records are migrated into technical compatibility groups; `parentSessionID` remains provenance and is not renamed to ownership.
- This proposal adds no production code and does not select a cross-process manager/transport design beyond the remaining boundary question.
