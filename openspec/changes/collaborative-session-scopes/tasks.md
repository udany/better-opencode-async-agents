## 1. Confirm Contract Decisions

- [ ] 1.1 Confirm whether legacy parent-child access is materialized as a compatibility scope or derived as membership, including behavior for historical tasks.
- [ ] 1.2 Confirm scope administrators, invitation/join proof, token expiry/replay rules, inactive-member cleanup, and message retention.
- [ ] 1.3 Confirm whether task-control capabilities are allowed in the first release and whether scopes must coordinate across independent plugin managers.
- [ ] 1.4 Confirm the default and explicit-scope behavior for `bgagent_list` and the notification projection for non-owner participants.

## 2. Domain and Persistence Contract

- [ ] 2.1 Define typed collaboration scope, participant, capability, invitation, revision, and attributed-message data structures without removing parent task ownership fields.
- [ ] 2.2 Define persisted representations and versioning for scopes, memberships, grants, revocations, revisions, and message metadata.
- [ ] 2.3 Implement load, save, migration, and recovery behavior for collaboration records, including revoked and empty scopes.
- [ ] 2.4 Add conflict-safe per-scope membership transitions and deterministic handling for stale revisions.

## 3. Authorization and Manager Operations

- [ ] 3.1 Implement scope creation, explicit invitation or join, acceptance, departure, permission changes, and revocation through one authorization model for child and peer participants.
- [ ] 3.2 Implement authorization checks for scope discovery, task listing, task reads, message sending, notifications, and any separately granted task control.
- [ ] 3.3 Add scope-aware task projections that preserve owner, parent session, task, and status identity while excluding unauthorized data and counts.
- [ ] 3.4 Define and implement the compatibility mapping that keeps existing parent-child behavior private and authorized without a second routing rule.

## 4. Messaging and Existing Tool Compatibility

- [ ] 4.1 Implement an attributed message envelope carrying sender session, sender agent when available, sender task when available, target scope, and literal message body.
- [ ] 4.2 Route `bgagent_report` through the collaboration authorization and attribution contract while preserving its existing parent-child caller behavior.
- [ ] 4.3 Extend `bgagent_list` with the approved scope behavior while retaining its private default and existing task projection indicators.
- [ ] 4.4 Apply scope authorization to completion/error/cancellation notifications, cancellation, clearing, and resume without transferring task ownership.
- [ ] 4.5 Add typed collaboration tool/data surfaces for scope inspection, membership management, authorized discovery, and messaging with non-leaking authorization failures.

## 5. Lifecycle, Recovery, and Concurrency

- [ ] 5.1 Define and implement scope behavior when tasks complete, fail, cancel, clear, resume, or when participant sessions end.
- [ ] 5.2 Rebuild collaboration indexes on restart from persisted state and prove revoked memberships are not restored by task loading.
- [ ] 5.3 Exercise concurrent join, grant, revoke, listing, and message operations at the defined scope read points.
- [ ] 5.4 Verify peer orchestrators and child agents can use the same scope operations without relationship-specific branches.

## 6. Verification and Migration

- [ ] 6.1 Add isolation and authorization tests for unrelated scopes, missing grants, independent visibility/message grants, and non-leaking errors.
- [ ] 6.2 Add lifecycle tests for invitation, acceptance, departure, revocation, stale revisions, empty scopes, and session/task termination.
- [ ] 6.3 Add persistence/restart tests for active scopes, revoked members, attributed messages, and historical tasks.
- [ ] 6.4 Add compatibility tests for `bgagent_report`, `bgagent_list`, completion notifications, cancellation, clearing, and resume.
- [ ] 6.5 Add concurrency tests for revocation races, peer managers, message read points, and deterministic conflicts.
- [ ] 6.6 Review migration and rollback behavior, update the main specification only after implementation is verified, and document any deferred lead decisions.
