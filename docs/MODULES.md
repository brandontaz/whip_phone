# Writing a whip_phone module

The phone ships with no apps of its own. Every app is a **module**: one JavaScript file that calls `WhipPhone.module({ ... })`. Delete a module and its app disappears; the phone keeps working. With none installed, the home screen says "No apps installed".

A module is **UI only**:
- it renders screens and asks for data with `app.request(...)`;
- the framework answers those requests on the server;
- the framework sends live updates back as pushes.

## Where modules live

**Built-in modules**
- **Location:** `whip_phone/html/modules/<id>/module.js`.
- **Install:** list the id in `Config.Modules`, and add the file to `files { }` in whip_phone's `fxmanifest.lua` (`'html/modules/<id>/module.js'`, one line per module: a `*` in a folder name matches nothing there, and a file not listed never reaches players). A listed module whose folder is missing is skipped.
- **Developer apps:** list the id in `Config.DeveloperApps` instead, and only players with developer mode on (whip_core's /w switch) get the app. It comes and goes as they switch it. Their requests reach the server like any other, so check `exports.whip_core:HasDevTools(source)` in each one (the Skill Check Tester's `server/skilltest.lua` does).
- **Request namespace:** `whip_phone:<id>:<action>`.

**Modules from another resource**
- Your resource lists its script in its own `fxmanifest.lua` and registers it from a client script:

```lua
-- fxmanifest.lua of your resource
files { 'html/phone_app.js' }
dependency 'whip_phone'

-- client.lua of your resource
local function register()
    if GetResourceState('whip_phone') ~= 'started' then return end
    exports.whip_phone:RegisterModule({ id = 'garage', script = 'html/phone_app.js' })   -- ns defaults to your resource name
end
CreateThread(register)
AddEventHandler('onResourceStart', function(res) if res == 'whip_phone' then register() end end)
```

- **Request namespace:** `<ns>:<action>`, where `ns` defaults to your resource name. So `app.request('cars')` calls the SecureCallback `my_garage:cars`.
- **Answering it:** `exports.whip_core:SecureCallback('my_garage:cars', { rateLimit = 250, params = { { 'args', 'any' } } }, function(source, player, args) ... end)`. Keep the `params` line: whip_core hands the handler only the params its schema names, so without it `args` (what `app.request` sent) never arrives. Check each field you read.
- **Removal:** stopping your resource removes the app, or `exports.whip_phone:UnregisterModule('garage')`.
- **Your apps only:** an id another running resource registered is refused (`false, 'the phone app "garage" belongs to other_res'`); registering your own again replaces it; `UnregisterModule` removes only your own. Both answer `true`, or `false, why`.

## The smallest module

```js
(() => {
  const { kit: K, icons: I } = window.WhipPhone;
  WhipPhone.module({
    id: 'notes', name: 'Notes', version: '1.0.0', order: 50, icon: I.compose,
    state: () => ({ list: [], loaded: false }),
    async open(app) {
      app.state.list = await app.request('list').catch(() => []);   // -> SecureCallback whip_phone:notes:list
      app.state.loaded = true;
    },
    render(app, view) {
      const s = app.state;
      const rows = s.list.map((n) => K.row({ label: n.title, sub: n.preview, act: 'openNote', d: { id: n.id } }));
      return K.screen('list', K.title('Notes') + K.scroll(rows.length ? K.list(rows) : K.empty({ title: s.loaded ? 'No notes' : 'Loading…' })));
    },
    actions: {
      openNote(app, d) { app.toast('Note ' + d.id); },
    },
  });
})();
```

## The definition

