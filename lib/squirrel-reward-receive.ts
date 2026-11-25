export const squirrelRewardReceivePath = "/game/reward/receive";
export const squirrelRewardStorageKey = "hg:squirrel-reward-receive";
export const squirrelRewardTokenPattern = /^[a-f0-9]{64}$/;

// Older production envs name the magazine apex. Accounts live on app or Stage.
export function squirrelAccountOrigin(appOrigin: string | undefined) {
  const stage = "https://stage.hmghadam.com";
  return appOrigin?.replace(/\/$/, "") === stage ? stage : "https://app.hmghadam.com";
}
