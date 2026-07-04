import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import gifenc from "gifenc";
import { PNG } from "pngjs";

const { GIFEncoder, applyPalette, quantize } = gifenc;

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outputPath = join(root, "docs/assets/agentdesk-demo-loop.gif");
const framePaths = [
  "docs/assets/agentdesk-start-here.png",
  "docs/assets/agentdesk-failure-debug.png",
  "docs/assets/agentdesk-artifacts.png",
  "docs/assets/agentdesk-llm-config.png",
  "docs/assets/agentdesk-workflow-run.png"
];

const width = 720;
const height = 500;
const background = [8, 13, 31, 255];

const frames = framePaths.map((path) => readFrame(join(root, path), width, height));
const gif = GIFEncoder({ initialCapacity: 1024 * 1024 });

for (const frame of [...frames, frames[0]]) {
  const palette = quantize(frame, 192, { format: "rgb444" });
  const index = applyPalette(frame, palette, "rgb444");
  gif.writeFrame(index, width, height, { palette, delay: 900, repeat: 0 });
}

gif.finish();
mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, gif.bytes());
console.log(`Created ${outputPath}`);

function readFrame(path, targetWidth, targetHeight) {
  const png = PNG.sync.read(readFileSync(path));
  const frame = new Uint8Array(targetWidth * targetHeight * 4);

  for (let i = 0; i < frame.length; i += 4) {
    frame[i] = background[0];
    frame[i + 1] = background[1];
    frame[i + 2] = background[2];
    frame[i + 3] = background[3];
  }

  const scale = Math.min(targetWidth / png.width, targetHeight / png.height);
  const drawWidth = Math.floor(png.width * scale);
  const drawHeight = Math.floor(png.height * scale);
  const offsetX = Math.floor((targetWidth - drawWidth) / 2);
  const offsetY = Math.floor((targetHeight - drawHeight) / 2);

  for (let y = 0; y < drawHeight; y += 1) {
    const sourceY = Math.min(png.height - 1, Math.floor(y / scale));

    for (let x = 0; x < drawWidth; x += 1) {
      const sourceX = Math.min(png.width - 1, Math.floor(x / scale));
      const sourceIndex = (sourceY * png.width + sourceX) * 4;
      const targetIndex = ((offsetY + y) * targetWidth + offsetX + x) * 4;
      const alpha = png.data[sourceIndex + 3] / 255;

      frame[targetIndex] = blend(png.data[sourceIndex], background[0], alpha);
      frame[targetIndex + 1] = blend(png.data[sourceIndex + 1], background[1], alpha);
      frame[targetIndex + 2] = blend(png.data[sourceIndex + 2], background[2], alpha);
      frame[targetIndex + 3] = 255;
    }
  }

  return frame;
}

function blend(foreground, base, alpha) {
  return Math.round(foreground * alpha + base * (1 - alpha));
}