| Field | What it does |
|---|---|
| `id` | lowercase `a-z 0-9 _ -`, up to 32 characters. Unique. |
| `name`, `icon` | home-screen label and glyph: an SVG drawn in `currentColor`. The phone draws it inside its capsule-gauge icon. |
| `order`, `dock`, `hidden` | where it sorts on the home screen; `dock: true` pins it to the capsule dock (the phone shows 4, the tablet 6); `hidden` keeps it off the home screen. |
| `version` | shown in Settings > Apps. |
| `css` | CSS text, scoped to your app automatically (see [CSS](#css)). It is also embedded in the fold animation's snapshots. |
| `globalCss` | CSS that is **not** scoped, for the rare rule that has to reach outside your app (e.g. your notification capsule: `.banner[data-app="<id>"]`). Use sparingly. |
| `statusBar` | `'dark'` (dark text and icons, for light apps), `'light'` (white), or a function `(app) => 'dark'` that can change per screen. Leave it out for the phone's default (white). The home bar and the controller highlight follow it. |
| `state()` | returns the module's initial state; read and write it as `app.state`. |
| `init(app)` | once, when the module loads. |
| `session(app, session)` | the phone got a session (`{ number, name }`): reload your data. |
| `open(app, args)` / `close(app)` | the app opened (with args from a notification tap or another app) or left. |
| `render(app, view)` | Returns the app's HTML. `view = { size: 'phone' or 'tablet', portrait, console }`. Every display renders at once, so render must not change state. **A module needs `render` or `mount`.** |
| `mount(app, el, view)` / `update(app, el, view, changed)` / `unmount(app, el)` | [Mount mode](#mount-mode-your-own-dom-any-library): your app draws itself into `el` with any library, instead of `render`. |
| `overlay(app, view)` | HTML drawn over everything, even other apps (the Phone module's call screen). Return `''` when there is none. |
| `presence(app, now, before)` | what the player sees changed: the phone was put away or taken out, or an app opened or closed. Both are `{ visible, app, locked }`. The Phone module uses it to move a ringing call between its capsule and the full screen. |
| `actions` | `{ name(app, data, el, view) }`: run by any element with `data-act="name"` inside your app. `data` is the element's `data-*` attributes. |
| `bind` | `{ name(app, value) }`: inputs with `data-bind="name"`; `data-enter="action"` runs an action on Enter. |
| `on` | `{ event(app, data) }`: pushes from the framework (`exports.whip_phone:Push(src, '<id>', 'event', data)`). |
| `back(app)` | return `true` if you handled Back (closed a sub-screen); otherwise the app closes to home. |
| `route(app)` | a short name for the current sub-screen, which keeps the controller highlight per screen. |
| `tab(app, dir)` / `tabLabel(app)` | LB / RB (dir -1 / 1). Return `true` if handled. |
| `input(app, cmd, down, info)` | the buttons, before the phone sees them: `cmd` is `up down left right a b x y lb rb menu home` from a controller or the keyboard, `down` false on its release, `info = { repeat, from: 'pad' or 'keys' }` (`repeat`: a held direction stepping again). Return `true` to take it (a game), anything else and the phone handles it as usual. LB arrives as a press only, on its release (whip's combo key). |
| `keys` | `'all'`: while your app is open, W A S D, Space, Q and E reach it too (as up left down right, A, LB, RB), and the phone holds walking and jumping off meanwhile. |
| `x(app)` | the controller X button: `{ label, run }` or `null`. |
| `badge(app)` | the number on the icon. |
| `info(app)` | one line under the tile in the controller layout. |

After every action, binding, push and resolved request, the phone re-renders. Mutate `app.state` and return; call `app.render()` only from timers.

## The app object

| Member | What it is |
|---|---|
| `app.state` | your state |
| `app.request(action, args)` | Promise of the framework's answer. Rejects with `err.reason` when refused or missing. |
| `app.notify({ title, text, kind, args, ... })` | a notification capsule from your app; tapping it opens your app with `args`. Returns its id, or `false` when Do Not Disturb held it back. More options below. |
| `app.dismiss(key)` | takes down your capsule with that `key` (or the id `notify` returned). |
| `app.toast(text)` | a short message at the bottom. |
| `app.open(id, args)` | open another app (or your own) with args, e.g. `app.open('messages', { number })`. |
| `app.close()` / `app.back()` | back to home, or the same as pressing Back. |
| `app.attention(true / false)` | raise a put-away phone into view (a call answered from its capsule), and let it drop again. |
| `app.ring(kind)` | the call's sound: `'ring'` (ringing in: the SIM's ringtone, over and over), `'back'` (calling out: the line ringing at the other end) or `null` (quiet). The Phone module sets it at every change of a call. |
| `app.contacts` | shared contacts: `list`, `sorted`, `loaded`, `load()`, `find(number)`, `name(number)`, `save(c)`, `remove(id)`. |
| `app.blocks` | the SIM's block list: `list` (`{ number, time }`), `loaded`, `load()`, `has(number)`, `add(number)`, `remove(number)`. `add` and `remove` reject with `err.reason` when the server refuses. The server keeps blocked numbers' texts and calls away, so there's nothing to filter. |
| `app.settings` | `get(key)` and `set(key, value)` for wallpaper / dnd / ringtone / messageTone / notifyTone / soundVolume; `wallpapers()`; `sounds('ringtone' or 'alert')` the list to pick from, `preview(kind, id)` to hear one, `stopPreview()`. `get('layout')` is always `'auto'` (the layout follows the input; `app.console` says which one is showing). |
| `app.session` | `{ number, name }`. |
| `app.console` | `true` in the controller layout. |
| `app.active`, `app.visible` | your app is the open one; the phone is out (not put away). |
| `app.asset(path)` | the URL of a file next to your module script, e.g. `app.asset('img/car.png')` for an `<img src>`. Use it for every file you reference from JS: a bare relative path would resolve against whip_phone's page, not your resource. |
| `app.presence` | `{ visible, app, locked }`: the phone is out, which app is open (`null` = home), the lock screen is up. |
| `app.modules()` | installed modules `{ id, name, version, external }`, e.g. to show a "Message" button only when Messages is installed. |
| `app.forced` | the phone is held to your app (Lua's `exports.whip_phone:RunApp`): no home, no folding, no other app, and Back is your `back` hook. The phone draws no button-hint bar or home bar: draw your own hints. |
| `app.done(result)` | a held app's answer (a table): the phone lets go and `RunApp` returns it. |
| `app.rumble(ms, strength)` | shake the controller (`strength` 0 to 1). Nothing on a mouse and keyboard. |
| `app.kit`, `app.icons` | the UI kit below and the icon set. |

### Capsules with buttons

`app.notify` takes a few more fields for a capsule that needs the player, like the Phone module's incoming call:

| Field | What it does |
|---|---|
| `key` | names the capsule. Calling `notify` again with the same key updates it where it is (no new pop-in), and `app.dismiss(key)` takes it down. |
| `persist` | `true`: it stays up until you dismiss it, and newer notifications never push it out. Update it with `persist: false` and it times out like any other. |
| `actions` | up to 3 round buttons at its right end: `[{ act, label, tone, icon }]`. `act` is one of your `actions`, `tone` is `accept` (green), `reject` (red), `on` (white: a switch that is on, like a call's Speaker) or left out (glass), `icon` is SVG. |
| `data` | what your actions (and `tap`) receive as `data`. |
| `tap` | `{ act, label }`: a tap on the capsule runs this action instead of opening your app. With a controller, X runs it, and `label` shows on the X hint. |
| `life` | ms before it goes (5000), when it doesn't persist. |
| `sound` | `false`: no sound for this one. A new capsule otherwise plays the SIM's notification sound (not an update by `key`, not a `call`, not under Do Not Disturb). |

```js
app.notify({
  key: 'call', kind: 'call', persist: true, title: 'Ava Chen', text: 'Incoming call', data: { callId: 7 },
  tap: { act: 'showCall', label: 'Show call' },
  actions: [{ act: 'decline', label: 'Decline', tone: 'reject', icon: GLYPH }, { act: 'answer', label: 'Answer', tone: 'accept', icon: GLYPH }],
});
```

On a put-away phone the capsule peeks up like any notification. In game that phone has no mouse cursor, so its buttons can only be clicked once the phone is taken out.

## Mount mode: your own DOM, any library

`render` returns HTML strings that the phone patches into the screen. That suits small apps, but not React, Vue, Svelte, Preact or anything else that wants to own its DOM. Those use **mount mode**: give the module `mount` instead of `render`, and the phone hands your app a box it never touches.

```js
WhipPhone.module({
  id: 'garage', name: 'Garage', icon: GLYPH, statusBar: 'dark',
  css: `:host { background: #f3efe6 } .list { display: grid; gap: 10px }`,
  mount(app, el, view) { this.root = createRoot(el); this.root.render(<Garage app={app} view={view} />); },
  update(app, el, view, changed) { if (changed) this.root.render(<Garage app={app} view={view} />); },
  unmount(app, el) { this.root.unmount(); },
});
```

| Hook | When |
|---|---|
| `mount(app, el, view)` | the app opened. `el` is an empty box covering the whole display. Can be `async` (e.g. to load your bundle). |
| `update(app, el, view, changed)` | after every phone re-render while open. `changed` is `true` when your box moved to the other display (folded / unfolded) or the layout switched (controller / mouse): re-render for the new `view.size`. Otherwise you can ignore it. |
| `unmount(app, el)` | the app closed or the module was removed. Tear your library down. |

**How it behaves:**
- **One live instance.** Your box sits in the display in use and moves when the phone folds, so component state (an open card, a half-typed form, scroll) survives the fold. Lay out for both sizes with CSS (`.phone ...`, `.tablet ...` in your `css` work, so do container queries), or with `view.size` in JS.
- **The whole display is yours**, under the status bar and the home bar. Keep content inside `var(--safe-top)` and `var(--safe-bottom)` (in the controller layout `--safe-bottom` grows to clear the button-hint bar).
- **It starts from browser defaults.** None of the phone's styles reach into your box: not its fonts, colours or resets, and not its kit classes (your `.list` is your `.list`). Only CSS variables come through (`--accent`, `--safe-top`, `--text`...), so you can match the phone if you want to. Bring your own reset.
- **Everything else works as in render mode.** `app.request`, `app.notify`, `app.toast`, `on` pushes, `back`, `x`, `badge` and `statusBar`. Elements with `data-act` still run your `actions` if you like that style.
- **Controller:** ordinary `<button>`s, links, `role="button"` and `tabindex` elements are reachable with the D-pad, and A clicks them, so your `onClick` handlers run. `data-hint="Take out"` labels the A button.
- **Hooks run inside the phone's render.** Don't call `app.render()` from `mount` / `update`; it is ignored there. Your library re-renders itself.
- **3D works:** a WebGL canvas (three.js, Babylon, raw WebGL) in your box renders live on the phone's screen.
  - **Resize:** do it in `update` when `changed` is true.
  - **Pause:** stop your render loop in `presence(app, now)` while `now.visible` is false, and dispose in `unmount`.
  - **Fold:** create the renderer with `preserveDrawingBuffer: true`, so the fold animation can show its last frame.
  - **Cost:** it is a second WebGL context next to the phone's own, and NUI rendering costs game frames. Draw on demand or cap the frame rate where you can.
  - **three.js comes with the phone:** its page maps `three` (0.170) and `three/addons/`, so `await import('three')` works without shipping your own copy.
  - **Fold:** the fold animation re-photographs apps that draw on a canvas when it starts, so it folds with the current frame.
  - **Example:** `html/dev/example_3d/app.js` (Atlas) is a 3D map app with drag to orbit, tappable pins, controller support and pushes.
- **Working examples (both in the preview's default app list):**
  - `html/dev/example/app.js`: a light-themed Garage app built with Preact + htm, with an image, its own font and a canvas gauge;
  - `html/dev/example_3d/app.js`: Atlas, the 3D map.

## CSS

Your `css` is rewritten when the module registers, so it can only style your app:

| You write | It becomes |
|---|---|
| `button { }` | `:where(.m-<id>) button { }`: your buttons only. `:where()` adds no specificity, so the rule weighs what you wrote. |
| `.tablet .grid { }` | `.tablet :where(.m-<id>) .grid { }`. The display classes stay in front: `.phone`, `.tablet`, `.portrait`, `.console`, `.mk`, `.in-pad`, `.in-keys`, `.in-mouse`, `.sb-dark`, `.sb-light`. |
| `:host { }`, `body { }`, `html { }`, `:root { }` | your app's own box (in mount mode, the box you draw into, so colours and fonts set there are inherited by your content). |
| `@keyframes spin` | `@keyframes <id>--spin`, and your `animation`s are renamed to match, so two apps can both have a `spin`. |
| `url(img/bg.png)` | an absolute URL next to your module script. Fonts in `@font-face` work the same way. |
| `.m-<id> .x { }` | left alone (CSS you scoped by hand keeps working). |

- **Not supported:** `@import` (it is dropped with a warning). Put the rules in `css`, or load fonts with `@font-face`.
- **Reaching outside your app:** use `globalCss`.
- **Render-mode apps** still inherit the phone's look and kit classes. That is what makes the kit work. Mount-mode apps don't (see above).

## Images, fonts and canvases in the fold animation

The fold animation photographs both displays, and that picture can't load files by itself. The phone fills the gaps for you:
- **Images and fonts:** `<img>`, SVG `<image>`, `url()` in inline styles and in your `css` (fonts included) are copied in as data URLs, fetched once and cached.
  - In game, a file in your resource may not be fetchable from whip_phone's page. In that case whip_phone's Lua reads it (images and fonts up to 3 MB).
- **Canvases and videos** inside apps show their current frame. A WebGL canvas needs `preserveDrawingBuffer: true`, or it comes out blank. A canvas with pixels from another site can't be read and stays blank.
- **Mount-mode apps** appear on both displays during a fold (the other display gets a copy).

## The kit (`WhipPhone.kit`)

All builders return HTML strings.

| Builder | Makes |
|---|---|
| `screen(key, inner, { slide })` | a full app page. Give each sub-screen its own key; `slide` animates it in. |
| `nav({ back, title, right, act, d })` | the top bar; its back button runs `os:back` unless you give `act`. |
| `navBtn(icon, act, d, hint)` | an icon button for `nav.right`. |
| `title(text)` | the big page title. |
| `search({ bind, value, placeholder })` | a search field. |
| `scroll(inner, { bottom })` | a scrolling body; `bottom` keeps a chat pinned to the newest message. |
| `list(rows, { header, footer, inset })` | a grouped list. |
| `row({ icon, av, label, sub, value, act, d, chev, toggle, sel, tone, hint, html })` | a list row. It is pressable when it has `act`; `tone: 'danger'` makes it red. |
| `button({ label, act, d, kind, icon, block })` | a button; `kind` is `gray`, `red`, `green` or `ghost`. |
| `field({ label, bind, value, placeholder, type, enter, mode })` | a labelled input row. |
| `seg(options, value, act)` | a segmented control. |
| `tabs(tabs, value, act)` | a bottom tab bar. |
| `empty({ icon, title, text, action })` | an empty state. |
| `avatar({ name, size })` | initials in a circle. |
| `bubble({ me, text })`, `day(text)`, `composer({ bind, value, send })` | chat pieces. |
| `sheet({ title, body, close })` | a bottom sheet (a card on the tablet). |
| `split(side, main, key)` | the tablet's two-column layout. |

**Formatting helpers:**
- `esc`: escape text into HTML. Always escape data you put in HTML.
- `data(obj)`: turns an object into `data-*` attributes.
- `digits`, `fmtNumber`: phone numbers as digits / as `xxx-xxx-xxxx`.
- `fmtTime`, `fmtWhen`, `fmtDuration`, `toMs`, `initials`.

## Rules that keep it working

- **Interactivity:** anything with `data-act` is clickable and reachable with the controller automatically. Add `data-hint="Call"` to label the A button.
- **Core actions:** use `os:` actions for the shell (`os:back`, `os:home`); never reuse those names.
- **No iframes:** the fold animation snapshots the DOM, and an iframe can't be copied into it. Use mount mode instead.
- **Isolation:** keep state in `app.state` and keep `render` free of side effects. CSS is scoped for you. A module that throws is logged once and shows an error screen; it never takes the phone down.
- **Testing in the browser:** add your module to `html/preview.html` (or to `?modules=` for built-ins) and answer its requests in `html/dev/mock.js`. The example app shows how: `example` in the module list loads `dev/example/app.js` the way another resource's module would load.
