import { faContent } from "@/locales/domain-fa";
import { isImageFileSelection, imageFileError, MAX_IMAGE_BYTES, MAX_EVENT_IMAGE_BYTES } from "./media-policy";

export function validateImages(files: File[]) {
  for (const file of files) {
    if (!isImageFileSelection(file)) return imageFileError(file.name, faContent.imageTypeInvalid);
    if (file.size === 0 || file.size > MAX_IMAGE_BYTES) return imageFileError(file.name, faContent.imageSizeInvalid);
  }
  if (files.reduce((total, file) => total + file.size, 0) > MAX_EVENT_IMAGE_BYTES)
    return faContent.combinedImagesTooLarge;
  return "";
}

