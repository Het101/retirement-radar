# Security policy

Retirement Radar runs with **your AWS credentials**. It is built so that the worst it can do with them is read version numbers. Please treat findings that break that accordingly.

## Reporting a vulnerability

**Do not open a public issue for a security problem.**

Use [GitHub's private vulnerability reporting](https://github.com/Het101/retirement-radar/security/advisories/new). If that is unavailable to you, open a public issue that says only "security report, please make contact", with no detail, and we will arrange a private channel.

Please include what the problem is and what an attacker gets out of it, the smallest reproduction you can manage, and the version (`npx retirement-radar --version`).

**Never include AWS keys, session tokens or unredacted account ids in a report**, even expired ones.

Expect an acknowledgement within 3 working days and an assessment within 10. If a fix is warranted we will agree a disclosure timeline with you, and credit you in the release notes unless you would rather not be.

## Supported versions

Pre-1.0. Security fixes land on `main` and in the next release; there are no maintained release branches.

## What Retirement Radar promises

A defect in any of these is a security bug, not a feature request:

| Promise | Enforced by |
|---|---|
| It only reads. Every AWS call is a `list-*`, `describe-*` or `get-*` operation | `test/radar.test.js` ("read-only") fails if a scan makes any other call |
| Nothing leaves your machine except through your own AWS CLI. No telemetry | `test/radar.test.js` ("local") fails if the source loads a network module or calls `fetch` |
| It never sees your credentials | It runs the AWS CLI you already have; it never reads `~/.aws`, environment keys or SSO caches itself |
| Credentials don't enter this repository | `.githooks/pre-commit` and the CI `hygiene` job reject AWS access keys, secret keys and npm tokens |

The minimal IAM policy is in the [README](README.md#safe-by-design).

## Not vulnerabilities

- **The output contains resource names, regions and your account id.** That is the report. Redact it before sharing.
- **`--data` loads a dates file you point it at.** It is parsed as YAML data and never executed.

## How the supply chain is checked

The thing you are really trusting is the release pipeline, not just the source.

| Tool | Runs | Catches |
|---|---|---|
| [CodeQL](https://github.com/Het101/retirement-radar/security/code-scanning) | push, PR, weekly | Injection, unsafe parsing and the standard JavaScript query pack |
| [zizmor](https://docs.zizmor.sh) | every PR | Vulnerabilities in the workflows themselves: template injection, persisted tokens, cache poisoning, unpinned actions |
| [Dependency Review](.github/workflows/dependency-review.yml) | every PR | A new dependency with a known high advisory or a copyleft licence |
| [OpenSSF Scorecard](https://github.com/Het101/retirement-radar/security/code-scanning) | push to `main`, weekly | Posture drift: branch protection weakened, a permission widened, an action unpinned |
| `npm audit` | every PR | Known high or critical advisories in the dependency tree |
| [Harden-Runner](https://github.com/step-security/harden-runner) | every job | Outbound network calls made while the build runs; the release job blocks anything not on its allowlist |

And the decisions behind them:

- **One runtime dependency** (`yaml`). The AWS SDK is deliberately not used; the AWS CLI already on your machine does the calls.
- **Every action is pinned to a commit SHA**, not a tag.
- **Dependabot waits 7 days** (14 for majors) before proposing a new version, so most malicious releases are yanked before they reach a pull request.
- **Workflows default to `contents: read`**; jobs that need more ask for it themselves.
- **The release job does not use the Actions cache**, which lower-privilege workflows can write to.
- **Publishing uses npm trusted publishing over OIDC, with provenance, and is staged.** CI can prepare a release but only a human approving with a second factor can publish it. There is no long-lived npm token to steal.
