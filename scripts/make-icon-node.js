// Generates assets/icon.icns using the existing pure-JS PNG encoder
// Run: node scripts/make-icon-node.js
const path = require('path');
const fs   = require('fs');
const zlib = require('zlib');
const { execFileSync } = require('child_process');

const iconsetDir = path.resolve(__dirname, '../assets/icon.iconset');
const icnsOut    = path.resolve(__dirname, '../assets/icon.icns');
if (!fs.existsSync(iconsetDir)) fs.mkdirSync(iconsetDir, { recursive: true });

// ── Inline PNG encoder (same as main.js) ─────────────────────────────────────
function crc32(buf) {
  let c = 0xffffffff;
  const table = (() => {
    const t = new Uint32Array(256);
    for (let n=0;n<256;n++){let v=n;for(let k=0;k<8;k++)v=(v&1)?0xedb88320^(v>>>1):v>>>1;t[n]=v;}
    return t;
  })();
  for (let i=0;i<buf.length;i++) c=table[(c^buf[i])&0xff]^(c>>>8);
  return (c^0xffffffff)>>>0;
}
function makeChunk(type, data) {
  const tb=Buffer.from(type,'ascii'), len=Buffer.alloc(4); len.writeUInt32BE(data.length);
  const body=Buffer.concat([tb,data]), crc=Buffer.alloc(4); crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len,body,crc]);
}
function makePNG(w,h,pixels) {
  const raw=Buffer.alloc(h*(1+w*4));
  for(let y=0;y<h;y++){raw[y*(w*4+1)]=0;for(let x=0;x<w;x++){const d=y*(w*4+1)+1+x*4,s=(y*w+x)*4;raw[d]=pixels[s];raw[d+1]=pixels[s+1];raw[d+2]=pixels[s+2];raw[d+3]=pixels[s+3];}}
  const compressed=zlib.deflateSync(raw),ihdr=Buffer.alloc(13);
  ihdr.writeUInt32BE(w,0);ihdr.writeUInt32BE(h,4);ihdr[8]=8;ihdr[9]=6;
  return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),makeChunk('IHDR',ihdr),makeChunk('IDAT',compressed),makeChunk('IEND',Buffer.alloc(0))]);
}

// ── Mascot geometry (same as main.js) ────────────────────────────────────────
const MASCOT_BODY = [
  {x:40,y:8.1},{x:33.3,y:8.1},{x:33.3,y:4.9},{x:31.6,y:4.9},{x:31.6,y:3.2},
  {x:33.3,y:3.2},{x:33.3,y:0},{x:6.6,y:0},{x:6.6,y:3.2},{x:8.4,y:3.2},
  {x:8.4,y:4.9},{x:6.6,y:4.9},{x:6.6,y:8.1},{x:0,y:8.1},{x:0,y:16.3},
  {x:6.6,y:16.3},{x:6.6,y:21.2},{x:6.6,y:26},{x:9.9,y:26},{x:9.9,y:21.2},
  {x:13.3,y:21.2},{x:13.3,y:26},{x:16.7,y:26},{x:16.7,y:21.2},{x:23.3,y:21.2},
  {x:23.3,y:26},{x:26.6,y:26},{x:26.6,y:21.2},{x:30,y:21.2},{x:30,y:26},
  {x:33.3,y:26},{x:33.3,y:16.3},{x:40,y:16.3},
];

function fillPoly(px, W, H, verts, ox, oy, sc, r, g, b, a=255) {
  const pts = verts.map(v => [v.x*sc+ox, v.y*sc+oy]);
  const yMin=Math.floor(Math.min(...pts.map(p=>p[1])));
  const yMax=Math.ceil(Math.max(...pts.map(p=>p[1])));
  const n=pts.length;
  for(let y=yMin;y<=yMax;y++){
    const xs=[];
    for(let i=0;i<n;i++){
      const [ax,ay]=pts[i],[bx,by]=pts[(i+1)%n];
      if((ay<=y&&by>y)||(by<=y&&ay>y)) xs.push(ax+(y-ay)/(by-ay)*(bx-ax));
    }
    xs.sort((a,b)=>a-b);
    for(let i=0;i+1<xs.length;i+=2)
      for(let x=Math.floor(xs[i]);x<=Math.ceil(xs[i+1]);x++){
        if(x<0||x>=W||y<0||y>=H)continue;
        const idx=(y*W+x)*4;px[idx]=r;px[idx+1]=g;px[idx+2]=b;px[idx+3]=a;
      }
  }
}

