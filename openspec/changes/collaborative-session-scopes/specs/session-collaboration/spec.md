## Purpose

Define explicit, private-by-default collaboration scopes that control which sessions can discover tasks and communicate while keeping task ownership and message authorship distinct.

## ADDED Requirements

### Requirement: Collaboration Scope Model

The system SHALL represent collaboration as a scope with a stable identifier, an administrator or owner, participant memberships, independent visibility and communication grants, lifecycle state, and a revision suitable for conflict detection. Task ownership SHALL remain separate from scope membership.

#### Scenario: Create a private scope

- **WHEN** an authorized session creates a collaboration scope
- **THEN** the system creates a stable scope record with that session as an administrator
- **AND** the scope starts private with no implicit unrelated participants
- **AND** the creator's task ownership is not changed by scope creation

#### Scenario: Represent child and peer participants uniformly

- **WHEN** a child session or a peer orchestrator joins a scope
- **THEN** the system records both as the same participant principal type
- **AND** relationship metadata may identify task or orchestration context without changing authorization semantics

### Requirement: Explicit Membership and Authorization

The system SHALL require explicit membership and capability grants for scope discovery, task visibility, message sending, and scope administration. A session without a valid grant MUST NOT enumerate the scope, its tasks, or contact its participants. New scopes and memberships SHALL be private by default.

#### Scenario: Deny an unrelated listing

- **WHEN** a session with no membership requests tasks in a scope
- **THEN** the system denies the request
- **AND** it does not reveal the scope's existence, members, or task identifiers

#### Scenario: Allow separately granted visibility and messaging

- **WHEN** a participant has task-visibility permission but no message-sending permission
- **THEN** the participant can discover only the authorized task projection
- **AND** a message attempt is denied without exposing another participant's details

#### Scenario: Deny unauthorized contact

- **WHEN** a session without a valid communication grant attempts to send a message to a scope participant
- **THEN** the system rejects the message
- **AND** no delivery occurs

### Requirement: Scope Membership Lifecycle

The system SHALL support explicit invitation or join, acceptance where required, permission changes, revocation, and participant departure. Membership transitions SHALL be authorized, serialized per scope, and observable through a revision or equivalent conflict result.

#### Scenario: Accept an explicit invitation

- **WHEN** an invited session accepts a valid invitation
- **THEN** the system creates the membership with only the granted capabilities
- **AND** the membership becomes usable at a new scope revision

#### Scenario: Reject an unauthorized join

- **WHEN** a session attempts to join without an invitation or other explicit authorization
- **THEN** the system rejects the join
- **AND** the scope remains unchanged

#### Scenario: Revoke a participant

- **WHEN** an authorized administrator revokes a participant
- **THEN** subsequent discovery, task reads, and messages use the revoked state and are denied
- **AND** the scope revision advances
- **AND** already delivered messages are not rewritten

#### Scenario: Resolve a concurrent membership update

- **WHEN** two actors submit conflicting membership changes against the same scope revision
- **THEN** one change is applied
- **AND** the other receives a deterministic conflict or current-state response
- **AND** the losing request does not silently overwrite the applied grants

### Requirement: Authorized Task Discovery

The system SHALL provide a scope-aware task projection that returns only tasks visible to the requesting participant. Task owners SHALL remain identifiable, and a scope listing MUST NOT imply that the requester owns or controls the listed tasks.

#### Scenario: List authorized tasks from a child collaboration

- **WHEN** a child participant requests a scope task list with visibility permission
- **THEN** the response contains only tasks authorized by that scope
- **AND** each task preserves its owner and parent session identity

#### Scenario: List tasks from a peer orchestrator

- **WHEN** a peer orchestrator with visibility permission requests the shared scope
- **THEN** it sees the same authorized task set as other participants at the same read point
- **AND** the tasks remain owned by their original sessions

#### Scenario: Hide tasks outside the scope

- **WHEN** a participant lists a scope
- **THEN** tasks not associated with that scope or not granted to that participant are absent
- **AND** unrelated task identifiers are not disclosed through counts or errors

### Requirement: Attributed Inter-Session Messaging

The system SHALL route messages only between authorized participants and SHALL preserve the sender session, sender agent when available, sender task when available, target scope, and original message body. The receiver MUST be able to distinguish a message from another background agent from a message authored by the receiver or its parent.

#### Scenario: Deliver an authorized child report

- **WHEN** a child participant sends a report through a scope with communication permission
- **THEN** the recipient receives an attributed message identifying the child session and task
- **AND** the original report body is preserved literally

#### Scenario: Deliver a peer orchestrator message

- **WHEN** one authorized orchestrator sends a message to another through a shared scope
- **THEN** the recipient receives the sending orchestrator's session identity and available agent identity
- **AND** the message is not labeled as if it came from a child or parent unless that is the actual sender relationship

