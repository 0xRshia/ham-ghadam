import { ApiError } from "@/lib/server";

// Workers deployments do not provision a paid Images binding. The UI uses
// original media URLs there; static WebP variants work on both runtimes.
export const imageVariantsSupported = false;
export const readImageVariant: (key: string, width: number) => Promise<ArrayBuffer | null> = async () => {
  throw new ApiError(400, "تغییر اندازهٔ تصویر در این محیط فعال نیست.");
};
