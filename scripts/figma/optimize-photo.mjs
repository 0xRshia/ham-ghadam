import sharp from 'sharp';
import { resolve } from 'node:path';
const [input,output,width] = process.argv.slice(2);
if(!input || !output || !Number.isInteger(Number(width)) || Number(width)<1)throw new Error('Usage: node scripts/figma/optimize-photo.mjs input output width');
// Keep the source photograph and aspect ratio; crop/overlay remain source-derived CSS.
await sharp(resolve(input)).resize({width:Number(width),withoutEnlargement:true}).webp({quality:90}).toFile(resolve(output));
