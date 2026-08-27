# Recovery report format

Produce a compact report with enough detail for another engineer to reproduce the result.

## Source

- selected absolute miniapp source directory;
- `tsdk/tsdk.wasm` modification time and size;
- relevant `game.js` bundle/module identifiers;
- temporary working directory, if retained, or confirmation it was removed.

## Recovered protocol

For each action include:

- enum symbol and numeric command;
- outer request property;
- action-specific request/reply type names;
- field table: message, property, field number, wire type, sentinel, encoded hex, evidence label;
- unresolved or ambiguous properties.

## Reconstructed request

- sanitized semantic object;
- component/tag hex with annotations;
- contiguous request hex;
- the exact label `official-encoder-reconstruction`.

## Cross-checks

List each HAR/WS, `GetGroup`/`List`, generated-code, Prefab, or config source checked and whether it supports, contradicts, or does not resolve the result. Mark encrypted data as `encrypted: true, decoded: false`.

## Repository changes and verification

- changed proto/service/config files;
- focused fixed-hex tests and results;
- full core test result;
- remaining uncertainty;
- real-account validation status: not requested, not authorized, unavailable, failed, or validated with before/after state.
