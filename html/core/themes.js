// The phone's look: CSS layered over the base stylesheet (variables + structural overrides), a default wallpaper and the
// OS name. It follows whip_core's design language: Night Glass surfaces with no blur and no gradients, Signal Blue only for "interactive / needs you", the white selection pill for "this one",
// Plus Jakarta Sans, soft-but-never-bubbly radii (20 panel / 12 pop / 11 row / 8 field / 6 button), dark only.
import { WHIP_FONTS } from './fonts.js';

// ---- the whip wordmark (from whip_loadingscreen, pixel-traced). Holes are cut with even-odd so the world shows through.
const LETTERS = 'M62 83A33 33 0 0 1 128 83L128 211L169 211L169 50L235 50L235 211L276 211L276 50L342 50L342 277L117 277A55 55 0 0 1 62 222Z' +
  'M369 50H435V157H583V50H649V277H583V223H435V277H369Z' +
  'M710 50A33 33 0 0 1 743 83V244A33 33 0 0 1 677 244V83A33 33 0 0 1 710 50Z' +
  'M771 50H1001A50 50 0 0 1 1051 100V173A50 50 0 0 1 1001 223H897A33 33 0 0 1 897 157H985V116H837V277H771Z';
const I_LIGHTS = [83, 136.67, 190.33, 244];
const hole = (cx, cy, r) => `M${cx - r} ${cy}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0Z`;
const LOGO_D = LETTERS + hole(95, 83, 26.5) + hole(897, 190, 26.5) + I_LIGHTS.map((y) => hole(710, y, 20)).join('');
/** WHIP wordmark: lit lights in the W and P; lights: true steps the I's four lights like the loading screen. */
export function whipLogo(cls = 'whip-logo', lights = false) {
  return `<svg class="${cls}" viewBox="58 46 997 235" role="img" aria-label="whip"><path fill="currentColor" fill-rule="evenodd" d="${LOGO_D}"/>` +
    `<circle cx="95" cy="83" r="20.5" fill="currentColor"/><circle cx="897" cy="190" r="20.5" fill="currentColor"/>` +
    (lights ? I_LIGHTS.map((y, i) => `<circle class="ilight" style="animation-delay:${(i * 0.45).toFixed(2)}s" cx="710" cy="${y}" r="20" fill="currentColor"/>`).join('') : '') + '</svg>';
}

