"use strict";
import BigNumber from "bignumber.js";
import { Address, Hash } from "../commonTypes";
import { ContractWrapperBase } from "../contractWrapperBase";
import { ContractWrapperFactory } from "../contractWrapperFactory";
import { ArcTransactionResult, IContractWrapperFactory, DecodedLogEntryEvent } from "../iContractWrapperBase";
import { TxGeneratingFunctionOptions } from "../transactionService";
import { AggregatedEventsResult, EntityFetcherFactory, EventToAggregate, Web3EventService } from "../web3EventService";
import { WrapperService } from "../wrapperService";
import { RedeemEventResult } from "./commonEventInterfaces";

export class RedeemerWrapper extends ContractWrapperBase {
  public name: string = "Redeemer";
  public friendlyName: string = "Redeemer";
  public factory: IContractWrapperFactory<RedeemerWrapper> = RedeemerFactory;

  /**
   * Redeems rewards for a ContributionReward proposal in a single transaction.
   * Calls execute on the proposal if it is not yet executed.
   * Redeems rewardable reputation and stake from the GenesisProtocol.
   * Redeem rewardable contribution proposal rewards.
   * @param options
   */
  public async redeem(options: RedeemerOptions & TxGeneratingFunctionOptions)
    : Promise<ArcTransactionResult> {

    if (!options.avatarAddress) {
      throw new Error("avatarAddress is not defined");
    }

    if (!options.beneficiaryAddress) {
      throw new Error("beneficiaryAddress is not defined");
    }

    if (!options.proposalId) {
      throw new Error("proposalId is not defined");
    }

    this.logContractFunctionCall("Redeemer.redeem", options);

    return this.wrapTransactionInvocation("Redeemer.redeem",
      options,
      this.contract.redeem,
      [options.proposalId, options.avatarAddress, options.beneficiaryAddress]
    );
  }

  /**
   * Returns the amounts that would be redeemed if `Redeemer.redeem` were invoked right now.
   * @param options
   */
  public async redeemables(options: RedeemerOptions)
    : Promise<RedeeemableResult> {

    if (!options.avatarAddress) {
      throw new Error("avatarAddress is not defined");
    }

    if (!options.beneficiaryAddress) {
      throw new Error("beneficiaryAddress is not defined");
    }

    if (!options.proposalId) {
      throw new Error("proposalId is not defined");
    }

    this.logContractFunctionCall("Redeemer.redeem.call", options);

    const result = await this.contract.redeem.call(
      options.proposalId,
      options.avatarAddress,
      options.beneficiaryAddress)
      // correct for fake truffle promises
      .then((r: any): any => r)
      .catch((ex: Error) => {
        throw new Error(ex.message);
      });

    return {
      contributionRewardEther: result[3][2],
      contributionRewardExternalToken: result[3][3],
      contributionRewardNativeToken: result[3][1],
      contributionRewardReputation: result[3][0],
      daoStakingBountyPotentialReward: result[1][1],
      daoStakingBountyReward: result[1][0],
      proposalExecuted: result[2],
      proposalId: options.proposalId,
      proposerReputationAmount: result[0][4],
      stakerReputationAmount: result[0][1],
      stakerTokenAmount: result[0][0],
      voterReputationAmount: result[0][3],
      voterTokenAmount: result[0][2],
    };
  }


