#!/usr/bin/env node
/**
 * Build a Windows .ico file from existing PNG sources.
 * Modern ICO format: embedded PNG data for each size.
 */

const fs = require('fs');
const path = require('path');

const ASSETS = path.join(__dirname, '..', 'assets');
const ICONSET = path.join(ASSETS, 'icon.iconset');

const sources = [
  { file: path.join(ICONSET, 'icon_16x16.png'),   w: 16,  h: 16  },
  { file: path.join(ICONSET, 'icon_32x32.png'),    w: 32,  h: 32  },
  { file: '/tmp/icon-48.png',                       w: 48,  h: 48  },
  { file: path.join(ICONSET, 'icon_256x256.png'),   w: 256, h: 256 },
];

// Read all PNG buffers
const images = sources.map(s => ({
  ...s,
  data: fs.readFileSync(s.file),
}));

const count = images.length;

// ICO header: 6 bytes
// Directory entries: 16 bytes each
// Then image data
const headerSize = 6;
const dirEntrySize = 16;
const dirSize = dirEntrySize * count;
let dataOffset = headerSize + dirSize;

// Build header
const header = Buffer.alloc(headerSize);
header.writeUInt16LE(0, 0);       // reserved
header.writeUInt16LE(1, 2);       // type = ICO
header.writeUInt16LE(count, 4);   // image count

// Build directory entries and collect offsets
const dirEntries = Buffer.alloc(dirSize);
let currentOffset = dataOffset;

for (let i = 0; i < count; i++) {
  const img = images[i];
  const off = i * dirEntrySize;

  // Width and height: 0 means 256
  dirEntries.writeUInt8(img.w >= 256 ? 0 : img.w, off + 0);  // width
  dirEntries.writeUInt8(img.h >= 256 ? 0 : img.h, off + 1);  // height
  dirEntries.writeUInt8(0, off + 2);                           // color palette count
  dirEntries.writeUInt8(0, off + 3);                           // reserved
  dirEntries.writeUInt16LE(1, off + 4);                        // color planes
  dirEntries.writeUInt16LE(32, off + 6);                       // bits per pixel
  dirEntries.writeUInt32LE(img.data.length, off + 8);          // image data size
  dirEntries.writeUInt32LE(currentOffset, off + 12);           // offset to image data

  currentOffset += img.data.length;
}

// Concatenate everything
const ico = Buffer.concat([header, dirEntries, ...images.map(i => i.data)]);
const outPath = path.join(ASSETS, 'icon.ico');
fs.writeFileSync(outPath, ico);

console.log(`Created ${outPath} (${ico.length} bytes, ${count} images)`);
images.forEach(img => {
  console.log(`  ${img.w}x${img.h}: ${img.data.length} bytes`);
});
