# Changelog

All notable changes to Retirement Radar are recorded here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project uses [Semantic Versioning](https://semver.org/). Until 1.0, breaking changes may land in a minor release; they are always called out.

## [Unreleased]

## [0.3.0] - 2026-10-05

### Added

- **ElastiCache** (Redis OSS and Valkey; clusters, replication groups and serverless caches), **OpenSearch** (Elasticsearch and OpenSearch domains) and **MSK** (provisioned Kafka clusters).
- `--services` to scan only some services, with fewer permissions.
- RDS and Aurora now know the end of Extended Support, so a database past it shows as `retired`.
- Versions AWS lists with no end date yet show as `ok` ("No end of support announced") rather than `unknown`.

### Changed

- `retirements.yaml` re-checked against the AWS pages on 2026-10-05: EKS 1.34–1.37, PostgreSQL 17–18, MySQL 8.4, Aurora MySQL 3 (its 8.0 runs to 30 April 2028, longer than RDS MySQL 8.0), and every current Lambda runtime with its deprecation date.

## [0.2.0] - 2026-10-05

### Added

- `--version` flag.
- Tests that enforce the two security promises: a scan only makes read-only AWS calls, and the code has no network access of its own.
- CI, CodeQL, dependency review, OpenSSF Scorecard, Dependabot and a staged, provenance-signed npm release workflow.
- Issue forms for bugs, date corrections, run reports and feature requests; `SECURITY.md`, `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`.

### Fixed

- `package.json` `repository` is an object, which `npm publish` warned about.

## [0.1.1] - 2026-10-04

### Changed

- README: banner, badges and an example output image.
- Line endings forced to LF, so a package published from Windows does not ship a `node\r` shebang that fails on macOS and Linux.

## [0.1.0] - 2026-10-04

### Added

- `retirement-radar scan`: read-only scan of EKS cluster versions, RDS/Aurora engine versions and Lambda runtimes across every enabled region, through the local AWS CLI.
- `retirements.yaml`: end-of-support dates with AWS source links.
- Table and `--json` output, an EKS extended-support cost estimate, and `--fail-on <level>` for CI.

[Unreleased]: https://github.com/Het101/retirement-radar/compare/v0.3.0...HEAD
[0.3.0]: https://github.com/Het101/retirement-radar/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/Het101/retirement-radar/compare/v0.1.1...v0.2.0
[0.1.1]: https://github.com/Het101/retirement-radar/releases/tag/v0.1.1
[0.1.0]: https://github.com/Het101/retirement-radar/commits/v0.1.1
