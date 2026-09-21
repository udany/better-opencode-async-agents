## Purpose

Define private, on-demand coordination groups for managed asynchronous agents and orchestrators, with explicit roles, isolated visibility, governed communication, deterministic identification, and preserved message authorship.

## ADDED Requirements

### Requirement: AsyncAgent Managed Record

The system SHALL model the managed asynchronous agent as an `AsyncAgent` record containing its session, agent identity, lifecycle, result, and initiating-session provenance. The existing `parentSessionID` value SHALL mean the session that initiated the agent and MUST NOT be treated as agent ownership.

#### Scenario: Record an initiated asynchronous agent

- **WHEN** an orchestrator initiates an asynchronous agent
- **THEN** the system records the agent session and lifecycle as one `AsyncAgent`
- **AND** records the initiator session as provenance
- **AND** does not transfer ownership of the orchestrator session or invent a task owner

#### Scenario: Preserve provenance in a message

- **WHEN** an asynchronous agent sends a report or message
- **THEN** the routed data includes the agent session and its initiating session when available
- **AND** provenance is not presented as message authorship

### Requirement: Coordination Group Identity

The system SHALL use a coordination group as the unit of collaboration. A group SHALL have an immutable technical ID, a creator-supplied arbitrary semantic display name, memberships, and lifecycle state. The semantic name MUST NOT be required to be globally unique and MUST NOT be used as an authorization selector.

#### Scenario: Create a named group

- **WHEN** an orchestrator creates a group with a semantic name
- **THEN** the system assigns a new immutable technical group ID
- **AND** preserves the supplied name for display
- **AND** does not claim that the system or a migrated record chose the semantic name

#### Scenario: Resolve an explicit group

- **WHEN** a tool receives a technical group ID
- **THEN** the system resolves that exact group ID
- **AND** it does not substitute another group with the same semantic name

#### Scenario: Reject ambiguous name selection

- **WHEN** a caller attempts to select a group only by a semantic name that matches multiple groups
- **THEN** the system rejects the selection as ambiguous
- **AND** requires the technical group ID

### Requirement: Governed Group Roles

Each group membership SHALL have exactly one role, `agent` or `orchestrator`. Only an `orchestrator` member SHALL create groups, add members, change membership, and end member sessions. An `agent` member SHALL have no group-governance or session-ending authority.

#### Scenario: Allow orchestrator governance

- **WHEN** an orchestrator member creates a group or adds a member
- **THEN** the operation succeeds under the group's authorization rules
- **AND** the new membership records the selected role explicitly

#### Scenario: Deny agent governance

- **WHEN** an agent member attempts to create a group, add a member, or end a session
- **THEN** the operation is denied
- **AND** group membership and session lifecycle remain unchanged

#### Scenario: Use multiple groups for isolation

- **WHEN** one orchestrator creates multiple groups
- **THEN** each group receives a distinct technical ID and membership set
- **AND** membership in one group does not grant visibility into another

### Requirement: Private Group Isolation

Groups SHALL be private by default. Members of the same group SHALL receive only the visibility and communication allowed by that group; agents and orchestrators in different groups MUST NOT enumerate, inspect, or contact one another through a group they do not belong to.

#### Scenario: Isolate different groups

- **WHEN** an agent belongs to group A and another agent belongs only to group B
- **THEN** the agent in A cannot list, inspect, or message the agent in B through group coordination
- **AND** no group B task or member identifier is disclosed

#### Scenario: Communicate within one group

- **WHEN** two members belong to the same group and the group allows their communication
- **THEN** a message may be delivered between them
- **AND** the delivery remains scoped to that group

### Requirement: Group Membership Lifecycle

The system SHALL support orchestrator-controlled creation, addition, removal, and session ending for group memberships. Removing the last membership SHALL remove the active group. A later group created with the same semantic name SHALL receive a new technical ID and MUST NOT regain prior members, permissions, messages, or history.

#### Scenario: Add and remove a member

- **WHEN** an orchestrator adds an agent or orchestrator to a group
- **THEN** the member receives the explicitly assigned role and group access
- **AND** when the orchestrator removes that membership, subsequent group access is denied

#### Scenario: Remove an empty group

- **WHEN** the last membership is removed from a group
- **THEN** the active group is deleted
- **AND** its technical ID is not reused

#### Scenario: Reuse a semantic name

- **WHEN** an orchestrator later creates a group with the same semantic name
- **THEN** the system creates a new technical group ID
- **AND** no permissions or history from the removed group are active in the new group

### Requirement: Deterministic Legacy Group Migration

The system SHALL migrate each legacy managed-agent record into a group containing the recorded asynchronous agent with role `agent` and its initiating `parentSessionID` with role `orchestrator`. The migrated technical group ID SHALL be deterministic from stable legacy identifiers, and migration MUST distinguish that technical identity from a semantic name chosen by a creator.

#### Scenario: Migrate a complete legacy record

- **WHEN** the system loads a legacy record with agent session ID and `parentSessionID`
- **THEN** it creates or finds the same deterministic migrated group on every recovery
- **AND** the group contains exactly the corresponding agent and initiating orchestrator memberships
- **AND** the generated display label is marked as migration-generated rather than creator-chosen

#### Scenario: Do not widen legacy visibility

