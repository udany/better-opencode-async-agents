## MODIFIED Requirements

### Requirement: Event-Based Completion Detection

The system SHALL use `session.idle` events as the primary mechanism for detecting task completion, with polling as a fallback. Completion notifications SHALL be delivered to the owning parent and to any collaboration participants with explicit notification permission, without changing task ownership.

#### Scenario: Detect completion via event

- **WHEN** a background session emits `session.idle` event
- **THEN** system immediately marks corresponding task as completed
- **AND** sends an attributed notification to the owning parent
- **AND** sends only the authorized notification projection to collaboration participants

#### Scenario: Fallback to polling

- **WHEN** `session.idle` event is missed (e.g., during reconnection)
- **THEN** polling mechanism detects completion within fallback interval
- **AND** sends the same ownership-preserving, authorization-checked notifications

### Requirement: Task List Parent Session Filtering

The system SHALL preserve direct parent-child task listing while allowing `bgagent_list` to use an explicitly authorized collaboration scope. A caller without scope visibility permission MUST receive only its existing private/parent-compatible projection and MUST NOT see tasks from unrelated sessions.

#### Scenario: Filter by parent session

- **WHEN** user calls `asyncagents_list` without an explicit collaboration scope
- **THEN** system returns tasks authorized by the caller's existing parent-child compatibility relationship
- **AND** tasks from unrelated sessions are not displayed

#### Scenario: List an authorized collaboration scope

- **WHEN** user calls `asyncagents_list` with an explicit scope for which the caller has visibility permission
- **THEN** system returns only tasks associated with that scope and authorized for the caller
- **AND** each task retains its original parent session and owner identity

#### Scenario: Reject an unauthorized scope listing

- **WHEN** user calls `asyncagents_list` with a scope for which the caller has no visibility permission
- **THEN** system denies the request without revealing the scope's task count or identifiers
