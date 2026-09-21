## Context

The current `BackgroundTask` record represents an asynchronously managed agent session, not a user-domain task. It carries the managed session's lifecycle, result, agent configuration, and `parentSessionID`. That parent field identifies the session that initiated the agent and is provenance; it does not establish ownership of the agent or its messages.

The collaboration boundary is therefore a coordination group. A group contains asynchronous-agent and orchestrator memberships. Members of one group can see and communicate according to that group's policy; members of different groups are isolated. An orchestrator may create multiple groups, allowing separate subsets of agents to coordinate without sharing visibility.

## Goals / Non-Goals

**Goals:**

- Establish `AsyncAgent` as the domain name for the managed asynchronous-agent record while retaining current storage identifiers until migration is implemented.
- Define a group as the sole coordination boundary for visibility and communication.
- Represent membership with an explicit `agent` or `orchestrator` role without creating a separate participant domain entity.
- Make orchestrator governance explicit: only orchestrators create groups, add members, and end sessions.
- Preserve literal message bodies and available sender session, agent, and provenance identity.
- Make semantic group names useful for display while making technical IDs mandatory for unambiguous references.
- Migrate legacy records deterministically and preserve private parent-child compatibility through migrated groups.

**Non-Goals:**

- Treating an asynchronous agent as a task with task ownership; `parentSessionID` remains initiator provenance.
- Granting ordinary `agent` members cancellation, steering, clearing, resume, group administration, or session-ending authority.
- Introducing a standalone participant entity or a second collaboration model for peer orchestrators.
- Making semantic group names globally unique, globally discoverable, or sufficient as a selector.
- Choosing the database, cross-process transport, or manager-discovery protocol before the remaining boundary decision is confirmed.

## Decisions

### 1. Use `AsyncAgent` for the managed record

The domain record is an `AsyncAgent`: a managed asynchronous agent session with lifecycle, result, and initiator provenance. Existing `BackgroundTask` and `PersistedTask` names are compatibility names for the implementation migration, not domain concepts. `parentSessionID` is retained as `initiatorSessionID` directionally and is never interpreted as ownership.

Alternative considered: keep task terminology and add collaborators around it. Rejected because it makes agent lifecycle and result records look like user work items and invites incorrect ownership rules.

### 2. Make the coordination group the only collaboration boundary

Groups hold membership records for asynchronous agents and orchestrators. Group membership, not parentage or agent name, determines visibility and communication. A peer orchestrator and a child agent use the same membership and routing model; their role and provenance metadata explain the relationship without changing the boundary.

Alternative considered: infer collaboration from shared parent sessions. Rejected because it cannot isolate subsets of agents or coordinate peer orchestrators from different initiating sessions.

### 3. Govern groups through explicit roles

Each membership has exactly one role: `orchestrator` or `agent`. Only an orchestrator may create a group, add a member, change group membership, and end a member session. `agent` members may use the group's allowed visibility and communication surfaces but receive no group or session-control authority.

Alternative considered: grant control capabilities independently to any member. Rejected for this proposal because group governance belongs to orchestrators; ordinary agent control would recreate the discarded task-ownership model.

### 4. Separate semantic names from technical references

The creator supplies an arbitrary semantic group name for display. The system generates an immutable technical group ID. All mutating and listing operations require the technical ID; a semantic name is never a selector. Where a human-facing resolver is useful, it may return a caller's own groups for explicit selection, but it must reject name-based ambiguity rather than choose a group.

Alternative considered: globally unique names or most-recent-name resolution. Rejected because arbitrary creator names must remain valid and neither global uniqueness nor recency is a safe authorization boundary.

### 5. Require a group for `bgagent_list`

`bgagent_list` accepts a technical group ID and lists only that group. Omitting the ID is an intentional error that explains the requirement and enumerates only the groups in which the caller has membership, including each technical ID and display name when available. The omitted-group response reveals no groups outside the caller's memberships.

Alternative considered: default to the caller's parent or most recent group. Rejected because implicit selection is ambiguous and would hide the coordination boundary from callers.

### 6. Preserve attribution through an envelope

Every routed report or message carries sender session ID, sender agent ID/name when available, initiating-session provenance when available, group ID, and the original body. The recipient sees that the sender is another asynchronous agent or orchestrator; routing never rewrites authorship as the parent, group creator, or relay manager. `bgagent_report` remains a compatibility child-to-initiator surface over the same attributed message contract.

Alternative considered: prefixing the body with a textual marker only. Rejected because it cannot reliably preserve structured identity or support authorization.

### 7. Migrate legacy records into deterministic technical groups

Each legacy persisted managed-agent record is migrated into one group whose members are the recorded agent session with role `agent` and its recorded `parentSessionID` with role `orchestrator`. The technical ID is deterministic from stable legacy identifiers, for example `legacy:<digest(parentSessionID + ":" + agentSessionID)>`. The migration may expose a generated technical label such as `Migrated <agentSessionID>` for display, but it MUST state that no semantic name was chosen by the original creator.

Alternative considered: group all legacy agents by parent or synthesize a semantic name from the parent. Rejected because it can widen visibility between records that were never intentionally grouped and falsely implies creator intent.

### 8. Make groups on-demand and non-revivable

When the last group membership is removed, the group is deleted as an active coordination object. Reusing its semantic name creates a new technical group ID with no inherited members, permissions, messages, or history. Technical IDs are never recycled.

Alternative considered: retain an empty group and reactivate it by name. Rejected because it can resurrect old authorization and historical context.

## Risks / Trade-offs

- [Risk] A legacy record may have incomplete initiator metadata. → Mitigation: migration must record an explicit migration error/quarantine outcome rather than invent an orchestrator identity.
- [Risk] A caller may confuse a display name with a group selector. → Mitigation: require technical IDs in tools and show the distinction in omitted-group errors.
- [Risk] Ending a session can race with message delivery or member removal. → Mitigation: define a per-group revision/read point and test the boundary explicitly.
- [Risk] Independent managers may observe stale group membership. → Mitigation: persist revisions and make cross-manager consistency the remaining operational question.
- [Risk] Renaming all implementation types in one release could break persisted data and APIs. → Mitigation: introduce `AsyncAgent` terminology directionally and retain explicit compatibility decoding during migration.

## Migration Plan

1. Define the `AsyncAgent` and group/membership/message contracts while retaining current persisted field names for decoding.
2. Migrate every legacy managed-agent record to its deterministic technical group with one `agent` member and one initiating `orchestrator` member; quarantine records that cannot identify the initiator.
3. Route visibility, `bgagent_report`, and new messages through group membership and role authorization.
4. Make `bgagent_list` group-required and provide the caller-only group enumeration error for omitted IDs.
5. Remove empty groups and ensure a reused semantic name creates a new technical ID.
6. Roll back by retaining legacy record decoding and disabling new group mutations; never restore deleted group permissions or history from a reused name.

## Open Questions

- Must groups coordinate across independent plugin processes/managers, or is one manager/storage authority the first supported boundary? This determines the required cross-process consistency and message delivery mechanism.
- If cross-process coordination is required, which existing authenticated channel may carry group membership revisions and attributed messages?
