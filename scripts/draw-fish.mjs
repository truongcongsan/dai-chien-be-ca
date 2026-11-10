/**
 * Vẽ bộ cá mẫu (asset-specs/fish-sample.md) bằng SVG rồi xuất PNG 1024×1024 nền trong suốt.
 * Nguồn SVG: assets/src/fish/<id>.svg — ảnh: assets/raw/fish/<id>.png
 * Dùng: node scripts/draw-fish.mjs [id...]   (không truyền id = vẽ tất cả)
 *       node scripts/draw-fish.mjs --export   (xuất thêm bản 512px sát khung cho game: public/assets/fish/)
 * Cần Chromium headless: bản Playwright trong cache (macOS/Windows), hoặc Chrome/Edge cài sẵn trên Windows, hoặc đặt CHROME=...
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const ROOT = resolve(import.meta.dirname, "..");
const SRC = join(ROOT, "assets/src/fish");
const OUT = join(ROOT, "assets/raw/fish");
const SIZE = 1024;
const FILL_RATIO = 0.8; // cá chiếm ~80% khung

// ---------- helpers ----------
const star = (cx, cy, r, fill = "#FFFBE6", op = 1) =>
  `<path d="M${cx} ${cy - r} Q${cx} ${cy} ${cx + r} ${cy} Q${cx} ${cy} ${cx} ${cy + r} Q${cx} ${cy} ${cx - r} ${cy} Q${cx} ${cy} ${cx} ${cy - r}Z" fill="${fill}" opacity="${op}"/>`;

const eye = (cx, cy, r) => `
  <circle cx="${cx}" cy="${cy}" r="${r * 1.12}" fill="#FFF6EC" opacity="0.55"/>
  <circle cx="${cx}" cy="${cy}" r="${r}" fill="url(#iris)"/>
  <ellipse cx="${cx + r * 0.3}" cy="${cy - r * 0.35}" rx="${r * 0.36}" ry="${r * 0.32}" fill="#fff"/>
  <circle cx="${cx - r * 0.38}" cy="${cy + r * 0.42}" r="${r * 0.15}" fill="#fff" opacity="0.9"/>`;

const commonDefs = `
  <radialGradient id="iris" cx="0.45" cy="0.4" r="0.65">
    <stop offset="0" stop-color="#4A2C1E"/><stop offset="0.7" stop-color="#1E110B"/><stop offset="1" stop-color="#0E0805"/>
  </radialGradient>
  <filter id="soft" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="9"/></filter>
  <filter id="soft4" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="4"/></filter>
  <filter id="soft16" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="16"/></filter>`;

/** Tia vây: các đường mảnh tỏa ra từ gốc (bx,by) tới các điểm đích. */
const rays = (bx, by, targets, color, width = 5, op = 0.35) =>
  targets
    .map(([tx, ty]) => {
      const mx = bx + (tx - bx) * 0.55;
      const my = by + (ty - by) * 0.45;
      return `<path d="M${bx} ${by} Q${mx} ${my} ${tx} ${ty}" stroke="${color}" stroke-width="${width}" fill="none" stroke-linecap="round" opacity="${op}"/>`;
    })
    .join("");

// ---------- trứng ----------
function egg(kind) {
  const legendary = kind === "legendary";
  const rare = kind === "rare";
  const c = { x: 512, y: 512, r: 330 };
  const shell = legendary
    ? ["#FFF6CC", "#FBD866", "#E9A93A", "#C98222"]
    : rare
      ? ["#EAFBFF", "#A8E6F5", "#6FC3EA", "#4A8FD6"]
      : ["#FFE7D2", "#FFC79C", "#FFA266", "#F08848"];
  const embryo = legendary ? "#E8503A" : rare ? "#7B5CF0" : "#FF7A2E";
  const pearls = rare
    ? [star(350, 310, 26, "#FFFFFF"), star(680, 650, 20, "#F0FBFF"), star(640, 300, 14, "#FFFFFF"), star(420, 690, 12, "#E6F7FF")].join("") +
      `<path d="M230 600 C330 640 450 650 560 640" stroke="#FFFFFF" stroke-width="10" fill="none" opacity="0.35" stroke-linecap="round"/>
       <path d="M260 420 C380 455 520 460 640 445" stroke="#FFFFFF" stroke-width="8" fill="none" opacity="0.3" stroke-linecap="round"/>`
    : "";
  const scales = legendary
    ? Array.from({ length: 9 }, (_, row) =>
        Array.from({ length: 9 }, (_, col) => {
          const x = 220 + col * 72 + (row % 2) * 36;
          const y = 200 + row * 70;
          return `<path d="M${x - 34} ${y} A36 36 0 0 0 ${x + 34} ${y}" stroke="#D18A1E" stroke-width="5" fill="none" opacity="0.28"/>`;
        }).join(""),
      ).join("")
    : "";
  const sparkles = legendary
    ? [star(340, 300, 34), star(690, 640, 26), star(620, 300, 18), star(400, 700, 16, "#FFF4B0"), star(760, 450, 14)].join("")
    : "";
  return `
  <defs>
    <radialGradient id="shell" cx="0.38" cy="0.32" r="0.75">
      <stop offset="0" stop-color="${shell[0]}"/><stop offset="0.45" stop-color="${shell[1]}"/>
      <stop offset="0.85" stop-color="${shell[2]}"/><stop offset="1" stop-color="${shell[3]}"/>
    </radialGradient>
    <clipPath id="eggClip"><circle cx="${c.x}" cy="${c.y}" r="${c.r}"/></clipPath>
  </defs>
  <g id="art">
    <circle cx="${c.x}" cy="${c.y}" r="${c.r}" fill="url(#shell)" opacity="0.93"/>
    <g clip-path="url(#eggClip)">
      ${scales}
      <!-- mầm cá cuộn tròn: thân cong ôm quanh, đầu tròn có mắt -->
      <g opacity="0.6">
        <path d="M560 520 C540 620 420 650 375 570" stroke="${embryo}" stroke-width="74" fill="none" stroke-linecap="round" filter="url(#soft4)"/>
        <path d="M375 570 C350 520 360 470 395 445" stroke="${embryo}" stroke-width="44" fill="none" stroke-linecap="round" filter="url(#soft4)"/>
        <path d="M395 445 C405 420 430 405 440 400" stroke="${embryo}" stroke-width="22" fill="none" stroke-linecap="round" filter="url(#soft4)"/>
        <circle cx="590" cy="470" r="82" fill="${embryo}" filter="url(#soft4)"/>
      </g>
      <circle cx="610" cy="455" r="34" fill="#2A160C" opacity="0.85"/>
      <circle cx="621" cy="445" r="11" fill="#fff" opacity="0.9"/>
      <!-- bóng tối phía dưới cho khối -->
      <ellipse cx="560" cy="790" rx="320" ry="140" fill="${shell[3]}" opacity="0.35" filter="url(#soft16)"/>
    </g>
    <circle cx="${c.x}" cy="${c.y}" r="${c.r - 4}" fill="none" stroke="${legendary ? "#FFE58A" : rare ? "#9FE4FF" : "#E87A3A"}" stroke-width="8" opacity="${legendary || rare ? 0.9 : 0.45}"/>
    <!-- phản sáng gel -->
    <path d="M300 330 C340 250 420 210 500 205" stroke="#fff" stroke-width="34" stroke-linecap="round" fill="none" opacity="0.75" filter="url(#soft4)"/>
    <ellipse cx="300" cy="420" rx="22" ry="30" fill="#fff" opacity="0.7"/>
    <ellipse cx="700" cy="760" rx="90" ry="26" transform="rotate(-30 700 760)" fill="#fff" opacity="0.25" filter="url(#soft4)"/>
    ${sparkles}
    ${pearls}
  </g>`;
}

// ---------- cá bột ----------
function fry() {
  return `
  <defs>
    <radialGradient id="body" cx="0.6" cy="0.35" r="0.8">
      <stop offset="0" stop-color="#FFFDF8"/><stop offset="0.6" stop-color="#EEE7DC"/><stop offset="1" stop-color="#CFC6B8"/>
    </radialGradient>
    <radialGradient id="yolk" cx="0.4" cy="0.35" r="0.7">
      <stop offset="0" stop-color="#FFF4C2"/><stop offset="0.6" stop-color="#FFDB6E"/><stop offset="1" stop-color="#F0B53C"/>
    </radialGradient>
    <linearGradient id="fold" x1="1" y1="0" x2="0" y2="0">
      <stop offset="0" stop-color="#F4EFE6" stop-opacity="0.9"/><stop offset="1" stop-color="#E6DED0" stop-opacity="0.55"/>
    </linearGradient>
  </defs>
  <g id="art">
    <!-- màng vây liền (fin fold) -->
    <path d="M520 400 C430 380 300 400 190 450 C150 470 140 540 190 565 C300 615 430 640 520 620 Z" fill="url(#fold)" stroke="#D8CFC1" stroke-width="4"/>
    ${rays(470, 510, [[200, 455], [175, 490], [170, 525], [180, 560], [210, 590]], "#CFC5B5", 4, 0.4)}
    <!-- thân thon -->
    <path d="M760 500 C760 390 680 330 600 340 C520 350 420 440 250 495 C230 502 230 518 250 525 C420 570 520 660 600 665 C690 670 760 610 760 500 Z" fill="url(#body)" opacity="0.92"/>
    <!-- dây sống mờ -->
    <path d="M560 500 C470 500 360 505 255 510" stroke="#C8BEB0" stroke-width="6" fill="none" opacity="0.5" stroke-linecap="round"/>
    <!-- túi noãn hoàng -->
    <ellipse cx="610" cy="590" rx="105" ry="72" fill="url(#yolk)" opacity="0.95"/>
    <ellipse cx="575" cy="565" rx="34" ry="16" fill="#fff" opacity="0.6"/>
    <!-- phản sáng -->
    <path d="M560 380 C610 355 680 360 720 395" stroke="#fff" stroke-width="22" fill="none" stroke-linecap="round" opacity="0.8" filter="url(#soft4)"/>
    ${eye(675, 470, 62)}
    <ellipse cx="700" cy="560" rx="26" ry="14" fill="#FF8FAB" opacity="0.45" filter="url(#soft4)"/>
    <path d="M738 532 Q748 542 758 532" stroke="#8C7B68" stroke-width="5" fill="none" stroke-linecap="round"/>
  </g>`;
}

