# Changelog

All notable changes to Retirement Radar are recorded here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project uses [Semantic Versioning](https://semver.org/). Until 1.0, breaking changes may land in a minor release; they are always called out.

## [Unreleased]

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

[Unreleased]: https://github.com/Het101/retirement-radar/compare/v0.1.1...HEAD
[0.1.1]: https://github.com/Het101/retirement-radar/releases/tag/v0.1.1
[0.1.0]: https://github.com/Het101/retirement-radar/commits/v0.1.1
