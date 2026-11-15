// whip_phone core stylesheet: the shell (status bar, lock, home, dock, app window, control centre, notifications)
// and the kit pieces modules build with. Kept as a JS string so the fold snapshot (SVG foreignObject) can embed it.
export const CSS = /* css */`
.os-host{position:absolute;left:0;top:0;transform-origin:0 0}
.os-screen{position:absolute;left:0;top:0;overflow:hidden;transform-origin:0 0;background:#000;color:var(--text);
  font:15px/1.3 var(--font-ui);
  --font-ui:-apple-system,"SF Pro Text","Segoe UI Variable Text","Segoe UI",system-ui,Roboto,"Helvetica Neue",Arial,sans-serif;
  --font-display:"SF Pro Rounded","Segoe UI Variable Display","Segoe UI",system-ui,sans-serif;--font-head:inherit;--font-mono:"Consolas","SF Mono",ui-monospace,monospace;
  --r-icon:23%;--r-card:12px;--r-tile:22px;--r-btn:14px;--r-dock:30px;--r-sheet:18px;--r-field:11px;
  -webkit-font-smoothing:antialiased;user-select:none;-webkit-user-select:none;cursor:default;text-align:left;touch-action:manipulation;-webkit-tap-highlight-color:transparent;
  --bg:#000;--bg2:#1c1c1e;--bg3:#2c2c2e;--bg4:#3a3a3c;--fill:rgba(120,120,128,.24);--fill2:rgba(120,120,128,.32);
  --text:#fff;--text2:rgba(235,235,245,.62);--text3:rgba(235,235,245,.32);--sep:rgba(84,84,88,.62);
  --accent:#0a84ff;--green:#30d158;--red:#ff453a;--orange:#ff9f0a;--yellow:#ffd60a;--purple:#bf5af2;--pink:#ff375f;--teal:#64d2ff;--indigo:#5e5ce6;
  --bubble-them:#26262a;--glass:rgba(40,40,44,.72);--sb-color:#fff}
.os-screen.light{--bg:#f2f2f7;--bg2:#fff;--bg3:#e5e5ea;--bg4:#d1d1d6;--fill:rgba(120,120,128,.12);--fill2:rgba(120,120,128,.2);
  --text:#000;--text2:rgba(60,60,67,.62);--text3:rgba(60,60,67,.32);--sep:rgba(60,60,67,.3);
  --accent:#007aff;--green:#34c759;--red:#ff3b30;--orange:#ff9500;--yellow:#ffcc00;--purple:#af52de;--pink:#ff2d55;--teal:#5ac8fa;--indigo:#5856d6;
  --bubble-them:#e9e9eb;--glass:rgba(255,255,255,.75)}
.os-screen.phone{--sb-h:62px;--bot:24px;border-radius:28px 46px 46px 28px}
.os-screen.tablet{--sb-h:30px;--bot:20px;border-radius:58px}
/* where an app's own layout must stay clear of: the status bar on top, the home bar (console: the hint bar) below */
.os-screen{--safe-top:var(--sb-h);--safe-bottom:var(--bot)}
.os-screen.console{--safe-bottom:48px}
.os-screen.console.tablet{--safe-bottom:52px}
:where(.os-screen) *,:where(.os-screen) *::before,:where(.os-screen) *::after{box-sizing:border-box;margin:0;padding:0}
:where(.os-screen) :where(button){font:inherit;color:inherit;background:none;border:0;cursor:pointer;text-align:inherit;-webkit-tap-highlight-color:transparent}
:where(.os-screen) :where(input,textarea){font:inherit;color:inherit;background:none;border:0;outline:0;resize:none;user-select:text;-webkit-user-select:text}
:where(.os-screen) svg{display:block}
.os-screen .wp{position:absolute;left:0;top:0;width:100%;height:100%}
.os-screen .layer{position:absolute;inset:0}
.os-screen [data-scroll]{overflow-y:auto;overflow-x:hidden;scrollbar-width:none}
.os-screen [data-scroll]::-webkit-scrollbar{display:none}
.os-screen.snap *,.os-screen.snap *::before,.os-screen.snap *::after{animation:none!important;transition:none!important}
/* a display nobody is looking at (put away, or the other half of the fold): looping animations stop, so the page
   doesn't repaint every frame for nothing; one-shot ones simply finish */
.os-screen.os-off *,.os-screen.os-off *::before,.os-screen.os-off *::after{animation-duration:0s!important}
.os-screen .tap{transition:transform .15s,opacity .15s}
.os-screen .tap:active{transform:scale(.94);opacity:.7}

/* ---------- status bar ---------- */
.sb{position:absolute;left:0;right:0;top:0;height:var(--sb-h);display:flex;align-items:center;justify-content:space-between;z-index:90;
  color:var(--sb-color);font-weight:600;pointer-events:none;transition:color .3s}
.phone .sb{padding:16px 64px 0 32px;font-size:15.5px}
.tablet .sb{padding:4px 26px 0;font-size:13px}
.sb-l{display:flex;gap:7px;align-items:center;letter-spacing:-.1px}
.sb-l .sb-date{font-weight:600;opacity:.95}
.sb-l .sb-tablet{width:22px;height:22px;padding:3px;display:grid;place-items:center;pointer-events:auto;color:inherit;opacity:.85;border-radius:6px}
.sb-l .sb-tablet:hover{background:rgba(255,255,255,.14);opacity:1}
.sb-l .sb-tablet:focus-visible{outline:2px solid currentColor;outline-offset:1px}
.sb-l .sb-tablet svg{width:16px;height:16px}
.sb-r{display:flex;gap:6px;align-items:center;pointer-events:auto;cursor:pointer;padding:4px 0 4px 10px}
.sb-r svg{height:11.5px;width:auto}
.sb-r .bat{height:12.5px}
.sb-r .pct{font-size:12px;font-weight:600;margin-right:-2px}
.sb-r .off{opacity:.35}
.app-open .sb{--sb-color:var(--text)}
.cc-open .sb,.locked .sb,.in-call .sb{--sb-color:#fff}
/* the open app picks the ink (def.statusBar): dark on light apps, light on dark ones (Control Centre / calls keep white) */
.app-open.sb-dark:not(.cc-open):not(.in-call) .sb{--sb-color:rgba(0,0,0,.88)}
.app-open.sb-light .sb{--sb-color:#fff}

/* ---------- lock screen ---------- */
.lock-clock{position:absolute;left:0;right:0;text-align:center;color:rgba(255,255,255,.96);transition:transform .5s cubic-bezier(.3,.9,.3,1),opacity .4s;
  text-shadow:0 1px 18px rgba(30,10,60,.25)}
.phone .lock-clock{top:74px}
.tablet .lock-clock{top:62px}
.lc-date{font-weight:600;letter-spacing:.1px;opacity:.92}
.phone .lc-date{font-size:17px}
.tablet .lc-date{font-size:21px}
.lc-time{font-family:var(--font-display);font-weight:600;line-height:1;letter-spacing:-3px;margin-top:2px}
.phone .lc-time{font-size:100px}
.tablet .lc-time{font-size:132px}
.lock{position:absolute;inset:0;z-index:30;transition:transform .5s cubic-bezier(.3,.9,.3,1),opacity .35s;color:#fff}
.os-screen:not(.locked) .lock{transform:translateY(-40%);opacity:0;pointer-events:none}
.os-screen:not(.locked) .lock-clock{transform:translateY(-60%);opacity:0}
.lock-icon{position:absolute;left:50%;transform:translateX(-50%);opacity:.9}
.phone .lock-icon{top:56px;display:none}
.notifs{position:absolute;display:flex;flex-direction:column;gap:8px}
.phone .notifs{left:12px;right:12px;bottom:96px}
.tablet .notifs{left:50%;width:420px;margin-left:-210px;bottom:110px}
.notif{display:flex;gap:11px;align-items:flex-start;padding:12px 14px;border-radius:var(--r-tile);background:rgba(30,24,44,.42);
  backdrop-filter:blur(24px) saturate(1.6);-webkit-backdrop-filter:blur(24px) saturate(1.6);width:100%;color:#fff;animation:pop .5s cubic-bezier(.2,1.3,.4,1) both}
.notif .ico{width:36px;height:36px;border-radius:9px;flex:none;font-size:36px}
.notif .ico svg{width:22px;height:22px;margin:7px}
.notif .n-body{flex:1;min-width:0}
.notif .n-top{display:flex;justify-content:space-between;font-size:13px;color:rgba(255,255,255,.7)}
.notif .n-title{font-weight:600;font-size:14.5px}
.notif .n-text{font-size:14px;line-height:1.25;color:rgba(255,255,255,.92);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.lock-btns{position:absolute;left:0;right:0;display:flex;justify-content:space-between;align-items:center}
.phone .lock-btns{bottom:36px;padding:0 40px}
.tablet .lock-btns{bottom:40px;padding:0 60px}
.lock-btn{width:50px;height:50px;border-radius:50%;background:rgba(20,16,30,.38);backdrop-filter:blur(20px);-webkit-backdrop-filter:blur(20px);display:grid;place-items:center}
.lock-btn svg{width:22px;height:22px}
.lock-btn.on{background:rgba(255,255,255,.92)}
.lock-btn.on svg{fill:#111}
.unlock-hint{font-size:14px;text-shadow:0 1px 8px rgba(0,0,0,.35);font-weight:500;color:rgba(255,255,255,.85)}
.locked .unlock-hint{animation:breathe 2.6s ease-in-out infinite}   /* only while the lock screen is up */
@keyframes breathe{50%{opacity:.45;transform:translateY(-2px)}}
@keyframes pop{from{transform:scale(.9) translateY(10px);opacity:0}}

/* ---------- home screen ---------- */
.home{position:absolute;inset:0;z-index:10;transition:transform .45s cubic-bezier(.25,.9,.3,1),opacity .35s,filter .35s}
.locked .home{transform:scale(1.12);opacity:0;pointer-events:none}
.app-open .home{transform:scale(.92);opacity:.0;transition-duration:.38s,.3s}
.cc-open .home,.cc-open .app-win{filter:blur(0)}
.app-icon{display:flex;flex-direction:column;align-items:center;gap:5px;color:#fff;font-size:11.5px;font-weight:500;text-shadow:0 1px 4px rgba(0,0,0,.35)}
.app-icon span{white-space:nowrap;letter-spacing:.1px}
.ico{position:relative;border-radius:var(--r-icon);overflow:hidden;background:linear-gradient(160deg,var(--c1),var(--c2));color:var(--fg,#fff);box-shadow:0 2px 6px rgba(0,0,0,.18);display:grid;place-items:center;flex:none}
.ico svg{width:60%;height:60%}
.ico::after{content:'';position:absolute;inset:0;border-radius:inherit;box-shadow:inset 0 0 0 .5px rgba(255,255,255,.18),inset 0 1px 0 rgba(255,255,255,.25)}
.ico.cal{background:#fff;color:#111;display:flex;flex-direction:column;align-items:center;justify-content:flex-start}
.ico.cal .cal-d{color:#ff3b30;font-weight:600;font-size:.17em;margin-top:13%;letter-spacing:.5px}
.ico.cal .cal-n{font-weight:400;font-size:.5em;line-height:1;margin-top:-2%}
.phone .grid{position:absolute;left:18px;right:18px;top:76px;display:grid;grid-template-columns:repeat(4,1fr);row-gap:16px}
.phone .grid .ico{width:60px;height:60px;font-size:60px}
.dots{position:absolute;left:0;right:0;display:flex;justify-content:center;gap:8px}
.dots i{width:7px;height:7px;border-radius:50%;background:rgba(255,255,255,.4)}
.dots i.on{background:#fff}
.phone .dots{bottom:112px}
.dock{position:absolute;display:flex;justify-content:space-around;align-items:center;border-radius:var(--r-dock);
  background:rgba(255,255,255,.2);backdrop-filter:blur(26px) saturate(1.5);-webkit-backdrop-filter:blur(26px) saturate(1.5)}
.phone .dock{left:12px;right:12px;bottom:14px;height:86px;padding:0 10px}
.phone .dock .ico{width:60px;height:60px;font-size:60px}
.dock .app-icon span{display:none}
.tablet .grid{position:absolute;left:36px;right:36px;top:64px;display:grid;grid-template-columns:repeat(auto-fill,118px);row-gap:30px}
.tablet .grid .ico{width:72px;height:72px;font-size:72px}
.tablet .app-icon{font-size:12.5px;gap:7px}
.tablet .dock{left:50%;transform:translateX(-50%);bottom:16px;height:96px;padding:0 16px;gap:18px}
.tablet .dock .ico{width:66px;height:66px;font-size:66px}
.tablet .dock .div{width:1px;height:56px;background:rgba(255,255,255,.3)}
.tablet .dots{bottom:124px;left:0}
/* the home arrangement (7 Oct 2026): every slot is a place, empty ones too; while an app is carried they show,
   the one under it lights, the carried app lifts and the others wiggle */
.slot{display:flex;flex-direction:column;align-items:center;gap:5px;font-size:11.5px}
.slot .ico-ghost{display:block;border-radius:var(--r-icon);transition:background .15s,box-shadow .15s}
.phone .slot .ico-ghost{width:60px;height:60px}
.tablet .slot{font-size:12.5px;gap:7px}
.tablet .slot .ico-ghost{width:72px;height:72px}
.home.arranging .slot .ico-ghost{box-shadow:inset 0 0 0 1.5px rgba(255,255,255,.3)}
.home.arranging .slot.over .ico-ghost{background:rgba(255,255,255,.18);box-shadow:inset 0 0 0 2px rgba(255,255,255,.9)}
.app-icon.held{z-index:2}
.app-icon.held .ico{transform:scale(1.12)!important;box-shadow:0 10px 24px rgba(0,0,0,.45),0 0 0 2px rgba(255,255,255,.9)}
.app-icon.over .ico{transform:scale(.9)!important;box-shadow:0 0 0 2px rgba(255,255,255,.9)}
.home.arranging .app-icon:not(.held):not(.over) .ico{animation:homeWiggle .3s ease-in-out infinite alternate}
@keyframes homeWiggle{from{transform:rotate(-1.8deg)}to{transform:rotate(1.8deg)}}
.hedge{position:absolute;top:60px;bottom:110px;width:28px;z-index:3}
.hedge.l{left:0}
.hedge.r{right:0}
.tile.held{transform:scale(1.04);box-shadow:0 0 0 2px rgba(255,255,255,.9),0 10px 24px rgba(0,0,0,.4)}

/* ---------- app window ---------- */
.app-win{position:absolute;inset:0;z-index:40;background:var(--bg);opacity:0;transform:scale(.18);pointer-events:none;overflow:hidden;
  transform-origin:var(--ox,50%) var(--oy,50%);border-radius:inherit;transition:transform .42s cubic-bezier(.22,.95,.3,1),opacity .22s,border-radius .4s}
.app-open .app-win{opacity:1;transform:none;pointer-events:auto}
.app-wrap{position:absolute;inset:0}
.app-wrap>.mount{position:absolute;inset:0}
.app{position:absolute;inset:0;display:flex;flex-direction:column;padding-top:var(--sb-h);background:var(--bg)}
.nav{display:flex;align-items:center;justify-content:space-between;min-height:42px;padding:0 12px;flex:none;position:relative}
.nav .back{color:var(--accent);display:flex;align-items:center;gap:5px;font-size:16.5px;padding:6px 4px}
.nav .back svg{width:11px;height:19px}
.nav .n-title{position:absolute;left:0;right:0;text-align:center;font-weight:600;font-size:16.5px;pointer-events:none}
.nav .n-act{color:var(--accent);font-size:16.5px;padding:6px 6px;display:flex;align-items:center;gap:14px}
.nav .n-act svg{width:22px;height:22px}
.big-title{font-family:var(--font-head);font-size:32px;font-weight:700;letter-spacing:-.6px;padding:0 18px 8px;flex:none}
.tablet .big-title{font-size:34px;padding:4px 26px 10px}
.scroll{flex:1;min-height:0}
.pad-b{height:calc(var(--bot) + 14px)}
.search{display:flex;align-items:center;gap:7px;margin:0 16px 12px;height:36px;border-radius:var(--r-field);background:var(--fill);color:var(--text2);padding:0 9px;font-size:16px;flex:none}
.search svg{width:16px;height:16px}
.search input{flex:1;color:var(--text)}
.list{margin:0 16px 22px;background:var(--bg2);border-radius:var(--r-card);overflow:hidden}
.list-h{margin:0 32px 7px;font-size:13px;color:var(--text2);text-transform:uppercase;letter-spacing:.2px}
.list-f{margin:-14px 32px 22px;font-size:13px;color:var(--text2)}
.row{display:flex;align-items:center;gap:12px;min-height:46px;padding:8px 14px;position:relative;width:100%;text-align:left;font-size:16px}
.row+.row::before{content:'';position:absolute;top:0;left:var(--inset,56px);right:0;border-top:.5px solid var(--sep)}
.row.plain+.row.plain::before{left:14px}
.row .r-ico{width:30px;height:30px;border-radius:7.5px;display:grid;place-items:center;flex:none;color:#fff}
.row .r-ico svg{width:18px;height:18px}
.row .r-main{flex:1;min-width:0}
.row .r-sub{font-size:13.5px;color:var(--text2);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.row .r-val{color:var(--text2);font-size:16px;white-space:nowrap}
.row .chev{width:8px;height:13px;color:var(--text3);flex:none}
.row.sel{background:var(--accent);color:#fff}
.row.sel .r-sub,.row.sel .r-val{color:rgba(255,255,255,.8)}
.row:active{background:var(--fill)}
.sw{width:51px;height:31px;border-radius:16px;background:var(--fill2);position:relative;transition:background .25s;flex:none;cursor:pointer}
.sw::after{content:'';position:absolute;left:2px;top:2px;width:27px;height:27px;border-radius:50%;background:#fff;
  box-shadow:0 3px 8px rgba(0,0,0,.15),0 3px 1px rgba(0,0,0,.06);transition:transform .28s cubic-bezier(.3,1.3,.5,1)}
.sw.on{background:var(--green)}
.sw.on::after{transform:translateX(20px)}
.av{border-radius:50%;display:grid;place-items:center;color:#fff;font-weight:600;flex:none;letter-spacing:.3px;position:relative;overflow:hidden}
.av-pic{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;border-radius:50%}
.btn{display:inline-flex;align-items:center;justify-content:center;gap:6px;height:44px;padding:0 20px;border-radius:var(--r-btn);background:var(--accent);color:#fff;font-weight:600;font-size:16px}
.btn.gray{background:var(--fill);color:var(--accent)}
.btn.red{background:var(--red)}
.btn.green{background:var(--green)}
.pill{display:inline-flex;align-items:center;height:22px;padding:0 9px;border-radius:11px;font-size:12px;font-weight:600}
.split{display:flex;flex:1;min-height:0}
.split>.side{width:360px;flex:none;display:flex;flex-direction:column;border-right:.5px solid var(--sep);background:var(--bg)}
.split>.main{flex:1;min-width:0;display:flex;flex-direction:column;background:var(--bg)}
.tablet .app{padding-top:var(--sb-h)}
.seg{display:flex;background:var(--fill);border-radius:9px;padding:2px;margin:0 16px 12px;flex:none}
.seg button{flex:1;height:30px;border-radius:7px;font-size:13.5px;font-weight:500;text-align:center}
.seg button.on{background:var(--bg4);box-shadow:0 2px 6px rgba(0,0,0,.15)}
.light .seg button.on{background:#fff}
.tabbar{display:flex;justify-content:space-around;flex:none;padding:6px 0 var(--bot);border-top:.5px solid var(--sep);background:var(--bg2)}
.tabbar button{display:flex;flex-direction:column;align-items:center;gap:2px;font-size:10.5px;font-weight:500;color:var(--text2);width:78px}
.tabbar button svg{width:26px;height:26px}
.tabbar button.on{color:var(--accent)}
.toast{position:absolute;left:50%;bottom:calc(var(--bot) + 40px);transform:translate(-50%,20px);background:var(--bg3);color:var(--text);padding:10px 18px;border-radius:22px;font-size:14px;font-weight:500;
  box-shadow:0 8px 30px rgba(0,0,0,.3);opacity:0;transition:opacity .3s,transform .3s;z-index:150;white-space:nowrap;pointer-events:none}
.toast.show{opacity:1;transform:translate(-50%,0)}
/* no voice system (the sound of calls) running: over everything (but the camera punch), and every click is its own */
.voice-down{position:absolute;inset:0;z-index:300;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px;
  padding:48px 36px;background:#0c0c11;color:#fff;text-align:center;font-size:17px;font-weight:600;line-height:1.4}
.voice-down .vd-icon{width:56px;height:56px;color:#ff453a}
.voice-down .vd-text{max-width:300px}
.sheet-bg{position:absolute;inset:0;background:rgba(0,0,0,.4);z-index:120;animation:fade .25s both}
.sheet{position:absolute;left:0;right:0;bottom:0;z-index:121;background:var(--bg2);border-radius:var(--r-sheet) var(--r-sheet) 0 0;padding:8px 18px calc(var(--bot) + 14px);animation:up .38s cubic-bezier(.2,.95,.3,1) both}
.tablet .sheet{left:50%;width:480px;margin-left:-240px;bottom:auto;top:50%;transform:translateY(-50%);border-radius:var(--r-sheet);animation:fade .25s both}
.sheet .grab{width:38px;height:5px;border-radius:3px;background:var(--fill2);margin:0 auto 12px}
.sheet h3{font-size:19px;font-weight:700;margin-bottom:14px}
@keyframes fade{from{opacity:0}}
@keyframes up{from{transform:translateY(100%)}}
@keyframes slide-in{from{transform:translateX(30%);opacity:0}}
.slide-in{animation:slide-in .32s cubic-bezier(.2,.9,.3,1) both}
.empty{display:grid;place-items:center;height:100%;color:var(--text2);font-size:15px}

/* ---------- home indicator, control centre, banner, dimmer, punch ---------- */
.home-bar{position:absolute;bottom:7px;left:50%;width:134px;height:5px;margin-left:-67px;border-radius:3px;background:#fff;z-index:95;cursor:pointer;transition:background .3s}
.tablet .home-bar{width:180px;margin-left:-90px;bottom:8px}
.home-bar::before{content:'';position:absolute;left:-20px;right:-20px;top:-14px;bottom:-8px}
.app-open .home-bar{background:var(--text)}
.app-open.sb-dark:not(.cc-open):not(.in-call) .home-bar{background:rgba(0,0,0,.85)}
.app-open.sb-light .home-bar{background:#fff}
.cc{position:absolute;inset:0;z-index:100;background:rgba(10,8,18,.42);backdrop-filter:blur(28px) saturate(1.5);-webkit-backdrop-filter:blur(28px) saturate(1.5);
  opacity:0;pointer-events:none;transition:opacity .28s;color:#fff}
.cc-open .cc{opacity:1;pointer-events:auto}
.cc-panel{position:absolute;display:grid;grid-template-columns:repeat(4,1fr);gap:14px;transition:transform .4s cubic-bezier(.2,1.1,.3,1);transform:translateY(-24px) scale(.96)}
.cc-open .cc-panel{transform:none}
.phone .cc-panel{left:20px;right:20px;top:74px;gap:12px}
.tablet .cc-panel{right:26px;top:48px;width:360px}
.cc-tile{background:rgba(255,255,255,.14);border-radius:var(--r-tile);display:grid;place-items:center;aspect-ratio:1;position:relative}
.cc-tile svg{width:26px;height:26px}
.cc-tile.on.c-orange{background:var(--orange)}
.cc-tile.on.c-blue{background:#0a84ff}
.cc-tile.on.c-green{background:#30d158}
.cc-tile.on.c-purple{background:#5e5ce6}
.cc-tile.on.c-white{background:#fff}
.cc-tile.on.c-white svg{filter:brightness(0) opacity(.85)}
.cc-wide{grid-column:span 2;aspect-ratio:auto;place-items:stretch;padding:12px 14px;display:flex;flex-direction:column;justify-content:space-between}
.cc-quad{grid-column:span 2;grid-row:span 2;aspect-ratio:auto;display:grid;grid-template-columns:1fr 1fr;gap:10px;padding:12px;place-items:center}
.cc-quad .cc-mini{width:52px;height:52px;border-radius:50%;background:rgba(255,255,255,.18);display:grid;place-items:center}
.cc-quad .cc-mini.on{background:var(--c)}
.cc-quad .cc-mini svg{width:24px;height:24px}
.cc-slider{grid-row:span 2;aspect-ratio:auto;position:relative;overflow:hidden;cursor:ns-resize;place-items:end center;padding-bottom:16px}
.cc-slider .fill{position:absolute;left:0;right:0;bottom:0;background:#fff}
.cc-slider svg{position:relative;width:24px;height:24px;color:#8e8e93}
.cc-fold{grid-column:span 4;aspect-ratio:auto;height:62px;display:flex;align-items:center;justify-content:center;gap:12px;font-weight:600;font-size:15.5px;background:rgba(255,255,255,.92);color:#111}
.cc-fold svg{width:26px;height:26px;stroke:#111}
.banner{position:absolute;z-index:110;display:flex;gap:11px;align-items:center;padding:11px 13px;border-radius:var(--r-tile);background:rgba(36,36,40,.9);color:#fff;
  backdrop-filter:blur(26px);-webkit-backdrop-filter:blur(26px);box-shadow:0 10px 34px rgba(0,0,0,.35);transform:translateY(calc(-100% - 90px));opacity:0;transition:transform .5s cubic-bezier(.2,1.15,.35,1),opacity .3s;cursor:pointer}
.phone .banner{left:9px;right:9px;top:calc(60px + var(--i, 0) * 72px)}
.tablet .banner{left:50%;width:400px;margin-left:-200px;top:calc(38px + var(--i, 0) * 72px)}
.banner.on{transform:none;opacity:1}
.banner.out{opacity:0;pointer-events:none}
/* notification peek: the phone is put away and only rises to show notifications, so just the wallpaper, the status
   bar and the notification stack show on it */
.os-screen.peek .front>:not(.sb):not(.banner):not(.punch):not(.dimmer),.os-screen.peek .behind{opacity:0!important;pointer-events:none!important}
.banner .ico{width:38px;height:38px;border-radius:9px;font-size:38px}
.banner .ico svg{width:23px;height:23px}
.banner .ico.b-pic,.notif .ico.b-pic{border-radius:50%}
.banner .ico.b-pic svg,.notif .ico.b-pic svg{display:none}
.banner .b-main{flex:1;min-width:0}
.banner .b-t{font-weight:600;font-size:14.5px;display:flex;justify-content:space-between}
.banner .b-t span{font-weight:400;font-size:12.5px;opacity:.6}
.banner .b-x{font-size:14px;opacity:.92;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.dimmer{position:absolute;inset:0;background:#000;pointer-events:none;z-index:400}
.punch{position:absolute;left:337px;top:25.7px;width:27.4px;height:27.4px;border-radius:50%;background:#000;z-index:500;pointer-events:none}


/* ---------- chat pieces (kit: bubbles, chat header, composer) ---------- */
.chat-h{display:flex;flex-direction:column;align-items:center;gap:3px;padding:0 0 8px;border-bottom:.5px solid var(--sep);flex:none;position:relative;background:var(--bg)}
.chat-h .back{position:absolute;left:10px;top:4px}
.chat-h .ch-n{font-size:12px;font-weight:500;display:flex;align-items:center;gap:2px}
.msgs{display:flex;flex-direction:column;gap:3px;padding:12px 14px 10px}
.msgs .day{align-self:center;font-size:11.5px;color:var(--text2);margin:6px 0 8px;font-weight:500}
.bub{max-width:76%;padding:7px 13px;border-radius:19px;font-size:16px;line-height:1.3;word-wrap:break-word}
.bub.fresh{animation:pop .32s cubic-bezier(.2,1.2,.4,1) both}
.bub.me{align-self:flex-end;background:var(--accent);color:#fff}
.bub.them{align-self:flex-start;background:var(--bubble-them)}
.bub.me+.bub.them,.bub.them+.bub.me{margin-top:8px}
.msgs .read{align-self:flex-end;font-size:11px;color:var(--text2);margin:1px 4px 0}
.typing{align-self:flex-start;background:var(--bubble-them);border-radius:19px;padding:12px 14px;display:flex;gap:5px;margin-top:8px}
.typing i{width:8px;height:8px;border-radius:50%;background:var(--text2);animation:blink 1.2s infinite}
.typing i:nth-child(2){animation-delay:.2s}.typing i:nth-child(3){animation-delay:.4s}
@keyframes blink{0%,60%,100%{opacity:.35}30%{opacity:1}}
.composer{display:flex;align-items:center;gap:8px;padding:7px 10px calc(var(--bot) + 4px);flex:none;background:var(--bg)}
.composer .plus{width:34px;height:34px;border-radius:50%;background:var(--fill);display:grid;place-items:center;color:var(--text2);flex:none}
.composer .plus svg{width:17px;height:17px}
.composer .field{flex:1;display:flex;align-items:center;border:1px solid var(--fill2);border-radius:19px;min-height:36px;padding:0 4px 0 13px}
.composer input{flex:1;font-size:16px;height:34px}
.composer .send{width:28px;height:28px;border-radius:50%;background:var(--accent);display:grid;place-items:center;flex:none;transition:transform .2s,opacity .2s}
.composer .send svg{width:16px;height:16px}
.composer .send.off{transform:scale(0);opacity:0}

/* ---------- range input ---------- */
.bright{display:flex;align-items:center;gap:12px;padding:12px 14px}
.bright svg{width:18px;height:18px;fill:var(--text2);flex:none}
.os-screen input[type=range]{flex:1;-webkit-appearance:none;appearance:none;height:4px;border-radius:2px;background:var(--fill2);cursor:pointer}
.os-screen input[type=range]::-webkit-slider-thumb{-webkit-appearance:none;width:26px;height:26px;border-radius:50%;background:#fff;box-shadow:0 2px 8px rgba(0,0,0,.25)}

/* ---------- additions ---------- */
.app-icon{position:relative}
.badge{position:absolute;top:-6px;left:calc(50% + 18px);min-width:22px;height:22px;border-radius:11px;background:#ff3b30;color:#fff;font-size:13px;font-weight:600;display:grid;place-items:center;padding:0 6px;font-style:normal;z-index:2;box-shadow:0 1px 3px rgba(0,0,0,.25)}
.tablet .badge{left:calc(50% + 24px)}
.dock .badge{top:-6px}
.chat-h .back{position:absolute;left:8px;top:6px;color:var(--accent);padding:8px}
.chat-h .back svg{width:11px;height:19px}
.light .app .list{box-shadow:none}

/* ---------- tablet, rolled upright (portrait screens) ---------- */
.tablet.portrait .grid{left:28px;right:28px;top:64px;grid-template-columns:repeat(4,1fr);row-gap:30px}
.tablet.portrait .dots{left:0;bottom:122px}
.tablet.portrait .dock{gap:10px;padding:0 12px;height:84px}
.tablet.portrait .dock .ico{width:56px;height:56px;font-size:56px}
.tablet.portrait .dock .div{height:46px}
.tablet.portrait .lock-clock{top:118px}
.tablet.portrait .notifs{bottom:132px}
.tablet.portrait .split>.side{width:292px}

/* ---------- mouse & keyboard layout: hover feedback; the highlight shows only while using the keyboard ---------- */
.home{animation:fade .2s both}
/* home icons 15% bigger in this layout (2026-10-07); badges follow the bigger circle */
.mk.phone .grid .ico{width:69px;height:69px;font-size:69px}
.mk.tablet .grid .ico{width:83px;height:83px;font-size:83px}
.mk.phone .grid .badge{left:calc(50% + 21px)}
.mk.tablet .grid .badge{left:calc(50% + 28px)}
.mk .app-icon .ico{transition:transform .16s cubic-bezier(.34,1.4,.64,1),box-shadow .16s}
.mk.in-mouse .app-icon:hover .ico{transform:translateY(-3px) scale(1.05)}
.mk.in-mouse .row:hover,.mk.in-mouse .thread:hover,.mk.in-mouse .mail-row:hover,.mk.in-mouse .place:hover,.mk.in-mouse .notif:hover{background:rgba(255,255,255,.06)}
.mk.in-mouse .btn:hover,.mk.in-mouse .lock-btn:hover,.mk.in-mouse .cc-tile:hover{filter:brightness(1.12)}
.mk .kf{box-shadow:0 0 0 2px rgba(255,255,255,.93),0 0 0 6px rgba(255,255,255,.12)!important;outline:none;border-radius:var(--r-btn)}
.mk .row.kf,.mk .thread.kf,.mk .mail-row.kf,.mk .place.kf{background:rgba(255,255,255,.93)!important;color:rgb(10,12,18)!important;box-shadow:none!important;border-radius:0}
.mk .kf .r-sub,.mk .kf .r-val,.mk .kf .t-time,.mk .kf .t-prev,.mk .kf .mr-time,.mk .kf .mr-p{color:rgba(10,12,18,.62)!important}
.mk .app-icon.kf{box-shadow:none!important}
.mk .app-icon.kf .ico{box-shadow:0 0 0 2px rgba(255,255,255,.93),0 0 0 6px rgba(255,255,255,.12)}
.mk .lock.kf{box-shadow:none!important}

/* ---------- console layout: big targets, D-pad focus, button hints (mouse still works everywhere) ---------- */
.console .home-bar{display:none}
.console .app{padding-bottom:48px}
.console .app>.tabbar{order:-1;border-top:0;border-bottom:1px solid var(--sep);padding:2px 0 6px;background:transparent}
.console .call .c-end{margin-bottom:62px}
.console .sheet{padding-bottom:62px}
.console .lock .notifs{bottom:106px}
.console .lock-btns{bottom:62px}
.console.tablet .lock-btns{bottom:70px}
.console .row{min-height:50px}
/* hint bar */
.hints{position:absolute;left:0;right:0;bottom:0;height:48px;z-index:107;display:flex;align-items:center;justify-content:center;gap:2px;padding:0 8px 6px;
  background:rgb(14,16,23);border-top:1px solid rgba(255,255,255,.07)}
.tablet .hints{height:52px;gap:12px;padding-bottom:8px}
.hint{display:flex;align-items:center;gap:6px;height:30px;padding:0 8px;border-radius:8px;font-size:12px;font-weight:600;color:var(--text2);white-space:nowrap;transition:background .1s,color .1s}
.tablet .hint{font-size:13px;padding:0 10px}
.hint:hover{background:rgba(255,255,255,.06);color:var(--text)}
.in-mouse .hint{color:var(--text);background:rgba(255,255,255,.05);box-shadow:inset 0 0 0 1px rgba(255,255,255,.07)}
.kg{display:inline-grid;place-items:center;min-width:20px;height:20px;padding:0 5px;border-radius:10px;font-style:normal;font-size:10.5px;font-weight:800;letter-spacing:0;
  color:var(--text);box-shadow:inset 0 0 0 1.5px rgba(255,255,255,.6);flex:none}
.kg.k-keys{border-radius:5px;min-width:22px;font-size:10px;font-weight:700;box-shadow:inset 0 0 0 1px rgba(255,255,255,.42),inset 0 -2px 0 rgba(255,255,255,.16)}
.kg+.kg{margin-left:-2px}
/* the "this one" highlight: white fill on rows and tiles, white ring elsewhere */
.console .kf{box-shadow:0 0 0 2px rgba(255,255,255,.93),0 0 0 6px rgba(255,255,255,.12)!important;outline:none}
.console .tile.kf,.console .row.kf,.console .kp-key.kf,.console .qr.kf,.console .pg.kf,.console .btn.kf,.console .cc-tile.kf{position:relative;z-index:2}
.console .row.kf,.console .thread.kf,.console .mail-row.kf,.console .place.kf,.console .qr.kf,.console .pg.kf,.console .notif.kf,.console .tile.kf{
  background:rgba(255,255,255,.93)!important;color:rgb(10,12,18)!important;box-shadow:0 8px 24px rgba(0,0,0,.45)!important}
.console .kf .r-sub,.console .kf .r-val,.console .kf .t-time,.console .kf .t-prev,.console .kf .mr-time,.console .kf .mr-p,.console .kf .chev,.console .notif.kf .n-top,.console .notif.kf .n-text,.console .place.kf span span{color:rgba(10,12,18,.62)!important}
.console .lock.kf{box-shadow:none!important}
/* home: two pages of 3x3 tiles (phone), one big grid (tablet), info line for the focused tile */
.chome .ch-head{position:absolute;display:flex;align-items:center;gap:8px}
.phone .chome .ch-head{left:18px;right:18px;top:66px}
.tablet .chome .ch-head{left:36px;right:36px;top:40px}
.chome .ch-title{font-family:var(--font-head);font-size:24px;font-weight:700;letter-spacing:-.4px;margin-right:auto;color:#fff;text-shadow:0 1px 8px rgba(0,0,0,.5)}
.chome .pgs{display:flex;align-items:center;gap:6px}
.chome .pg{height:30px;padding:0 12px;border-radius:9px;font-size:13px;font-weight:600;color:rgba(255,255,255,.6);background:rgba(10,12,18,.6)}
.chome .pg.on{color:#fff;background:rgba(10,12,18,.88);box-shadow:inset 0 0 0 1px rgba(255,255,255,.16)}
.chome .tiles{position:absolute;display:grid;gap:10px}
.phone .chome .tiles{left:16px;right:16px;top:112px;grid-template-columns:repeat(3,1fr);grid-auto-rows:98px}
.tablet .chome .tiles{left:36px;right:36px;top:92px;grid-template-columns:repeat(auto-fill,110px);grid-auto-rows:116px;gap:12px}
.tablet.portrait .chome .tiles{left:28px;right:28px;top:92px;grid-template-columns:repeat(4,1fr);grid-auto-rows:116px}
.tablet .chome .widgets{top:92px}
.tablet.portrait .chome .widgets{top:86px}
.tile{position:relative;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:9px;border-radius:var(--r-tile);color:rgba(255,255,255,.93);
  background:rgba(14,16,23,.86);box-shadow:0 6px 16px rgba(0,0,0,.4),inset 0 1px 0 rgba(255,255,255,.06);font-size:12.5px;font-weight:600;
  transition:transform .18s cubic-bezier(.34,1.4,.64,1),background .1s,color .1s}
.tablet .tile{font-size:13.5px}
.tile .ico{width:50px;height:50px;font-size:50px}
.tablet .tile .ico{width:58px;height:58px;font-size:58px}
.tile .badge{top:8px;left:auto;right:10px}
.console .tile.kf{transform:scale(1.045)}
.chome .ch-info{position:absolute;color:#fff;text-shadow:0 1px 8px rgba(0,0,0,.6);pointer-events:none}
.phone .chome .ch-info{left:20px;right:20px;top:440px}
.tablet .chome .ch-info{left:40px;width:420px;top:362px}
.tablet.portrait .chome .ch-info{left:32px;right:32px;width:auto;top:490px}
.ch-info b{display:block;font-size:17px;font-weight:700;letter-spacing:-.2px}
.ch-info span{display:block;font-size:13px;color:rgba(255,255,255,.66);margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
/* messages: quick replies for controller players */
.quick{display:flex;gap:6px;padding:4px 10px 2px;flex:none;overflow:hidden}
.qr{height:32px;padding:0 12px;border-radius:9px;font-size:13px;font-weight:600;background:rgba(255,255,255,.06);box-shadow:inset 0 0 0 1px var(--sep);white-space:nowrap}
/* ---------- kit additions (whip_phone) ---------- */
.nav .nb{width:36px;height:36px;display:grid;place-items:center;color:var(--accent);border-radius:10px}
.nav .nb svg{width:22px;height:22px}
.search input{min-width:0;font-size:16px}
.search input::placeholder,.field-row input::placeholder,.composer input::placeholder{color:var(--text3)}
.field-row{cursor:text;gap:10px}
.field-row .f-l{width:88px;flex:none;font-size:15px;color:var(--text2)}
.field-row input{flex:1;min-width:0;font-size:16px;height:30px}
.btn.block{display:flex;width:100%}
.btn.ghost{background:transparent;color:var(--accent);box-shadow:none}
.row.danger,.row.danger .r-main{color:var(--red)}
.row .r-ico{background:rgba(255,255,255,.07);color:var(--text)}
.row .av{margin:-2px 0}
.av{background:rgba(255,255,255,.1);box-shadow:inset 0 0 0 1px rgba(255,255,255,.08);color:rgba(255,255,255,.93)}
.av svg{width:56%;height:56%}
.tabbar button{position:relative}
.tabbar .t-badge{position:absolute;top:-2px;left:calc(50% + 6px);min-width:17px;height:17px;border-radius:9px;background:var(--red);color:#fff;font-size:11px;font-weight:700;display:grid;place-items:center;padding:0 4px}
.bub.failed{opacity:.55;box-shadow:inset 0 0 0 1px var(--red)}
.kempty{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;padding:30px;text-align:center;color:var(--text2);font-size:14px;min-height:220px}
.kempty i{width:46px;height:46px;color:var(--text3);margin-bottom:4px}
.kempty i svg{width:100%;height:100%}
.kempty b{font-size:17px;font-weight:700;color:var(--text)}
.kempty .btn{margin-top:10px}
.overlay{position:absolute;inset:0;z-index:105}
.empty-home{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;color:#fff;text-align:center;padding:0 40px;text-shadow:0 1px 8px rgba(0,0,0,.6)}
.empty-home .eh-logo{width:120px;margin-bottom:14px;color:#fff;opacity:.9}
.empty-home b{font-size:19px;font-weight:700}
.empty-home span{font-size:14px;color:rgba(255,255,255,.7);line-height:1.4;max-width:280px}
.app-err{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;padding:30px;text-align:center}
.app-err b{font-size:17px}
.app-err code{font-size:12px;color:var(--text2);white-space:pre-wrap;word-break:break-word}
.dots button{width:7px;height:7px;border-radius:50%;background:rgba(255,255,255,.4)}
.dots button.on{background:#fff}
.cc-tile.cc-wide2{grid-column:span 2;aspect-ratio:auto;height:76px;display:flex;align-items:center;justify-content:flex-start;gap:12px;padding:0 16px;font-size:13.5px;font-weight:600;text-align:left}
.cc-tile.cc-wide2 svg{flex:none}
.cc-slider.wide{grid-row:auto;grid-column:span 2;aspect-ratio:auto}
.cc-tile .cc-ico{width:42px;height:42px;font-size:42px;flex:none}
.cc-panel>span:empty{display:block}
`;

/** mount-mode apps: a box the app owns, the whole display (content stays inside --safe-top / --safe-bottom). It starts
 *  from browser defaults: nothing inherits from the phone except CSS variables (--accent, --safe-top ...). Added as
 *  is, after the phone's CSS is shielded (see scope.js). */
export const MOUNT_CSS = /* css */`
:where(.mount-root){all:initial;display:block;position:absolute;inset:0;overflow:hidden}   /* zero specificity: an app's :host wins */
.sb-dark .mount-root .kf{box-shadow:0 0 0 2px rgba(0,0,0,.85),0 0 0 6px rgba(0,0,0,.14)!important}
`;
