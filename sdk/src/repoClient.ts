import {
  CreateEvent,
  ExerciseResult,
  Ledger,
  Query,
} from '@c7/ledger';

// Assuming Daml code generation has been run and the package is available.
// The package name is derived from the 'name' and 'version' in daml.yaml.
import * as Repo from '@daml.js/canton-repo-protocol-0.1.0/lib/Repo/V1/Repo';
// The following imports assume the use of standard Daml finance interfaces for instruments and IDs.
import { InstrumentKey } from '@daml.js/daml-finance-interface-instrument-base-v1.0.0/lib/Daml/Finance/Interface/Instrument/Base/Instrument';

/**
 * Represents the arguments needed to propose a new repo agreement.
 * This is initiated by the lender (cash provider).
 */
export type ProposeRepoArgs = {
  /** A unique identifier for this repo proposal, used for tracking. */
  id: string;
  /** The party acting as the borrower (collateral provider). */
  borrower: string;
  /** The principal amount of cash to be lent. */
  principalAmount: string;
  /** The instrument key identifying the cash asset (e.g., USD). */
  principalInstrument: InstrumentKey;
  /** The repo rate as a decimal (e.g., "0.05" for 5%). */
  rate: string;
  /** The maturity date of the repo in ISO 8601 format (YYYY-MM-DD). */
  maturityDate: string;
  /** The amount of collateral to be provided. */
  collateralAmount: string;
  /** The instrument key identifying the collateral asset (e.g., US Treasury Bond). */
  collateralInstrument: InstrumentKey;
};

/**
 * Represents the arguments needed to accept a repo proposal.
 * This is initiated by the borrower.
 */
export type AcceptRepoArgs = {
  /** The contract ID of the `RepoProposal` to be accepted. */
  proposalCid: string;
  /** The contract ID of the fungible asset representing the collateral being posted by the borrower. */
  collateralHoldingCid: string;
};

/**
 * Represents the arguments needed to close a repo at maturity.
 * This is initiated by the borrower to repay the loan and reclaim collateral.
 */
export type CloseRepoArgs = {
  /** The contract ID of the active `RepoAgreement` to be closed. */
  agreementCid: string;
  /** The contract ID of the fungible asset representing the principal + interest repayment. */
  repaymentHoldingCid: string;
};

/**
 * Provides a client-side API for interacting with the Canton Repo Protocol.
 * This class encapsulates the logic for creating, accepting, and closing repo agreements,
 * as well as querying for their state on the ledger.
 */
export class RepoClient {
  /**
   * @param ledger An instance of the `@c7/ledger` Ledger object, configured for a specific party.
   * @param party The party ID (string) on behalf of whom commands are submitted.
   */
  constructor(
    private readonly ledger: Ledger,
    private readonly party: string
  ) {}

  /**
   * Proposes a new repo agreement as the lender.
   * This creates a `RepoProposal` contract on the ledger, which the borrower can then accept.
   * @param args The parameters for the repo proposal.
   * @returns A promise that resolves to the creation event of the `RepoProposal` contract.
   */
  public async proposeRepo(
    args: ProposeRepoArgs
  ): Promise<CreateEvent<Repo.RepoProposal>> {
    const payload: Repo.RepoProposal = {
      lender: this.party,
      borrower: args.borrower,
      id: { unpack: args.id },
      principalAmount: args.principalAmount,
      principalInstrument: args.principalInstrument,
      rate: args.rate,
      maturityDate: args.maturityDate,
      collateralAmount: args.collateralAmount,
      collateralInstrument: args.collateralInstrument,
      observers: [], // Observers (e.g., regulators) can be added here if needed
    };

    return this.ledger.create(Repo.RepoProposal, payload);
  }

  /**
   * Accepts an existing repo proposal as the borrower.
   * This action is atomic and results in a Delivery-vs-Payment (DvP) settlement,
   * creating a `RepoAgreement` upon successful transfer of cash and collateral.
   * @param args The arguments required to accept the proposal.
   * @returns A promise that resolves to the exercise result, containing the created `RepoAgreement` contract.
   */
  public async acceptRepo(
    args: AcceptRepoArgs
  ): Promise<ExerciseResult<Repo.RepoAgreement>> {
    const choiceArgs = {
      collateralHoldingCid: args.collateralHoldingCid,
    };
    return this.ledger.exercise(
      Repo.RepoProposal.AcceptRepo,
      args.proposalCid,
      choiceArgs
    );
  }

  /**
   * Closes an active repo agreement at maturity as the borrower.
   * This action triggers the closing leg of the repo, where the borrower repays the
   * principal plus interest, and the lender returns the collateral.
   * @param args The arguments required to close the agreement.
   * @returns A promise that resolves to the exercise result. The return value is `void` as the agreement is archived.
   */
  public async closeRepo(args: CloseRepoArgs): Promise<ExerciseResult<void>> {
    const choiceArgs = {
      repaymentHoldingCid: args.repaymentHoldingCid,
    };
    return this.ledger.exercise(
      Repo.RepoAgreement.CloseRepo,
      args.agreementCid,
      choiceArgs
    );
  }

  /**
   * Fetches all open repo proposals where the current party is a stakeholder.
   * @returns A promise that resolves to an array of `RepoProposal` creation events.
   */
  public async fetchOpenProposals(): Promise<CreateEvent<Repo.RepoProposal>[]> {
    const query: Query<Repo.RepoProposal> = {
      templateId: Repo.RepoProposal.templateId,
    };
    return this.ledger.query(query);
  }

  /**
   * Fetches all active repo agreements where the current party is a stakeholder.
   * @returns A promise that resolves to an array of `RepoAgreement` creation events.
   */
  public async fetchActiveAgreements(): Promise<
    CreateEvent<Repo.RepoAgreement>[]
  > {
    const query: Query<Repo.RepoAgreement> = {
      templateId: Repo.RepoAgreement.templateId,
    };
    return this.ledger.query(query);
  }

  /**
   * Fetches a specific repo proposal by its contract ID.
   * Returns null if the contract is not found or the party does not have visibility.
   * @param cid The contract ID of the proposal.
   * @returns A promise that resolves to the creation event or null.
   */
  public async fetchProposal(
    cid: string
  ): Promise<CreateEvent<Repo.RepoProposal> | null> {
    return this.ledger.fetch(Repo.RepoProposal, cid);
  }

  /**
   * Fetches a specific repo agreement by its contract ID.
   * Returns null if the contract is not found or the party does not have visibility.
   * @param cid The contract ID of the agreement.
   * @returns A promise that resolves to the creation event or null.
   */
  public async fetchAgreement(
    cid: string
  ): Promise<CreateEvent<Repo.RepoAgreement> | null> {
    return this.ledger.fetch(Repo.RepoAgreement, cid);
  }
}