// ---------- cá vàng tròn (free) ----------
const GOLD_STAGES = {
  juvenile: { light: "#FFD2A6", mid: "#FFAE6E", dark: "#F08A4A", tail: 0.55, split: false, dorsal: 0.45, eyeR: 60, fins: 0.6 },
  teen: { light: "#FFC08A", mid: "#FF9A52", dark: "#E8722E", tail: 0.8, split: true, dorsal: 0.8, eyeR: 52, fins: 0.85 },
  adult: { light: "#FFB878", mid: "#FF8A3D", dark: "#DE5F1E", tail: 1.0, split: true, dorsal: 1.0, eyeR: 48, fins: 1.0 },
};

function goldfish(stage) {
  const s = GOLD_STAGES[stage];
  const bx = 385; // gốc đuôi
  const by = 505;
  // điểm mút đuôi theo độ dài
  const tx = (x) => bx - (bx - x) * s.tail;
  const tail = s.split
    ? `<path d="M${bx + 10} 478 C${tx(330)} 410 ${tx(240)} 300 ${tx(130)} 285 C${tx(165)} 360 ${tx(185)} 425 ${tx(240)} 478 C${tx(285)} 505 ${tx(330)} 508 ${bx + 10} 505 Z" fill="url(#fin)"/>
       <path d="M${bx + 10} 532 C${tx(330)} 600 ${tx(240)} 710 ${tx(130)} 725 C${tx(165)} 650 ${tx(185)} 585 ${tx(240)} 532 C${tx(285)} 505 ${tx(330)} 502 ${bx + 10} 505 Z" fill="url(#fin)"/>
       ${rays(bx, by, [[tx(150), 300], [tx(185), 360], [tx(230), 440], [tx(230), 570], [tx(185), 650], [tx(150), 710]], s.dark, 5, 0.3)}`
    : `<path d="M${bx + 10} 470 C${tx(300)} 400 ${tx(180)} 360 ${tx(150)} 380 C${tx(180)} 450 ${tx(180)} 560 ${tx(150)} 630 C${tx(180)} 650 ${tx(300)} 610 ${bx + 10} 540 Z" fill="url(#fin)"/>
       ${rays(bx, by, [[tx(165), 400], [tx(175), 470], [tx(175), 540], [tx(165), 610]], s.dark, 5, 0.3)}`;
  const d = s.dorsal;
  const f = s.fins;
  return `
  <defs>
    <radialGradient id="body" cx="0.42" cy="0.3" r="0.78">
      <stop offset="0" stop-color="${s.light}"/><stop offset="0.55" stop-color="${s.mid}"/><stop offset="1" stop-color="${s.dark}"/>
    </radialGradient>
    <linearGradient id="fin" x1="1" y1="0" x2="0" y2="0">
      <stop offset="0" stop-color="${s.mid}"/><stop offset="0.6" stop-color="${s.light}" stop-opacity="0.95"/><stop offset="1" stop-color="#FFE8D2" stop-opacity="0.85"/>
    </linearGradient>
    <linearGradient id="belly" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#FFF4E0" stop-opacity="0"/><stop offset="0.5" stop-color="#FFF4E0" stop-opacity="0.85"/><stop offset="1" stop-color="#FFE9CC" stop-opacity="0.9"/>
    </linearGradient>
    <clipPath id="bodyClip"><path id="bodyPath" d="M830 505 C832 385 720 302 595 302 C480 302 405 370 378 450 C368 480 368 535 378 565 C405 645 480 708 595 708 C720 708 828 625 830 505 Z"/></clipPath>
  </defs>
  <g id="art">
    ${tail}
    <!-- vây lưng -->
    <path d="M${505} 322 C${520 - 10 * d} ${320 - 95 * d} ${600} ${320 - 135 * d} ${665} ${320 - 118 * d} C${652} ${320 - 70 * d} ${648} 300 ${655} 318 Z" fill="url(#fin)"/>
    ${rays(560, 318, [[575, 320 - 110 * d], [610, 320 - 125 * d], [645, 320 - 112 * d]], s.dark, 4, 0.3)}
    <!-- vây hậu môn + vây bụng phía sau -->
    <path d="M455 655 C${440 - 20 * f} ${655 + 60 * f} ${405 - 20 * f} ${660 + 90 * f} ${375 - 15 * f} ${665 + 95 * f} C${392} ${660 + 55 * f} 405 680 425 645 Z" fill="url(#fin)"/>
    <path d="M610 692 C${600 - 8 * f} ${700 + 60 * f} ${570 - 20 * f} ${700 + 100 * f} ${525 - 20 * f} ${705 + 108 * f} C${545} ${700 + 65 * f} 552 725 565 690 Z" fill="url(#fin)"/>
    <!-- thân -->
    <use href="#bodyPath" fill="url(#body)"/>
    <g clip-path="url(#bodyClip)">
      <ellipse cx="610" cy="650" rx="230" ry="120" fill="url(#belly)"/>
      <ellipse cx="560" cy="760" rx="300" ry="90" fill="${s.dark}" opacity="0.35" filter="url(#soft16)"/>
    </g>
    <!-- nắp mang -->
    <path d="M718 372 C688 440 688 568 718 630" stroke="${s.dark}" stroke-width="8" fill="none" stroke-linecap="round" opacity="0.35"/>
    <!-- vây ngực -->
    <path d="M650 560 C${610 - 15 * f} ${595 + 20 * f} ${585 - 20 * f} ${640 + 30 * f} ${595 - 15 * f} ${672 + 30 * f} C${640} ${665 + 15 * f} 672 620 676 580 Z" fill="url(#fin)" opacity="0.9"/>
    <!-- phản sáng -->
    <ellipse cx="555" cy="372" rx="120" ry="40" transform="rotate(-12 555 372)" fill="#fff" opacity="0.5" filter="url(#soft)"/>
    <ellipse cx="520" cy="362" rx="34" ry="13" transform="rotate(-14 520 362)" fill="#fff" opacity="0.8"/>
    ${eye(735, 462, s.eyeR)}
    <ellipse cx="765" cy="565" rx="34" ry="19" fill="#FF6F91" opacity="0.45" filter="url(#soft4)"/>
    <path d="M800 532 Q813 546 827 534" stroke="#8A3B16" stroke-width="7" fill="none" stroke-linecap="round"/>
  </g>`;
}

// ---------- cá rồng ánh kim (huyền thoại) ----------
const DRAGON_STAGES = {
  juvenile: { scaleOp: 0.3, red: 0, fin: 0.55, barbel: 0.45, eyeR: 54, sparkle: 0, crest: false, glow: false, pale: true },
  teen: { scaleOp: 0.85, red: 0.6, fin: 0.85, barbel: 0.8, eyeR: 46, sparkle: 0, crest: false, glow: false, pale: false },
  adult: { scaleOp: 1, red: 1, fin: 1.05, barbel: 1, eyeR: 42, sparkle: 5, crest: false, glow: false, pale: false },
  king: { scaleOp: 1, red: 1, fin: 1.4, barbel: 1.25, eyeR: 42, sparkle: 12, crest: true, glow: true, pale: false },
};

