# Canton Repo Protocol: Integration Guide

This guide provides technical instructions for integrating with the Canton Repo Protocol. It is intended for developers at repo trading desks, custodians, and technology providers who need to connect their systems to the protocol for automated repo trading and settlement.

## 1. Overview

The Canton Repo Protocol enables two-party repurchase agreements with atomic, confidential, and risk-free settlement. Key features include:

*   **Atomic DvP:** Delivery-versus-Payment is guaranteed by the Canton protocol. The cash leg and collateral leg of the repo settle in a single, atomic transaction, eliminating principal risk.
*   **Bilateral Privacy:** All trade details—including rate, size, collateral, and even the identities of the counterparties—are kept strictly confidential between the two transacting parties. This data is never broadcast to the wider network.
*   **Automation:** The entire lifecycle, from proposal and acceptance to termination and margin calls, is managed by Daml smart contracts, reducing operational overhead and the risk of manual errors.
*   **Interoperability:** Built on Canton, the protocol can interoperate with any other Canton-native asset, including tokenized securities, deposits, and central bank digital currencies (CBDCs) that adhere to the Canton token standard (CIP-0056).

## 2. Prerequisites

Before you begin integration, ensure you have the following:

1.  **Canton Network Access:** Access to a Canton network environment. For development and testing, you can run a local network using `dpm sandbox`. For UAT and production, you will connect to a shared DevNet, TestNet, or MainNet.
2.  **Participant Node:** A running Canton participant node connected to the network. This is your gateway to the ledger.
3.  **Party IDs:** One or more `Party` identifiers allocated on your participant node. A `Party` represents your legal entity on the network. Parties can be allocated via the JSON API.
4.  **DPM Toolchain:** The [Digital Asset Package Manager (DPM)](https://docs.digitalasset.com/dpm/index.html) version 3.4.0 or higher installed.
5.  **Authentication Token (JWT):** A valid JSON Web Token (JWT) to authenticate with your participant's JSON API. The token's payload must include `actAs` and `readAs` claims for the parties your application will represent.

## 3. Core Concepts

The protocol is defined by a set of Daml smart contract templates that govern the repo lifecycle.

| Template          | Module            | Description                                                                                             |
| ----------------- | ----------------- | ------------------------------------------------------------------------------------------------------- |
| `RepoProposal`    | `Repo.Proposal`   | An off-ledger offer to enter into a repo agreement. Only visible to the proposer and the counterparty.  |
| `RepoAgreement`   | `Repo.Agreement`  | The active repo contract, created upon acceptance of a proposal. Governs the terms until maturity.      |
| `MarginCall`      | `Repo.MarginCall` | Manages the process for posting or returning collateral based on mark-to-market valuation changes.      |
| `Allocation`      | (CIP-0056)        | A standard token primitive used to pre-authorize the atomic DvP settlement.                             |
| `Transfer`        | (CIP-0056)        | A standard token primitive used to execute the peer-to-peer transfer of assets.                       |

## 4. Integration Flow via JSON API

Your application will interact with the protocol by sending commands to your Canton participant's JSON API, typically running on `http://localhost:7575`.

### Step 1: Proposing a Repo

The `Borrower` initiates the workflow by creating a `RepoProposal` contract. This is a request to the `Lender` to provide cash in exchange for collateral.

To do this, the Borrower's application sends a `create` command. Note that the `collateral` field requires a `ContractId` of a token `Allocation` contract, which pre-authorizes the transfer of the collateral upon acceptance.

**HTTP Request:**

```http
POST /v1/create
Host: localhost:7575
Authorization: Bearer <your-jwt>
Content-Type: application/json

{
  "templateId": "Repo.Proposal:RepoProposal",
  "payload": {
    "borrower": "BorrowerParty::...",
    "lender": "LenderParty::...",
    "collateralCid": "008a9582d...:Repo.Token:Allocation",
    "collateralQuantity": { "name": "TREASURY_NOTE_2025", "amount": "101000000.0" },
    "cashAmount": "100000000.0",
    "rate": "0.0525",
    "termDays": 1,
    "repoId": "REPO-2024-08-15-001"
  }
}
```

### Step 2: Querying and Accepting a Proposal

The Lender's application queries for any active `RepoProposal` contracts where they are the designated `lender`.

**HTTP Request:**

```http
POST /v1/query
Host: localhost:7575
Authorization: Bearer <your-jwt>
Content-Type: application/json

{
  "templateIds": ["Repo.Proposal:RepoProposal"]
}
```

Upon receiving a proposal, the Lender can choose to accept it. To do so, they must first create a cash `Allocation` for the principal amount. They then exercise the `Accept` choice on the `RepoProposal`, providing the `ContractId` of their cash allocation.

This single `exercise` command is the core of the DvP settlement. Canton's transaction atomicity guarantees that the following happens as one indivisible unit:
1. The `RepoProposal` is consumed.
2. The `RepoAgreement` is created.
3. The Borrower's collateral allocation is settled, transferring collateral to the Lender.
4. The Lender's cash allocation is settled, transferring cash to the Borrower.

**HTTP Request:**

```http
POST /v1/exercise
Host: localhost:7575
Authorization: Bearer <your-jwt>
Content-Type: application/json

{
  "templateId": "Repo.Proposal:RepoProposal",
  "contractId": "<contract-id-of-the-proposal>",
  "choice": "Accept",
  "argument": {
    "cashAllocationCid": "009b11f...:Cash.Token:Allocation"
  }
}
```

### Step 3: Managing the Active Repo

Once the `RepoAgreement` is on the ledger, both parties (and any designated custodians) can query for it. The repo can be terminated at maturity or be subject to margin calls.

**Terminating a Repo:**

At maturity, the `Borrower` exercises the `Terminate` choice to repay the principal plus interest and get their collateral back. This is another atomic DvP transaction.

```http
POST /v1/exercise
Host: localhost:7575
Authorization: Bearer <your-jwt>
Content-Type: application/json

{
  "templateId": "Repo.Agreement:RepoAgreement",
  "contractId": "<contract-id-of-the-agreement>",
  "choice": "Terminate",
  "argument": {
    "repaymentCashAllocationCid": "00a4cc8...:Cash.Token:Allocation"
  }
}
```

## 5. Using the TypeScript SDK

To simplify integration, we provide a TypeScript client in `sdk/src/repoClient.ts`. This client abstracts the raw JSON API calls into a clean, typed interface.

### Installation and Setup

```bash
npm install @c7/ledger
# Copy or link the repoClient.ts file into your project
```

### Example Usage

```typescript
import { RepoClient } from './repoClient'; // Adjust path as needed
import { Ledger } from '@c7/ledger';

const ledgerUrl = 'http://localhost:7575';
const jwt = 'your-jwt-token';
const borrowerPartyId = 'BorrowerParty::...';
const lenderPartyId = 'LenderParty::...';

// Instantiate the client
const borrowerClient = new RepoClient(ledgerUrl, jwt, borrowerPartyId);
const lenderClient = new RepoClient(ledgerUrl, jwt, lenderPartyId);

async function runRepoWorkflow() {
  // 1. Borrower creates an allocation for the collateral (not shown, uses a token client)
  const collateralAllocationCid = '...';

  // 2. Borrower proposes the repo
  console.log('Borrower proposing repo...');
  const proposal = await borrowerClient.proposeRepo({
    lender: lenderPartyId,
    collateralCid: collateralAllocationCid,
    collateralQuantity: { name: 'TREASURY_NOTE_2025', amount: '101000000.0' },
    cashAmount: '100000000.0',
    rate: '0.0525',
    termDays: 1,
    repoId: `REPO-${new Date().toISOString()}`
  });
  console.log('Proposal created:', proposal.contractId);

  // 3. Lender finds the proposal
  console.log('Lender fetching proposals...');
  const proposals = await lenderClient.getActiveProposals();
  const myProposal = proposals.find(p => p.contractId === proposal.contractId);

  if (myProposal) {
    // 4. Lender creates a cash allocation (not shown)
    const cashAllocationCid = '...';

    // 5. Lender accepts the proposal
    console.log('Lender accepting proposal...');
    const agreement = await lenderClient.acceptRepo(myProposal.contractId, cashAllocationCid);
    console.log('Repo Agreement created:', agreement.contractId);
  }
}

runRepoWorkflow().catch(console.error);
```

## 6. Custodian Integration

Custodians play a vital role in asset servicing and reporting. In the Canton Repo Protocol, a custodian can be added as an `observer` on a `RepoAgreement`.

As an observer, the custodian's participant node will receive a copy of every relevant contract and transaction, allowing for real-time, automated reconciliation.

### Integration via Participant Query Store (PQS)

For robust reporting and analytics, we highly recommend integrating with the Participant Query Store (PQS). The PQS ingests all ledger data visible to your participant into a PostgreSQL database, enabling you to run complex SQL queries.

**Example: Querying for all active repo agreements for a client.**

This query retrieves the payload of all active `RepoAgreement` contracts where your client (`${clientPartyId}`) is either the borrower or the lender.

```sql
SELECT
  payload ->> 'repoId' AS repo_id,
  payload ->> 'borrower' AS borrower,
  payload ->> 'lender' AS lender,
  (payload ->> 'cashAmount')::numeric AS principal,
  (payload ->> 'rate')::numeric AS rate,
  payload -> 'collateralQuantity' ->> 'name' AS collateral_asset,
  (payload -> 'collateralQuantity' ->> 'amount')::numeric AS collateral_amount,
  (payload ->> 'startDate')::date AS start_date,
  (payload ->> 'maturityDate')::date AS maturity_date
FROM
  active('Repo.Agreement:RepoAgreement', '${custodianPartyId}')
WHERE
  payload ->> 'borrower' = '${clientPartyId}' OR payload ->> 'lender' = '${clientPartyId}';
```

This provides a powerful, read-only view of your clients' positions without needing to hit the transactional Ledger API.

## 7. Support

For questions, bug reports, or feature requests, please open an issue in the [GitHub repository](https://github.com/digital-asset/canton-repo-protocol/issues). For general questions about Canton and Daml, please refer to the official [Canton Documentation](https://docs.canton.io/) and [Daml Documentation](https://docs.daml.com/).