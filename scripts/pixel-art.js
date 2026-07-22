/**
 * Pixel Art Converter — Floyd-Steinberg dithering with preset palettes
 * JavaScript port of pixel_art.py
 */

const PALETTES = {
  NES: [
    [0,0,0],[124,124,124],[0,0,252],[0,0,188],[68,40,188],
    [148,0,132],[168,0,32],[168,16,0],[136,20,0],[0,116,0],
    [0,148,0],[0,120,0],[0,88,0],[0,64,88],[188,188,188],
    [0,120,248],[0,88,248],[104,68,252],[216,0,204],[228,0,88],
    [248,56,0],[228,92,16],[172,124,0],[0,184,0],[0,168,0],
    [0,168,68],[0,136,136],[248,248,248],[60,188,252],
    [104,136,252],[152,120,248],[248,120,248],[248,88,152],
    [248,120,88],[252,160,68],[248,184,0],[184,248,24],
    [88,216,84],[88,248,152],[0,232,216],[120,120,120],
    [252,252,252],[164,228,252],[184,184,248],[216,184,248],
    [248,184,248],[248,164,192],[240,208,176],[252,224,168],
    [248,216,120],[216,248,120],[184,248,184],[184,248,216],
    [0,252,252],[216,216,216]
  ],
  GAMEBOY: [
    [0,63,0],[46,115,32],[140,191,10],[160,207,10]
  ],
  PICO_8: [
    [0,0,0],[29,43,83],[126,37,83],[0,135,81],[171,82,54],
    [95,87,79],[194,195,199],[255,241,232],[255,0,77],
    [255,163,0],[255,236,39],[0,228,54],[41,173,255],
    [131,118,156],[255,119,168],[255,204,170]
  ],
  C64: [
    [0,0,0],[255,255,255],[161,77,67],[106,191,199],
    [161,87,164],[92,172,95],[64,64,223],[191,206,137],
    [161,104,60],[108,80,21],[203,126,117],[98,98,98],
    [137,137,137],[154,226,155],[124,124,255],[173,173,173]
  ],
  NEON: [
    [0,0,0],[255,0,128],[0,255,255],[255,0,255],
    [0,255,128],[255,255,0],[128,0,255],[255,128,0],
    [0,128,255],[255,255,255]
  ],
  RETRO: [
    [62,39,35],[139,69,19],[210,105,30],[244,164,96],
    [255,218,185],[255,245,238],[178,34,34],[205,92,92],
    [255,99,71],[255,160,122]
  ]
};

const PRESETS = {
  arcade: { contrast: 1.8, color: 1.5, sharpness: 1.2, posterizeBits: 5, block: 8, palette: 16 },
  snes: { contrast: 1.6, color: 1.4, sharpness: 1.2, posterizeBits: 6, block: 4, palette: 32 },
  nes: { contrast: 1.5, color: 1.4, sharpness: 1.2, posterizeBits: 6, block: 8, palette: 'NES' },
  gameboy: { contrast: 1.5, color: 1.0, sharpness: 1.2, posterizeBits: 6, block: 8, palette: 'GAMEBOY' },
  pico8: { contrast: 1.6, color: 1.3, sharpness: 1.2, posterizeBits: 6, block: 6, palette: 'PICO_8' },
  c64: { contrast: 1.6, color: 1.3, sharpness: 1.2, posterizeBits: 6, block: 8, palette: 'C64' },
  neon: { contrast: 1.8, color: 1.6, sharpness: 1.2, posterizeBits: 5, block: 6, palette: 'NEON' },
  retro: { contrast: 1.2, color: 1.3, sharpness: 1.1, posterizeBits: 6, block: 6, palette: 'RETRO' }
};

/**
 * Find closest color in palette
 */
function closestColor(r, g, b, palette) {
  let minDist = Infinity;
  let closest = palette[0];
  for (const [pr, pg, pb] of palette) {
    const dist = (r - pr) ** 2 + (g - pg) ** 2 + (b - pb) ** 2;
    if (dist < minDist) {
      minDist = dist;
      closest = [pr, pg, pb];
    }
  }
  return closest;
}

