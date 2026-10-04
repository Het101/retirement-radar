## What breaks without this

<!-- The problem, not the diff. If it fixes a bug, what went wrong? -->

## What changed

<!-- Keep it short; the diff has the detail. -->

## Checklist

- [ ] A test fails without this change (or: this only changes dates/docs)
- [ ] `npm test` passes locally
- [ ] No AWS keys, session tokens or real account ids anywhere in the diff
- [ ] README updated if behaviour or flags changed
- [ ] CHANGELOG.md has an entry under Unreleased
- [ ] One concern in this PR

## Rules this project keeps

<!-- Tick only those your change touches. -->

- [ ] Still read-only: only list/describe/get calls (`test/radar.test.js` enforces the allowlist)
- [ ] Still local: no network calls except through the user's AWS CLI
- [ ] Every new or changed date in `retirements.yaml` has its AWS source link
- [ ] A version the data does not know is still reported as `unknown`, never as fine
