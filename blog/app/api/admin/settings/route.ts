import { requireAdmin, assertOrigin } from "@/lib/auth";
import { saveSettings } from "@/lib/store";
import { boundary, json, readJson } from "@/lib/http";
import { settingsInput } from "@/lib/validation";
import { assertReferencedImages } from "@/lib/media";
export async function PUT(request: Request) {
  return boundary(async () => {
    assertOrigin(request); await requireAdmin(); const data = await readJson(request);
    const settings = settingsInput(data.settings);
    await assertReferencedImages(settings.homeBody, [settings.logoUrl, settings.socialImage]);
    return json({ settings: saveSettings(data.settings) });
  });
}
