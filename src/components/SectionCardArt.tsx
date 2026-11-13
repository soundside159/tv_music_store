// Home page section cards (Catalog / Collections / Playlists): vector art with a
// hover animation (13.11.2026, replaces /images/panels/*.png). The card <Link>
// must carry the "group" class: every animation starts on .group:hover.

const CSS = `
.tvms-art{position:absolute;right:10px;top:50%;transform:translateY(-50%);overflow:visible;pointer-events:none}
.tvms-art .mv{transition:transform .7s cubic-bezier(.2,.85,.25,1.05),fill .35s}
.group:hover .tvms-art .s1{transform:translate(-6px,-2px) rotate(-5deg)}
.group:hover .tvms-art .s2{transform:translate(-3px,-1px) rotate(-2.5deg)}
.group:hover .tvms-art .rec{transform:translateX(-40px)}
.tvms-art .spin{transform-origin:83px 49px}
.group:hover .tvms-art .spin{animation:tvmsSpin 2s linear infinite .25s}
@keyframes tvmsSpin{to{transform:rotate(360deg)}}
.group:hover .tvms-art .tile{transform:scale(.86)}
.group:hover .tvms-art .t-a{fill:#7c5cff}
.group:hover .tvms-art .t-b{fill:#2b2d33}
.group:hover .tvms-art .t-c{fill:#F4C430}
.group:hover .tvms-art .t-d{fill:#ff8fb1}
.tvms-art .pb{transform-origin:23px 16px;transform-box:view-box}
.group:hover .tvms-art .pb{animation:tvmsPress .45s cubic-bezier(.3,1.6,.5,1) 1}
@keyframes tvmsPress{0%{transform:scale(1)}40%{transform:scale(.8)}100%{transform:scale(1)}}
.tvms-art .row{transition:transform .35s cubic-bezier(.3,1.5,.5,1)}
.tvms-art .row .bg,.tvms-art .row .ic{transition:fill .3s}
.group:hover .tvms-art .row{transform:translateY(-1.5px)}
.group:hover .tvms-art .row .bg{fill:#3a1715}
.group:hover .tvms-art .row .ic{fill:#ffffff}
.group:hover .tvms-art .q2,.group:hover .tvms-art .q2 .bg,.group:hover .tvms-art .q2 .ic{transition-delay:.08s}
.group:hover .tvms-art .q3,.group:hover .tvms-art .q3 .bg,.group:hover .tvms-art .q3 .ic{transition-delay:.16s}
@media (prefers-reduced-motion:reduce){.tvms-art *{animation:none!important;transition:none!important}}
`;

/** Rendered once next to the cards. */
export const SectionCardArtStyle = () => <style>{CSS}</style>;

/** Record sleeves: the record sits inside, seen through a round cut-out, and slides out on hover. */
export const CatalogArt = () => (
  <svg className="tvms-art" width="120" height="92" viewBox="0 0 120 92" aria-hidden="true">
    <defs>
      <mask id="tvmsSleeveHole" maskUnits="userSpaceOnUse" x="0" y="0" width="120" height="92">
        <rect x="0" y="0" width="120" height="92" fill="#fff" />
        <circle cx="83" cy="49" r="20" fill="#000" />
      </mask>
    </defs>
    <g className="mv s1" style={{ transformOrigin: "80px 76px" }}>
      <rect x="44" y="10" width="62" height="62" rx="5" fill="#b38a0e" />
    </g>
    <g className="mv s2" style={{ transformOrigin: "80px 76px" }}>
      <rect x="48" y="14" width="62" height="62" rx="5" fill="#d7a612" />
    </g>
    <rect x="52" y="18" width="62" height="62" rx="5" fill="#9c7a0b" />
    <g className="mv rec">
      <g className="spin">
        <circle cx="83" cy="49" r="27" fill="#141519" />
        <circle cx="83" cy="49" r="23" fill="none" stroke="#25272d" strokeWidth="1" />
        <circle cx="83" cy="49" r="18" fill="none" stroke="#25272d" strokeWidth="1" />
        <circle cx="83" cy="49" r="13" fill="none" stroke="#25272d" strokeWidth="1" />
        <circle cx="83" cy="49" r="7" fill="#F4C430" />
        <circle cx="83" cy="49" r="1.8" fill="#141519" />
        <rect x="82" y="43.2" width="2" height="3" rx="1" fill="#c99a0f" />
      </g>
    </g>
    <rect x="52" y="18" width="62" height="62" rx="5" fill="#F4C430" mask="url(#tvmsSleeveHole)" />
    <circle cx="83" cy="49" r="20" fill="none" stroke="#c99a0f" strokeWidth="1.2" />
  </svg>
);

const TILES: { x: number; y: number; cls?: string; fill?: string; delay: number }[] = [
  { x: 10, y: 8, cls: "t-c", delay: 0 },
  { x: 38, y: 8, delay: 0.05 },
  { x: 66, y: 8, cls: "t-d", delay: 0.1 },
  { x: 10, y: 36, delay: 0.05 },
  { x: 38, y: 36, cls: "t-b", fill: "#7c5cff", delay: 0.1 },
  { x: 66, y: 36, delay: 0.15 },
  { x: 10, y: 64, cls: "t-a", delay: 0.1 },
  { x: 38, y: 64, delay: 0.15 },
  { x: 66, y: 64, delay: 0.2 },
];

/** Tile grid: the tiles shrink in a wave and change colour on hover. */
export const CollectionsArt = () => (
  <svg className="tvms-art" width="100" height="92" viewBox="0 0 100 92" aria-hidden="true">
    {TILES.map((t, i) => (
      <rect
        key={i}
        className={`mv tile ${t.cls ?? ""}`}
        x={t.x}
        y={t.y}
        width="24"
        height="24"
        rx="3"
        fill={t.fill ?? "#2b2d33"}
        style={{ transformOrigin: `${t.x + 12}px ${t.y + 12}px`, transitionDelay: `${t.delay}s` }}
      />
    ))}
  </svg>
);

const ROWS = [
  { y: 31, w1: 28, w2: 18, cls: "q1" },
  { y: 50, w1: 32, w2: 20, cls: "q2" },
  { y: 69, w1: 24, w2: 15, cls: "q3" },
];

/** Playlist panel: the play button presses once, the rows light up one after another. */
export const PlaylistsArt = () => (
  <svg className="tvms-art" width="96" height="92" viewBox="0 0 96 92" aria-hidden="true">
    <rect x="10" y="2" width="80" height="88" rx="5" fill="#d23b33" />
    <path className="pb" d="M17 8v16l13-8z" fill="#f4e4e2" />
    <rect x="36" y="15" width="46" height="2" rx="1" fill="#f4e4e2" opacity=".85" />
    {ROWS.map((r) => (
      <g key={r.y} className={`row ${r.cls}`}>
        <rect className="bg" x="15" y={r.y} width="70" height="15" rx="2.5" fill="#1b1c20" />
        <path className="ic" d={`M20 ${r.y + 4}v7l6-3.5z`} fill="#e8463d" />
        <rect x="31" y={r.y + 4} width={r.w1} height="2" rx="1" fill="#e8463d" />
        <rect x="31" y={r.y + 8.5} width={r.w2} height="2" rx="1" fill="#55585f" />
      </g>
    ))}
  </svg>
);
