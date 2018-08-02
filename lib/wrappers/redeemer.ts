"use strict";
import { Address, Hash } from "../commonTypes";
import { ContractWrapperBase } from "../contractWrapperBase";
import { ContractWrapperFactory } from "../contractWrapperFactory";
import { ArcTransactionResult, IContractWrapperFactory } from "../iContractWrapperBase";
import { TxGeneratingFunctionOptions } from "../transactionService";
import { Web3EventService } from "../web3EventService";

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

export interface GetRedemptionOptions {
  proposalId: Hash;
  executed?: boolean;
}

export interface RedemptionResult {
  contributionRewardEther: boolean;
  contributionRewardExternalToken: boolean;
  contributionRewardNativeToken: boolean;
  contributionRewardReputation: boolean;
  proposalExecuted: boolean;
  genesisProtocolRedeem: boolean;
  genesisProtocolDaoBounty: boolean;
  proposalId: Hash;
}

export interface RedeemerOptions extends TxGeneratingFunctionOptions {
  avatarAddress: Address;
  beneficiaryAddress: Address;
  proposalId: Hash;
}

export interface RedeemerRedeemEventResult {
  _contributionRewardEther: boolean;
  _contributionRewardExternalToken: boolean;
  _contributionRewardNativeToken: boolean;
  _contributionRewardReputation: boolean;
  /**
   * indexed
   */
  _execute: boolean;
  _genesisProtocolRedeem: boolean;
  _genesisProtocolDaoBounty: boolean;
  _proposalId: Hash;
}