- **WHEN** two legacy records share an initiator but were stored separately
- **THEN** migration does not combine them unless a deterministic migration rule explicitly identifies the same group
- **AND** one migrated agent cannot see the other solely because their initiator matches

#### Scenario: Quarantine incomplete legacy provenance

- **WHEN** a legacy record lacks the stable identifier required to identify its initiating orchestrator
- **THEN** migration records an explicit incomplete-migration outcome
- **AND** it does not invent an orchestrator or grant group access

### Requirement: Group-Required Agent Listing

The system SHALL require `bgagent_list` to receive a technical group ID. If the group ID is omitted, the tool MUST fail with an explanation that a group is required and enumerate only the groups in which the calling session is a member.

#### Scenario: List one selected group

- **WHEN** a caller supplies a technical group ID for a group in which it is a member
- **THEN** `bgagent_list` returns only the authorized `AsyncAgent` records from that group
- **AND** each record retains its initiating-session provenance and agent identity

#### Scenario: Explain an omitted group

- **WHEN** a caller omits the group ID from `bgagent_list`
- **THEN** the tool fails and explains that a group ID is required
- **AND** the response enumerates only the caller's group technical IDs and semantic names
- **AND** it does not enumerate groups or agents outside the caller's memberships

#### Scenario: Reject an unauthorized group

- **WHEN** a caller supplies a technical group ID for a group in which it is not a member
- **THEN** `bgagent_list` denies the request without revealing that group's agents, history, or count

### Requirement: Attributed Agent Messaging

The system SHALL route `bgagent_report` and other group messages only through authorized group membership. Every delivered message SHALL preserve the sender's session, agent identity when available, initiating-session provenance when available, group ID, and literal body. The recipient MUST be able to identify the sender as another agent or orchestrator rather than as the recipient or its parent.

#### Scenario: Preserve an agent report

- **WHEN** an authorized asynchronous agent sends `bgagent_report`
- **THEN** the recipient receives sender session, agent identity, and initiating provenance when available
- **AND** the report body is preserved literally, including line breaks and punctuation

#### Scenario: Preserve peer orchestrator authorship

- **WHEN** an authorized orchestrator sends a message to another orchestrator in the same group
- **THEN** the recipient sees the sending orchestrator's session identity
- **AND** the message is not labeled as if it came from an agent or parent unless that is true

#### Scenario: Preserve attribution through a relay

- **WHEN** a manager relays a message between group members
- **THEN** the original sender and provenance fields remain unchanged
- **AND** the manager is not substituted as the author

### Requirement: Group Persistence and Recovery

The system SHALL persist active group IDs, semantic names, memberships, roles, lifecycle state, and message-attribution metadata required for recovery. Restart SHALL restore active groups and revoked membership state without reviving removed groups or permissions.

#### Scenario: Restore a group

- **WHEN** the plugin restarts with an active group
- **THEN** the same technical ID, semantic name, roles, and membership set are available
- **AND** authorized members can resolve the group by technical ID

#### Scenario: Preserve revocation

- **WHEN** a member was removed before restart
- **THEN** that member remains unable to list or message through the group after restart

#### Scenario: Do not restore an empty group

- **WHEN** a group had no members before restart
- **THEN** the active group is absent after recovery
- **AND** a later group with the same name is a new technical group

### Requirement: Agent Lifecycle Compatibility

The system SHALL preserve asynchronous-agent creation, completion, error, cancellation, result retrieval, resume, and report behavior while treating `parentSessionID` as initiator provenance. Group membership SHALL not transfer or invent lifecycle control for ordinary `agent` members; only authorized orchestrators may end sessions.

#### Scenario: Complete an agent in a group

- **WHEN** an asynchronous agent completes
- **THEN** its lifecycle and result are updated as before
- **AND** authorized group members may receive the allowed notification projection
- **AND** its initiating-session provenance remains unchanged

#### Scenario: Preserve result retrieval and resume

- **WHEN** an authorized existing flow retrieves or resumes an asynchronous agent
- **THEN** the existing lifecycle and result semantics remain available
- **AND** group membership does not change the initiating-session provenance

#### Scenario: Deny ordinary agent session control

- **WHEN** an `agent` member attempts to cancel, clear, steer, resume, or end another member's session through group coordination
- **THEN** the operation is denied
- **AND** the managed agent lifecycle is unchanged

### Requirement: Group Coordination Verification

The implementation SHALL include tests for role governance, group isolation, deterministic name and ID resolution, legacy migration, empty-group deletion, authorization, literal attribution, restart recovery, concurrency boundaries, and compatibility with existing asynchronous-agent tools.

#### Scenario: Verify isolation and omitted listing

- **WHEN** members of separate groups list and message through the coordination surfaces
- **THEN** each member sees only its own groups
- **AND** omitting the `bgagent_list` group ID fails with only the caller's group enumeration

#### Scenario: Verify migration determinism

- **WHEN** the same legacy record is migrated more than once
- **THEN** it resolves to the same technical group ID and memberships
- **AND** no semantic creator-selected name is inferred

#### Scenario: Verify revocation and empty deletion

- **WHEN** an orchestrator removes members concurrently with message or list requests
- **THEN** the implementation applies a defined authorization read point
- **AND** after the group becomes empty no old permissions or history are available through a reused name
