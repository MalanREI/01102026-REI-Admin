// Generates solid-color placeholder PNGs for the Outlook add-in manifest.
import { PNG } from 'pngjs';
import { mkdirSync, createWriteStream } from 'node:fs';
import { join } from 'node:path';

const SIZES = [16, 32, 64, 80, 128];
const OUTPUT_DIR = 'public/icons';
const COLOR = { r: 31, g: 64, b: 128, a: 255 };

mkdirSync(OUTPUT_DIR, { recursive: true });

for (const size of SIZES) {
  const png = new PNG({ width: size, height: size });
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (size * y + x) << 2;
      png.data[i + 0] = COLOR.r;
      png.data[i + 1] = COLOR.g;
      png.data[i + 2] = COLOR.b;
      png.data[i + 3] = COLOR.a;
    }
  }
  const out = join(OUTPUT_DIR, `icon-${size}.png`);
  await new Promise((resolve, reject) => {
    png.pack().pipe(createWriteStream(out))
      .on('finish', resolve)
      .on('error', reject);
  });
  console.log(`wrote ${out}`);
}
