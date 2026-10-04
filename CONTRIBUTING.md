# Contributing to Retirement Radar

Thanks for looking. The most useful contribution is a **date**: AWS changes its support calendars, and `retirements.yaml` is most of this tool's value.

## The hard rules

1. **Read-only, always.** Only `list-*`, `describe-*` and `get-*` AWS calls. A test enforces it.
2. **Every date has a source.** New or changed entries in `retirements.yaml` need the AWS page that states them, in the file or the pull request. A wrong date is worse than a missing one: it tells someone they are safe when they are not.
3. **Unknown stays unknown.** A version the data doesn't list is reported as `unknown`, never as fine.
4. **Never commit a credential**, not even an expired key in a test. The pre-commit hook and CI will stop you, but don't rely on them.

## Getting set up

```bash
git clone https://github.com/Het101/retirement-radar.git
cd retirement-radar
npm install
npm run hooks        # one-off: points git at .githooks
npm test
node src/cli.js scan --region eu-west-1 --profile <a-profile-you-can-read>
```

`npm run hooks` is a deliberate step rather than a `prepare` script, so the published package has no install-time script.

## Changing dates

1. Edit `retirements.yaml`. Keep dates as quoted `"YYYY-MM-DD"` strings.
2. Put the AWS source link in the pull request, or in the section's `source:` if it is a new page.
3. `npm test` checks that every date parses and every section has a source.

## Commits and pull requests

- **Conventional Commits**, subject under 72 characters: `feat(eks): …`, `fix(rds): …`, `docs: …`, `ci: …`. The `commit-msg` hook checks it.
- **Signed commits.** `main` only accepts signed commits. Set `git config commit.gpgsign true` and `git config rebase.gpgsign true`. Don't use GitHub's "Update branch" button; it strips signatures. Rebase locally.
- **No tooling attribution trailers** (`Co-Authored-By` lines for AI assistants or bots).
- Add a line under `## [Unreleased]` in `CHANGELOG.md`.
- One concern per pull request.

## Releasing (maintainers)

1. In a pull request, bump the version (`npm version minor --no-git-tag-version`) and move the Unreleased notes in `CHANGELOG.md` under the new version.
2. After it merges, tag the merge commit and push the tag:
   ```bash
   git checkout main && git pull
   git tag -s v0.2.0 -m v0.2.0
   git push origin v0.2.0
   ```
3. The `release` workflow runs every check, stages the package on npm with provenance, drafts the GitHub release, and opens an issue with the exact approve commands. Nothing is public until you approve it with your 2FA.
