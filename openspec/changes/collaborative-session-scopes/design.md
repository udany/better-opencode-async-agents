## Context

`BackgroundTask` currently stores one `parentSessionID`, while `BackgroundManager.tasks` is the in-memory registry. `bgagent_list` derives visibility from direct parentage and `bgagent_report` routes only from child to parent. Persistence stores task metadata but no authorization or relationship data. The requested behavior needs one model for child collaboration and peer orchestrators, with explicit access control and no accidental widening of the existing private default.

The design must remain compatible with existing task ownership, completion, resume, list, and report flows. It must also account for multiple plugin instances or manager actors observing the same persisted collaboration state, without assuming that an in-memory map is the authority for authorization.

## Goals / Non-Goals

**Goals:**

- Model collaboration as an explicit scope/domain with participants, task visibility, communication permissions, and an owner or administrator distinct from task ownership.
- Use the same membership and authorization model for child agents and peer orchestrators.
- Make discovery, joining, revocation, messaging, task lifecycle, persistence, and restart recovery testable.
- Preserve sender session, sender agent, and task identity on every routed message.
- Keep existing parent-child tools working through an explicit compatibility mapping rather than a second authorization system.
- Define concurrency behavior for membership changes, task updates, and messages observed by more than one manager.

**Non-Goals:**

- Selecting a database, transport, locking technology, or cross-process protocol before the lead confirms the operational boundary.
- Making all tasks globally discoverable or introducing public collaboration rooms.
- Replacing task ownership, parent-session traceability, completion state, resume semantics, or existing tool names.
- Allowing collaboration membership to grant unrestricted control over tasks; visibility, messaging, and task-control rights remain separate.

## Decisions

### 1. Separate ownership from collaboration membership

The task keeps its owner/parent relationship for lifecycle and accountability. A collaboration scope contains a stable scope identity, participants, membership state, and permission grants. A participant's ability to see a task or send a message is evaluated from scope membership, not inferred from task ownership.

Alternative considered: replace `parentSessionID` with a list of collaborators. Rejected because it conflates lifecycle ownership with access control and makes existing completion/resume behavior ambiguous.

### 2. Use session identity as the participant principal

Participants are identified by session identity, with agent/task metadata attached when available. The model must support a parent, child, and peer orchestrator as the same principal kind; their relationship is metadata, not a different authorization path.

Alternative considered: authorize by agent name or task ID. Rejected because names are not unique and task IDs do not identify the receiving session.

### 3. Grant capabilities independently

Membership grants are represented as separate capabilities for discovery/listing, reading task details, sending messages, and task control. Scope administration (invite/join/revoke) is distinct from ordinary participation. The default for a new scope is private and no session can enumerate or contact it without an explicit grant or invitation accepted through the defined join flow.

Alternative considered: one boolean `shared` flag. Rejected because it cannot express controlled visibility without also granting communication or control.

### 4. Route messages as attributed envelopes

Cross-session messages carry the sender session, sender agent when known, sender task when known, target scope, and original body. The receiver sees that envelope and the original text; the router never rewrites the author as the parent or another participant. `bgagent_report` becomes a compatibility surface over the same routing contract.

Alternative considered: prefixing plain text only. Rejected because text markers are not sufficient for authorization, structured inspection, or reliable attribution.

### 5. Treat persisted collaboration state as authoritative for recovery

Scope definitions, membership state, grants, and message delivery metadata needed for recovery are persisted alongside task metadata. On restart, managers reload active scopes and reconcile stale sessions without silently restoring revoked access. In-memory indexes remain caches and must not be the only source for an authorization decision.

Alternative considered: derive scopes from the current `tasks` map after restart. Rejected because it loses peer membership and cannot represent a scope that temporarily has no active task.

### 6. Define atomic membership transitions

Join, revoke, and permission changes are serialized per scope and carry a monotonic revision or equivalent conflict check. A message or listing evaluates membership at a defined read point; revocation prevents subsequent access and does not retroactively erase an already delivered message. Concurrent operations must return a deterministic conflict or current-state result rather than last-write-wins silently.

Alternative considered: unversioned read-modify-write updates. Rejected because concurrent peer orchestrators could overwrite grants or resurrect revoked members.

## Risks / Trade-offs

- [Risk] Persisted scope state can outlive a session or task. → Mitigation: define explicit inactive-member and empty-scope lifecycle rules, and test restart plus cleanup behavior.
- [Risk] Compatibility with current parent-only tools may accidentally widen visibility. → Mitigation: require an explicit compatibility mapping and authorization tests proving unrelated sessions remain isolated.
- [Risk] Cross-manager concurrency may expose stale listings. → Mitigation: specify scope revisions, atomic updates, and read-point semantics before implementation.
- [Risk] Message retention can expose sensitive reports after membership changes. → Mitigation: distinguish delivery from historical access and require a lead decision on retention and redaction.
- [Risk] A peer orchestrator may be mistaken for a task owner. → Mitigation: preserve sender and owner fields separately in every data contract and scenario.

## Migration Plan

1. Add the collaboration data contract and persistence representation without changing existing task ownership fields.
2. Establish the compatibility mapping for current parent-child listing, reporting, completion notification, and resume flows.
3. Add scope authorization and management surfaces, then route new collaboration messages through the attributed envelope.
4. Backfill or lazily materialize compatibility scope state for existing persisted tasks, according to the lead's decision on empty and historical scopes.
5. Roll back by disabling new scope surfaces while retaining legacy task records; do not delete membership or message data until migration and retention policy are confirmed.

## Open Questions

- Does every launch create a persisted private compatibility scope automatically, or should legacy parent-child access be represented as a derived membership until a scope is explicitly created?
- Which session is allowed to create a scope, invite participants, change grants, and revoke membership: task owner, current scope administrator, or both?
- How does a peer orchestrator prove its invitation or join token across plugin instances, and what is the token expiry/replay policy?
- Should a revoked participant retain access to messages already delivered, historical task details, or neither?
- What is the lifecycle of a scope with no active participants or tasks, and how long should its audit/message metadata persist?
- Are task-control operations (cancel, steer, resume, clear) ever grantable through a scope, or are scopes limited to discovery, read, and messaging in the first version?
- Must collaboration be limited to one plugin process, or must the first implementation coordinate across independent manager instances?
- Should `bgagent_list` default to the caller's direct compatibility scope, require an explicit scope argument, or support both with an unambiguous private default?
