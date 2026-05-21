const gradientHillsSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="820" viewBox="0 0 1280 820">
  <defs>
    <linearGradient id="sky" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#0e1028"/><stop offset=".42" stop-color="#4e246f"/><stop offset="1" stop-color="#f2a65a"/></linearGradient>
    <radialGradient id="sun" cx="48%" cy="42%" r="38%"><stop offset="0" stop-color="#fff6b7"/><stop offset=".28" stop-color="#f95738"/><stop offset="1" stop-color="#111021" stop-opacity="0"/></radialGradient>
    <filter id="blur"><feGaussianBlur stdDeviation="22"/></filter>
  </defs>
  <rect width="1280" height="820" fill="url(#sky)"/>
  <circle cx="690" cy="310" r="270" fill="url(#sun)" opacity=".74" filter="url(#blur)"/>
  <path d="M0 620 C190 540 270 700 430 610 S760 500 940 620 1130 720 1280 610 L1280 820 L0 820 Z" fill="#10131c" opacity=".82"/>
  <path d="M0 710 C170 665 330 735 510 665 S850 590 1040 690 1190 755 1280 715 L1280 820 L0 820 Z" fill="#05060a" opacity=".96"/>
  <g opacity=".9">
    <circle cx="230" cy="180" r="88" fill="#52d6c6"/>
    <circle cx="1020" cy="210" r="66" fill="#f6d365"/>
    <rect x="535" y="455" width="210" height="110" rx="30" fill="#f04a2a" transform="rotate(-9 640 510)"/>
    <rect x="850" y="405" width="140" height="190" rx="24" fill="#2f80ed" transform="rotate(13 920 500)"/>
  </g>
</svg>`;

const alphaStacksSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="820" viewBox="0 0 1280 820">
  <defs>
    <pattern id="checker" width="48" height="48" patternUnits="userSpaceOnUse">
      <rect width="48" height="48" fill="#18202b"/>
      <rect width="24" height="24" fill="#263343"/>
      <rect x="24" y="24" width="24" height="24" fill="#263343"/>
    </pattern>
    <filter id="softShadow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="24" stdDeviation="28" flood-color="#000000" flood-opacity=".42"/>
    </filter>
  </defs>
  <rect width="1280" height="820" fill="url(#checker)"/>
  <g filter="url(#softShadow)">
    <circle cx="390" cy="360" r="245" fill="#ff2f6d" opacity=".64"/>
    <circle cx="600" cy="330" r="245" fill="#1fd3ff" opacity=".58"/>
    <circle cx="505" cy="505" r="245" fill="#f7f15b" opacity=".52"/>
    <rect x="705" y="176" width="360" height="360" rx="72" fill="#6b4cff" opacity=".5" transform="rotate(18 885 356)"/>
    <rect x="755" y="330" width="365" height="250" rx="54" fill="#18f1a5" opacity=".42" transform="rotate(-13 937 455)"/>
  </g>
  <g fill="none" stroke-width="10" opacity=".72">
    <path d="M170 650 C360 520 520 750 705 620 S1015 515 1150 650" stroke="#ffffff" opacity=".54"/>
    <path d="M180 672 C370 542 530 772 715 642 S1025 537 1160 672" stroke="#07090d" opacity=".6"/>
  </g>
</svg>`;

const hairlineMoiresSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="820" viewBox="0 0 1280 820" shape-rendering="geometricPrecision">
  <defs>
    <pattern id="fineGrid" width="13" height="13" patternUnits="userSpaceOnUse">
      <rect width="13" height="13" fill="#f7f2e8"/>
      <path d="M0 .5 H13 M.5 0 V13" stroke="#1e2530" stroke-width="1" opacity=".42"/>
    </pattern>
    <pattern id="microDots" width="18" height="18" patternUnits="userSpaceOnUse">
      <rect width="18" height="18" fill="none"/>
      <circle cx="1" cy="1" r="1" fill="#f04a2a"/>
      <circle cx="10" cy="8" r=".8" fill="#2f80ed"/>
    </pattern>
  </defs>
  <rect width="1280" height="820" fill="url(#fineGrid)"/>
  <g transform="rotate(-7 640 410)" opacity=".8">
    <rect x="130" y="110" width="1020" height="590" fill="none" stroke="#111827" stroke-width="1"/>
    <path d="M130 140 H1150 M130 174 H1150 M130 208 H1150 M130 242 H1150 M130 276 H1150 M130 310 H1150 M130 344 H1150 M130 378 H1150 M130 412 H1150 M130 446 H1150 M130 480 H1150 M130 514 H1150 M130 548 H1150 M130 582 H1150 M130 616 H1150 M130 650 H1150" stroke="#111827" stroke-width=".75" opacity=".55"/>
    <path d="M170 110 V700 M212 110 V700 M254 110 V700 M296 110 V700 M338 110 V700 M380 110 V700 M422 110 V700 M464 110 V700 M506 110 V700 M548 110 V700 M590 110 V700 M632 110 V700 M674 110 V700 M716 110 V700 M758 110 V700 M800 110 V700 M842 110 V700 M884 110 V700 M926 110 V700 M968 110 V700 M1010 110 V700 M1052 110 V700 M1094 110 V700" stroke="#111827" stroke-width=".75" opacity=".55"/>
  </g>
  <g fill="none" stroke-linecap="round">
    <circle cx="640" cy="410" r="280" stroke="#061d3b" stroke-width="1" opacity=".62"/>
    <circle cx="640" cy="410" r="244" stroke="#f04a2a" stroke-width="1" opacity=".5"/>
    <circle cx="640" cy="410" r="208" stroke="#168f7a" stroke-width="1" opacity=".48"/>
    <path d="M185 702 L1095 106" stroke="#ff006e" stroke-width="2" opacity=".75"/>
    <path d="M186 106 L1094 702" stroke="#00b4d8" stroke-width="2" opacity=".75"/>
  </g>
  <rect x="1020" y="560" width="150" height="120" fill="url(#microDots)" opacity=".85"/>
</svg>`;

const maskPatternSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="820" viewBox="0 0 1280 820">
  <defs>
    <linearGradient id="ribbon" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#ffbe0b"/><stop offset=".33" stop-color="#fb5607"/><stop offset=".66" stop-color="#8338ec"/><stop offset="1" stop-color="#3a86ff"/></linearGradient>
    <pattern id="slashes" width="36" height="36" patternUnits="userSpaceOnUse" patternTransform="rotate(28)">
      <rect width="36" height="36" fill="#11151d"/>
      <rect width="9" height="36" fill="#edf2f4" opacity=".82"/>
    </pattern>
    <clipPath id="bigClip"><path d="M186 142 C390 26 530 170 650 112 C840 20 1090 110 1124 302 C1172 570 915 714 646 664 C400 620 120 734 98 470 C88 338 66 210 186 142 Z"/></clipPath>
    <mask id="holes">
      <rect width="1280" height="820" fill="white"/>
      <circle cx="384" cy="330" r="118" fill="black"/>
      <circle cx="790" cy="405" r="172" fill="black" opacity=".76"/>
      <rect x="905" y="230" width="190" height="300" rx="46" fill="black" transform="rotate(11 1000 380)"/>
    </mask>
  </defs>
  <rect width="1280" height="820" fill="#0b0f14"/>
  <g clip-path="url(#bigClip)" mask="url(#holes)">
    <rect x="70" y="60" width="1110" height="650" fill="url(#slashes)"/>
    <path d="M70 620 C250 380 390 690 570 430 S920 240 1180 500 L1180 710 L70 710 Z" fill="url(#ribbon)" opacity=".88"/>
    <path d="M65 220 C270 80 390 360 610 180 S905 122 1175 310" fill="none" stroke="#61ffca" stroke-width="38" opacity=".72"/>
  </g>
  <g fill="none" stroke="#f8f9fa" stroke-width="6" opacity=".86">
    <path d="M160 720 h960" stroke-dasharray="10 18"/>
    <path d="M170 96 h940" stroke-dasharray="1 18" stroke-linecap="round"/>
  </g>
</svg>`;

const lowContrastSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="820" viewBox="0 0 1280 820">
  <defs>
    <linearGradient id="mist" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#b8b8ac"/><stop offset=".35" stop-color="#aeb7b2"/><stop offset=".7" stop-color="#b6acb7"/><stop offset="1" stop-color="#c0b8ad"/></linearGradient>
    <filter id="grain" x="0" y="0" width="100%" height="100%">
      <feTurbulence type="fractalNoise" baseFrequency=".9" numOctaves="2" seed="7" result="noise"/>
      <feColorMatrix in="noise" type="saturate" values="0"/>
      <feComponentTransfer><feFuncA type="table" tableValues="0 .06"/></feComponentTransfer>
    </filter>
  </defs>
  <rect width="1280" height="820" fill="url(#mist)"/>
  <rect width="1280" height="820" filter="url(#grain)"/>
  <g opacity=".64">
    <circle cx="305" cy="270" r="170" fill="#b9c0ba"/>
    <circle cx="488" cy="335" r="170" fill="#c1b7bb"/>
    <circle cx="720" cy="300" r="180" fill="#b3b8c0"/>
    <circle cx="955" cy="370" r="205" fill="#bfb6a9"/>
  </g>
  <g fill="none" stroke-width="36" stroke-linecap="round" opacity=".36">
    <path d="M150 575 C350 498 458 646 642 574 S970 500 1138 604" stroke="#8d9992"/>
    <path d="M156 624 C348 548 482 700 668 626 S1002 552 1144 654" stroke="#998e9a"/>
  </g>
  <rect x="525" y="262" width="235" height="235" rx="54" fill="#adb5bd" opacity=".34" transform="rotate(4 642 380)"/>
</svg>`;

const sparseOutliersSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="820" viewBox="0 0 1280 820">
  <rect width="1280" height="820" fill="#111318"/>
  <rect x="94" y="86" width="1092" height="648" rx="24" fill="#171a20" stroke="#262b33" stroke-width="2"/>
  <g opacity=".46" stroke="#303741" stroke-width="1">
    <path d="M94 248 H1186 M94 410 H1186 M94 572 H1186"/>
    <path d="M367 86 V734 M640 86 V734 M913 86 V734"/>
  </g>
  <g>
    <rect x="210" y="180" width="5" height="5" fill="#ff0054"/>
    <rect x="1017" y="252" width="8" height="8" fill="#00f5d4"/>
    <rect x="468" y="602" width="4" height="4" fill="#fee440"/>
    <rect x="802" y="512" width="7" height="7" fill="#9b5de5"/>
    <circle cx="1130" cy="680" r="7" fill="#f15bb5"/>
    <circle cx="168" cy="690" r="3" fill="#00bbf9"/>
  </g>
  <g font-family="ui-monospace, SFMono-Regular, Menlo, Consolas, monospace" font-size="22" fill="#8b949e" opacity=".74">
    <text x="126" y="128">sparse source: 99% almost nothing</text>
  </g>
</svg>`;

export const demoImages = [
  {
    id: "gradient-hills",
    name: "Soft gradients",
    description: "Smooth gradients, blur, translucent glow, and large dark masses.",
    statusName: "demo image",
    svg: gradientHillsSvg
  },
  {
    id: "alpha-stacks",
    name: "Alpha stacks",
    description: "Transparent overlapping colors on a checkerboard with composited edges.",
    statusName: "demo alpha stacks",
    svg: alphaStacksSvg
  },
  {
    id: "hairline-moires",
    name: "Hairline moirés",
    description: "Subpixel strokes, dense grids, tiny pattern dots, and anti-aliased diagonals.",
    statusName: "demo hairline moirés",
    svg: hairlineMoiresSvg
  },
  {
    id: "mask-patterns",
    name: "Masks + patterns",
    description: "Clips, masks, repeated hatches, holes, dashes, and saturated ribbons.",
    statusName: "demo masks and patterns",
    svg: maskPatternSvg
  },
  {
    id: "low-contrast",
    name: "Low contrast",
    description: "Near-neutral hue shifts, low chroma, grain, and soft value separation.",
    statusName: "demo low contrast",
    svg: lowContrastSvg
  },
  {
    id: "sparse-outliers",
    name: "Sparse outliers",
    description: "Mostly empty dark space with a few tiny high-chroma samples and text.",
    statusName: "demo sparse outliers",
    svg: sparseOutliersSvg
  }
];

export const DEFAULT_DEMO_IMAGE_ID = demoImages[0].id;

export function getDemoImage(id = DEFAULT_DEMO_IMAGE_ID) {
  return demoImages.find(demo => demo.id === id) || demoImages[0];
}

export const demoSvg = demoImages[0].svg;