function dragonfish(stage) {
  const s = DRAGON_STAGES[stage];
  const gold = s.pale ? ["#FFF6CF", "#FBE39A", "#E9C25E"] : ["#FFF3B8", "#F6C445", "#C9881C"];
  const finStops = s.pale
    ? ["#FBE39A", "#FFC27A", "#FFAD70"]
    : ["#F6C445", "#FF8A3D", "#E8503A"];
  const F = s.fin;
  // vây kéo dài về phía sau-trái từ gốc, scale theo F
  const fx = (x0, x) => x0 - (x0 - x) * F;
  // mép vây dạng lưỡi lửa (vài răng cưa mềm)
  const flame = (pts) => pts.map(([x, y]) => `${x} ${y}`).join(" ");

  // đuôi: quạt lớn, mép lượn sóng
  const T = 330; // gốc đuôi x
  const tail = `<path d="M${T + 15} 478 C${fx(T, 280)} 420 ${fx(T, 210)} 360 ${fx(T, 120)} ${500 - 150 * F}
      Q${fx(T, 150)} ${500 - 105 * F} ${fx(T, 115)} ${500 - 70 * F}
      Q${fx(T, 160)} ${500 - 35 * F} ${fx(T, 112)} 500
      Q${fx(T, 160)} ${500 + 35 * F} ${fx(T, 115)} ${500 + 70 * F}
      Q${fx(T, 150)} ${500 + 105 * F} ${fx(T, 120)} ${500 + 150 * F}
      C${fx(T, 210)} 640 ${fx(T, 280)} 580 ${T + 15} 528 Z" fill="url(#fin)"/>
    ${rays(T, 503, [[fx(T, 130), 500 - 140 * F], [fx(T, 125), 500 - 70 * F], [fx(T, 125), 500], [fx(T, 125), 500 + 70 * F], [fx(T, 130), 500 + 140 * F]], "#FFF0B0", 5, 0.45)}`;

  // vây lưng dài phía sau
  const dorsal = `<path d="M560 418 C${fx(560, 500)} ${418 - 90 * F} ${fx(560, 420)} ${418 - 120 * F} ${fx(560, 340)} ${418 - 105 * F}
      Q${fx(560, 360)} ${418 - 75 * F} ${fx(560, 330)} ${418 - 55 * F}
      Q${fx(560, 355)} ${418 - 30 * F} 340 462 C400 445 480 428 560 418 Z" fill="url(#finV)"/>
    ${rays(470, 430, [[fx(560, 360), 418 - 100 * F], [fx(560, 400), 418 - 112 * F], [fx(560, 450), 418 - 105 * F]], "#FFF0B0", 4, 0.4)}`;
  // vây hậu môn dài phía dưới
  const anal = `<path d="M560 596 C${fx(560, 500)} ${596 + 90 * F} ${fx(560, 420)} ${596 + 120 * F} ${fx(560, 340)} ${596 + 105 * F}
      Q${fx(560, 360)} ${596 + 75 * F} ${fx(560, 330)} ${596 + 55 * F}
      Q${fx(560, 355)} ${596 + 30 * F} 340 545 C400 565 480 585 560 596 Z" fill="url(#finV2)"/>
    ${rays(470, 585, [[fx(560, 360), 596 + 100 * F], [fx(560, 400), 596 + 112 * F], [fx(560, 450), 596 + 105 * F]], "#FFF0B0", 4, 0.4)}`;
  // vây bụng (dải lụa dưới ngực)
  const pelvic = `<path d="M700 612 C${700 - 10 * F} ${612 + 70 * F} ${700 - 50 * F} ${612 + 120 * F} ${700 - 110 * F} ${612 + 140 * F}
      C${700 - 70 * F} ${612 + 95 * F} ${700 - 50 * F} ${612 + 50 * F} 668 610 Z" fill="url(#finV2)"/>`;

  // vảy: vẽ từ đuôi về đầu để vảy phía đầu đè lên, lộ mép sau (bên trái)
  let scales = "";
  for (let col = 0; col < 7; col++) {
    const x = 350 + col * 56;
    for (let row = 0; row < 6; row++) {
      const y = 400 + row * 48 + (col % 2) * 24;
      scales += `<circle cx="${x}" cy="${y}" r="36" fill="url(#scale)"/>`;
      if (s.red) scales += `<path d="M${x} ${y - 36} A36 36 0 0 0 ${x} ${y + 36}" stroke="#E8503A" stroke-width="5" fill="none" opacity="${0.85 * s.red}"/>`;
      scales += `<path d="M${x - 8} ${y - 30} A32 32 0 0 0 ${x - 30} ${y + 2}" stroke="#fff" stroke-width="4" fill="none" opacity="${0.35 * s.scaleOp}" stroke-linecap="round"/>`;
    }
  }
  // gờ vảy trên trán cho cá chúa
  const crest = s.crest
    ? `<path d="M772 404 C752 352 722 322 680 312 C708 340 728 372 738 408 Z" fill="url(#horn)" stroke="#C9881C" stroke-width="4" stroke-linejoin="round"/>
       <path d="M812 412 C800 362 778 330 744 316 C764 344 778 378 784 410 Z" fill="url(#horn)" stroke="#C9881C" stroke-width="4" stroke-linejoin="round"/>
       <circle cx="682" cy="313" r="9" fill="#FFF6C4"/><circle cx="746" cy="317" r="8" fill="#FFF6C4"/>`
    : "";
  const glowTips = s.glow
    ? [
        [fx(T, 118), 500 - 150 * F], [fx(T, 112), 500], [fx(T, 118), 500 + 150 * F],
        [fx(560, 340), 418 - 105 * F], [fx(560, 340), 596 + 105 * F],
      ].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="26" fill="#FFF1A8" opacity="0.9" filter="url(#soft4)"/><circle cx="${x}" cy="${y}" r="10" fill="#fff"/>`).join("")
    : "";
  const sparklePts = [[440, 455], [520, 520], [600, 470], [470, 575], [640, 560], [380, 500], [300, 380], [260, 640], [470, 330], [450, 690], [560, 440], [700, 700]];
  const sparkles = sparklePts.slice(0, s.sparkle).map(([x, y], i) => star(x, y, i % 3 === 0 ? 20 : 13)).join("");
  const B = s.barbel;

  return `
  <defs>
    <radialGradient id="body" gradientUnits="userSpaceOnUse" cx="680" cy="440" r="420">
      <stop offset="0" stop-color="${gold[0]}"/><stop offset="0.45" stop-color="${gold[1]}"/><stop offset="1" stop-color="${gold[2]}"/>
    </radialGradient>
    <linearGradient id="headFade" gradientUnits="userSpaceOnUse" x1="640" y1="0" x2="720" y2="0">
      <stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#fff" stop-opacity="1"/>
    </linearGradient>
    <mask id="headMask"><rect x="0" y="0" width="1024" height="1024" fill="url(#headFade)"/></mask>
    <linearGradient id="sheen" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#FF8FAB" stop-opacity="0.35"/><stop offset="0.5" stop-color="#FFF6C4" stop-opacity="0"/><stop offset="1" stop-color="#7FE0E6" stop-opacity="0.3"/>
    </linearGradient>
    <linearGradient id="horn" x1="1" y1="1" x2="0" y2="0">
      <stop offset="0" stop-color="#F6C445"/><stop offset="0.6" stop-color="#FFE58A"/><stop offset="1" stop-color="#FFF8DC"/>
    </linearGradient>
    <radialGradient id="scale" cx="0.35" cy="0.3" r="0.8">
      <stop offset="0" stop-color="${s.pale ? "#FFF8DC" : "#FFF6C4"}" stop-opacity="${s.scaleOp}"/>
      <stop offset="0.55" stop-color="${gold[1]}" stop-opacity="${s.scaleOp}"/>
      <stop offset="1" stop-color="${gold[2]}" stop-opacity="${s.scaleOp}"/>
    </radialGradient>
    <linearGradient id="fin" x1="1" y1="0" x2="0" y2="0">
      <stop offset="0" stop-color="${finStops[0]}"/><stop offset="0.5" stop-color="${finStops[1]}" stop-opacity="0.95"/><stop offset="1" stop-color="${finStops[2]}" stop-opacity="0.9"/>
    </linearGradient>
    <linearGradient id="finV" x1="0" y1="1" x2="0" y2="0">
      <stop offset="0" stop-color="${finStops[0]}"/><stop offset="0.55" stop-color="${finStops[1]}" stop-opacity="0.95"/><stop offset="1" stop-color="${finStops[2]}" stop-opacity="0.9"/>
    </linearGradient>
    <linearGradient id="finV2" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${finStops[0]}"/><stop offset="0.55" stop-color="${finStops[1]}" stop-opacity="0.95"/><stop offset="1" stop-color="${finStops[2]}" stop-opacity="0.9"/>
    </linearGradient>
    <linearGradient id="bellyShade" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset="0.6" stop-color="#FFF8E0" stop-opacity="0.35"/><stop offset="1" stop-color="${gold[2]}" stop-opacity="0.5"/>
    </linearGradient>
    <clipPath id="bodyClip"><path id="bodyPath" d="M880 468 C866 418 812 398 735 398 C620 398 480 418 360 462 C338 470 328 484 328 503 C328 522 338 536 360 544 C480 590 620 620 735 616 C820 612 872 565 880 505 C884 490 884 478 880 468 Z"/></clipPath>
  </defs>
  <g id="art">
    ${glowTips ? `<g opacity="0.7">${glowTips}</g>` : ""}
    ${tail}
    ${dorsal}
    ${anal}
    <use href="#bodyPath" fill="url(#body)"/>
    <g clip-path="url(#bodyClip)">
      ${scales}
      <rect x="300" y="380" width="600" height="260" fill="url(#bellyShade)"/>
      <!-- đầu trơn, không vảy -->
      <rect x="600" y="380" width="320" height="260" fill="url(#body)" mask="url(#headMask)"/>
      ${s.glow ? `<rect x="300" y="380" width="620" height="260" fill="url(#sheen)"/>` : ""}
      <ellipse cx="560" cy="650" rx="320" ry="60" fill="${gold[2]}" opacity="0.4" filter="url(#soft16)"/>
    </g>
    <!-- nắp mang -->
    <path d="M700 405 C672 455 672 560 700 612" stroke="${s.red ? "#E8503A" : gold[2]}" stroke-width="9" fill="none" stroke-linecap="round" opacity="${s.red ? 0.75 : 0.45}"/>
    ${crest}
    ${pelvic}
    <!-- vây ngực -->
    <path d="M708 545 C${680 - 30 * F} ${560 + 15 * F} ${650 - 50 * F} ${590 + 30 * F} ${640 - 50 * F} ${615 + 40 * F} C${690 - 20 * F} ${610 + 25 * F} 720 590 728 560 Z" fill="url(#fin)" opacity="0.9"/>
    <!-- phản sáng kim loại -->
    <path d="M430 445 C540 418 660 408 760 412" stroke="#fff" stroke-width="20" fill="none" stroke-linecap="round" opacity="${s.pale ? 0.55 : 0.7}" filter="url(#soft4)"/>
    <ellipse cx="800" cy="430" rx="34" ry="12" transform="rotate(-8 800 430)" fill="#fff" opacity="0.85"/>
    ${eye(790, 462, s.eyeR)}
    <ellipse cx="822" cy="540" rx="26" ry="15" fill="#FF6F91" opacity="0.4" filter="url(#soft4)"/>
    <!-- miệng hếch -->
    <path d="M846 488 Q866 492 882 472" stroke="#8A4A12" stroke-width="6" fill="none" stroke-linecap="round"/>
    <!-- râu -->
    <path d="M872 494 C${872 + 50 * B} ${505 + 20 * B} ${872 + 68 * B} ${520 + 55 * B} ${872 + 50 * B} ${530 + 90 * B}" stroke="${s.pale ? "#F3CD6A" : "#E9A93A"}" stroke-width="9" fill="none" stroke-linecap="round"/>
    <path d="M862 500 C${862 + 35 * B} ${515 + 25 * B} ${862 + 40 * B} ${535 + 60 * B} ${862 + 15 * B} ${545 + 95 * B}" stroke="${s.pale ? "#F3CD6A" : "#D9962A"}" stroke-width="8" fill="none" stroke-linecap="round"/>
    ${sparkles}
  </g>`;
}

/** Mép quạt mềm: các điểm trên cung tròn tâm (cx,cy) bán kính R từ góc a0→a1 (độ), nối bằng Q lượn sóng. */
function fanEdge(cx, cy, R, a0, a1, n, wobble = 0.08) {
  const pt = (a, r) => [cx + r * Math.cos((a * Math.PI) / 180), cy + r * Math.sin((a * Math.PI) / 180)];
  let d = "";
  for (let i = 0; i < n; i++) {
    const a = a0 + ((a1 - a0) * (i + 1)) / n;
    const am = a0 + ((a1 - a0) * (i + 0.5)) / n;
    const [qx, qy] = pt(am, R * (1 - wobble));
    const [x, y] = pt(a, R);
    d += ` Q${qx.toFixed(1)} ${qy.toFixed(1)} ${x.toFixed(1)} ${y.toFixed(1)}`;
  }
  return { start: pt(a0, R), d, pt };
}

// ---------- cá bảy màu (thường) ----------
const GUPPY_STAGES = {
  juvenile: { tail: 0.5, colors: ["#D9ECF5", "#B9D8EE", "#A6C4E8"], spots: 0, dorsal: 0.5, eyeR: 50 },
  teen: { tail: 0.78, colors: ["#FFD36E", "#FF8FAB", "#9A7BEF"], spots: 4, dorsal: 0.8, eyeR: 44 },
  adult: { tail: 1.0, colors: ["#FFC94A", "#FF6F9C", "#7B5CF0"], spots: 9, dorsal: 1.0, eyeR: 40 },
};

function guppy(stage) {
  const s = GUPPY_STAGES[stage];
  const bx = 480;
  const by = 505;
  const R = 340 * s.tail;
  const fan = fanEdge(bx, by, R, 215, 145, 6, 0.07);
  const tail = `<path d="M${bx + 8} 482 L${fan.start[0].toFixed(1)} ${fan.start[1].toFixed(1)}${fan.d} L${bx + 8} 528 Z" fill="url(#tail)"/>`;
  const tailRays = rays(bx, by, [212, 200, 188, 176, 164, 152].map((a) => fan.pt(a, R * 0.93)), "#fff", 5, 0.35);
  const spotPts = [[200, 0.55, 26], [170, 0.62, 22], [188, 0.8, 18], [158, 0.78, 20], [205, 0.75, 16], [180, 0.45, 15], [165, 0.9, 13], [195, 0.92, 12], [150, 0.6, 12]];
  const spots = spotPts
    .slice(0, s.spots)
    .map(([a, r, sz]) => {
      const [x, y] = fan.pt(a, R * r);
      return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${sz * s.tail}" fill="#2B2F7A" opacity="0.32"/><circle cx="${(x - 4).toFixed(1)}" cy="${(y - 4).toFixed(1)}" r="${sz * s.tail * 0.45}" fill="#fff" opacity="0.45"/>`;
    })
    .join("");
  const D = s.dorsal;
  return `
  <defs>
    <radialGradient id="tail" gradientUnits="userSpaceOnUse" cx="${bx}" cy="${by}" r="${R}">
      <stop offset="0" stop-color="${s.colors[0]}"/><stop offset="0.5" stop-color="${s.colors[1]}" stop-opacity="0.95"/><stop offset="1" stop-color="${s.colors[2]}" stop-opacity="0.9"/>
    </radialGradient>
    <linearGradient id="body" x1="1" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#E9F6FF"/><stop offset="0.45" stop-color="#BFDDF2"/><stop offset="1" stop-color="${s.colors[0]}"/>
    </linearGradient>
    <linearGradient id="fin" x1="0" y1="1" x2="0" y2="0">
      <stop offset="0" stop-color="${s.colors[1]}" stop-opacity="0.9"/><stop offset="1" stop-color="${s.colors[2]}" stop-opacity="0.75"/>
    </linearGradient>
    <linearGradient id="belly" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset="0.6" stop-color="#fff" stop-opacity="0.7"/><stop offset="1" stop-color="#F3F8FF" stop-opacity="0.9"/>
    </linearGradient>
    <clipPath id="bodyClip"><path id="bodyPath" d="M850 505 C850 452 806 420 748 418 C660 415 565 446 470 480 C452 487 452 523 470 530 C565 564 660 596 748 592 C806 590 850 558 850 505 Z"/></clipPath>
  </defs>
  <g id="art">
    ${tail}
    ${tailRays}
    ${spots}
    <!-- vây lưng dài nghiêng về sau -->
    <path d="M640 428 C${600 - 20 * D} ${428 - 70 * D} ${540 - 50 * D} ${428 - 95 * D} ${500 - 60 * D} ${428 - 90 * D} C${530 - 20 * D} ${428 - 55 * D} 540 455 525 470 Z" fill="url(#fin)"/>
    <!-- vây bụng -->
    <path d="M610 585 C${590 - 10 * D} ${585 + 45 * D} ${560 - 20 * D} ${585 + 70 * D} ${530 - 25 * D} ${585 + 75 * D} C${550} ${585 + 40 * D} 565 590 575 575 Z" fill="url(#fin)"/>
    <use href="#bodyPath" fill="url(#body)"/>
    <g clip-path="url(#bodyClip)">
      <ellipse cx="680" cy="575" rx="220" ry="55" fill="url(#belly)"/>
      <!-- nửa sau thân nhuộm màu đuôi -->
      <ellipse cx="470" cy="505" rx="130" ry="90" fill="${s.colors[1]}" opacity="${s.spots ? 0.55 : 0.25}" filter="url(#soft16)"/>
      <ellipse cx="640" cy="610" rx="260" ry="40" fill="#7FA6C9" opacity="0.35" filter="url(#soft16)"/>
    </g>
    <path d="M725 440 C705 480 705 545 725 580" stroke="#8FB3D1" stroke-width="7" fill="none" stroke-linecap="round" opacity="0.45"/>
    <!-- vây ngực -->
    <path d="M700 535 C670 550 650 575 652 600 C680 595 705 575 712 548 Z" fill="url(#fin)" opacity="0.85"/>
    <!-- phản sáng -->
    <path d="M560 455 C640 432 710 426 780 432" stroke="#fff" stroke-width="18" fill="none" stroke-linecap="round" opacity="0.75" filter="url(#soft4)"/>
    ${eye(780, 478, s.eyeR)}
    <ellipse cx="800" cy="548" rx="24" ry="13" fill="#FF6F91" opacity="0.45" filter="url(#soft4)"/>
    <path d="M826 522 Q836 532 846 522" stroke="#5B6F8A" stroke-width="6" fill="none" stroke-linecap="round"/>
  </g>`;
}

