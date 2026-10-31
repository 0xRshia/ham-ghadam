/** Progressive enhancement: unsupported browsers retain keyboard AutoFill/paste. */
export function listenForSmsCode(onCode: (code: string) => void, signal: AbortSignal) {
  if (typeof window === "undefined" || !window.isSecureContext || !("OTPCredential" in window) || !navigator.credentials?.get) return false;
  const options: CredentialRequestOptions & { otp: { transport: string[] } } = { otp: { transport: ["sms"] }, signal };
  try {
    void navigator.credentials.get(options).then(credential => {
      const code = (credential as (Credential & { code?: string }) | null)?.code;
      if (!signal.aborted && typeof code === "string" && /^\d{6}$/.test(code)) onCode(code);
    }).catch(() => { /* Dismissal, timeout and unsupported devices keep manual entry available. */ });
    return true;
  } catch { return false; }
}