  /**
   * Obtain an `EntityFetcherFactory` that enables you to get, watch and subscribe to events that
   * return a `RedeemerRewardEventsResult` when rewards are rewarded, either via `Redeemer.redeem`
   * or directly via `GenesisProtocol` and `ContributionReward`.
   * @param options
   */
  public rewardsEvents(options: RewardsEventsOptions = {}):
    EntityFetcherFactory<RedeemerRewardEventsResult, AggregatedEventsResult> {

    const web3EventService = new Web3EventService();
    const eventSpecifiersMap = new Map<EventToAggregate, string>();
    const genesisProtocol = WrapperService.wrappers.GenesisProtocol;
    const contributionReward = WrapperService.wrappers.ContributionReward;
    const redeemerContractAddress = options.redeemerAddress || this.address;

    /* tslint:disable:max-line-length */
    eventSpecifiersMap.set({ eventName: "Redeem", contract: genesisProtocol }, "rewardGenesisProtocolTokens");
    eventSpecifiersMap.set({ eventName: "RedeemReputation", contract: genesisProtocol }, "rewardGenesisProtocolReputation");
    eventSpecifiersMap.set({ eventName: "RedeemDaoBounty", contract: genesisProtocol }, "bountyGenesisProtocolDao");
    eventSpecifiersMap.set({ eventName: "RedeemReputation", contract: contributionReward }, "rewardContributionReputation");
    eventSpecifiersMap.set({ eventName: "RedeemEther", contract: contributionReward }, "rewardContributionEther");
    eventSpecifiersMap.set({ eventName: "RedeemNativeToken", contract: contributionReward }, "rewardContributionNativeToken");
    eventSpecifiersMap.set({ eventName: "RedeemExternalToken", contract: contributionReward }, "rewardContributionExternalToken");
    /* tslint:enable:max-line-length */

    const baseFetcherFactory = web3EventService.aggregatedEventsFetcherFactory(Array.from(eventSpecifiersMap.keys()));

    return web3EventService.pipeEntityFetcherFactory(
      baseFetcherFactory,
      (txEvent: AggregatedEventsResult): Promise<RedeemerRewardEventsResult | undefined> => {
        if (options.allSources || (txEvent.txReceipt.receipt.contractAddress === redeemerContractAddress)) {

          const events: Array<DecodedLogEntryEvent<RedeemEventResult>> = Array.from(txEvent.events.values());
          const proposalId = events[0].args._proposalId;
          const result = {
            proposalId,
            transactionHash: txEvent.txReceipt.transactionHash,
          } as RedeemerRewardEventsResult;

          /**
           * get all the reward amounts
           */
          for (const eventSpecifier of eventSpecifiersMap.keys()) {
            const event = txEvent.events.get(eventSpecifier) as DecodedLogEntryEvent<RedeemEventResult>;
            if (event) {
              result[eventSpecifiersMap.get(eventSpecifier)] = event.args._amount;
            }
          }

          /**
           * get the GP beneficiary, if there is one
           */
          for (const eventSpecifier of txEvent.events.keys()) {

            const propertyName = eventSpecifiersMap.get(eventSpecifier);

            if ([
              "rewardGenesisProtocolTokens",
              "rewardGenesisProtocolReputation",
              "bountyGenesisProtocolDao"].indexOf(propertyName) !== -1) {

              const event = txEvent.events.get(eventSpecifier) as DecodedLogEntryEvent<RedeemEventResult>;
              result.beneficiaryGenesisProtocol = event.args._beneficiary;
              break;
            }
          }

          /**
           * get the CR beneficiary, if there is one
           */
          for (const eventSpecifier of txEvent.events.keys()) {
            const propertyName = eventSpecifiersMap.get(eventSpecifier);

            if ([
              "rewardContributionReputation",
              "rewardContributionEther",
              "rewardContributionNativeToken",
              "rewardContributionExternalToken"].indexOf(propertyName) !== -1) {

              const event = txEvent.events.get(eventSpecifier) as DecodedLogEntryEvent<RedeemEventResult>;
              result.beneficiaryContributionReward = event.args._beneficiary;
              break;
            }
          }
          return Promise.resolve(result);
        }
      });
  }
}

/**
 * defined just to add good type checking
 */
export class RedeemerFactoryType extends ContractWrapperFactory<RedeemerWrapper> {

  public async new(
    contributionRewardAddress: Address,
    genesisProtocolAddress: Address): Promise<RedeemerWrapper> {
    return super.new(contributionRewardAddress, genesisProtocolAddress);
  }
}

export const RedeemerFactory =
  new RedeemerFactoryType(
    "Redeemer",
    RedeemerWrapper,
    new Web3EventService()) as RedeemerFactoryType;

export interface RedeeemableResult {
  contributionRewardEther: boolean;
  contributionRewardExternalToken: boolean;
  contributionRewardNativeToken: boolean;
  contributionRewardReputation: boolean;
  daoStakingBountyReward: BigNumber;
  daoStakingBountyPotentialReward: BigNumber;
  proposalExecuted: boolean;
  proposalId: Hash;
  proposerReputationAmount: BigNumber;
  stakerReputationAmount: BigNumber;
  stakerTokenAmount: BigNumber;
  voterReputationAmount: BigNumber;
  voterTokenAmount: BigNumber;
}

export interface RedeemerOptions {
  avatarAddress: Address;
  beneficiaryAddress: Address;
  proposalId: Hash;
}

export interface RedeemerRewardEventsResult {
  beneficiaryGenesisProtocol: Address;
  beneficiaryContributionReward: Address;
  bountyGenesisProtocolDao: BigNumber;
  proposalId: Hash;
  rewardContributionEther: BigNumber;
  rewardContributionExternalToken: BigNumber;
  rewardContributionNativeToken: BigNumber;
  rewardContributionReputation: BigNumber;
  rewardGenesisProtocolTokens: BigNumber;
  rewardGenesisProtocolReputation: BigNumber;
  transactionHash: Hash;
}

/**
 * Options for `rewardsEvents`.
 */
export interface RewardsEventsOptions {
  /**
   * True to report on all redeeming traansactions, false to report on
   * only those transactions that originate with the Redeemer contract.  The default
   * is false.
   */
  allSources?: boolean;
  /**
   * Optional Redeemer contract address.  The default is the one deployed by the
   * currently running version of Arc.js.
   */
  redeemerAddress?: Address;
}
