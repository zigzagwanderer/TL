// ╔══════════════════════════════════════════════════════════════╗
// ║  MODULE 2: THEMES & FONTS                                    ║
// ╚══════════════════════════════════════════════════════════════╝
const APP_THEMES={
  void:     {name:'Void',    bg:'#06060a',panel:'#0b0b10',border:'#141418',text:'#888', sub:'#55556a',accent:'#c8ff00',muted:'#2a2a35',card:'#0f0f16',bright:'#ccc'},
  ash:      {name:'Ash',     bg:'#111',   panel:'#181818',border:'#252525',text:'#777', sub:'#555',   accent:'#fff',   muted:'#333',   card:'#1c1c1c',bright:'#bbb'},
  slate:    {name:'Slate',   bg:'#0d1117',panel:'#161b22',border:'#21262d',text:'#8b949e',sub:'#6e7681',accent:'#58a6ff',muted:'#30363d',card:'#1c2128',bright:'#c9d1d9'},
  sepia:    {name:'Sepia',   bg:'#1a1610',panel:'#201c13',border:'#302c1e',text:'#8a7a5a',sub:'#6a5a3a',accent:'#d4a853',muted:'#3a3020',card:'#252015',bright:'#c8b890'},
  terminal: {name:'Terminal',bg:'#000d00',panel:'#001200',border:'#002200',text:'#00aa00',sub:'#007700',accent:'#00ff41',muted:'#003300',card:'#001500',bright:'#00ff00'},
  chalk:    {name:'Chalk',   bg:'#f0ede8',panel:'#e8e4de',border:'#ccc8c0',text:'#555', sub:'#777',   accent:'#111',   muted:'#aaa',   card:'#ddd9d2',bright:'#222'},
  paper:    {name:'Paper',   bg:'#fafaf7',panel:'#f2f0eb',border:'#dddad2',text:'#666', sub:'#888',   accent:'#c0392b',muted:'#bbb',   card:'#eae8e1',bright:'#111'},
};
const DEFAULT_APP_THEME={themeKey:'void',brightness:100,borderRadius:0,colorOverrides:false,customBg:'#06060a',customPanel:'#0b0b10',customBorder:'#141418',customText:'#888',customSub:'#55556a',customBright:'#cccccc',customAccent:'#c8ff00',uiFontSize:115};
const BASE_SCHEMES={
  blanc: {n:'Blanc', bg:'#ffffff',fg:'#000',bannerBg:'#000',bannerFg:'#fff',metaBg:'#000',metaFg:'#fff',accent:'#000',sub:'#777',border:'#000',strip:'#f0f0f0',codeBg:'#f6f6f6',codeFg:'#000'},
  void:  {n:'Void',  bg:'#000',fg:'#fff',bannerBg:'#fff',bannerFg:'#000',metaBg:'#fff',metaFg:'#000',accent:'#fff',sub:'#888',border:'#fff',strip:'#111',codeBg:'#111',codeFg:'#fff'},
  thermal:{n:'Thermal',bg:'#faf8f5',fg:'#1a1614',bannerBg:'#1a1614',bannerFg:'#faf8f5',metaBg:'#1a1614',metaFg:'#faf8f5',accent:'#1a1614',sub:'#666054',border:'#1a1614',strip:'#ede9e4',codeBg:'#ede9e4',codeFg:'#1a1614'},
  xerox: {n:'Xerox', bg:'#d8d5d0',fg:'#1a1a18',bannerBg:'#1a1a18',bannerFg:'#d8d5d0',metaBg:'#1a1a18',metaFg:'#d8d5d0',accent:'#1a1a18',sub:'#555',border:'#1a1a18',strip:'#c8c5c0',codeBg:'#c8c5c0',codeFg:'#1a1a18'},
  amber: {n:'Amber', bg:'#fefce8',fg:'#1a1200',bannerBg:'#b45309',bannerFg:'#fff',metaBg:'#1a1200',metaFg:'#fefce8',accent:'#b45309',sub:'#78350f',border:'#1a1200',strip:'#fef3c7',codeBg:'#fff7e0',codeFg:'#92400e'},
  slate: {n:'Slate', bg:'#f8f9fa',fg:'#1e293b',bannerBg:'#334155',bannerFg:'#fff',metaBg:'#1e293b',metaFg:'#f8f9fa',accent:'#3b5279',sub:'#64748b',border:'#1e293b',strip:'#e2e8f0',codeBg:'#e8edf2',codeFg:'#334155'},
  acid:  {n:'Acid',  bg:'#fff',fg:'#000',bannerBg:'#00c853',bannerFg:'#000',metaBg:'#000',metaFg:'#00c853',accent:'#00c853',sub:'#444',border:'#000',strip:'#efffef',codeBg:'#efffef',codeFg:'#007a33'},
  dusk:  {n:'Dusk',  bg:'#1a0a2e',fg:'#e8d8ff',bannerBg:'#4a2070',bannerFg:'#e8d8ff',metaBg:'#3d1a6b',metaFg:'#e8d8ff',accent:'#bf5af2',sub:'#9b72cf',border:'#5e2a8c',strip:'#250d40',codeBg:'#250d40',codeFg:'#bf5af2'},
  ghost: {n:'Ghost', bg:'#f7f7f5',fg:'#111',bannerBg:'#e0e0de',bannerFg:'#111',metaBg:'#1a1a1a',metaFg:'#f0f0f0',accent:'#777',sub:'#aaa',border:'#111',strip:'#ededed',codeBg:'#eeeeec',codeFg:'#555'},
  custom:{n:'Custom',bg:'#fff',fg:'#000',bannerBg:'#000',bannerFg:'#fff',metaBg:'#000',metaFg:'#fff',accent:'#000',sub:'#666',border:'#000',strip:'#f2f2f2',codeBg:'#f6f6f6',codeFg:'#000'},
};
const FONTS={
  // ── MONO / TECHNICAL
  'share-tech':      {css:'"Share Tech Mono",monospace',      name:'Share Tech Mono — OCR/thermal ★'},
  'b612':            {css:'"B612 Mono",monospace',            name:'B612 Mono — aerospace'},
  'ibm-plex':        {css:'"IBM Plex Mono",monospace',        name:'IBM Plex Mono — industrial'},
  'space-mono':      {css:'"Space Mono",monospace',           name:'Space Mono — grid'},
  'anonymous':       {css:'"Anonymous Pro",monospace',        name:'Anonymous Pro — terminal'},
  'courier':         {css:'"Courier Prime",monospace',        name:'Courier Prime — typewriter'},
  'major-mono':      {css:'"Major Mono Display",monospace',   name:'Major Mono Display — geometric'},
  'vt323':           {css:'VT323,monospace',                  name:'VT323 — CRT screen'},
  'press-start':     {css:'"Press Start 2P",monospace',       name:'Press Start 2P — 8-bit'},
  // ── INDUSTRIAL / CONDENSED
  'barlow':          {css:'"Barlow Condensed",sans-serif',    name:'Barlow Condensed — Soviet ★'},
  'roboto-condensed':{css:'"Roboto Condensed",sans-serif',    name:'Roboto Condensed — clean'},
  'oswald':          {css:'Oswald,sans-serif',                name:'Oswald — condensed'},
  'bebas':           {css:'"Bebas Neue",sans-serif',          name:'Bebas Neue — ultra-condensed'},
  'anton':           {css:'Anton,sans-serif',                 name:'Anton — bold block'},
  'teko':            {css:'Teko,sans-serif',                  name:'Teko — slab condensed'},
  'saira':           {css:'"Saira Condensed",sans-serif',     name:'Saira Condensed — narrow'},
  'fjalla':          {css:'"Fjalla One",sans-serif',          name:'Fjalla One — display'},
  'pathway':         {css:'"Pathway Gothic One",sans-serif',  name:'Pathway Gothic One — ultra-narrow'},
  'six-caps':        {css:'"Six Caps",sans-serif',            name:'Six Caps — extreme narrow'},
  'stint':           {css:'"Stint Ultra Condensed",sans-serif',name:'Stint Ultra Condensed'},
  'staatliches':     {css:'Staatliches,sans-serif',           name:'Staatliches — tall block'},
  'bungee':          {css:'Bungee,sans-serif',                name:'Bungee — inline/signage'},
  'righteous':       {css:'Righteous,sans-serif',             name:'Righteous — retro round'},
  // ── SCI-FI / FUTURIST
  'orbitron':        {css:'Orbitron,sans-serif',              name:'Orbitron — sci-fi ★'},
  'audiowide':       {css:'Audiowide,sans-serif',             name:'Audiowide — electronic'},
  'aldrich':         {css:'Aldrich,sans-serif',               name:'Aldrich — technical'},
  'michroma':        {css:'Michroma,sans-serif',              name:'Michroma — circuit'},
  'chakra':          {css:'"Chakra Petch",sans-serif',        name:'Chakra Petch — tech angular'},
  'exo2':            {css:'"Exo 2",sans-serif',               name:'Exo 2 — geometric sci-fi'},
  'rajdhani':        {css:'Rajdhani,sans-serif',              name:'Rajdhani — devanagari-influenced'},
  'syncopate':       {css:'Syncopate,sans-serif',             name:'Syncopate — space caps'},
  'jura':            {css:'Jura,sans-serif',                  name:'Jura — soft geometric'},
  'gruppo':          {css:'Gruppo,sans-serif',                name:'Gruppo — light futurist'},
  'black-ops':       {css:'"Black Ops One",sans-serif',       name:'Black Ops One — military'},
  'graduate':        {css:'Graduate,sans-serif',              name:'Graduate — collegiate'},
  // ── EDITORIAL / SERIF
  'playfair':        {css:'"Playfair Display",serif',         name:'Playfair Display — editorial'},
  'cinzel':          {css:'Cinzel,serif',                     name:'Cinzel — classical roman'},
  'cormorant':       {css:'"Cormorant Garamond",serif',       name:'Cormorant Garamond — elegant'},
  'libre-baskerville':{css:'"Libre Baskerville",serif',       name:'Libre Baskerville — book'},
  'im-fell':         {css:'"IM Fell English",serif',          name:'IM Fell English — old press'},
  'alfa-slab':       {css:'"Alfa Slab One",serif',            name:'Alfa Slab One — slab display'},
  'archivo-black':   {css:'"Archivo Black",sans-serif',       name:'Archivo Black — grotesque'},
  'passion-one':     {css:'"Passion One",sans-serif',         name:'Passion One — display round'},
  // ── VINTAGE / CHARACTER
  'special-elite':   {css:'"Special Elite",monospace',        name:'Special Elite — damaged type'},
  'rye':             {css:'Rye,serif',                        name:'Rye — western'},
  // ── HANDWRITTEN
  'permanent-marker':{css:'"Permanent Marker",cursive',       name:'Permanent Marker — marker'},
  'caveat':          {css:'Caveat,cursive',                   name:'Caveat — casual hand'},
  'kalam':           {css:'Kalam,cursive',                    name:'Kalam — clean hand'},
  'patrick-hand':    {css:'"Patrick Hand",cursive',           name:'Patrick Hand — notebook'},
};

