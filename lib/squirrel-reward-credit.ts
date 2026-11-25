export const SQUIRREL_REWARD_TOMAN = 100_000;
export const squirrelRewardCreditHeader = "X-Hamghadam-Squirrel-Reward";
export const squirrelRewardCreditMode = "wallet";

export type SquirrelRewardCredit = {
  amountToman: number;
  balanceAfter: number;
  walletHref: string;
};
