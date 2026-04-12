# Canton Repo Protocol

[![CI](https://github.com/digital-asset/canton-repo-protocol/actions/workflows/ci.yml/badge.svg)](https://github.com/digital-asset/canton-repo-protocol/actions/workflows/ci.yml)
[![License](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](https://opensource.org/licenses/Apache-2.0)

An open-source, institutional-grade protocol for atomic, private repurchase agreements (repos) on the Canton Network.

This protocol enables two parties to engage in a collateralized loan, where one party sells securities to another with an agreement to repurchase them at a later date at a higher price. The entire lifecycle—proposal, acceptance, settlement, and maturity—is managed through Daml smart contracts, ensuring atomicity, privacy, and correctness without a central counterparty.

## Overview

### What is a Repo?

A repurchase agreement (repo) is a form of short-term borrowing, mainly in government securities. The dealer sells the government securities to investors, usually on an overnight basis, and buys them back the following day at a slightly higher price. That small difference in price is the implicit overnight interest rate. Repos are a common, low-risk tool for raising short-term capital.

### Why on Canton?

Traditional repo markets rely on centralized clearinghouses and complex, slow settlement processes (T+1 or T+2), introducing operational overhead and counterparty risk. The Canton Repo Protocol leverages the unique features of the Canton Network to solve these problems:

*   **Atomic DvP Settlement:** Delivery versus Payment (DvP) is guaranteed by the protocol's atomicity. The cash leg and collateral leg of the transaction settle in the *exact same transaction*, eliminating settlement risk. If one side fails, the entire transaction is rolled back.
*   **Privacy by Design:** All terms of a repo deal—including the rate, collateral, and even the identities of the counterparties—are strictly confidential. This information is only visible to the direct participants and is never leaked to the broader network or validators.
*   **Reduced Counterparty Risk:** The protocol enforces the rights and obligations of both parties from trade inception to maturity. The collateral is held on-ledger, and the maturity transaction is guaranteed to execute atomically, removing the risk that a counterparty will fail to deliver or return funds.
*   **Efficiency and Automation:** By modeling the repo lifecycle in Daml, the protocol automates complex workflows, reduces the need for manual reconciliation, and creates a verifiable, immutable audit trail for all actions.

## How It Works

The protocol follows a standard proposal-acceptance pattern, ensuring that a valid agreement is formed before any assets are moved.

1.  **Proposal:** The Cash Lender (Party A) creates a `RepoProposal` smart contract. This contract contains all the economic terms:
    *   Cash Amount & Currency
    *   Collateral Criteria (e.g., specific ISIN, asset type)
    *   Repo Rate
    *   Term (Start and End Dates)
    *   The counterparty (Cash Borrower, Party B)

    This proposal is only visible to Party A and Party B.

2.  **Acceptance & Settlement:** The Cash Borrower (Party B) can view the proposal. To accept, they exercise the `Accept` choice on the `RepoProposal` contract, providing the specific collateral that meets the criteria. This single action atomically:
    *   Archives the `RepoProposal`.
    *   Creates an active `RepoAgreement` contract.
    *   Executes the DvP transfer: the Cash Lender's cash is transferred to the Borrower, and the Borrower's collateral is transferred to the Lender. This is typically done by composing with a standard token contract (e.g., a CIP-0056 compliant token).

3.  **Maturity:** On the agreed-upon maturity date, either party can initiate the unwinding of the repo. This is done by exercising a choice on the `RepoAgreement` contract, which atomically:
    *   Transfers the original collateral back to the Cash Borrower.
    *   Transfers the principal plus the calculated repo interest back to the Cash Lender.
    *   Archives the `RepoAgreement`, concluding the workflow.

## Getting Started

This project is built using the Canton SDK and its package manager, DPM.

### Prerequisites

*   **Canton SDK (v3.4.0 or later):** Follow the [official installation instructions](https://docs.canton.io/3.4.0/user-manual/getting-started/download.html).

### Quickstart

1.  **Clone the repository:**
    ```bash
    git clone https://github.com/digital-asset/canton-repo-protocol.git
    cd canton-repo-protocol
    ```

2.  **Build the Daml model:**
    This command compiles the Daml code into a DAR (Daml Archive) file.
    ```bash
    dpm build
    ```
    The output will be located in `.daml/dist/canton-repo-protocol-0.1.0.dar`.

3.  **Run the tests:**
    This command runs all the `Daml.Script` tests defined in the `daml/Test` directory to verify the contract logic.
    ```bash
    dpm test
    ```

4.  **Start a local Canton ledger:**
    This command starts a single-node Canton instance, a PostgreSQL database, and a JSON API server on port 7575, allowing you to interact with the contracts.
    ```bash
    dpm sandbox
    ```

## Key Daml Templates

The core logic is contained within the `Daml/Repo` directory.

*   `Repo.Dvl.Proposal`: Represents an off-ledger, bilateral offer to enter into a repo agreement. It contains all the terms and is only visible to the proposer and the counterparty.
*   `Repo.Dvl.Agreement`: The active, on-ledger repo agreement created upon acceptance of a proposal. It represents the state of the repo during its term and is the contract that enforces the maturity settlement.
*   `Repo.Dvl.Master`: A long-lived role contract that can be used to establish an ongoing trading relationship between two parties, streamlining the creation of new proposals.

## Contributing

Contributions are welcome! Please feel free to open an issue to report a bug or suggest a feature, or open a pull request with your improvements.

## License

This project is licensed under the [Apache License 2.0](LICENSE).