// ---------- cá nóc tròn (thường) ----------
const PUFFER_STAGES = {
  juvenile: { rx: 210, ry: 175, spines: 0, spots: 4, eyeR: 66, top: ["#FFF3B0", "#F8DE73", "#E4BC4C"] },
  teen: { rx: 230, ry: 200, spines: 0.65, spots: 8, eyeR: 60, top: ["#FFEE96", "#F6CF4E", "#D9A436"] },
  adult: { rx: 245, ry: 222, spines: 1, spots: 12, eyeR: 56, top: ["#FFEB84", "#F4C23A", "#C98F26"] },
};

function puffer(stage) {
  const s = PUFFER_STAGES[stage];
  const cx = 580;
  const cy = 505;
  const { rx, ry } = s;
  // gai mềm hình nón quanh thân (nhiều ở bụng)
  let spines = "";
  if (s.spines) {
    for (let a = 20; a <= 340; a += 20) {
      if (a > 150 && a < 210) continue; // chừa chỗ đuôi
      const rad = (a * Math.PI) / 180;
      const x = cx + rx * Math.cos(rad);
      const y = cy + ry * Math.sin(rad);
      const len = 26 * s.spines * (Math.sin(rad) > 0 ? 1.2 : 0.9);
      const nx = Math.cos(rad);
      const ny = Math.sin(rad) * (rx / ry);
      const nl = Math.hypot(nx, ny);
      const [ux, uy] = [nx / nl, ny / nl];
      const [px, py] = [-uy * 11, ux * 11];
      spines += `<path d="M${(x + px - ux * 6).toFixed(1)} ${(y + py - uy * 6).toFixed(1)} L${(x + ux * len).toFixed(1)} ${(y + uy * len).toFixed(1)} L${(x - px - ux * 6).toFixed(1)} ${(y - py - uy * 6).toFixed(1)} Z" fill="${Math.sin(rad) > 0.3 ? "#F2E6CC" : s.top[1]}" stroke="${s.top[2]}" stroke-width="3" stroke-linejoin="round" opacity="0.95"/>`;
    }
  }
  const spotPts = [[480, 360], [560, 330], [640, 345], [430, 430], [520, 410], [610, 400], [690, 390], [450, 500], [380, 470], [560, 460], [660, 445], [400, 545]];
  const spots = spotPts
    .slice(0, s.spots)
    .map(([x, y], i) => `<ellipse cx="${x}" cy="${y}" rx="${i % 3 === 0 ? 17 : 12}" ry="${i % 3 === 0 ? 14 : 10}" fill="#8A5A1E" opacity="0.38"/>`)
    .join("");
  const tx = cx - rx + 8; // gốc đuôi
  return `
  <defs>
    <radialGradient id="body" cx="0.42" cy="0.28" r="0.8">
      <stop offset="0" stop-color="${s.top[0]}"/><stop offset="0.55" stop-color="${s.top[1]}"/><stop offset="1" stop-color="${s.top[2]}"/>
    </radialGradient>
    <linearGradient id="belly" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#FFFBF0" stop-opacity="0"/><stop offset="0.35" stop-color="#FFFBF0" stop-opacity="0.95"/><stop offset="1" stop-color="#EFE3CC"/>
    </linearGradient>
    <linearGradient id="fin" x1="1" y1="0" x2="0" y2="0">
      <stop offset="0" stop-color="${s.top[1]}"/><stop offset="1" stop-color="#FFF4C8" stop-opacity="0.85"/>
    </linearGradient>
    <clipPath id="bodyClip"><ellipse id="bodyShape" cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}"/></clipPath>
  </defs>
  <g id="art">
    <!-- đuôi quạt nhỏ -->
    <path d="M${tx + 20} ${cy - 30} C${tx - 40} ${cy - 90} ${tx - 95} ${cy - 95} ${tx - 110} ${cy - 70} C${tx - 90} ${cy - 25} ${tx - 90} ${cy + 25} ${tx - 110} ${cy + 70} C${tx - 95} ${cy + 95} ${tx - 40} ${cy + 90} ${tx + 20} ${cy + 30} Z" fill="url(#fin)"/>
    ${rays(tx + 10, cy, [[tx - 100, cy - 65], [tx - 92, cy - 22], [tx - 92, cy + 22], [tx - 100, cy + 65]], s.top[2], 4, 0.35)}
    <!-- vây lưng + vây hậu môn sát đuôi -->
    ${[-1, 1]
      .map((side) => {
        // Vây mọc từ thân ở góc ~150°–170° (gần đuôi), chóp hướng ra sau-ngoài.
        const P = (deg, k = 1) => {
          const r = (deg * Math.PI) / 180;
          return [(cx + rx * k * Math.cos(r)).toFixed(1), (cy + side * ry * k * Math.sin(r)).toFixed(1)];
        };
        const [a, b, tip, c1] = [P(128, 0.92), P(158, 0.92), P(150, 1.32), P(132, 1.22)];
        return `<path d="M${a[0]} ${a[1]} Q${c1[0]} ${c1[1]} ${tip[0]} ${tip[1]} Q${P(160, 1.12)[0]} ${P(160, 1.12)[1]} ${b[0]} ${b[1]} Z" fill="url(#fin)"/>`;
      })
      .join("")}
    ${spines}
    <use href="#bodyShape" fill="url(#body)"/>
    <g clip-path="url(#bodyClip)">
      <ellipse cx="${cx + 10}" cy="${cy + ry * 0.62}" rx="${rx * 1.05}" ry="${ry * 0.62}" fill="url(#belly)"/>
      ${spots}
      <ellipse cx="${cx}" cy="${cy + ry}" rx="${rx}" ry="60" fill="#C9A878" opacity="0.4" filter="url(#soft16)"/>
    </g>
    <!-- vây ngực tròn nhỏ -->
    <path d="M${cx + 40} ${cy + 20} C${cx + 5} ${cy + 5} ${cx - 30} ${cy + 20} ${cx - 35} ${cy + 55} C${cx - 5} ${cy + 75} ${cx + 30} ${cy + 60} ${cx + 40} ${cy + 20} Z" fill="url(#fin)" opacity="0.9"/>
    <!-- phản sáng -->
    <ellipse cx="${cx - 40}" cy="${cy - ry * 0.68}" rx="${rx * 0.45}" ry="38" transform="rotate(-10 ${cx - 40} ${cy - ry * 0.68})" fill="#fff" opacity="0.55" filter="url(#soft)"/>
    <ellipse cx="${cx - 80}" cy="${cy - ry * 0.72}" rx="34" ry="13" transform="rotate(-14 ${cx - 80} ${cy - ry * 0.72})" fill="#fff" opacity="0.85"/>
    ${eye(cx + rx * 0.55, cy - ry * 0.25, s.eyeR)}
    <ellipse cx="${cx + rx * 0.62}" cy="${cy + ry * 0.2}" rx="30" ry="17" fill="#FF6F91" opacity="0.45" filter="url(#soft4)"/>
    <!-- miệng chu tròn -->
    <ellipse cx="${cx + rx - 8}" cy="${cy + 18}" rx="15" ry="17" fill="#E89A5A" stroke="#A8601E" stroke-width="5"/>
  </g>`;
}

