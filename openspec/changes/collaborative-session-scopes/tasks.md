## 1. Domain Terminology and Contract

- [ ] 1.1 Define `AsyncAgent` as the managed asynchronous-agent/session/lifecycle/result record and retain `parentSessionID` only as initiating-session provenance.
- [ ] 1.2 Define coordination group, membership, technical group ID, semantic display name, role, lifecycle, and attributed-message data structures without introducing a participant domain entity.
- [ ] 1.3 Define role invariants: only `orchestrator` creates groups, adds members, changes membership, and ends sessions; `agent` members have no governance authority.
- [ ] 1.4 Define exact group-reference and name-resolution behavior, making technical IDs mandatory and semantic names display-only.

## 2. Group Lifecycle and Authorization

- [ ] 2.1 Implement private group creation by an orchestrator with arbitrary semantic name and immutable technical ID.
- [ ] 2.2 Implement orchestrator-controlled member addition/removal for `agent` and `orchestrator` roles with group isolation.
- [ ] 2.3 Enforce that ordinary agent members cannot create groups, add members, or end sessions.
- [ ] 2.4 Implement empty-group deletion, technical-ID non-reuse, and fresh-group behavior when a semantic name is reused.
- [ ] 2.5 Define and implement the authorization read point for membership changes racing with listing, messaging, or session ending.

## 3. Legacy Migration and Persistence

- [ ] 3.1 Define the deterministic migrated technical ID from stable legacy agent and initiating-session identifiers.
- [ ] 3.2 Migrate each complete legacy record into one group with the agent membership and initiating orchestrator membership, without inferring a creator-selected semantic name.
- [ ] 3.3 Quarantine or report incomplete legacy records without inventing an orchestrator identity or granting access.
- [ ] 3.4 Persist and recover asynchronous-agent records, groups, memberships, roles, names, lifecycle state, and message attribution.
- [ ] 3.5 Prove restart recovery preserves revocation and does not recreate removed or empty groups from historical records.

## 4. Listing and Messaging Surfaces

- [ ] 4.1 Change `bgagent_list` to require a technical group ID and return only the selected group's authorized `AsyncAgent` records.
- [ ] 4.2 Make omitted `bgagent_list` fail with a clear group-required explanation and caller-only group ID/name enumeration.
- [ ] 4.3 Reject unauthorized or ambiguous group references without revealing group existence, members, counts, or history.
- [ ] 4.4 Define the attributed message envelope with sender session, agent identity, initiating provenance, group ID, and literal body.
- [ ] 4.5 Route `bgagent_report` and peer messages through group authorization without replacing sender identity with parent or relay-manager identity.

## 5. AsyncAgent Lifecycle Compatibility

- [ ] 5.1 Preserve asynchronous-agent creation, completion, error, cancellation, result retrieval, resume, and notification behavior with provenance intact.
- [ ] 5.2 Keep ordinary agent members unable to cancel, clear, steer, resume, or end other sessions through group coordination.
- [ ] 5.3 Preserve existing parent-child `bgagent_report` behavior through the migrated or active group without treating parentage as ownership.
- [ ] 5.4 Preserve status, forked, resumed, progress, and result projections while replacing task-domain language with managed-agent language where contracts change.

## 6. Verification

- [ ] 6.1 Test role governance, multiple groups per orchestrator, same-group communication, and different-group isolation.
- [ ] 6.2 Test technical-ID resolution, duplicate semantic names, omitted listing, caller-only group enumeration, and non-leaking authorization failures.
- [ ] 6.3 Test deterministic legacy migration, generated-label provenance, incomplete-record quarantine, and migration idempotence.
- [ ] 6.4 Test empty-group removal, semantic-name reuse, non-revived permissions, and non-restored history.
- [ ] 6.5 Test literal message preservation and sender session/agent/provenance attribution for child agents and peer orchestrators.
- [ ] 6.6 Test persistence, restart recovery, revocation races, and the remaining cross-process/manager boundary once confirmed.
