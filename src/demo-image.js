export const demoSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="820" viewBox="0 0 1280 820">
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