// ---------- cá neon (thường) ----------
const NEON_STAGES = {
  juvenile: { glow: 0.45, red: 0.35, eyeR: 46, fin: 0.7 },
  teen: { glow: 0.8, red: 0.75, eyeR: 42, fin: 0.85 },
  adult: { glow: 1, red: 1, eyeR: 40, fin: 1 },
};

function neon(stage) {
  const s = NEON_STAGES[stage];
  const F = s.fin;
  const T = 400; // gốc đuôi
  return `
  <defs>
    <linearGradient id="body" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#A9B9A0"/><stop offset="0.4" stop-color="#D6DDCF"/><stop offset="0.7" stop-color="#F4F6F2"/><stop offset="1" stop-color="#E2E6EA"/>
    </linearGradient>
    <linearGradient id="red" x1="1" y1="0" x2="0" y2="0">
      <stop offset="0" stop-color="#FF3B4E" stop-opacity="0"/><stop offset="0.25" stop-color="#FF3B4E" stop-opacity="${0.9 * s.red}"/><stop offset="1" stop-color="#E8203A" stop-opacity="${0.95 * s.red}"/>
    </linearGradient>
    <linearGradient id="stripe" x1="1" y1="0" x2="0" y2="0">
      <stop offset="0" stop-color="#7FF6FF"/><stop offset="0.5" stop-color="#2FD2FF"/><stop offset="1" stop-color="#3A7BFF"/>
    </linearGradient>
    <linearGradient id="fin" x1="1" y1="0" x2="0" y2="0">
      <stop offset="0" stop-color="#E8EEF2" stop-opacity="0.85"/><stop offset="1" stop-color="#D2DEE8" stop-opacity="0.65"/>
    </linearGradient>
    <clipPath id="bodyClip"><path id="bodyPath" d="M860 505 C860 466 826 444 770 442 C650 438 520 462 ${T} 486 C${T - 12} 489 ${T - 12} 521 ${T} 524 C520 548 650 572 770 568 C826 566 860 544 860 505 Z"/></clipPath>
  </defs>
  <g id="art">
    <!-- đuôi chẻ -->
    <path d="M${T + 10} 492 C${T - 40} 470 ${T - 90 * F} ${505 - 85 * F} ${T - 130 * F} ${505 - 110 * F} C${T - 110 * F} ${505 - 50 * F} ${T - 85 * F} 495 ${T - 60 * F} 505 C${T - 85 * F} 515 ${T - 110 * F} ${505 + 50 * F} ${T - 130 * F} ${505 + 110 * F} C${T - 90 * F} ${505 + 85 * F} ${T - 40} 540 ${T + 10} 518 Z" fill="url(#fin)"/>
    ${rays(T, 505, [[T - 120 * F, 505 - 98 * F], [T - 80 * F, 505 - 40 * F], [T - 80 * F, 505 + 40 * F], [T - 120 * F, 505 + 98 * F]], "#B8C6D2", 4, 0.45)}
    <!-- vây lưng, vây hậu môn, vây mỡ -->
    <path d="M610 450 C${600 - 10 * F} ${450 - 70 * F} ${560 - 25 * F} ${450 - 85 * F} ${535 - 30 * F} ${450 - 80 * F} C${545} ${450 - 40 * F} 548 462 545 462 Z" fill="url(#fin)"/>
    <path d="M590 560 C${570 - 10 * F} ${560 + 55 * F} ${510 - 30 * F} ${560 + 70 * F} ${470 - 30 * F} ${560 + 55 * F} C${490} ${560 + 25 * F} 500 548 510 545 Z" fill="url(#fin)"/>
    <ellipse cx="455" cy="476" rx="20" ry="11" transform="rotate(-15 455 476)" fill="url(#fin)"/>
    <use href="#bodyPath" fill="url(#body)" opacity="0.95"/>
    <g clip-path="url(#bodyClip)">
      <!-- nửa sau bụng đỏ -->
      <path d="M680 515 C600 518 500 520 380 515 L380 600 L700 600 Z" fill="url(#red)"/>
      <!-- sọc neon phát sáng -->
      <path d="M795 488 C700 488 560 495 420 503" stroke="#4FE6FF" stroke-width="44" fill="none" stroke-linecap="round" opacity="${0.55 * s.glow}" filter="url(#soft)"/>
      <path d="M795 488 C700 488 560 495 420 503" stroke="url(#stripe)" stroke-width="24" fill="none" stroke-linecap="round" opacity="${0.35 + 0.65 * s.glow}"/>
      <path d="M780 482 C700 482 580 488 470 494" stroke="#E8FFFF" stroke-width="7" fill="none" stroke-linecap="round" opacity="${0.8 * s.glow}"/>
      <ellipse cx="640" cy="580" rx="260" ry="30" fill="#9AA8B4" opacity="0.35" filter="url(#soft16)"/>
    </g>
    <path d="M745 452 C730 480 730 535 745 560" stroke="#A7B3B8" stroke-width="6" fill="none" stroke-linecap="round" opacity="0.5"/>
    <!-- vây ngực -->
    <path d="M730 530 C700 540 680 560 680 580 C705 578 725 560 735 540 Z" fill="url(#fin)" opacity="0.9"/>
    <!-- phản sáng -->
    <path d="M560 470 C650 452 730 448 800 455" stroke="#fff" stroke-width="12" fill="none" stroke-linecap="round" opacity="0.7" filter="url(#soft4)"/>
    <!-- mắt có vành xanh -->
    <circle cx="802" cy="490" r="${s.eyeR * 1.22}" fill="none" stroke="#4FE6FF" stroke-width="7" opacity="${0.6 * s.glow}"/>
    ${eye(802, 490, s.eyeR)}
    <ellipse cx="820" cy="540" rx="18" ry="10" fill="#FF6F91" opacity="0.45" filter="url(#soft4)"/>
    <path d="M838 522 Q847 530 856 520" stroke="#6A7480" stroke-width="5" fill="none" stroke-linecap="round"/>
    ${s.glow >= 1 ? star(560, 492, 16, "#F0FFFF") + star(470, 500, 11, "#F0FFFF") : ""}
  </g>`;
}

