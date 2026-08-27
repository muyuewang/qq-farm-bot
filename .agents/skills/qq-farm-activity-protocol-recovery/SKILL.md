---
name: qq-farm-activity-protocol-recovery
description: Recover unknown QQ Farm ActivityService.Operate protobuf actions from the latest official macOS miniapp client. Use when fields, command values, nested request types, or the local activitypb.proto disagree with or are missing from the official client; do not use for ordinary activity UI work or resource lookup.
---

# QQ Farm Activity Protocol Recovery

Recover an evidence-backed schema and reproducible request encoding before changing the local protocol or service. Never infer a field number from declaration order, an older activity, a UI label, or a similarly named message.

## Authorization boundary

Static inspection, temporary copies, local decoding, and tests are read-only or repository-local work. Do not send an `Operate` request to a real account unless the user explicitly asks for real-account validation in the current task. A request being sent is not proof of success.

## Workflow

1. From the repository root, run `node .agents/skills/qq-farm-activity-protocol-recovery/scripts/find-latest-miniapp.js`. Record the selected source directory and `tsdk/tsdk.wasm` modification time. If an explicit source was supplied, validate it with `--source <directory>`.
2. Treat the selected QQ container directory as read-only. Copy files that need processing to a temporary directory; never write generated files or caches into the official source or runtime resource cache.
3. Inspect the selected `game.js` to locate the main bundle, its bytecode/interpreter loader, and the generated `chunks:///_virtual/activitypb.ts` module. In an isolated Node `vm`, register the required `define` factory and restore only the `System.register` modules needed to evaluate the generated protocol module. Do not boot the QQ game or execute unrelated business modules.
4. Read the official exports for `OperateType`, `OperateRequest`, `OperateReply`, and the action-specific request/reply messages. Treat `core/src/proto/activitypb.proto` only as a comparison target, never as the source of truth for unknown fields.
5. For every candidate property, call the official message type's `create` and `encode` with a minimal non-default sentinel. Decode the first protobuf tag into field number and wire type. Probe nested messages independently. Repeat with a second suitable sentinel when default elision, enum zero values, packed fields, or ambiguous scalar types could hide the result.
6. Reconstruct one complete request using the official encoder with the confirmed activity ID, command, and one known node, product, or item parameter. Record the semantic object, component hex, and contiguous request hex. Label it **official-encoder reconstruction**, not a packet capture.
7. Cross-check the result against available HAR/WS data, `GetGroup`/`List` replies, generated client code, and relevant Prefab/config data. For encrypted traffic record `encrypted: true, decoded: false`; do not parse ciphertext as protobuf.
8. Produce the report described in [references/report-format.md](references/report-format.md), using the evidence labels in [references/evidence-levels.md](references/evidence-levels.md).
9. When implementation is requested, update the local proto and reusable service model rather than concatenating one-off bytes. Add a fixed-hex regression test covering the outer activity ID and command, the action field, and all nested parameters. Run the focused test first and then the complete core test suite.
10. Only with explicit authorization, send one minimal real-account request while the action remains available. Log sanitized semantic parameters, request hex, response code, and before/after refreshed state. Success requires both a successful server response and observable state advancement.

## Stop conditions

Stop and report the missing evidence instead of guessing when:

- no complete source candidate contains `game.js`, `game.json`, `tsdk/tsdk.wasm`, and `assets/`;
- the generated protocol module cannot be isolated without executing QQ business code;
- candidate fields cannot be distinguished by official encoding;
- only encrypted dynamic traffic is available and static recovery has not established the schema;
- real-account validation is required but was not explicitly authorized.

## Repository integration

Preserve protocol discoveries as maintainable artifacts: `.proto` definitions, normalized service parsing, sanitized inspector output, and fixed-hex tests. Do not make CDN content a runtime dependency. For WASM discovery, snapshotting, comparison, or rollback beyond locating the current client, follow `core/docs/tsdk-update-runbook.md`.

The historical Rain Poem result in [references/rain-poem-example.md](references/rain-poem-example.md) is a method example only. It does not authorize reusing any field, command, or message name for a later activity.