function fillRect(px, W, H, svgX, svgY, svgW, svgH, ox, oy, sc, r, g, b) {
  const x0=Math.floor(svgX*sc+ox),y0=Math.floor(svgY*sc+oy);
  const x1=Math.ceil((svgX+svgW)*sc+ox),y1=Math.ceil((svgY+svgH)*sc+oy);
  for(let y=y0;y<=y1;y++) for(let x=x0;x<=x1;x++){
    if(x<0||x>=W||y<0||y>=H)continue;
    const idx=(y*W+x)*4;px[idx]=r;px[idx+1]=g;px[idx+2]=b;px[idx+3]=255;
  }
}

function drawIcon(size) {
  const px = new Uint8Array(size * size * 4); // transparent

  // Dark rounded square background
  const r = Math.round(size * 0.22);
  const bg = { x: 0, y: 0, w: size, h: size };
  // Fill background as rounded rect (approximate with circle corners)
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      // Check if inside rounded rect
      const cx = Math.min(Math.max(x, r), size - r);
      const cy = Math.min(Math.max(y, r), size - r);
      const dist = Math.sqrt((x-cx)**2 + (y-cy)**2);
      if (dist <= r || (x >= r && x <= size-r) || (y >= r && y <= size-r)) {
        if (x >= r || y >= r || dist <= r) {
          // simplified: just fill the whole square, mask corners
          const inCorner = (x < r || x > size-r) && (y < r || y > size-r);
          if (!inCorner || dist <= r) {
            const idx = (y*size+x)*4;
            px[idx]=0x1a; px[idx+1]=0x1a; px[idx+2]=0x1a; px[idx+3]=255;
          }
        }
      }
    }
  }

  // Draw mascot centered, SVG viewBox is 40x26, scale to ~72% of icon
  const mascotW = size * 0.72;
  const sc = mascotW / 40;
  const ox = (size - mascotW) / 2;
  const oy = (size - 26 * sc) / 2;

  fillPoly(px, size, size, MASCOT_BODY, ox, oy, sc, 0xda, 0x78, 0x59);
  fillRect(px, size, size, 8.4, 3.3, 23.3, 1.6, ox, oy, sc, 0x18, 0x4c, 0x81);
  fillRect(px, size, size, 10, 8.1, 3.6, 4.9, ox, oy, sc, 0x2a, 0x00, 0x00);
  fillRect(px, size, size, 26.5, 8.1, 3.6, 4.9, ox, oy, sc, 0x2a, 0x00, 0x00);

  return makePNG(size, size, px);
}

// ── Icon name map ─────────────────────────────────────────────────────────────
const nameMap = {
  16:   ['icon_16x16.png'],
  32:   ['icon_16x16@2x.png', 'icon_32x32.png'],
  64:   ['icon_32x32@2x.png'],
  128:  ['icon_128x128.png'],
  256:  ['icon_128x128@2x.png', 'icon_256x256.png'],
  512:  ['icon_256x256@2x.png', 'icon_512x512.png'],
  1024: ['icon_512x512@2x.png'],
};

for (const [size, names] of Object.entries(nameMap)) {
  const png = drawIcon(Number(size));
  for (const name of names) {
    fs.writeFileSync(path.join(iconsetDir, name), png);
  }
  console.log(`✓ ${size}x${size}`);
}

try {
  execFileSync('iconutil', ['-c', 'icns', iconsetDir, '-o', icnsOut]);
  console.log('✓ assets/icon.icns created');
} catch(e) { console.error('iconutil failed:', e.message); }