#### Scenario: Preserve attribution when relaying

- **WHEN** a message is relayed through a manager different from the sender's manager
- **THEN** the original sender and task fields remain unchanged
- **AND** the relay does not replace authorship with its own session identity

### Requirement: Scope Lifecycle and Task Lifecycle

The system SHALL define behavior when a participant, task, or session ends without transferring task ownership implicitly. Scope membership SHALL be independently revocable, and task completion, cancellation, clearing, and resumption SHALL remain compatible with authorized scope visibility and messaging.

#### Scenario: Complete a visible task

- **WHEN** a task visible to a scope completes
- **THEN** authorized participants may receive the completion projection or notification allowed by their grants
- **AND** the task's owner and completion state remain unchanged

#### Scenario: Resume a visible task

- **WHEN** an authorized participant requests a supported resume operation
- **THEN** the system applies the existing resume authorization and lifecycle rules
- **AND** scope visibility does not by itself transfer task ownership

#### Scenario: End a participant session

- **WHEN** a participant session ends or becomes unavailable
- **THEN** its membership enters the defined inactive state or is removed according to scope policy
- **AND** other participants' grants and task ownership are not implicitly changed

### Requirement: Scope Persistence and Restart Recovery

The system SHALL persist scope definitions, membership state, grants, revisions, and the metadata required to preserve message attribution and authorization across plugin restarts. Restored in-memory indexes MUST reflect persisted revocations and MUST NOT grant access solely because a task is present in memory.

#### Scenario: Restore an active scope

- **WHEN** the plugin restarts with a persisted active scope
- **THEN** the scope and its memberships are available after recovery
- **AND** authorized participants retain only their persisted capabilities

#### Scenario: Preserve revocation across restart

- **WHEN** a participant was revoked before restart
- **THEN** the participant remains unable to enumerate, read, or message through that scope after recovery

#### Scenario: Recover a scope with no current tasks

- **WHEN** a persisted scope has participants but no active tasks after restart
- **THEN** the system follows the scope retention policy without deleting the scope or granting unrelated task access

### Requirement: Compatibility with Existing Tools

The system SHALL preserve `bgagent_report`, `bgagent_list`, task completion notifications, cancellation, clearing, and resume behavior. Existing parent-child callers SHALL continue to work through the same explicit collaboration authorization model, and adding a scope MUST NOT make unrelated sessions visible.

#### Scenario: Preserve parent-child report behavior

- **WHEN** an existing child calls `bgagent_report` using the supported parent-child setup
- **THEN** the report reaches the authorized parent
- **AND** the delivered content includes sender/task attribution without losing the original report

#### Scenario: Preserve private list behavior

- **WHEN** an existing parent calls `bgagent_list` without requesting broader collaboration
- **THEN** it sees its authorized child tasks using the existing task projection
- **AND** it does not see tasks belonging to unrelated parents

#### Scenario: Preserve cancellation and clearing boundaries

- **WHEN** a participant without task-control permission attempts cancellation or clearing through a collaboration scope
- **THEN** the operation is denied
- **AND** the task remains controlled by its owner and existing lifecycle rules

### Requirement: Collaboration Tool and Data Surfaces

The system SHALL expose typed surfaces sufficient to create or discover an authorized scope, invite or join participants, change or revoke grants, list authorized tasks, and send attributed messages. Surface names and transport MAY follow existing plugin conventions, but each operation MUST return authorization failures without leaking private scope data.

#### Scenario: Inspect a scope through a typed surface

- **WHEN** an authorized participant requests scope metadata
- **THEN** the response includes the scope identifier, membership state, granted capabilities, and revision
- **AND** it excludes private members or tasks not authorized for that participant

#### Scenario: Use an unauthorized surface

- **WHEN** an unlinked session invokes any collaboration discovery or messaging surface
- **THEN** the surface returns a typed authorization failure
- **AND** it does not return a distinguishable not-found reason that reveals private scope existence

### Requirement: Collaboration Isolation and Concurrency Tests

The implementation SHALL include tests for default isolation, explicit authorization, independent visibility and communication grants, join and revocation, persisted recovery, attributed messages, peer and child participation, concurrent membership changes, and compatibility with existing tools.

#### Scenario: Prove unrelated-session isolation

- **WHEN** two independent scopes and their participants perform discovery and messaging operations
- **THEN** each participant can access only its authorized scope data
- **AND** no test assertion depends on an impossible absence without a corresponding possible presence state

#### Scenario: Prove concurrent revocation

- **WHEN** a message send races with membership revocation
- **THEN** the test records the defined authorization read point
- **AND** no message is delivered after the revocation boundary