/** Mép vây lụa: đường cong từ a qua các điểm lượn sóng tới b (mảng [x,y]). */
const wavy = (pts) => {
  let d = `M${pts[0][0]} ${pts[0][1]}`;
  for (let i = 1; i < pts.length; i++) {
    const [x0, y0] = pts[i - 1];
    const [x1, y1] = pts[i];
    const mx = (x0 + x1) / 2 + (y1 - y0) * 0.18;
    const my = (y0 + y1) / 2 - (x1 - x0) * 0.18;
    d += ` Q${mx.toFixed(1)} ${my.toFixed(1)} ${x1.toFixed(1)} ${y1.toFixed(1)}`;
  }
  return d;
};

// ---------- cá betta đuôi lụa (hiếm) ----------
const BETTA_STAGES = {
  juvenile: { F: 0.5, colors: ["#FFC2CF", "#FF8FA8", "#E86A8C"], edge: "#B9D8FF", eyeR: 46, shine: 0 },
  teen: { F: 0.8, colors: ["#FF8A8A", "#E8384F", "#B0204A"], edge: "#7FB8FF", eyeR: 42, shine: 3 },
  adult: { F: 1.0, colors: ["#FF6B7A", "#D81E45", "#8E1240"], edge: "#5C8DFF", eyeR: 40, shine: 7 },
};

function betta(stage) {
  const s = BETTA_STAGES[stage];
  const F = s.F;
  const bx = 575; // gốc đuôi
  const by = 505;
  const lerp = (x0, x) => x0 - (x0 - x) * F;
  // đuôi lụa: quạt rộng, rủ hơi xuống, mép lượn nhiều
  const tailPts = [];
  for (let i = 0; i <= 8; i++) {
    const a = ((232 - i * 13.5) * Math.PI) / 180;
    const R = 360 * F * (1 + 0.08 * Math.sin(i * 1.7));
    tailPts.push([bx + R * Math.cos(a), by + 40 * F + R * Math.sin(a)]);
  }
  const tail = `<path d="M${bx + 10} 478 L${tailPts[0][0].toFixed(1)} ${tailPts[0][1].toFixed(1)} ${wavy(tailPts).replace(/^M[^Q]+/, "")} L${bx + 10} 532 Z" fill="url(#silk)"/>`;
  const tailRays = rays(bx, by, tailPts.filter((_, i) => i % 2 === 1).map(([x, y]) => [bx + (x - bx) * 0.9, by + (y - by) * 0.9]), "#fff", 5, 0.25);
  // vây lưng lụa dài về sau
  const dorsal = `<path d="M720 440 C${lerp(720, 640)} ${440 - 80 * F} ${lerp(720, 520)} ${440 - 150 * F} ${lerp(720, 420)} ${440 - 140 * F} ${wavy([[lerp(720, 420), 440 - 140 * F], [lerp(720, 460), 440 - 90 * F], [lerp(720, 470), 440 - 40 * F], [585, 470]]).replace(/^M[^Q]+/, "")} Z" fill="url(#silkV)"/>`;
  // vây hậu môn lụa rủ xuống
  const anal = `<path d="M740 572 C${lerp(740, 680)} ${572 + 110 * F} ${lerp(740, 560)} ${572 + 220 * F} ${lerp(740, 440)} ${572 + 230 * F} ${wavy([[lerp(740, 440), 572 + 230 * F], [lerp(740, 470), 572 + 150 * F], [lerp(740, 500), 572 + 80 * F], [585, 540]]).replace(/^M[^Q]+/, "")} Z" fill="url(#silkV2)"/>`;
  const pelvic = `<path d="M760 585 C${760 - 10 * F} ${585 + 90 * F} ${760 - 30 * F} ${585 + 160 * F} ${760 - 55 * F} ${585 + 200 * F}" stroke="${s.colors[1]}" stroke-width="${16 * F + 6}" fill="none" stroke-linecap="round" opacity="0.9"/>`;
  const shinePts = [[380, 420], [330, 560], [450, 650], [520, 340], [300, 480], [470, 760], [600, 330]];
  const shine = shinePts.slice(0, s.shine).map(([x, y], i) => star(lerp(575, x), y, i % 2 ? 12 : 17, "#E6F0FF", 0.9)).join("");
  return `
  <defs>
    <radialGradient id="silk" gradientUnits="userSpaceOnUse" cx="${bx}" cy="${by}" r="${380 * F}">
      <stop offset="0" stop-color="${s.colors[0]}"/><stop offset="0.55" stop-color="${s.colors[1]}" stop-opacity="0.95"/><stop offset="0.88" stop-color="${s.colors[2]}" stop-opacity="0.92"/><stop offset="1" stop-color="${s.edge}" stop-opacity="0.85"/>
    </radialGradient>
    <linearGradient id="silkV" x1="0" y1="1" x2="0" y2="0">
      <stop offset="0" stop-color="${s.colors[1]}"/><stop offset="0.75" stop-color="${s.colors[2]}" stop-opacity="0.92"/><stop offset="1" stop-color="${s.edge}" stop-opacity="0.85"/>
    </linearGradient>
    <linearGradient id="silkV2" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${s.colors[1]}"/><stop offset="0.75" stop-color="${s.colors[2]}" stop-opacity="0.92"/><stop offset="1" stop-color="${s.edge}" stop-opacity="0.85"/>
    </linearGradient>
    <radialGradient id="body" cx="0.6" cy="0.3" r="0.85">
      <stop offset="0" stop-color="${s.colors[0]}"/><stop offset="0.6" stop-color="${s.colors[1]}"/><stop offset="1" stop-color="${s.colors[2]}"/>
    </radialGradient>
    <clipPath id="bodyClip"><path id="bodyPath" d="M860 500 C860 450 815 425 760 424 C690 422 620 448 570 478 C556 488 556 522 570 532 C620 562 690 590 760 588 C815 586 860 552 860 500 Z"/></clipPath>
  </defs>
  <g id="art">
    ${tail}
    ${tailRays}
    ${anal}
    ${dorsal}
    <use href="#bodyPath" fill="url(#body)"/>
    <g clip-path="url(#bodyClip)">
      <ellipse cx="740" cy="570" rx="140" ry="40" fill="#FFE0E6" opacity="0.35" filter="url(#soft4)"/>
      <!-- vảy ánh xanh -->
      ${[0, 1, 2, 3].map((c) => [0, 1, 2].map((r) => `<path d="M${610 + c * 45} ${455 + r * 38 + (c % 2) * 19} a20 20 0 0 0 0 36" stroke="${s.edge}" stroke-width="4" fill="none" opacity="${0.15 + 0.3 * F}"/>`).join("")).join("")}
      <ellipse cx="700" cy="610" rx="200" ry="40" fill="${s.colors[2]}" opacity="0.45" filter="url(#soft16)"/>
    </g>
    <path d="M770 440 C750 475 750 540 770 575" stroke="${s.colors[2]}" stroke-width="7" fill="none" stroke-linecap="round" opacity="0.5"/>
    ${pelvic}
    <path d="M745 540 C715 550 695 575 697 600 C725 595 748 572 755 548 Z" fill="url(#silkV2)" opacity="0.85"/>
    <path d="M640 452 C700 432 760 428 815 438" stroke="#fff" stroke-width="16" fill="none" stroke-linecap="round" opacity="0.65" filter="url(#soft4)"/>
    ${eye(800, 478, s.eyeR)}
    <ellipse cx="820" cy="545" rx="22" ry="12" fill="#FFB0C4" opacity="0.5" filter="url(#soft4)"/>
    <path d="M840 518 Q850 528 858 517" stroke="#7A1530" stroke-width="6" fill="none" stroke-linecap="round"/>
    ${shine}
  </g>`;
}