// ---- shared whip rules
const INK = 'rgb(10,12,18)';
const WHIP = `
.os-screen,.os-screen.light{
  --font-ui:'Plus Jakarta Sans','Segoe UI',system-ui,sans-serif;--font-display:'Plus Jakarta Sans','Segoe UI',sans-serif;
  --font-head:'Plus Jakarta Sans','Segoe UI',sans-serif;--font-mono:'Plus Jakarta Sans','Segoe UI',sans-serif;
  --r-icon:16%;--r-card:12px;--r-tile:12px;--r-btn:8px;--r-dock:20px;--r-sheet:20px;--r-field:8px;
  --bg:${INK};--bg2:rgba(255,255,255,.04);--bg3:rgba(255,255,255,.07);--bg4:rgba(255,255,255,.12);
  --fill:rgba(255,255,255,.05);--fill2:rgba(255,255,255,.1);
  --text:rgba(255,255,255,.93);--text2:rgba(255,255,255,.5);--text3:rgba(255,255,255,.25);--sep:rgba(255,255,255,.08);
  --accent:#60a5fa;--green:#4ade80;--red:#f87171;--orange:#fbbf24;--yellow:#fbbf24;--purple:#a78bfa;--pink:#f472b6;--teal:#2dd4bf;--indigo:#818cf8;
  --bubble-them:rgba(255,255,255,.07);--glass:rgba(10,12,18,.9);--sb-color:rgba(255,255,255,.93);
  --pane:rgba(10,12,18,.75);--pane-raised:rgba(10,12,18,.9);--scrim:rgba(10,12,18,.78);--edge:rgba(255,255,255,.08);
  --lift:inset 0 1px 0 rgba(255,255,255,.05);--sh:0 4px 20px rgba(0,0,0,.4),inset 0 1px 0 rgba(255,255,255,.05);
  --sh-lg:0 8px 32px rgba(0,0,0,.5),inset 0 1px 0 rgba(255,255,255,.05);--sh-modal:0 20px 60px rgba(0,0,0,.6);
  --ease:cubic-bezier(.16,1,.3,1);--bounce:cubic-bezier(.34,1.4,.64,1);
  font-weight:500;
}
.os-screen .big-title{font-size:28px;font-weight:700;letter-spacing:-.3px}
.os-screen .list-h{font-size:10.5px;font-weight:700;letter-spacing:.9px;color:var(--text2)}
.os-screen .nav .back,.os-screen .nav .n-act{font-weight:600}
.os-screen .nav .n-title{font-weight:700;letter-spacing:-.2px}
/* surfaces: night glass, no blur, no gradients */
.os-screen .app,.os-screen .split>.side,.os-screen .split>.main,.os-screen .chat-h,.os-screen .composer,.os-screen .br{background:transparent}
.os-screen .tabbar,.os-screen .br-bar{background:rgba(10,12,18,.6);border-top:1px solid var(--edge)}
.os-screen .split>.side{border-right:1px solid var(--edge)}
.os-screen .list{background:rgba(255,255,255,.04);box-shadow:var(--lift)}
.os-screen .row:active{background:rgba(255,255,255,.05)}
.os-screen .row.sel,.os-screen .thread.sel,.os-screen .mail-row.sel{background:rgba(255,255,255,.93);color:${INK}}
.os-screen .row.sel .r-sub,.os-screen .row.sel .r-val,.os-screen .thread.sel .t-time,.os-screen .thread.sel .t-prev,.os-screen .mail-row.sel .mr-time,.os-screen .mail-row.sel .mr-p{color:rgba(10,12,18,.62)}
.os-screen .sw{background:rgba(255,255,255,.12);width:46px;height:28px;border-radius:9px}
.os-screen .sw::after{width:22px;height:22px;top:3px;left:3px;border-radius:7px;transition:transform .18s var(--bounce)}
.os-screen .sw.on{background:var(--accent)}
.os-screen .sw.on::after{transform:translateX(18px)}
.os-screen .row .r-ico{background:rgba(255,255,255,.07)!important;box-shadow:inset 0 0 0 1px rgba(255,255,255,.1);color:rgba(255,255,255,.93);border-radius:8px}
.os-screen .row.sel .r-ico{background:rgba(10,12,18,.08)!important;color:${INK}}
.os-screen .btn{height:40px;font-size:14.5px;font-weight:600;transition:opacity .1s}
.os-screen .btn:hover{opacity:.9}
.os-screen .btn.gray{background:rgba(255,255,255,.05);color:var(--text);box-shadow:inset 0 0 0 1px var(--edge)}
.os-screen .btn.red{background:rgba(248,113,113,.12);color:#f87171;box-shadow:inset 0 0 0 1px rgba(248,113,113,.5)}
.os-screen .btn.green{background:var(--green);color:${INK}}
.os-screen .seg{background:rgba(255,255,255,.05);border-radius:11px}
.os-screen .seg button{border-radius:9px;font-weight:600}
.os-screen .seg button.on{background:rgba(255,255,255,.93);color:${INK};box-shadow:none}
.os-screen .search{background:rgba(255,255,255,.05);font-size:15px}
.os-screen .bub.me{background:rgba(255,255,255,.93);color:${INK}}
.os-screen .bub.them{background:rgba(255,255,255,.07)}
.os-screen .composer .field{border-color:var(--edge);background:rgba(255,255,255,.03)}
.os-screen .notif{background:var(--pane);backdrop-filter:none;-webkit-backdrop-filter:none;box-shadow:var(--sh);border:1px solid var(--edge)}
.os-screen .notif .n-title{font-weight:700}
/* notifications = the capsule in its notification mode (whip_core capsule.js, 2026-10-07): the app's gauge in
   the first slot fills with the state colour as the capsule pops in and its glyph turns ink at 55% of the gauge; the
   text sits beside it. A stack of up to 3 (oldest on top); each pops in at its slot on the capsule's reveal curve,
   slides up a slot when the one above leaves, and the leaving one rises out. Always the full width of the phone screen
   (12px each side); the tablet uses that same phone width, centred. */
.os-screen .banner{--g:50px;--u:calc(var(--g) / 67);--state:rgba(255,255,255,.93);
  left:50%;right:auto;width:calc(100% - 24px);max-width:none;margin-left:0;
  gap:calc(var(--u) * 10);padding:calc(var(--u) * 4) calc(var(--u) * 26) calc(var(--u) * 4) calc(var(--u) * 8);border-radius:999px;
  background:rgba(10,12,18,.92);border:1px solid rgba(255,255,255,.08);box-shadow:0 4px 20px rgba(0,0,0,.4),inset 0 1px 0 rgba(255,255,255,.05);
  backdrop-filter:none;-webkit-backdrop-filter:none;     /* .92, not the HUD's .75: it sits over busy UI, not the world */
  --top:60px;--pitch:66px;top:calc(var(--top) + var(--i, 0) * var(--pitch));
  transform:translate(-50%,6px) scale(.5);opacity:0;
  transition:transform .6s cubic-bezier(.34,1.56,.64,1),opacity .25s,top .45s cubic-bezier(.16,1,.3,1)}
.os-screen .banner.on{transform:translate(-50%,0) scale(1);opacity:1}
.os-screen .banner.out{transform:translate(-50%,-6px) scale(.92);opacity:0;pointer-events:none;
  transition:transform .3s cubic-bezier(.4,0,1,1),opacity .25s,top .45s cubic-bezier(.16,1,.3,1)}
.os-screen.tablet .banner{--g:54px;--top:38px;--pitch:70px;width:366px}   /* = the phone's 390px screen less 24 */
.os-screen .banner::before{content:'';position:absolute;top:0;left:16%;right:16%;height:1px;pointer-events:none;
  background:linear-gradient(90deg,transparent,rgba(255,255,255,.1),transparent)}
.os-screen .banner[data-kind="command"]{--state:#60a5fa}
.os-screen .banner[data-kind="success"]{--state:#4ade80}
.os-screen .banner[data-kind="error"]{--state:#f87171}
.os-screen .banner[data-kind="warning"]{--state:#fbbf24}
.os-screen .banner[data-kind="call"]{--state:#4ade80}
.os-screen .banner .ico{width:var(--g);height:var(--g);font-size:var(--g);border-radius:50%;overflow:visible;background:none;box-shadow:none;
  color:#fff;transition:color .2s .25s}
.os-screen .banner .ico::before{content:'';position:absolute;inset:calc(6.5em / 67);border-radius:50%;
  background:linear-gradient(var(--state),var(--state)) bottom/100% 0% no-repeat,linear-gradient(160deg,#040508 0%,#070b14 48%,#14294a 100%);
  box-shadow:inset 0 0 0 calc(3em / 67) rgba(0,0,0,.55);transition:background-size .45s cubic-bezier(.16,1,.3,1) .15s}
.os-screen .banner .ico::after{display:block;content:'';position:absolute;inset:calc(4em / 67);border-radius:50%;background:none;
  border:calc(4em / 67) solid rgba(255,255,255,.55);box-shadow:0 0 0 calc(3em / 67) rgba(0,0,0,.9),0 0 calc(6em / 67) rgba(0,0,0,.85)}
.os-screen .banner .ico svg{position:relative;z-index:1;width:calc(34em / 67);height:calc(34em / 67);margin:0;transition:width .35s cubic-bezier(.16,1,.3,1) .15s,height .35s cubic-bezier(.16,1,.3,1) .15s}
.os-screen .banner:is(.on,.out) .ico{color:${INK}}
.os-screen .banner:is(.on,.out) .ico::before{background-size:100% 100%,auto}
.os-screen .banner:is(.on,.out) .ico svg{width:calc(36.85em / 67);height:calc(36.85em / 67)}
.os-screen .banner .b-main{flex:1 1 auto;min-width:0;text-shadow:0 1px 6px rgba(0,0,0,.8)}
.os-screen .banner .b-t{justify-content:flex-start;align-items:baseline;gap:8px;font-size:calc(var(--u) * 18);font-weight:700;line-height:1.25}
.os-screen .banner .b-t span{font-size:calc(var(--u) * 16);font-weight:500;opacity:1;color:var(--text2)}
.os-screen .banner .b-x{font-size:calc(var(--u) * 19.5);font-weight:500;line-height:1.3;opacity:1}
/* capsule buttons (notify actions, e.g. Decline / Answer on an incoming call): discs at the capsule's right end,
   gauge-sized, so the capsule reads gauge - text - buttons */
.os-screen .banner.has-acts{padding-right:calc(var(--u) * 8)}
.os-screen .banner .b-acts{display:flex;gap:calc(var(--u) * 10);margin-left:calc(var(--u) * 14);flex:none}
.os-screen .banner .b-act{width:calc(var(--u) * 56);height:calc(var(--u) * 56);border-radius:50%;display:grid;place-items:center;flex:none;
  background:rgba(255,255,255,.14);color:#fff;box-shadow:inset 0 0 0 1px rgba(255,255,255,.1);transition:transform .15s,filter .15s}
.os-screen .banner .b-act svg{width:46%;height:46%}
.os-screen .banner .b-act:hover{transform:scale(1.07);filter:brightness(1.08)}
.os-screen .banner .b-act:active{transform:scale(.94)}
.os-screen .banner .b-act.t-accept{background:#4ade80;color:${INK}}
.os-screen .banner .b-act.t-reject{background:#f87171;color:#fff}
.os-screen .banner .b-act.t-on{background:#fff;color:${INK}}
/* dock = whip's player stats capsule (whip_core status-hud.css, specs from Main McClaude 2026-10-07): a night-glass
   pill of gauge discs. All sizes come from the gauge unit: one gauge = 67, --g sets it per screen, --u = 1/67 of it. */
.os-screen .home .dock{--u:calc(var(--g) / 67);height:auto;left:50%;right:auto;transform:translateX(-50%);justify-content:flex-start;
  gap:calc(var(--u) * 4);padding:calc(var(--u) * 4) calc(var(--u) * 8);border-radius:999px;
  background:rgba(10,12,18,.75);border:1px solid rgba(255,255,255,.08);box-shadow:0 4px 20px rgba(0,0,0,.4),inset 0 1px 0 rgba(255,255,255,.05);
  backdrop-filter:none;-webkit-backdrop-filter:none}
.os-screen.phone .home .dock{--g:60px}
.os-screen.tablet .home .dock{--g:66px}
.os-screen.tablet.portrait .home .dock{--g:56px}
/* mouse & keyboard: the icons are 15% bigger (2026-10-07) */
.os-screen.mk.phone .home .dock{--g:69px}
.os-screen.mk.tablet .home .dock{--g:76px}
.os-screen.mk.tablet.portrait .home .dock{--g:64px}
.os-screen .home .dock::before{content:'';position:absolute;top:0;left:16%;right:16%;height:1px;pointer-events:none;
  background:linear-gradient(90deg,transparent,rgba(255,255,255,.1),transparent)}
/* a gauge: white ring with a black outline round a dark disc; the disc wears the icons' black-to-blue. Glyphs are
   34/67 of the gauge (the HUD's 25/67 read too small on app icons, 2026-10-07) */
.os-screen .home .dock .ico{width:var(--g);height:var(--g);font-size:var(--g);border-radius:50%;overflow:visible;background:none;box-shadow:none;
  color:#fff;transform:none;transition:color .25s}
.os-screen .home .dock .ico::before{content:'';position:absolute;inset:calc(var(--u) * 6.5);border-radius:50%;
  background:linear-gradient(#fff,#fff) bottom/100% 0% no-repeat,linear-gradient(160deg,#040508 0%,#070b14 48%,#14294a 100%);
  box-shadow:inset 0 0 0 calc(var(--u) * 3) rgba(0,0,0,.55);transition:background-size .45s cubic-bezier(.16,1,.3,1)}
.os-screen .home .dock .ico::after{display:block;content:'';position:absolute;inset:calc(var(--u) * 4);border-radius:50%;background:none;
  border:calc(var(--u) * 4) solid rgba(255,255,255,.55);box-shadow:0 0 0 calc(var(--u) * 3) rgba(0,0,0,.9),0 0 calc(var(--u) * 6) rgba(0,0,0,.85)}
.os-screen .home .dock .ico svg{position:relative;z-index:1;width:calc(var(--u) * 34);height:calc(var(--u) * 34)}
/* hover / keyboard highlight: the gauge fills from the bottom like a full stat and the glyph turns ink */
.os-screen.mk.in-mouse .home .dock .app-icon:hover .ico,.os-screen.mk .home .dock .app-icon.kf .ico{color:${INK};transform:none;box-shadow:none}
.os-screen.mk.in-mouse .home .dock .app-icon:hover .ico::before,.os-screen.mk .home .dock .app-icon.kf .ico::before{background-size:100% 100%,auto}
.os-screen .home .dock .div{width:1px;height:calc(var(--g) * .6);margin:0 calc(var(--u) * 4);background:rgba(255,255,255,.14)}
.os-screen .home .dock .badge{top:calc(var(--u) * -2);left:calc(50% + var(--g) * .32)}
.os-screen .lock-btn{background:var(--pane);backdrop-filter:none;-webkit-backdrop-filter:none;box-shadow:var(--sh)}
.os-screen .lock-btn.on{background:rgba(255,255,255,.93)}
.os-screen .lock-btn.on svg{filter:brightness(0)}
.os-screen .cc{background:var(--scrim);backdrop-filter:none;-webkit-backdrop-filter:none}
.os-screen .cc-tile{background:rgba(255,255,255,.07);box-shadow:var(--lift)}
.os-screen .cc-quad .cc-mini{background:rgba(255,255,255,.08)}
.os-screen .cc-quad .cc-mini.on,.os-screen .cc-tile.on{background:rgba(255,255,255,.93)!important}
.os-screen .cc-quad .cc-mini.on svg,.os-screen .cc-tile.on svg{filter:brightness(0) opacity(.85)}
.os-screen .cc-slider .fill{background:rgba(255,255,255,.93)}
.os-screen .cc-fold{background:var(--accent);color:#fff}
.os-screen .cc-fold svg{stroke:#fff}
.os-screen .toast{background:var(--pane-raised);box-shadow:var(--sh-lg);border:1px solid var(--edge)}
.os-screen .sheet{background:var(--pane-raised);box-shadow:var(--sh-modal);border-top:1px solid var(--edge)}
.os-screen .sheet-bg{background:var(--scrim)}
.os-screen .widget{box-shadow:var(--sh);border:1px solid var(--edge)}
.os-screen .w-weather,.os-screen .w-music{background:var(--pane)}
.os-screen .w-cal{background:var(--pane);color:var(--text)}
.os-screen .w-cal .wc-day{color:var(--accent)}
.os-screen .w-cal .ev span{color:var(--text2)}
.os-screen .wx,.os-screen .wx.night{background:rgba(10,12,18,.9)}
.os-screen .wx-card{background:rgba(255,255,255,.04);backdrop-filter:none;-webkit-backdrop-filter:none;box-shadow:var(--lift)}
.os-screen .days .bar i{background:var(--accent)}
.os-screen .call{background:rgba(10,12,18,.96)}
.os-screen .card{background:rgba(255,255,255,.07);box-shadow:inset 0 0 0 1px rgba(255,255,255,.14),var(--sh)}
.os-screen .card::after{display:none}
.os-screen .qa i{background:rgba(255,255,255,.06);color:var(--accent)}
.os-screen .veh{background:rgba(255,255,255,.04);box-shadow:var(--lift)}
.os-screen .veh .v-art{background:rgba(255,255,255,.03)}
.os-screen .veh .v-p{background:#f4f1e6;color:#1a2b6b}
.os-screen .rd{background:rgba(10,12,18,.92)}
.os-screen .rd-row button{background:rgba(255,255,255,.06)}
.os-screen .members{background:rgba(255,255,255,.04)!important}
.os-screen .fab{background:var(--accent);box-shadow:0 6px 18px rgba(96,165,250,.3)}
.os-screen .map-card{background:var(--pane-raised);backdrop-filter:none;-webkit-backdrop-filter:none;box-shadow:var(--sh-lg);border:1px solid var(--edge)}
.os-screen .nav-banner{background:var(--pane-raised);border:1px solid var(--edge);box-shadow:var(--sh-lg)}
.os-screen .nav-banner svg{color:var(--accent)}
.os-screen .route-line{stroke:var(--accent)}
.os-screen .kp-key{background:rgba(255,255,255,.06)}
.os-screen .kp-key:active{background:rgba(255,255,255,.12)}
.os-screen .cal-g button.today span{color:var(--accent)}
.os-screen .cal-g button.sel span{background:rgba(255,255,255,.93);color:${INK}}
.os-screen .cal-g button.sel.today span{background:var(--accent);color:#fff}
.os-screen .evs .e{background:rgba(255,255,255,.04)}
.os-screen .badge{background:var(--accent);border-radius:6px;font-weight:700;box-shadow:0 2px 8px rgba(0,0,0,.4)}
.os-screen .home-bar{background:rgba(255,255,255,.93)}
.os-screen .ph-view{background:${INK}}
.os-screen .br-home .logo{display:none}
.os-screen .br-logo{display:block;width:150px;margin:24px auto;color:var(--text)}
.os-screen .notes-y .nav .back,.os-screen .notes-y .nav .n-act{color:var(--accent)}
/* lock screen: wordmark above the clock, tabular digits */
.os-screen .lock-logo{position:absolute;left:50%;transform:translateX(-50%);color:rgba(255,255,255,.93);filter:drop-shadow(0 1px 6px rgba(0,0,0,.6))}
.os-screen.phone .lock-logo{top:68px;width:66px}
.os-screen.tablet .lock-logo{top:46px;width:84px}
.os-screen.phone .lock-clock{top:92px}
.os-screen.tablet .lock-clock{top:76px}
.os-screen .lc-time{font-weight:700;letter-spacing:-3px;font-variant-numeric:tabular-nums}
.os-screen .lc-date{font-weight:600;letter-spacing:.2px}
.os-screen .unlock-hint{font-weight:600}
/* boot: the loading-screen wordmark, the I's lights stepping every 450 ms with a .55 s fade */
.os-screen .boot{position:absolute;inset:0;z-index:600;background:#000;display:grid;place-items:center;opacity:0;pointer-events:none;transition:opacity .35s}
.os-screen .boot.on{opacity:1;pointer-events:auto;transition:none}
.os-screen .boot .whip-logo{width:46%;color:#fff}
.os-screen.tablet .boot .whip-logo{width:30%}
.os-screen .ilight{opacity:0}
.os-screen .boot.on .ilight{animation:ilight 1.8s linear infinite}   /* only while the boot screen shows */
@keyframes ilight{0%{opacity:1}30.5%{opacity:0}100%{opacity:0}}
.os-screen .about-logo{display:block;width:120px;margin:6px auto 18px;color:var(--text)}
`;

