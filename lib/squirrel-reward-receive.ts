export const squirrelRewardReceivePath = "/game/reward/receive";
export const squirrelRewardStorageKey = "hg:squirrel-reward-receive";
export const squirrelRewardTokenPattern = /^[a-f0-9]{64}$/;

export const squirrelGameOrigin = "https://game.hmghadam.com";
export const squirrelAccountOrigin = "https://app.hmghadam.com";

export function squirrelPlayEndpoint(origin: string, action: "session" | "claim") {
  const base = origin === squirrelGameOrigin ? squirrelAccountOrigin : "";
  return base + "/game/reward/" + action;
}
