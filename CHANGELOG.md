# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Support for evergreen repos via a `Repo.Roll` choice, allowing parties to extend the term without creating a new agreement.
- Optional `regulator` observer field on `Repo.Agreement` for regulatory reporting use cases.

### Changed
- Refined the `Repo.Settle` choice to emit a `SettlementConfirmation` event contract for easier off-ledger integration and reconciliation.

### Fixed
- Addressed an issue where settlement could fail if the collateral asset's observers changed mid-trade. The settlement logic now fetches the collateral contract right before exercising the transfer, ensuring the latest signatories are used.

## [1.1.0] - 2024-07-15

### Added
- Implemented `Repo.Amend` choice, allowing for bilateral, atomic amendment of repo terms (e.g., rate, termination date) before settlement.
- Added Daml Script tests covering early termination and amendment scenarios.
- Introduced `Repo.Lifecycle` rule in triggers to automatically notify participants of upcoming settlement dates.
- Full integration with the Canton Interoperability Protocol (CIP-0056) for tokenized cash and collateral legs, replacing the previous dependency on a generic asset model.

### Changed
- **BREAKING**: Upgraded project to Canton SDK 3.4.0. The `daml.yaml` and CI workflow have been updated to use DPM.
- The `principal` and `repoInterest` fields now use `Daml.Finance.Data.Numeric.Amount` for better type safety and consistency with CIP-0056 assets.
- Improved logging in Daml Script tests for easier debugging.

## [1.0.1] - 2024-06-20

### Fixed
- Corrected a rounding discrepancy in the repo interest calculation that occurred with specific day count conventions. The calculation now strictly adheres to a 10-decimal precision standard.
- Fixed a bug where a rejected `RepoProposal` contract was not correctly archived, leaving it in the active contract set (ACS) of the proposer.

## [1.0.0] - 2024-06-01

### Added
- Initial release of the Canton Repo Protocol.
- Core Daml templates: `Repo.Proposal` and `Repo.Agreement` for a secure, two-phase commit workflow.
- Atomic DvP (Delivery vs. Payment) settlement choice `Repo.Settle` ensures no settlement risk.
- Privacy-by-design: repo rate, collateral details, and counterparty identifiers are kept private from the rest of the network.
- Comprehensive Daml Script test suite covering the happy path (propose -> accept -> settle).
- Project structure including `daml.yaml`, `.gitignore`, and GitHub Actions CI workflow.