// ---- the phone's look: night-glass surfaces, solid lifted lists, capsule-gauge app icons
const SOLID = `
.os-screen,.os-screen.light{--r-icon:22%;--r-card:12px;--r-tile:14px}
.os-screen .app-win{background:${INK}}
.os-screen .list,.os-screen .veh,.os-screen .evs .e,.os-screen .wx-card{background:rgb(20,23,32);box-shadow:0 4px 14px rgba(0,0,0,.35),inset 0 1px 0 rgba(255,255,255,.06)}
.os-screen .notif,.os-screen .widget,.os-screen .map-card,.os-screen .lock-btn{background:rgb(16,19,27);border-color:rgba(255,255,255,.06)}
.os-screen .w-weather,.os-screen .w-music,.os-screen .w-cal{background:rgb(16,19,27)}
.os-screen .tabbar,.os-screen .br-bar{background:rgb(14,16,23)}
.os-screen .wx,.os-screen .wx.night,.os-screen .rd,.os-screen .call{background:${INK}}
/* icons (2026-10-07): every app icon is a capsule gauge, as in the dock but without the capsule. White ring with a
   black outline round a black-to-blue disc, white glyph; hover / keyboard / pad highlight fills it white from the bottom
   and the glyph turns ink. Every .ico has font-size = its size, so 1em/67 is the gauge unit at any size. */
.os-screen .ico,.os-screen .ico.cal{border-radius:50%;overflow:visible;background:none;box-shadow:none;color:#fff;transition:color .25s}
.os-screen .ico::before{content:'';position:absolute;inset:calc(6.5em / 67);border-radius:50%;
  background:linear-gradient(#fff,#fff) bottom/100% 0% no-repeat,linear-gradient(160deg,#040508 0%,#070b14 48%,#14294a 100%);
  box-shadow:inset 0 0 0 calc(3em / 67) rgba(0,0,0,.55);transition:background-size .45s cubic-bezier(.16,1,.3,1)}
.os-screen .ico::after{display:block;content:'';position:absolute;inset:calc(4em / 67);border-radius:50%;background:none;
  border:calc(4em / 67) solid rgba(255,255,255,.55);box-shadow:0 0 0 calc(3em / 67) rgba(0,0,0,.9),0 0 calc(6em / 67) rgba(0,0,0,.85)}
.os-screen .ico svg{position:relative;z-index:1;width:calc(34em / 67);height:calc(34em / 67);margin:0}
.os-screen .slot .ico-ghost{border-radius:50%}   /* an empty home slot, shown while arranging: the gauge's round */
.os-screen .ico>span{position:relative;z-index:1}
.os-screen.mk.in-mouse .app-icon:hover .ico,.os-screen.mk .app-icon.kf .ico,.os-screen.console .tile.kf .ico{color:${INK};transform:none;box-shadow:none}
.os-screen.mk.in-mouse .app-icon:hover .ico::before,.os-screen.mk .app-icon.kf .ico::before,.os-screen.console .tile.kf .ico::before{background-size:100% 100%,auto}
.os-screen.mk.in-mouse .app-icon:hover .ico.cal .cal-d,.os-screen.mk .app-icon.kf .ico.cal .cal-d{color:rgba(10,12,18,.6)}
.os-screen.mk.in-mouse .app-icon:hover .ico.cal .cal-n,.os-screen.mk .app-icon.kf .ico.cal .cal-n{color:${INK}}
.os-screen .ico.cal .cal-d{color:rgba(255,255,255,.6)}
.os-screen .ico.cal .cal-n{color:rgba(255,255,255,.93);font-weight:600}
.os-screen .app-icon span{font-weight:600}
/* control centre: solid tiles so the home screen never shows through; an "on" tile is the white pill with ink text */
.os-screen .cc-tile{background:rgb(22,25,34);box-shadow:0 4px 14px rgba(0,0,0,.4),inset 0 1px 0 rgba(255,255,255,.06)}
.os-screen .cc-tile.on{color:${INK}}
.os-screen .cc-tile.cc-fold{background:var(--accent);color:#fff}
`;
export const THEMES = {
  solid: {
    name: 'whip', note: 'night glass, solid lists, capsule-gauge icons', osName: 'whip', logo: true, darkOnly: true,
    wallpaper: 'dusk', fontFace: WHIP_FONTS, css: WHIP + SOLID,
  },
};
export const DEFAULT_THEME = 'solid';   // the phone has one look (the theme plumbing stays so it can change in one place)

/** CSS text for a theme: embedded @font-face rules + overrides. */
export function themeCSS(id) {
  const t = THEMES[id] || THEMES[DEFAULT_THEME];
  return `${t.fontFace || ''}\n${t.css || ''}`;
}