/**
 * Generate adaptive palette from image data
 */
function generatePalette(imageData, numColors) {
  const pixels = [];
  const data = imageData.data;
  // Limit pixels for performance (max ~50000 pixels)
  const step = Math.max(1, Math.floor(data.length / 4 / 50000));
  for (let i = 0; i < data.length; i += 4 * step) {
    pixels.push([data[i], data[i + 1], data[i + 2]]);
  }
  
  // Simple median cut — iterative to avoid stack overflow
  function medianCut(startPixels, maxDepth) {
    let groups = [startPixels];
    for (let d = 0; d < maxDepth; d++) {
      const newGroups = [];
      for (const group of groups) {
        if (group.length < 2) { newGroups.push(group); continue; }
        let ranges = [0, 1, 2].map(ch => {
          let min = 255, max = 0;
          for (const p of group) { if (p[ch] < min) min = p[ch]; if (p[ch] > max) max = p[ch]; }
          return max - min;
        });
        const splitCh = ranges.indexOf(Math.max(...ranges));
        group.sort((a, b) => a[splitCh] - b[splitCh]);
        const mid = Math.floor(group.length / 2);
        newGroups.push(group.slice(0, mid), group.slice(mid));
      }
      groups = newGroups;
    }
    return groups.map(g => {
      if (g.length === 0) return [0, 0, 0];
      const avg = [0, 0, 0];
      for (const [r, g2, b] of g) { avg[0] += r; avg[1] += g2; avg[2] += b; }
      return [Math.round(avg[0] / g.length), Math.round(avg[1] / g.length), Math.round(avg[2] / g.length)];
    });
  }
  
  const depth = Math.ceil(Math.log2(numColors));
  return medianCut(pixels, depth).slice(0, numColors);
}

/**
 * Floyd-Steinberg dithering
 */
function floydSteinbergDither(imageData, palette, width, height) {
  const data = imageData.data;
  const err = new Float32Array(width * height * 3);
  
  // Copy initial values
  for (let i = 0; i < data.length; i += 4) {
    const idx = i / 4 * 3;
    err[idx] = data[i];
    err[idx + 1] = data[i + 1];
    err[idx + 2] = data[i + 2];
  }
  
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 3;
      const r = Math.max(0, Math.min(255, Math.round(err[idx])));
      const g = Math.max(0, Math.min(255, Math.round(err[idx + 1])));
      const b = Math.max(0, Math.min(255, Math.round(err[idx + 2])));
      
      const [cr, cg, cb] = closestColor(r, g, b, palette);
      
      const pi = (y * width + x) * 4;
      data[pi] = cr;
      data[pi + 1] = cg;
      data[pi + 2] = cb;
      data[pi + 3] = 255;
      
      const er = r - cr;
      const eg = g - cg;
      const eb = b - cb;
      
      // Distribute error
      const distribute = (tx, ty, factor) => {
        if (tx >= 0 && tx < width && ty >= 0 && ty < height) {
          const ti = (ty * width + tx) * 3;
          err[ti] += er * factor;
          err[ti + 1] += eg * factor;
          err[ti + 2] += eb * factor;
        }
      };
      
      distribute(x + 1, y, 7 / 16);
      distribute(x - 1, y + 1, 3 / 16);
      distribute(x, y + 1, 5 / 16);
      distribute(x + 1, y + 1, 1 / 16);
    }
  }
  
  return imageData;
}

/**
 * Apply contrast enhancement
 */
function adjustContrast(imageData, factor) {
  const data = imageData.data;
  const f = (259 * (factor * 128 + 255)) / (255 * (259 - factor * 128));
  for (let i = 0; i < data.length; i += 4) {
    data[i] = Math.max(0, Math.min(255, f * (data[i] - 128) + 128));
    data[i + 1] = Math.max(0, Math.min(255, f * (data[i + 1] - 128) + 128));
    data[i + 2] = Math.max(0, Math.min(255, f * (data[i + 2] - 128) + 128));
  }
}