// ---------- cá thần tiên (hiếm) ----------
const ANGEL_STAGES = {
  juvenile: { F: 0.55, stripes: 0.5, gold: 0, eyeR: 46 },
  teen: { F: 0.8, stripes: 0.85, gold: 0.4, eyeR: 42 },
  adult: { F: 1.0, stripes: 1, gold: 1, eyeR: 40 },
};

function angelfish(stage) {
  const s = ANGEL_STAGES[stage];
  const F = s.F;
  const cx = 640;
  const cy = 505;
  // vây lưng & hậu môn: cánh buồm cao vút về sau
  const sail = (dir) => {
    const y0 = cy + dir * 120;
    const tipY = cy + dir * (150 + 280 * F);
    return `<path d="M760 ${cy + dir * 95} C${700} ${cy + dir * (180 + 120 * F)} ${620 - 40 * F} ${tipY} ${560 - 60 * F} ${tipY + dir * 10} C${560 - 30 * F} ${cy + dir * (150 + 150 * F)} 545 ${cy + dir * 150} 520 ${cy + dir * 70} C580 ${y0} 690 ${cy + dir * 110} 760 ${cy + dir * 95} Z" fill="url(#${dir < 0 ? "finUp" : "finDown"})"/>
      ${rays(640, y0, [[600 - 50 * F, tipY], [620 - 20 * F, cy + dir * (140 + 220 * F)], [650, cy + dir * (130 + 150 * F)]], "#8E9AAE", 4, 0.35)}`;
  };
  const stripes = [560, 650, 745]
    .map((x, i) => `<path d="M${x} 330 C${x - 20} 430 ${x - 20} 580 ${x} 680" stroke="#2F3A5C" stroke-width="${i === 2 ? 22 : 34}" fill="none" opacity="${0.75 * s.stripes}" stroke-linecap="round"/>`)
    .join("");
  return `
  <defs>
    <radialGradient id="body" cx="0.65" cy="0.35" r="0.8">
      <stop offset="0" stop-color="#FFFFFF"/><stop offset="0.6" stop-color="#E9EEF5"/><stop offset="1" stop-color="#BFC9D8"/>
    </radialGradient>
    <linearGradient id="finUp" x1="0" y1="1" x2="0" y2="0">
      <stop offset="0" stop-color="#E6ECF4" stop-opacity="0.95"/><stop offset="1" stop-color="#C7D2E2" stop-opacity="0.75"/>
    </linearGradient>
    <linearGradient id="finDown" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#E6ECF4" stop-opacity="0.95"/><stop offset="1" stop-color="#C7D2E2" stop-opacity="0.75"/>
    </linearGradient>
    <radialGradient id="gold" cx="0.5" cy="0.5" r="0.5">
      <stop offset="0" stop-color="#FFD36E" stop-opacity="0.85"/><stop offset="1" stop-color="#FFD36E" stop-opacity="0"/>
    </radialGradient>
    <clipPath id="bodyClip"><path id="bodyPath" d="M860 505 C860 420 800 330 690 318 C600 310 540 380 500 450 C488 475 488 535 500 560 C540 630 600 700 690 692 C800 680 860 590 860 505 Z"/></clipPath>
  </defs>
  <g id="art">
    <!-- đuôi quạt có sợi kéo dài -->
    <path d="M505 470 C450 430 420 ${505 - 110 * F} ${400 - 30 * F} ${505 - 140 * F} C${410 - 20 * F} ${505 - 60 * F} ${410 - 20 * F} ${505 + 60 * F} ${400 - 30 * F} ${505 + 140 * F} C420 ${505 + 110 * F} 450 580 505 540 Z" fill="url(#finUp)"/>
    ${rays(500, 505, [[400 - 25 * F, 505 - 120 * F], [395 - 25 * F, 505 - 40 * F], [395 - 25 * F, 505 + 40 * F], [400 - 25 * F, 505 + 120 * F]], "#8E9AAE", 4, 0.35)}
    ${sail(-1)}
    ${sail(1)}
    <use href="#bodyPath" fill="url(#body)"/>
    <g clip-path="url(#bodyClip)">
      ${stripes}
      <ellipse cx="790" cy="420" rx="110" ry="80" fill="url(#gold)" opacity="${s.gold}"/>
      <ellipse cx="660" cy="700" rx="260" ry="70" fill="#9AA6BA" opacity="0.4" filter="url(#soft16)"/>
    </g>
    <!-- sợi vây bụng dài -->
    <path d="M760 615 C${750 - 10 * F} ${615 + 120 * F} ${720 - 30 * F} ${615 + 220 * F} ${690 - 60 * F} ${615 + 280 * F}" stroke="#D6DEEA" stroke-width="12" fill="none" stroke-linecap="round" opacity="0.95"/>
    <path d="M745 612 C${730 - 10 * F} ${612 + 110 * F} ${700 - 30 * F} ${612 + 200 * F} ${665 - 60 * F} ${612 + 250 * F}" stroke="#C3CDDB" stroke-width="9" fill="none" stroke-linecap="round" opacity="0.9"/>
    <path d="M770 520 C740 535 722 560 724 585 C752 580 772 558 778 530 Z" fill="url(#finDown)" opacity="0.9"/>
    <path d="M610 360 C680 330 760 335 815 380" stroke="#fff" stroke-width="18" fill="none" stroke-linecap="round" opacity="0.75" filter="url(#soft4)"/>
    ${eye(790, 470, s.eyeR)}
    <ellipse cx="815" cy="540" rx="22" ry="12" fill="#FF8FAB" opacity="0.45" filter="url(#soft4)"/>
    <path d="M838 515 Q848 525 856 514" stroke="#4A5470" stroke-width="6" fill="none" stroke-linecap="round"/>
  </g>`;
}

// ---------- cá ngựa (hiếm) ----------
const SEAHORSE_STAGES = {
  juvenile: { colors: ["#FFE3C2", "#FFC08A", "#F09A62"], crown: 0, spots: 0, eyeR: 44, fin: 0.7 },
  teen: { colors: ["#FFD08A", "#FF9E5E", "#E86F4A"], crown: 0.7, spots: 4, eyeR: 40, fin: 0.85 },
  adult: { colors: ["#FFC872", "#FF7F5E", "#D9504A"], crown: 1, spots: 8, eyeR: 38, fin: 1 },
};

