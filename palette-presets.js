window.PALETTE_PRESETS = {
    // Amiga Workbench-inspired desktop colors.
    // Stark black/white UI contrast, blue system tones, and warm orange accents.
    amigaWorkbench: [
        "#000000", "#ffffff", "#0055aa", "#ff8800",
        "#223344", "#446688", "#88aacc", "#ffd2a0",
        "#aa5500", "#663300", "#cccccc", "#555555"
    ],

    // Amiga demoscene-style palette.
    amigaDemoscene: [
        "#000000", "#111133", "#332266", "#663399",
        "#aa44aa", "#ff66cc", "#ff9966", "#ffcc55",
        "#ffff99", "#88ffcc", "#44ccff", "#2288dd",
        "#115599", "#ffffff", "#777777", "#331122"
    ],

    // Commodore 64-style 16-color palette.
    commodore64: [
        "#000000", "#ffffff", "#880000", "#aaffee",
        "#cc44cc", "#00cc55", "#0000aa", "#eeee77",
        "#dd8855", "#664400", "#ff7777", "#333333",
        "#777777", "#aaff66", "#0088ff", "#bbbbbb"
    ],

    // IBM CGA bright 16-color palette.
    // The classic RGBI colors: harsh, electric, and absolutely not subtle.
    cgaBright: [
        "#000000", "#0000aa", "#00aa00", "#00aaaa",
        "#aa0000", "#aa00aa", "#aa5500", "#aaaaaa",
        "#555555", "#5555ff", "#55ff55", "#55ffff",
        "#ff5555", "#ff55ff", "#ffff55", "#ffffff"
    ],

    // ZX Spectrum-style palette.
    // Primary-color arcade brutalism: black, bright ink colors, and their high-intensity variants.
    zxSpectrum: [
        "#000000", "#0000d7", "#d70000", "#d700d7",
        "#00d700", "#00d7d7", "#d7d700", "#d7d7d7",
        "#0000ff", "#ff0000", "#ff00ff", "#00ff00",
        "#00ffff", "#ffff00", "#ffffff"
    ],

    // MSX / TMS9918-inspired palette.
    // Soft early-home-computer colors with those distinctive blue, red, cyan, and green jumps.
    msxTms9918: [
        "#000000", "#21c842", "#5edc78", "#5455ed",
        "#7d76fc", "#d4524d", "#42ebf5", "#fc5554",
        "#ff7978", "#d4c154", "#e6ce80", "#21b03b",
        "#c95bba", "#cccccc", "#ffffff"
    ],

    // Atari ST-inspired palette.
    // Clean desktop grays, saturated primaries, and a softer 16-bit computer feel.
    atariST: [
        "#000000", "#ffffff", "#777777", "#bbbbbb",
        "#880000", "#cc4444", "#ffaa55", "#ffff88",
        "#448844", "#66cc66", "#44aaaa", "#88ffff",
        "#224488", "#6688cc", "#8844aa", "#cc88ff"
    ],

    // NES-inspired palette slice.
    // A practical subset: neutral ramps, blues, reds, greens, and golds for tile work.
    nes: [
        "#000000", "#7c7c7c", "#bcbcbc", "#ffffff",
        "#0000fc", "#0078f8", "#3cbcfc", "#6888fc",
        "#a80020", "#f83800", "#f87858", "#f8b878",
        "#005800", "#00b800", "#58d854", "#b8f818",
        "#503000", "#ac7c00", "#f8b800", "#f8d878"
    ],

    // Game Boy Pocket-inspired palette.
    // Cooler and cleaner than the original DMG.
    gameBoyPocket: [
        "#081820", "#346856", "#88c070", "#e0f8d0",
        "#102820", "#204838", "#589060", "#b0d890"
    ],

    // Classic Macintosh monochrome palette.
    // Pure grayscale dithering territory.
    macintoshClassic: [
        "#000000", "#1c1c1c", "#383838", "#555555",
        "#717171", "#8d8d8d", "#aaaaaa", "#c6c6c6",
        "#e2e2e2", "#ffffff"
    ],

    // Vaporwave DOS fantasy palette.
    // Purple shadows, neon cyan, hot pink, lemon yellow — like a command prompt at the mall.
    vaporwaveDos: [
        "#000000", "#120024", "#240046", "#3c096c",
        "#5a189a", "#7b2cbf", "#9d4edd", "#c77dff",
        "#ff5d8f", "#ff85a1", "#ffb3c1", "#ffd6ff",
        "#00f5d4", "#00bbf9", "#fee440", "#ffffff"
    ],

    // Gothic console palette extracted from emulated NES Castlevania.
    // Candlelight, stone, blood red, haunted blue — cathedral pixels, basically.
    castlevania: [
        "#000000", "#000344", "#7d1f1b", "#b53120",
        "#474747", "#104890", "#7e4400", "#5c5c5c",
        "#00404d", "#7391e2", "#fe8170", "#d88e1e",
        "#a9a8a9", "#ffbeac", "#ffe072", "#fdfcfd"
    ],

    // Original Game Boy DMG. The iconic 4-shade "pea soup" green.
    gameBoyDmg: [
        "#0f380f", "#306230", "#8bac0f", "#9bbc0f"
    ],

    // Nintendo Virtual Boy. The hardware only emitted red LEDs.
    // 4 shades of red on black — that's the entire system palette.
    virtualBoy: [
        "#000000", "#550000", "#aa0000", "#ff0000"
    ],

    // IBM CGA Mode 4, palette 1, high intensity.
    // The "cyan/magenta/white on black" 4-color mode you'd recognize from
    // early King's Quest, Sierra adventures, etc.
    cgaMode4Cyan: [
        "#000000", "#55ffff", "#ff55ff", "#ffffff"
    ],

    // IBM CGA Mode 4, palette 0, high intensity.
    // The other canonical 4-color combo: green/red/yellow on black.
    cgaMode4Green: [
        "#000000", "#55ff55", "#ff5555", "#ffff55"
    ],

    // Apple II High-Resolution Graphics (HGR) — 6 colors.
    // NOTE: Apple II HGR colors come from NTSC artifacting, so exact
    // RGB values vary by monitor and source. These are widely-cited
    // approximations, not a hardware-exact spec.
    appleIIHgr: [
        "#000000", "#20c000", "#a000ff", "#ffffff",
        "#ff6500", "#0080ff"
    ],

    // TIC-80 fantasy console default palette — the SWEETIE-16 palette
    // by GrafxKid. Modern, but a real fixed hardware-like palette
    // shipped with the tool.
    tic80Sweetie16: [
        "#1a1c2c", "#5d275d", "#b13e53", "#ef7d57",
        "#ffcd75", "#a7f070", "#38b764", "#257179",
        "#29366f", "#3b5dc9", "#41a6f6", "#73eff7",
        "#f4f4f4", "#94b0c2", "#566c86", "#333c57"
    ],

    // PICO-8 fantasy console palette.
    // Tight, iconic, and weirdly perfect: 16 colors that can do caves, UI, sunsets, slime, everything.
    pico8: [
        "#000000", "#1d2b53", "#7e2553", "#008751",
        "#ab5236", "#5f574f", "#c2c3c7", "#fff1e8",
        "#ff004d", "#ffa300", "#ffec27", "#00e436",
        "#29adff", "#83769c", "#ff77a8", "#ffccaa"
    ],

    // PC-98 visual novel-inspired palette.
    // Dusky purples, warm skin tones, dusty blues — moody dialogue-box romance machine.
    pc98VisualNovel: [
        "#050007", "#1b1020", "#2e1b35", "#4d2b4f",
        "#70405f", "#9b5f6e", "#d58a8a", "#ffc4aa",
        "#fff0d6", "#253050", "#3f5f8f", "#70a0c8",
        "#b8d8e8", "#62503a", "#a88755", "#e0c070"
    ],

    // EGA dungeon palette.
    // IBM EGA base colors plus torchlit browns for walls, floors, doors, dirt, and danger.
    egaDungeon: [
        "#000000", "#0000aa", "#00aa00", "#00aaaa",
        "#aa0000", "#aa00aa", "#aa5500", "#aaaaaa",
        "#2a1a12", "#442818", "#663820", "#884c28",
        "#b86838", "#d89050", "#ffd080", "#ffffff"
    ],

    // VGA dungeon palette.
    // Expanded cave-crawler tones: EGA bones, earthy ramps, moss greens,
    // cold blues, and purple deep levels.
    vgaDungeon: [
        "#000000", "#0000aa", "#00aaaa",
        "#1c2818", "#344028", "#586838", "#889060",
        "#882030", "#d8a838", "#287058", "#4080a8",
        "#aa00aa", "#aa5500", "#aaaaaa",
        "#2a1a12", "#442818", "#663820", "#884c28",
        "#b86838", "#d89050", "#ffd080", "#ffffff",
        "#181028", "#2a1f48", "#443868", "#6858a0",
        "#8c80c0",
    ],

    // DOS Midnight Commander-inspired palette.
    // Blue panels, cyan highlights, gray text, warning reds.
    dosMidnightCommander: [
        "#000000", "#000055", "#0000aa", "#0055aa",
        "#00aaaa", "#55ffff", "#aaaaaa", "#ffffff",
        "#550000", "#aa0000", "#ff5555", "#ffff55",
        "#005500", "#00aa00", "#55ff55", "#555555"
    ],

    // Arcade neon fantasy palette.
    // Black glass, ultraviolet shadows, and every attract-mode color screaming at once.
    arcadeNeon: [
        "#000000", "#080014", "#16002b", "#2d0055",
        "#55008a", "#8f00ff", "#ff00aa", "#ff3366",
        "#ff7733", "#ffee33", "#aaff00", "#33ff77",
        "#00ffaa", "#00ccff", "#3366ff", "#ffffff"
    ],

    // Amber terminal palette.
    terminalAmber: [
        "#050300", "#120900", "#241200", "#3a1f00",
        "#5a3200", "#7a4800", "#a06000", "#c9821f",
        "#e0a040", "#ffc060", "#ffda8a", "#fff0c0"
    ],

    // Green phosphor monitor palette.
    greenPhosphor: [
        "#001000", "#002000", "#003818", "#005020",
        "#007030", "#009040", "#00b850", "#20d868",
        "#58f080", "#98ffb0", "#d8ffe0", "#ffffff"
    ],

    // SNES RPG town palette.
    // Warm wood, stone shadows, grass, roofs, sky — little 16-bit village in a bottle.
    snesRpgTown: [
        "#080808", "#181820", "#282830", "#404050",
        "#5c4a38", "#806848", "#b08858", "#d8b878",
        "#f0d8a8", "#284030", "#407050", "#68a060",
        "#98c878", "#304868", "#5878a0", "#a8c8e8"
    ],

    // Amiga copper sunset palette.
    // Horizontal-gradient heaven: purple night, red-orange sun, pale highlights, and desktop-era shine.
    amigaCopperSunset: [
        "#000014", "#09002a", "#1a0045", "#35005f",
        "#5f0078", "#8a1a72", "#b83a5f", "#e05a45",
        "#ff7a2a", "#ffaa3a", "#ffd866", "#fff0a8",
        "#403050", "#6a5870", "#a090a0", "#ffffff"
    ],

    // Win32 system color-inspired palette.
    // Utility colors from old Windows UI: grays, navy, teal, green, yellow, red.
    win32: [
        "#000000", "#202020", "#404040", "#808080",
        "#c0c0c0", "#ffffff", "#000080", "#0000ff",
        "#008080", "#00ffff", "#008000", "#00ff00",
        "#808000", "#ffff00", "#800000", "#ff0000"
    ],

    // Desert CRT palette.
    // Sand, sun-baked browns, olive shadows, and creamy highlights through a dusty screen.
    desertCRT: [
        "#030201", "#14100b", "#2a2014", "#44301c",
        "#664525", "#8a6030", "#b88340", "#dca35a",
        "#f0c078", "#ffe0a8", "#202818", "#405030",
        "#708050", "#a0a878", "#c8c0a0", "#fff4d0"
    ],

    // Haunted monitor palette.
    // Sickly blue-green CRT gloom with bruised reds and warm ghost-light highlights.
    hauntedMonitor: [
        "#000000", "#080812", "#101828", "#1c2a3a",
        "#263f4a", "#335c5a", "#4b7a68", "#78a878",
        "#b4d48c", "#f0f0b0", "#2a1020", "#581830",
        "#8a2840", "#c85050", "#f09070", "#ffffff"
    ],

    // Sharp X68000 cyber palette.
    // Japanese computer-club neon: violet hardware shadows, pink blasts, cyan edges, white heat.
    x68000Cyber: [
        "#000000", "#080018", "#140030", "#280060",
        "#3f008f", "#5f00c8", "#9b38ff", "#d080ff",
        "#ff2aa8", "#ff5a5a", "#ff9a3c", "#ffe05a",
        "#00e0ff", "#00ffaa", "#70ff70", "#ffffff"
    ],

    // Neo Geo fighter-inspired palette.
    // Big arcade contrast: punchy reds, clean blues, bright greens, chunky shadows.
    neoGeoFighter: [
        "#000000", "#101018", "#202030", "#383850",
        "#700018", "#b82020", "#f05038", "#ffb050",
        "#204070", "#3080c0", "#60c8ff", "#b8f0ff",
        "#205020", "#40a040", "#90d850", "#ffffff"
    ],

    // Tandy 1000-inspired palette.
    // PCjr/Tandy-style RGBI colors, extended with warm browns for richer old-PC scenes.
    tandy1000: [
        "#000000", "#0000aa", "#00aa00", "#00aaaa",
        "#aa0000", "#aa00aa", "#aa5500", "#aaaaaa",
        "#555555", "#5555ff", "#55ff55", "#55ffff",
        "#ff5555", "#ff55ff", "#ffff55", "#ffffff",
        "#221100", "#664422", "#cc8844", "#ffe0aa"
    ],

    // Lotus 1-2-3 spreadsheet-inspired palette.
    // Business DOS colors: blues, cyans, grays, acid yellows, and aggressive alert reds.
    lotus123: [
        "#000000", "#000055", "#0000aa", "#0055aa",
        "#00aaaa", "#aaaaaa", "#ffffff", "#ffff55",
        "#005500", "#00aa00", "#55ff55", "#550000",
        "#aa0000", "#ff5555", "#555555", "#222222"
    ],

    // SGI IRIX desktop-inspired palette.
    // Cool workstation blues, teals, slate grays, and warm muted orange accents.
    irixDesktop: [
        "#050508", "#101018", "#202030", "#303048",
        "#405060", "#5f7890", "#80a8c0", "#b0d8e8",
        "#203840", "#306860", "#50a080", "#90d0a0",
        "#805040", "#c08050", "#f0b070", "#ffffff"
    ],

    // Solaris CDE-inspired palette.
    // Enterprise UNIX desktop tones: gray UI blocks, teal panels, and mauve system accents.
    solarisCde: [
        "#000000", "#202020", "#404040", "#606060",
        "#8a8a8a", "#c0c0c0", "#ffffff", "#003850",
        "#006878", "#0090a0", "#60c0c8", "#c8f0f0",
        "#503050", "#805080", "#c090b0", "#f0d0e8"
    ],

    // Quake brown palette.
    // Mud, rust, stone, shadow, and gray metal. Everything is a corridor. Everything growls.
    quakeBrown: [
        "#000000", "#0a0604", "#18100a", "#2a1a10",
        "#3d2616", "#58381f", "#76502c", "#9a6b3a",
        "#bd8a4e", "#d8ad70", "#f0d090", "#fff0c0",
        "#202020", "#484848", "#808080", "#c0c0c0"
    ],

    // Doom Mars palette.
    // Hellbase reds, scorched orange light, bone highlights, and dirty industrial browns.
    doomMars: [
        "#000000", "#100408", "#24080c", "#401010",
        "#681818", "#902020", "#c03028", "#f05038",
        "#ff8a40", "#ffc060", "#ffe090", "#fff0c8",
        "#282018", "#504030", "#887050", "#d0b080"
    ],

    // Sega Saturn arcade-inspired palette.
    // Deep blue-violet shadows, bold reds, golds, and smooth high-intensity arcade lighting.
    saturnArcade: [
        "#000000", "#101018", "#202038", "#303060",
        "#4040a0", "#6060e0", "#9090ff", "#ffffff",
        "#600000", "#a01818", "#e03030", "#ff8080",
        "#605000", "#c09020", "#ffd850", "#fff0a0"
    ],

    // Windows 95 teal palette.
    // Classic gray chrome plus the sacred teal void behind every floating dialog box.
    win95Teal: [
        "#000000", "#202020", "#404040", "#808080",
        "#c0c0c0", "#ffffff", "#000080", "#0000ff",
        "#008080", "#00ffff", "#004040", "#006060",
        "#008000", "#00aa00", "#808000", "#ffff00"
    ],

    // GeoCities night palette.
    // Web 1.0 maximalism: electric blue links, cyan glow, magenta chaos, yellow hazard text.
    geocitiesNight: [
        "#000000", "#000033", "#000066", "#0000cc",
        "#0033ff", "#00ccff", "#00ffff", "#ffffff",
        "#330066", "#6600cc", "#cc00ff", "#ff00cc",
        "#ff0066", "#ff6600", "#ffff00", "#00ff00"
    ],

    // Synthwave BBS palette.
    // Dial-up noir with neon magenta, violet ramps, cyan wireframes, and sunset orange.
    synthwaveBbs: [
        "#000000", "#080010", "#160020", "#2a0040",
        "#480070", "#7010a0", "#a020d0", "#d858ff",
        "#ff4fa0", "#ff7070", "#ffa040", "#ffd060",
        "#00b8ff", "#00ffd0", "#a0ff80", "#ffffff"
    ],

    // Swamp RPG palette.
    // Murky greens, old mud, moss, reeds, lantern yellows — everything smells damp.
    swampRpg: [
        "#000400", "#071008", "#102010", "#1c3018",
        "#304820", "#506830", "#789040", "#a8c060",
        "#d8e890", "#f8ffd0", "#202018", "#403828",
        "#705830", "#a07840", "#d0a060", "#ffe0a0"
    ],

    // Large Lospec-style pixel art palette.
    // Broad, flexible ramps for characters, terrain, UI, foliage, skies, metals, and candy highlights.
    lospec: [
        "#10121c", "#2c1e31", "#6b2643", "#ac2847",
        "#ec273f", "#94493a", "#de5d3a", "#e98537",
        "#f3a833", "#4d3533", "#6e4c30", "#a26d3f",
        "#ce9248", "#dab163", "#e8d282", "#f7f3b7",
        "#1e4044", "#006554", "#26854c", "#5ab552",
        "#9de64e", "#008b8b", "#62a477", "#a6cb96",
        "#d3eed3", "#3e3b65", "#3859b3", "#3388de",
        "#36c5f4", "#6dead6", "#5e5b8c", "#8c78a5",
        "#b0a7b8", "#deceed", "#9a4d76", "#c878af",
        "#cc99ff", "#fa6e79", "#ffa2ac", "#ffd1d5",
        "#f6e8e0", "#ffffff"
    ],

    // 1-bit palette, slightly toned. e-reader energy.
    "1bit": [
        "#112221", "#eaeadd"
    ],

    // Damp woods, bark, moss, shaded stone, and pale misty highlights.
    forestStaircase: [
        "#000300", "#0b1306", "#341e06", "#003f00",
        "#1d3e23", "#4d554a", "#7f624a", "#4f8a26",
        "#506c51", "#638768", "#7ca392", "#d1af95",
        "#a0dc73", "#b2d8b6", "#cdf7e4", "#defff5"
    ],

    // Compact magical glamour: violet shadow, royal purple, electric orchid, candle-gold.
    witchLuxe: [
        "#291043", "#4c3a80", "#d364d5", "#f1ae49"
    ],

    // Extracted from silk painting. Antique fabric tones, faded reds, blue-green shadows, and tarnished earthy neutrals.
    agedSilk: [
        "#080503", "#362722", "#65412c", "#9d704e",
        "#af8862", "#bf9c7f", "#a69894", "#a40d1a",
        "#954e38", "#bb8872", "#2a3738", "#03304c",
        "#11556d", "#3e3a25", "#3f473d", "#457f62"
    ],

    // Night blues, cigarette ember oranges, asphalt grays, and washed-out diner warmth.
    smokeBreak: [
        "#000004", "#071d31", "#311408", "#413e38",
        "#773631", "#4a4a4d", "#4e6078", "#7c574b",
        "#a24617", "#8a8780", "#cb8178", "#9badc8",
        "#fe9360", "#dbd8d0", "#ffd2c8", "#ffe2aa"
    ],

    // Flash-lit intimacy: bruised blacks, warm skin, dirty gold, apartment shadows.
    nanGoldin: [
        "#030000", "#1f2424", "#352b0c", "#5b1000",
        "#765722", "#19466c", "#605e5c", "#636968",
        "#7f714f", "#b15a3c", "#c9a36a", "#b0b7b6",
        "#d0bf9b", "#ffa986", "#fff6ba", "#bdbdd8"
    ],

    // Desert twilight, dusty violet, far blue, warm camp light, and alkaline pale yellow.
    playaDusk: [
        "#02000f", "#15131d", "#001644", "#392c38",
        "#575460", "#3c568f", "#825f42", "#817380",
        "#8da2e1", "#d5ac8c", "#d2c2d0", "#fff7d5",
        "#dfe26e"
    ],

    // Muted flesh tones, cool grays, wine shadows, and soft photographic highlights.
    coolPortrait: [
        "#090001", "#191214", "#440000", "#431c11",
        "#4a3a3e", "#724839", "#5b5456", "#94411d",
        "#916052", "#7d6c70", "#958287", "#c49381",
        "#ee8d64", "#e5ae9e", "#cebbbf", "#e8d3d8",
        "#ffe5d2", "#fffafe"
    ],

    // Mountain darks, pine greens, glacial blues, cloud whites, and rocky tan accents.
    alpineClouds: [
        "#000600", "#111d0f", "#122c00", "#002d6c",
        "#223d33", "#415c7e", "#526151", "#547332",
        "#3572bc", "#68867a", "#a3c27c", "#91c0ff",
        "#b7d7ca", "#e2fcff", "#9a7a63", "#ccd6e2"
    ],

    // Extracted from a photo of Lake Merritt.
    // Moonlit water, black trees, distant buildings, orange reflection, pale streetlit edges.
    nightLake: [
        "#000114", "#150000", "#121a26", "#3e290e",
        "#483a28", "#48463e", "#545d6b", "#8c754f",
        "#596e63", "#929087", "#d48135", "#6d7bc5",
        "#dfc49b", "#e4e2d8", "#fffbd0", "#e29da4"
    ],

    // Dense foliage, dim earth, pink morning haze, and warm yellow light cutting through leaves.
    jungleDawn: [
        "#020100", "#232a07", "#30252f", "#323326",
        "#5e2529", "#766976", "#797a6b", "#b06d6e",
        "#a1956f", "#b57c8b", "#b8be96", "#c6b7c5",
        "#ecc778", "#ffbdbd", "#f5e7be", "#fffed5"
    ],

    // Blackened violet, wine red, muted olive, dusty flesh, pale pink, and bone-yellow light.
    softGoth: [
        "#030014", "#2c0000", "#4b111d", "#1f266a",
        "#273800", "#86482c", "#806a53", "#a7656d",
        "#6c7dc9", "#778e4d", "#e8a283", "#dec6ac",
        "#ffc1c9", "#d4eda9", "#fffbe0"
    ],

    // Dark parlor reds, oxidized greens, cloudy blues, dusty rose, and soft porcelain highlights.
    victorianAutumn: [
        "#100a0e", "#422623", "#13362e", "#173242",
        "#433742", "#566b41", "#5e699a", "#9a7874",
        "#668a81", "#698698", "#fbd5d1", "#c2e9de",
        "#c5e5f9"
    ],

    // Neon city darkness: purple-black ramps, hot pinks, warning orange, cyan plasma.
    cyberNight: [
        "#000000", "#06000e", "#10001c", "#1e0030",
        "#38004e", "#5e0d70", "#9330a8", "#c868d8",
        "#ff4fa0", "#ff7070", "#ff9944", "#ffd060",
        "#00d4ff", "#00fff0", "#b0ffee", "#ffffff"
    ],

    // Chrome-sky blues, clean whites, launch-orange accents, and teal dashboard glow.
    retrofuture: [
        "#02050a", "#081428", "#102448", "#1c3a78",
        "#2a5aa0", "#4080c0", "#70b0e8", "#b0d8ff",
        "#f0f8ff", "#ff6a00", "#ff9020", "#ffbe40",
        "#ffe880", "#004444", "#00888a", "#40d8d0"
    ],

    // Pool-tile unease: deep teal shadows, chlorinated greens, wet blues, too-clean highlights.
    liminalWater: [
        "#040c10", "#081820", "#103028", "#184840",
        "#206858", "#309070", "#50b890", "#80d8b0",
        "#b8f0d8", "#e8fef4", "#0c1828", "#183850",
        "#285c78", "#4088a8", "#70b8d0", "#b8e0f0"
    ],

    // Toxic magenta and venom green — status effect colors.
    poisonDamage: [
        "#0a0008", "#1e0018", "#400030", "#700050",
        "#a80070", "#e000a0", "#ff40c8", "#ff80e0",
        "#ffc0f0", "#fff0ff", "#001400", "#003c00",
        "#007000", "#00b020", "#40e060", "#a8ff88"
    ],

    // Minimal icy blue shadows with a hard ochre sun flare.
    coldSun: ["#0a0c10", "#1c3050", "#d09020", "#f8e080"],

    // Dark wine glass, pink refraction, and creamy highlight.
    roseGlass: ["#0e0818", "#4a1848", "#a03888", "#e880c0", "#ffe8f8"],

    // Purple-black swelling into mauve and dusty red-pink. Small, sore, effective.
    bruise: ["#0c0814", "#3a1858", "#7a2860", "#c06888"],

    // Glazed turquoise, cream, ochre, clay, and red-orange ceramic accents.
    moroccanTile: [
        "#0a1418", "#102830", "#1c4858", "#1d6f8a",
        "#2a9ab8", "#3ec0d8", "#7ad8e0", "#b8e8e8",
        "#f4ecd4", "#e8c878", "#d4a040", "#a06820",
        "#6a4018", "#b03028", "#d8503c", "#f08068"
    ],

    // Nearly black, hard gray, cigarette paper beige, and one blood-red accent.
    noir: [
        "#0a0a0c", "#3a3a3e", "#c8c0b0", "#b02020"
    ],

    // Minimal modernist blocks: black, off-white, red, yellow, and blue.
    bauhaus: [
        "#1a1a1a", "#f0ece4", "#d8281c", "#f0c020", "#1c50a0"
    ],

    // Old paper, ink, and brown halftone warmth.
    sepiaType: [
        "#1a1410", "#6e5640", "#f4ebd6"
    ],

    // Warm plastic, magenta label ink, yellow tape-card nostalgia, and cream highlights.
    cassette: [
        "#1c1410", "#6c2848", "#c84a78", "#f0d058", "#f4ecd8"
    ],

    // Cool green-black, herbal midtones, and soft mint highlight.
    mint: [
        "#0c2018", "#2e5848", "#88b89c", "#e0f0d8"
    ],

    // warm, restrained, earthy, rural
    zuhanden: [
        "#020501", "#341101", "#444c3f", "#8f423a",
        "#8b604d", "#8b8d7f", "#d2a85c", "#ecbba6"
    ],
    // the other side of Lake Merritt, by the Cathedral of
    // Christ the Light
    lakeNight: [
        "#000000", "#030714", "#1d1148", "#332627",
        "#475062", "#8a520e", "#6963a3", "#cd462d",
        "#877778", "#fa2f32", "#ebad71", "#c3bfff",
        "#ffa88b", "#e6d4d5", "#fff135", "#ffffff"
    ]

};