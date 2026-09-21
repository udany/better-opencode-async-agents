## MODIFIED Requirements

### Requirement: Task Result Retrieval

The system SHALL allow retrieval of asynchronous-agent results after completion, with managed agent records persisting according to existing retention and lifecycle rules. Active group membership controls collaborative access to those records; removing an empty group MUST NOT make its historical records available through a replacement group. The `asyncagents_output` tool provides non-blocking status and result retrieval only.

#### Scenario: Retrieve completed agent results

- **WHEN** user requests results from a completed asynchronous agent via `asyncagents_output`
- **THEN** system returns the stored result data immediately (non-blocking)
- **AND** marks result as retrieved with timestamp

#### Scenario: Check running agent status

- **WHEN** user calls `asyncagents_output` for a running asynchronous agent
- **THEN** system returns current status including progress information (non-blocking)

#### Scenario: Agent record persistence

- **WHEN** an asynchronous agent completes
- **THEN** its managed record persists according to the existing retention rules
- **AND** an active group may control collaborative access to that record without changing its provenance
- **OR** the record remains until an authorized orchestrator clears or ends the relevant session

### Requirement: Event-Based Completion Detection

The system SHALL use `session.idle` events as the primary mechanism for detecting asynchronous-agent completion, with polling as a fallback. Completion notifications SHALL preserve the initiating-session provenance and be delivered only to authorized members of the relevant coordination group.

#### Scenario: Detect completion via event

- **WHEN** a background agent session emits `session.idle` event
- **THEN** system immediately marks the corresponding asynchronous agent as completed
- **AND** sends an attributed notification to authorized group members

#### Scenario: Fallback to polling

- **WHEN** `session.idle` event is missed (e.g., during reconnection)
- **THEN** polling mechanism detects completion within fallback interval
- **AND** sends the same provenance-preserving, authorization-checked notification

### Requirement: Task List Parent Session Filtering

The system SHALL require `bgagent_list` to select a coordination group by technical group ID. The caller's `parentSessionID` relationship remains initiator provenance and MUST NOT be used as an implicit group selector. A caller without membership in the selected group MUST NOT see its asynchronous-agent records.

#### Scenario: Require a group identifier

- **WHEN** user calls `bgagent_list` without a technical group ID
- **THEN** system fails with an explanation that a group is required
- **AND** enumerates only the groups in which the current session is a member

#### Scenario: List a selected group

- **WHEN** user calls `bgagent_list` with a technical group ID for a group in which the current session participates
- **THEN** system returns only the authorized asynchronous-agent records in that group
- **AND** each record preserves its initiating-session provenance and agent identity

#### Scenario: Reject a group outside membership

- **WHEN** user calls `bgagent_list` with a technical group ID for a group in which the current session is not a member
- **THEN** system denies the request without revealing the group's agents, count, or history

### Requirement: Task History Persistence

The plugin SHALL persist managed asynchronous-agent records and active coordination-group data for history and restart recovery. Restored data SHALL preserve agent lifecycle, result, initiating-session provenance, group technical IDs, semantic names, memberships, and roles without reviving removed groups.

#### Scenario: Persist asynchronous agents and groups across restarts

- **WHEN** the plugin restarts after an asynchronous agent and its group were persisted
- **THEN** the managed agent record and active group are loaded into memory
- **AND** authorized members can resolve the same technical group ID

#### Scenario: Preserve historical agent details

- **WHEN** a caller with group membership requests a completed asynchronous agent after restart
- **THEN** the system returns the preserved lifecycle, result, provenance, and group projection

#### Scenario: Do not restore an empty group

- **WHEN** a group was removed after its last membership ended before restart
- **THEN** the group is not recreated from historical agent records
- **AND** a later group with the same semantic name has no previous permissions or history