/**
 * Apply saturation enhancement
 */
function adjustSaturation(imageData, factor) {
  const data = imageData.data;
  for (let i = 0; i < data.length; i += 4) {
    const gray = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    data[i] = Math.max(0, Math.min(255, gray + factor * (data[i] - gray)));
    data[i + 1] = Math.max(0, Math.min(255, gray + factor * (data[i + 1] - gray)));
    data[i + 2] = Math.max(0, Math.min(255, gray + factor * (data[i + 2] - gray)));
  }
}

/**
 * Posterize image
 */
function posterize(imageData, bits) {
  const data = imageData.data;
  const levels = Math.pow(2, bits);
  const step = 255 / (levels - 1);
  for (let i = 0; i < data.length; i += 4) {
    data[i] = Math.round(data[i] / step) * step;
    data[i + 1] = Math.round(data[i + 1] / step) * step;
    data[i + 2] = Math.round(data[i + 2] / step) * step;
  }
}

/**
 * Main pixel art conversion
 * @param {HTMLImageElement} img - Source image
 * @param {string} preset - Preset name
 * @param {object} overrides - Override preset values
 * @returns {HTMLCanvasElement} Result canvas
 */
function pixelArt(img, preset = 'arcade', overrides = {}) {
  const cfg = { ...PRESETS[preset], ...overrides };
  
  // Limit source size for performance
  let w = img.naturalWidth || img.width;
  let h = img.naturalHeight || img.height;
  const MAX_DIM = 2048;
  if (w > MAX_DIM || h > MAX_DIM) {
    const scale = MAX_DIM / Math.max(w, h);
    w = Math.round(w * scale);
    h = Math.round(h * scale);
  }
  
  // Create source canvas
  const srcCanvas = document.createElement('canvas');
  srcCanvas.width = w;
  srcCanvas.height = h;
  const srcCtx = srcCanvas.getContext('2d');
  srcCtx.drawImage(img, 0, 0, w, h);
  
  // Get source data
  const srcData = srcCtx.getImageData(0, 0, srcCanvas.width, srcCanvas.height);
  
  // Apply enhancements
  adjustContrast(srcData, cfg.contrast);
  adjustSaturation(srcData, cfg.color);
  posterize(srcData, cfg.posterizeBits);
  
  // Downscale
  const smallW = Math.max(1, Math.floor(srcCanvas.width / cfg.block));
  const smallH = Math.max(1, Math.floor(srcCanvas.height / cfg.block));
  
  const smallCanvas = document.createElement('canvas');
  smallCanvas.width = smallW;
  smallCanvas.height = smallH;
  const smallCtx = smallCanvas.getContext('2d');
  smallCtx.imageSmoothingEnabled = false;
  smallCtx.drawImage(srcCanvas, 0, 0, smallW, smallH);
  
  const smallData = smallCtx.getImageData(0, 0, smallW, smallH);
  
  // Get palette
  let palette;
  if (typeof cfg.palette === 'string') {
    palette = PALETTES[cfg.palette];
  } else {
    palette = generatePalette(smallData, cfg.palette);
  }
  
  // Apply Floyd-Steinberg dithering
  floydSteinbergDither(smallData, palette, smallW, smallH);
  
  // Upscale with nearest neighbor
  const outCanvas = document.createElement('canvas');
  outCanvas.width = srcCanvas.width;
  outCanvas.height = srcCanvas.height;
  const outCtx = outCanvas.getContext('2d');
  outCtx.imageSmoothingEnabled = false;
  
  smallCtx.putImageData(smallData, 0, 0);
  outCtx.drawImage(smallCanvas, 0, 0, srcCanvas.width, srcCanvas.height);
  
  return outCanvas;
}

/**
 * Pixelate from base64 image
 */
function pixelArtFromBase64(base64, preset = 'arcade', overrides = {}) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(pixelArt(img, preset, overrides));
    img.src = base64;
  });
}

// Export for use
window.PixelArt = { pixelArt, pixelArtFromBase64, PRESETS, PALETTES };