function seahorse(stage) {
  const s = SEAHORSE_STAGES[stage];
  // đuôi cuộn: chuỗi đoạn nét nhỏ dần
  const tailPath = "M545 640 C540 720 520 790 470 830 C420 870 360 850 355 800 C350 755 395 735 425 760 C445 778 435 805 412 802";
  const widths = [88, 70, 54, 40, 28, 18];
  const tailSegs = widths
    .map((w, i) => `<path d="${tailPath}" stroke="url(#body)" stroke-width="${w}" fill="none" stroke-linecap="round" pathLength="100" stroke-dasharray="${(i + 1) * 17} 100" stroke-dashoffset="${-i * 0}" opacity="1"/>`)
    .reverse()
    .join("");
  const ridges = [0, 1, 2, 3, 4, 5]
    .map((i) => `<path d="M${470 + i * 4} ${400 + i * 45} Q${560} ${415 + i * 45} ${640 - i * 6} ${395 + i * 45}" stroke="${s.colors[2]}" stroke-width="5" fill="none" opacity="0.35" stroke-linecap="round"/>`)
    .join("");
  const spotPts = [[520, 430], [590, 470], [510, 520], [600, 560], [540, 610], [470, 470], [620, 420], [480, 580]];
  const spots = spotPts.slice(0, s.spots).map(([x, y]) => `<circle cx="${x}" cy="${y}" r="9" fill="#FFF4E0" opacity="0.8"/>`).join("");
  const C = s.crown;
  const crown = C
    ? `<path d="M545 205 L${555} ${205 - 55 * C} L575 200 L${590} ${200 - 65 * C} L605 202 L${622} ${205 - 48 * C} L630 215 Z" fill="${s.colors[1]}" stroke="${s.colors[2]}" stroke-width="5" stroke-linejoin="round"/>`
    : "";
  return `
  <defs>
    <linearGradient id="body" gradientUnits="userSpaceOnUse" x1="680" y1="260" x2="420" y2="760">
      <stop offset="0" stop-color="${s.colors[0]}"/><stop offset="0.5" stop-color="${s.colors[1]}"/><stop offset="1" stop-color="${s.colors[2]}"/>
    </linearGradient>
    <linearGradient id="belly" x1="1" y1="0" x2="0" y2="0">
      <stop offset="0" stop-color="#FFF6E6" stop-opacity="0.9"/><stop offset="1" stop-color="#FFF6E6" stop-opacity="0"/>
    </linearGradient>
    <linearGradient id="fin" x1="1" y1="0" x2="0" y2="0">
      <stop offset="0" stop-color="#FFE6C8" stop-opacity="0.9"/><stop offset="1" stop-color="#FFD0A8" stop-opacity="0.65"/>
    </linearGradient>
    <clipPath id="bodyClip"><path id="bodyPath" d="M600 300 C670 330 690 420 665 500 C645 570 610 640 560 660 C510 675 470 640 455 590 C440 530 430 450 450 390 C470 330 530 280 600 300 Z"/></clipPath>
  </defs>
  <g id="art">
    <!-- vây lưng nhỏ phía sau -->
    <path d="M458 470 C${430 - 50 * s.fin} ${455} ${420 - 60 * s.fin} ${510} ${430 - 50 * s.fin} ${560} C450 555 455 530 452 520 Z" fill="url(#fin)"/>
    ${rays(455, 512, [[435 - 50 * s.fin, 470], [425 - 55 * s.fin, 512], [435 - 50 * s.fin, 550]], "#E89A6A", 4, 0.4)}
    ${tailSegs}
    <use href="#bodyPath" fill="url(#body)"/>
    <g clip-path="url(#bodyClip)">
      <ellipse cx="640" cy="520" rx="70" ry="150" fill="url(#belly)"/>
      ${ridges}
      ${spots}
    </g>
    <!-- đầu + mõm ống -->
    <path d="M540 300 C520 240 560 190 620 195 C680 200 705 250 700 280 L790 300 C812 305 812 335 790 338 L690 340 C670 360 600 365 560 340 Z" fill="url(#body)"/>
    <path d="M700 290 L785 306" stroke="#fff" stroke-width="8" stroke-linecap="round" opacity="0.6"/>
    ${crown}
    <path d="M580 230 C610 212 650 215 672 238" stroke="#fff" stroke-width="16" fill="none" stroke-linecap="round" opacity="0.7" filter="url(#soft4)"/>
    <path d="M520 360 C560 340 610 345 640 360" stroke="#fff" stroke-width="12" fill="none" stroke-linecap="round" opacity="0.4" filter="url(#soft4)"/>
    ${eye(635, 270, s.eyeR)}
    <ellipse cx="650" cy="325" rx="20" ry="11" fill="#FF6F91" opacity="0.45" filter="url(#soft4)"/>
    <!-- vây ngực sau mắt -->
    <path d="M590 330 C565 330 548 345 550 365 C572 368 590 355 596 338 Z" fill="url(#fin)"/>
  </g>`;
}

// ---------- danh sách asset ----------
const ASSETS = {
  "fish-egg-common": () => egg("common"),
  "fish-egg-legendary": () => egg("legendary"),
  "fish-egg-rare": () => egg("rare"),
  "fish-fry-base": fry,
  "goldfish-juvenile": () => goldfish("juvenile"),
  "goldfish-teen": () => goldfish("teen"),
  "goldfish-adult": () => goldfish("adult"),
  "dragonfish-juvenile": () => dragonfish("juvenile"),
  "dragonfish-teen": () => dragonfish("teen"),
  "dragonfish-adult": () => dragonfish("adult"),
  "dragonfish-king": () => dragonfish("king"),
  "guppy-juvenile": () => guppy("juvenile"),
  "guppy-teen": () => guppy("teen"),
  "guppy-adult": () => guppy("adult"),
  "puffer-juvenile": () => puffer("juvenile"),
  "puffer-teen": () => puffer("teen"),
  "puffer-adult": () => puffer("adult"),
  "neon-juvenile": () => neon("juvenile"),
  "neon-teen": () => neon("teen"),
  "neon-adult": () => neon("adult"),
  "betta-juvenile": () => betta("juvenile"),
  "betta-teen": () => betta("teen"),
  "betta-adult": () => betta("adult"),
  "angelfish-juvenile": () => angelfish("juvenile"),
  "angelfish-teen": () => angelfish("teen"),
  "angelfish-adult": () => angelfish("adult"),
  "seahorse-juvenile": () => seahorse("juvenile"),
  "seahorse-teen": () => seahorse("teen"),
  "seahorse-adult": () => seahorse("adult"),
};

const svgDoc = (body) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}"><defs>${commonDefs}</defs>${body}</svg>`;

// HTML bọc: căn #art vào giữa, chiếm FILL_RATIO khung (theo cạnh dài).
const htmlDoc = (svg, px = SIZE, fill = FILL_RATIO) => `<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0;background:transparent;overflow:hidden}svg{display:block;width:${px}px;height:${px}px}</style></head><body>${svg}
<script>
const g=document.getElementById('art');const b=g.getBBox();const t=${SIZE * fill};
const s=Math.min(t/b.width,t/b.height);const cx=b.x+b.width/2,cy=b.y+b.height/2;
const w=document.createElementNS('http://www.w3.org/2000/svg','g');g.parentNode.insertBefore(w,g);w.appendChild(g);
w.setAttribute('transform','translate(${SIZE / 2} ${SIZE / 2}) scale('+s+') translate('+(-cx)+' '+(-cy)+')');
</script></body></html>`;

/** Chromium để chụp: CHROME=… → headless shell của Playwright (macOS / Windows) → Chrome hoặc Edge cài sẵn trên Windows. */
function findChrome() {
  if (process.env.CHROME) return process.env.CHROME;
  const caches = [join(homedir(), "Library/Caches/ms-playwright"), join(process.env.LOCALAPPDATA ?? "", "ms-playwright")];
  for (const cache of caches) {
    const dir = existsSync(cache) ? readdirSync(cache).filter((d) => d.startsWith("chromium_headless_shell-")).sort().pop() : null;
    if (!dir) continue;
    for (const sub of ["chrome-headless-shell-mac-arm64/chrome-headless-shell", "chrome-headless-shell-win64/chrome-headless-shell.exe"]) {
      if (existsSync(join(cache, dir, sub))) return join(cache, dir, sub);
    }
  }
  const installed = [
    join(process.env.PROGRAMFILES ?? "C:/Program Files", "Google/Chrome/Application/chrome.exe"),
    join(process.env["PROGRAMFILES(X86)"] ?? "C:/Program Files (x86)", "Google/Chrome/Application/chrome.exe"),
    join(process.env["PROGRAMFILES(X86)"] ?? "C:/Program Files (x86)", "Microsoft/Edge/Application/msedge.exe"),
  ].find(existsSync);
  if (installed) return installed;
  throw new Error("Không tìm thấy Chromium headless; đặt biến CHROME=<đường dẫn>.");
}

const GAME = join(ROOT, "public/assets/fish");
const GAME_PX = 512;
mkdirSync(SRC, { recursive: true });
mkdirSync(OUT, { recursive: true });
mkdirSync(GAME, { recursive: true });
const chrome = findChrome();
const args = process.argv.slice(2);
const exportGame = args.includes("--export");
const only = args.filter((a) => !a.startsWith("--"));
const tmp = join(tmpdir(), "draw-fish");
mkdirSync(tmp, { recursive: true });

function shoot(html, out, px) {
  execFileSync(chrome, [
    // Chrome/Edge đầy đủ cần cờ headless; bản headless-shell thì luôn headless.
    ...(chrome.includes("headless-shell") ? [] : ["--headless", "--disable-gpu", `--user-data-dir=${join(tmp, "profile")}`]),
    `--screenshot=${out}`,
    `--window-size=${px},${px}`,
    "--default-background-color=00000000",
    "--hide-scrollbars",
    "--force-device-scale-factor=1",
    pathToFileURL(html).href,
  ], { stdio: "pipe" });
}

for (const [id, draw] of Object.entries(ASSETS)) {
  if (only.length && !only.includes(id)) continue;
  const svg = svgDoc(draw());
  writeFileSync(join(SRC, `${id}.svg`), svg);
  const html = join(tmp, `${id}.html`);
  writeFileSync(html, htmlDoc(svg));
  shoot(html, join(OUT, `${id}.png`), SIZE);
  if (exportGame) {
    // Bản cho game: cá gần chạm hai mép trái-phải để Rope uốn đúng chiều dài cá.
    const gameHtml = join(tmp, `${id}.game.html`);
    writeFileSync(gameHtml, htmlDoc(svg, GAME_PX, 0.96));
    shoot(gameHtml, join(GAME, `${id}.png`), GAME_PX);
  }
  console.log("✓", id);
}
