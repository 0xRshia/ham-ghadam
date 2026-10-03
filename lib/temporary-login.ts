import { faContent } from "@/locales/domain-fa";
import { config } from "@/db";

// TODO(PRODUCTION): REMOVE_TEMP_LOGIN — delete this module after revoking demo sessions.
const accounts = new Map([
  ["09108624707", { isHost: false, name: faContent.temporaryUser }],
  ["09108624708", { isHost: true, name: faContent.temporaryHost }],
]);

export function temporaryLoginEnabled() {
  return config().TEMP_LOGIN_ENABLED === "true";
}

export function temporaryAccount(phone: string) {
  return temporaryLoginEnabled() ? accounts.get(phone) : undefined;
}

// Distinguish test challenges so disabling demo mode also rejects outstanding codes.
export const temporaryOtpHashPrefix = "test:";

export function temporaryOtpCode(phone: string) {
  return temporaryLoginEnabled() && phone === "09108624707" ? "123456" : undefined;
}
