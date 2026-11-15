# whip_phone: the framework contract

This is every request the phone's core and built-in modules make, and every push they listen for. **whip_phone answers them itself** (Josh, 7 Oct 2026). It keeps its own tables, made and migrated by `server/schema.lua` when it starts. The handlers are in `server/contract.lua` (session, settings, contacts, messages, the SIM page), `server/calls.lua` (calls and Recents) and `server/blocks.lua` (the block list). It is the one whip satellite that talks to the database directly; everything else goes through whip_core's exports.

## Numbers and SIM cards (Josh, 7 Oct 2026)

- **A number belongs to a character.** A character may own several, and may lock any of them (Settings > SIM). A locked number works in no phone.
- **A SIM card carries one number.** Its metadata is `{ phoneNumber, owner }`.
  - **Any phone takes any SIM.** It goes in the phone's SIM tray (right-click the phone > SIM tray).
  - **Whoever holds the phone is that number:** they call and text as it, and see its contacts, messages and calls.
- **Character-private apps** (bank, business) always use the person holding the phone (`player` in the handler), whatever SIM is in.
- **Where a SIM's number comes from.** Its number is made with the card (whip_core tells an item's generator who it is for):
  - **bought in a shop or given to a player:** a new number for that player;
  - **made for nobody** (a stash, a Director reward): blank, and given a number the first time it is put in a phone, for whoever does.
  - The number is written to `phone_numbers` the first time the SIM is used (`server/numbers.lua` says why).
- **The phone item** keeps the SIM tray and the phone's look (`settings`: DND, and the wallpaper while it has no SIM). A phone handed over keeps its look. The layout is not a setting: it follows the input (a controller gives the console layout, the mouse and keyboard the other).
- **The wallpaper** goes with the SIM (`prefs.wallpaper`): someone using your SIM sees your wallpaper. A SIM with none shows the phone's own; its owner's phone wallpaper is moved onto it the first time.
- **The sounds** go with the SIM too (`prefs.ringtone`, `messageTone`, `notifyTone`, `soundVolume`; Settings → Sounds): someone using your SIM hears your ringtone. A SIM with none uses the phone's own, else `Config.Defaults`. The sounds are made by the page (`html/core/sounds.js`, Web Audio, no files), heard by whoever holds the phone. A call or text rung in carries its SIM's sounds (`sounds` in the push), so it rings right even before the phone has been opened.
- **The home screen's arrangement** goes with the SIM (`prefs.home`):
  - **mouse:** drag an app onto any slot, empty or not (an app there swaps), or hold it at the screen's edge to carry it to the next page;
  - **pad:** X on an app = Move, the D-pad carries it, LB / RB move it a page, A / B / X put it down.
- **The server works out the phone and SIM on every request** (`server/sim.lua`). It uses the phone the player opened by its own Use (while they still carry it), else the phone in the Phone accessory slot, else the first in the pockets. The hotkey, the F1 wheel and the Open export open the first phone and forget a phone chosen by Use (`session`'s `first`, below). The page never names the number.

| Session `sim` | Means |
|---|---|
| `ok` | the number works (`session.number` is set) |
| `nosim` | no card in the tray |
| `locked` | its owner locked the number |
| `blank` | the card could not be given a number |

**Tables:** `phone_numbers` (number, owner charId, locked), `phone_contacts`, `phone_messages`, `phone_calls` and `phone_blocks`, all keyed by number. whip_core's admin Phones panel edits them too, by number (all but `phone_blocks`: whip_phone moves a changed number's blocks itself).

## How a request travels

```
module (JS)  app.request('send', { number, text })
  -> page    bridge.request('whip_phone:messages:send', args)
  -> client/main.lua  NUI callback 'request'  (only names under whip_phone: or a registered module's namespace)
  -> Whip.core:Callback('whip_phone:messages:send', args)
  -> server  exports.whip_core:SecureCallback('whip_phone:messages:send', schema, fn(source, player, args))
```

- **The schema declares `args`:** `params = { { 'args', 'any' } }`. whip_core hands a handler only the params its schema names, so without that line every request arrives as `{}` (11 Oct 2026: typed names and numbers acted as if they were empty). whip_phone's own handlers get it from `PhoneSchema` (`server/main.lua`).

- **Success:** whatever the handler returns becomes the module's data. `nil` is fine and means "nothing".
- **Refusal:** return `false, 'reason'`. The module receives the reason (`err.reason`), and the built-in modules show it to the player.
- **Timeouts:** `Whip.core:Callback` times out after 10 s. A timeout is treated as a refusal.

**Times** can be `os.time()` seconds or milliseconds; the UI accepts both. **Phone numbers** are digit strings such as `'6895550142'`; the UI formats them as `689-555-0142`, matching inventory `format = 'phone'`.

## Pushing to the phone

Use these from the server:

| Call | Effect |
|---|---|
| `exports.whip_phone:Push(src, module, event, data)` | runs the module's `on[event](data)` |
| `exports.whip_phone:Notify(src, { app, title, text, kind, args })` | shows a notification capsule (peeks if the phone is put away) |
| `exports.whip_phone:Open(src, 'phone' or 'tablet')` / `Close(src)` | opens or closes it for the player (e.g. a script that needs the tablet) |
| `exports.whip_phone:SetSession(src, session)` | replaces the number, name and settings while the phone is up |

The plain event `TriggerClientEvent('whip_phone:client:push', src, module, event, data)` works the same as `Push`.

**Notification fields:**
- **kind:** `chat` (white), `command` (Signal Blue, "needs you"), `success`, `error`, `warning`, or `call` (green). `call` gets through Do Not Disturb.
- **sound:** a new capsule plays the SIM's notification sound (Messages' plays its message tone), unless Do Not Disturb is on or it is a `call`. `sound = false` keeps one quiet. `sounds = { ringtone, messageTone, notifyTone, soundVolume }` (as `PhoneDB.sounds(number)` gives them) sets which, for a phone that has not been opened yet.
- **app:** a module id (its icon is used). Unknown ids get a bell.
- **args:** handed to that module when the notification is tapped.
- **key, persist, actions, tap, data:** capsules with buttons that stay up (docs/MODULES.md). Their buttons run the app module's actions, so they are for modules, not plain framework notifications.

## Callbacks: core

| Name | args | Return |
|---|---|---|
| `whip_phone:session` | `{ first }` (true: the hotkey, the F1 wheel or the Open export opened it, so the first phone, and a phone chosen by its own Use is forgotten) | `{ number, name, sim, settings, card, mine }`, or `false, 'reason'` to refuse opening (no phone item). No SIM, or a locked one, still opens (`sim` says which). `card` is the number's contact card (below); `mine` is true when this player owns the number |
| `whip_phone:settings:save` | `{ wallpaper, dnd, ringtone, messageTone, notifyTone, soundVolume }` | `true` (the wallpaper and the sounds on the SIM in the phone, each written only when it changed; the rest on the phone item) |
| `whip_phone:home:save` | `{ home = { phone = { [appId] = slot }, tablet = { ... } } }` | `true`. The home screen's arrangement (slot = page × per-page + place; the phone's grid is 16 a page, the tablet's 24). Kept on the SIM (`phone_numbers.prefs`), or on the phone while it has no SIM; it comes back as `session.home` |
| `whip_phone:settings:numbers` | nothing | `{ current, state, numbers = { { number, locked }, ... } }`: the character's own numbers (Settings > SIM) |
| `whip_phone:settings:lock` | `{ number, locked }` | `true`, or `false, 'reason'` (not your number). Whoever holds that SIM is refreshed at once |
| `whip_phone:settings:card` | `{ name, picture, frame = { x, y, z } }` | the card as kept, `{ name, picture, frame }` (`{}` for none), or `false, 'reason'`. Settings > My card. Only the number's owner may change it, with its SIM in their phone. `picture` must pass whip_core's `CheckPicture` (`Config.LorePictureLinks`: Fivemanage by default). Kept on the SIM (`phone_numbers.prefs.card`). Phones that have the number saved are told to reload their contacts |
| `whip_phone:contacts:list` | nothing | `{ { id, name, number, picture, pictureFrame, noBlock }, ... }`. `picture` is a lore character's picture, else the picture on the number's card; `pictureFrame` is `{ x, y, z }` or nil (the middle); `noBlock` is true for a lore character's number (the page offers no Block for it) |
| `whip_phone:contacts:save` | `{ id = nil (new) or id, name, number }` | the saved `{ id, name, number }` |
| `whip_phone:contacts:delete` | `{ id }` | `true` |

- **session:** asked every time the player opens the phone (refusing it keeps the phone shut). The page only reloads contacts and app data when the session it gets differs from the last one, so keep it small and stable. `settings` is what `settings:save` stored; leave it nil for a fresh phone.
- **contacts:** shared by every app (names on calls, texts and notifications). After changing contacts outside the phone, push `Push(src, 'contacts', 'changed')` and the phone reloads them.
- **noBlock:** set on contacts, Messages threads and Recents rows whose number is a lore character's (the Director's scenarios text and call from it). The page offers no Block for it, and `blocks:add` refuses it.
- **A picture's frame:** `{ x, y, z }`. `x` and `y` are the point of the picture kept in view, 0-100 across and down (50, 50 is the middle). `z` is the zoom, 1-3. The page draws it as `object-position: x% y%` with `scale(z)` about that same point (`kit.frameStyle`), so no gap shows at any zoom, whatever the picture's shape. whip_core's Director frames lore pictures the same way.

## Callbacks: Phone module (`whip_phone:phone:*`)

| Name | args | Return |
|---|---|---|
| `recents` | nothing | `{ { id, number, dir = 'in'/'out'/'missed', time, duration, noBlock }, ... }`, newest first. Calls from a number this SIM blocked are left out, even after an unblock |
| `dial` | `{ number }` | `{ callId, state = 'dialing' }` or `false, 'reason'` ("Number not in service", "Busy") |
| `answer` | `{ callId }` | `{ state = 'active', startedAt }` |
| `decline` | `{ callId }` | `true` |
| `end` | `{ callId }` | `true` |
| `mute` / `speaker` | `{ callId, on }` | `true`, or `false, 'reason'`: the page shows the change at once and puts it back if refused. Both work while downed, as `end` does |
| `dtmf` | `{ callId, key }` | `true` (optional, keypad presses during a call) |
| `inviteAnswer` | `{ token, yes }` | `true`, or `false, 'reason'` ("That question is gone": whip_core stopped waiting) |

**Pushes to `phone`:**
- **`incoming`** `{ callId, number }`: someone is calling. How it shows depends on what the player is doing:
  - phone put away, or the player is in an app: a call capsule with Decline / Answer. It stays up until the call is answered, declined or missed; a missed call turns it into a "Missed call" note;
  - phone out on the home or lock screen: the full incoming-call screen;
  - taking the phone out, going back to home, or tapping the capsule (X on a controller) while it rings switches to the full screen; putting the phone away switches back to the capsule;
  - answering from the capsule goes on to the full call screen.
- **`state`** `{ callId, state, startedAt?, reason? }`, where state is:
  - `ringing`;
  - `active` (send `startedAt`);
  - `ended`, `declined`, `busy`, `unavailable` or `missed` (an optional `reason` is shown).
- **`recents`** `[ ... ]`: replaces the list.
- **`invite`** `{ token, title, message, yes, no }`: a whip_core yes / no question (the Director's job invite). It shows as one generic yes / no notification capsule — a `?` for its icon, a cross (Decline) and a tick (Accept) — through Do Not Disturb, and it stays until it is answered (or `inviteGone`): not a call, no call screen. The player's answer goes back through `inviteAnswer`. whip_core sends it here through the `'phone'` ask channel (server/calls.lua, whip_core `RegisterAskChannel`) when the player carries a phone that can be used (the Phone module on, whip_voice running); otherwise it asks on screen.
- **`inviteGone`** `{ token }`: whip_core stopped waiting (its timeout, the job ending, a logout): it comes down. Sent by client/main.lua from whip_core's `whip_core:client:serverAskCancel`.

**A call, end to end:**
1. A dials B: A's `dial` returns `{ callId }`, and B gets push `incoming { callId, number = A }`.
2. Both sides get `state ringing`.
3. B answers. Both sides must still hold the numbers the call is between: a phone handed on while it rang can't be answered by whoever gave it away. Then:
   - the call's sound opens (a voice line in the voice system, below);
   - B's `answer` returns `active`;
   - A gets push `state active`.
4. Either side ends: that side's `end` call runs, and the other side gets push `state ended`.
5. Write a recents row for both sides.

**A call also ends when** a side logs out or disconnects, the SIM or phone leaves them (anything moved in their pockets, or the SIM tray), the number is locked, or the voice system stops. The other side gets `state ended` with the reason.

**A call from a blocked number** (the callee's SIM blocked the caller): the caller gets what an unblocked call would get (unavailable, `Busy`, or `ringing` and then `unavailable` "No answer" after `Config.RingSeconds`), but the callee is never rung and its line stays free. The row is marked `blocked` and stays out of the callee's Recents. Blocking a number whose call is ringing at that moment sends the callee `state declined` and lets the caller's side ring out the same way. An answered call goes on.

## Callbacks: Messages module (`whip_phone:messages:*`)

| Name | args | Return |
|---|---|---|
| `threads` | nothing | `{ { number, unread, last = { text, time, me }, noBlock }, ... }`, newest first |
| `thread` | `{ number }` | `{ { id, me, text, time }, ... }`, oldest first |
| `send` | `{ number, text }` | `{ id, time }` or `false, 'reason'`. To a SIM that blocked the sender: the same answer, and the text is kept for the sender's thread but never pushed to the blocker |
| `read` | `{ number }` | `true` |

**Blocked texts.** A text sent while the receiving SIM blocks its sender is stored with `blocked = 1`. The receiver's `threads` (conversations, last messages, unread counts) and `thread` leave it out, even after an unblock; the sender sees it as sent in their own thread.

**Pushes to `messages`:**
- **`incoming`** `{ id, number, text, time }`: send to the recipient when a text arrives. The module adds it to the chat, bumps unread and notifies, unless the player is looking at that chat. Never sent for a blocked text.
- **`threads`** `[ ... ]`: replaces the list.
- **`thread`** `{ number, messages }`: replaces one conversation.

## Callbacks: the block list (`whip_phone:blocks:*`)

The SIM's, like its contacts: whoever has the SIM in their phone sees and changes it, and it goes where the SIM goes (`server/blocks.lua`). The page keeps it as `app.blocks` (docs/MODULES.md), read with each session. Blocking is one-way: the blocker can still call and text the number they blocked.

| Name | args | Return |
|---|---|---|
| `list` | nothing | `{ { number, time }, ... }`, the latest block first (`time` in seconds) |
| `add` | `{ number }` | `true` (also when it is blocked already), or `false, 'reason'`: not 10 digits, the SIM's own number, a number not in service, a lore character's number, or 100 blocked already. A call from that number ringing this SIM now stops ringing |
| `remove` | `{ number }` | `true`. Its texts and calls from while it was blocked stay hidden |

Rate limits match contacts: `list` 250 ms (burst 6), `add` and `remove` 500 ms (burst 3).

**Nothing tells the blocked number:** every answer its phone gets (a text sent, a call ringing out, `Busy`, unavailable) is one an unblocked number could get. **Lore characters' numbers can't be blocked**, since the Director's scenarios text and call from them. Bank and Business send nothing from a number, so they have nothing to block.

## Callbacks: Bank module (`whip_phone:bank:*`)

The Bank app is whip_core's bank, asked as the player (`server/bank.lua`): every call goes through whip_core's bank exports with the player as the actor, so the bank's own rules apply (a transfer needs withdraw, sharing checks the sharer, closing checks the owner, `Config.MaxExtraAccounts` in whip_core limits savings and shared accounts). It is always the character holding the phone, whatever SIM is in it, and it needs a phone item.

| Name | args | Return |
|---|---|---|
| `accounts` | `{ watch }` (optional) | `{ { id, number, label, type, balance, role, default, frozen, job }, ... }`, the default first. `job` is the job's name for a business account. Watches them (live pushes) unless `watch = false` |
| `unwatch` | nothing | `true`. No more `changed` pushes until `accounts` is read again. The app sends it when it leaves the screen or the phone is put away (works without a phone in hand) |
| `account` | `{ id }` | `{ account, can = { transfer, share, close }, history = { { id, amount, dir = 'in'/'out', text, time, balance }, ... } }` (the last 30) |
| `transfer` | `{ from, to }` (one of your accounts) or `{ from, number }` (`WB-000000`, or its 6 digits), plus `amount` and an optional `message` (100) | `true` |
| `access` | `{ id }` | `{ { charId, name, role, me }, ..., { invite, charId, name, role, pending = true }, ... }`: who shares it, then the invites waiting for an answer (the owner and managers only). An invite's `name` is `#<charId>` unless its sender could see the name |
| `share` | `{ id, role, src }` (a nearby player) or `{ id, role, charId }` (typed) | `{ name, invited }`. Someone already on the account: their role changes (view, deposit, withdraw, manager: below your own). Anyone else gets an **invite** (`invited = true`) and is on the account only once they accept it on their own phone (8 Oct 2026, audit 9 NEW-2: a typed ID added straight away let the access list name anyone). `name` is nil when whip_core's name rule hides it. The owner and managers only; at most 10 invites waiting per account, one per person; an invite lasts a day, or until a restart |
| `invites` | nothing | `{ { invite, account, role, from }, ... }`: invites waiting for this character's answer (`account` is its name, `from` the sender's name) |
| `answer` | `{ invite, accept = true/false }` | `{ id }` (accepted: the account) or `true` (declined). The invited character only. Accepted, the bank adds them on the sender's authority, checked again then. The sender's phone is told: "Invite declined", or "Name accepted" |
| `uninvite` | `{ invite }` | `true`. Takes back an invite not yet answered (the owner or a manager of its account) |
| `unshare` | `{ id, charId }` | `true` |
| `nearby` | nothing | `{ { src, name, dist }, ... }`: players within 15 m in the same routing bucket whose name the player may see (whip_core's `CanSeePlayerName`, `Config.ShowPlayerNames`), nearest first (up to 10). Anyone else is picked by character ID |
| `open` | `{ label, type = 'savings'/'shared' }` | `{ id, number }` |
| `close` | `{ id }` | `true` (the owner; an empty savings or shared account) |

**Pushes to `bank`:** `changed` `{ ids }`: money moved on accounts the player's Bank app listed and is still watching (`whip_core:bank:balanceChanged`); the app reads them again. Only while the app is in front of the player (8 Oct 2026, audit 9 NEW-3): a watch used to last until the player disconnected. Money arriving in a character's own account (not a business's), that they did not move themselves, also shows a notification on their phone: "Received $250 · Rent", which opens that account. `invite` `{ invite, account, role, from }`: someone invites this character (the app shows a capsule with Decline and Accept, and lists it under Invitations). `inviteGone` `{ invite }`: its sender took it back. `shared` `{ id }`: an invite this character sent was answered (the Sharing list is read again).

## Callbacks: Business module (`whip_phone:business:*`)

The Business app is whip_core's jobs, asked with the player as `by` (`server/business.lua`), so the jobs system's own rules apply: the permissions (canHire, canFire, canPromote, canDemote, canManage), the rank rule (nothing at or above your own level, except at level 100), and a job's `selfClockOn = false`. Always the character holding the phone; it needs a phone item.

| Name | args | Return |
|---|---|---|
| `jobs` | `{ watch }` (optional) | `{ { id, name, icon, role, level, onDuty }, ... }` by name. Watches them (live pushes) unless `watch = false` |
| `unwatch` | nothing | `true`. No more `changed` pushes about jobs the app looked at until it reads them again (the app sends it when it leaves the screen) |
| `job` | `{ id, watch }` | `{ job = { id, name, icon, role, level, onDuty, selfClock }, can = { hire, fire, promote, demote, manage }, staff?, roles? }`. `staff` (`{ charId, name, roleId, role, level, onDuty, me, owner, unhired }`, highest first, the owner included) and `roles` (`{ roleId, name, level, give }`: `give` is whether this player may hand that rank to someone — below their own level, and nothing in it they lack; offer only those in Hire and Set Rank) only for a rank that manages people, and `offers` (`{ offer, charId, name, role }`: job offers not answered yet; `name` is `#<charId>` unless the sender could see it) |
| `clockOn` | `{ id }` | `true` (refused where the job puts people on duty itself) |
| `clockOff` | `{ id }` | `true` (works while down) |
| `setRole` | `{ id, charId, roleId }` | `true` |
| `fire` | `{ id, charId }` | `true` |
| `hire` | `{ id, roleId, src }` (nearby) or `{ id, roleId, charId }` (typed) | `{ name, offered }`. A **job offer** the other player accepts or declines on their own phone (8 Oct 2026, audit 9 NEW-2): nobody is hired until they say yes. `name` is nil when the name rule hides it. whip_core's rules are asked first (`CanHirePlayer`) and again at accept; one offer per person per job, at most 10 waiting per job, a day each |
| `offers` | nothing | `{ { offer, job, role, from }, ... }`: job offers waiting for this character's answer |
| `answerOffer` | `{ offer, accept = true/false }` | `{ id }` (accepted: the job) or `true` (declined). The sender's phone is told: "Job offer declined", or "Name accepted: hired as Rank" |
| `unoffer` | `{ offer }` | `true`. Takes back an offer not yet answered (anyone at that job who may hire) |
| `nearby` | nothing | as Bank's |
| `roles` | `{ id }` | `{ roles = { { roleId, name, level, permissions } }, perms = { { key, label, custom } }, level, have = { perms, bank } }` (canManage only; `perms` is the built-ins, then the job's own; `have` is what this player's own rank holds — a rank they save can be given no more, so grey out the rest) |
| `saveRole` | `{ id, roleId? , name, level, permissions = { [key] = bool, bankAccess } }` | `{ roleId }`: a new rank without `roleId`. Permissions not named keep their value |
| `deleteRole` | `{ id, roleId }` | `true` (refused while anyone holds it) |

**Pushes to `business`:** `changed` `{ id }`: someone was hired, fired, re-ranked or went on or off duty at a job the player's app looked at, or the job changed (the `whip_core:job:*` events). The person it happened to gets it too. `offer` `{ offer, job, role, from }`: someone offers this character a job (a capsule with Decline and Accept, and the Job offers list). `offerGone` `{ offer }`: its sender took it back.

## Client side (other resources)

**Exports:**
- `exports.whip_phone:Open('phone' or 'tablet')`, `Close()`, `IsOpen()`, `GetState()` (`hidden` / `peek` / `phone` / `tablet`);
- `Notify(n)` and `Push(module, event, data)`: client-local versions of the server ones;
- `RegisterModule(def)` and `UnregisterModule(id)`: apps from other resources (docs/MODULES.md); each resource manages only its own apps, and both answer `true` or `false, why`. They can use their own DOM and any UI library (mount mode), with CSS scoped to them automatically.
- `RunApp(id, args)`: opens the phone **held to one app** and waits for its answer (call it from a thread). The phone comes out unfolded to a tablet (or unfolds, if it is out) on that app: no home, no folding, no other app, Back is the app's own, and every game control is held off as whip's skill check ring holds them. Back the app does not take (its `back()` answers anything but `true`: it has none, or it is at its top level) gives up, as putting the phone away does. It answers the app's `app.done(result)` table, or `{ passed = false, why = 'cancelled' }` when the phone is put away (the key, a death, a logout, being knocked down) or Back gives up; `nil, why` when it cannot start (`'busy'`: held already, `'dead'`, `'no app'`, `'not ready'`). Afterwards the phone goes back to how it was. `IsHeld()` says whether one is running. The skill check games use it.

**Skill check games:** the seven in `html/modules/skillcheck` (a hidden app) are whip_core skill check games, `phone.bruteforce`, `phone.coderecall`, `phone.fragmentmatch`, `phone.override`, `phone.reroute`, `phone.safecrack` and `phone.stabilise`: `exports.whip_core:SkillCheck(source, 'hard', { game = 'phone.reroute' })`, or the Director's Skill Check card. `shared/skillgames.lua` lists them and times each level (the fastest honest pass, the server's timeout); `server/skillgames.lua` registers them and refuses a player with no phone (`Config.SkillGameNoPhone`, and nothing starts); `client/main.lua` plays them with `RunApp`. Their levels are `Config.SkillGames`.

**Events:**
- `whip_phone:client:opened` (bool): the player took or released the phone, i.e. NUI focus. Not for a phone-in-hand animation: the phone plays its own (**In hand**, below), and a second one fights it. To change what is held, set `Config.Emotes`.
- `whip_phone:client:state` (`hidden` / `peek` / `phone` / `tablet`): what is on screen.

**What the client does for you:**
- **Focus:** `SetNuiFocus` with `SetNuiFocusKeepInput`, dropped while the player types.
- **whip_core:** `SetScreenOpen(true, 'phone', { keepHud = true })` (chat and prompts make way; the HUD stays up), and `BlockControls('whip_phone', { groups = Config.BlockControls })`.
- **The HUD makes room:** the page reports where the phone will sit (`area`, from html/core/duo.js), and the client hands it to whip_core's `SetScreenArea`. Its vehicle dial moves up over notifications peeking from the corner, left beside the phone, and fades while the tablet leaves it no room.
- **Controller:** read in Lua by whip_core's `Whip.padScreen` and forwarded as `cmd` messages, since FiveM's browser has no Gamepad API. D-pad up opens the phone (`RegisterPadAction('phone')`).
- **In hand:** whip_core's `phone` emote while the phone is out, swapped for `tablet` while it is unfolded (`Config.Emotes`). A player already in another emote is left alone. A drawn weapon is put away first (whip_core's `FreeHands`).
- **Death:** the call is hung up (server/calls.lua, the other side hears it end) and the phone is put away. It does not open again until the player is back up.

## whip_core integration notes

**Phone numbers.** whip_phone makes these tables itself (`server/schema.lua`, 7 Oct 2026); whip_core never did. whip_core's admin Phones panel (`server/devtools.lua`) reads and writes them, by number, and calls `exports.whip_phone:ReloadCache()` after a change. whip_phone then re-reads its numbers, and open phones refetch their session.
- `phone_numbers`: several per character, 10 digits, prefixes 689 / 041 / 227 / 869 / 915 (`Config.NumberPrefixes`), and a `locked` flag. A number the panel deletes or changes is **retired**, never removed (`retiredAt`, and `renamedTo` for a change, 8 Oct 2026): a SIM card carries its number, and a removed one came back the next time its phone opened. A deleted number's cards stop working; a changed number's cards are written over with the new number when their phone is next used. A retired number is never handed out again;
- `phone_contacts`, `phone_messages`, `phone_calls`;
- `phone_blocks` (the SIM's number, the number it blocked, when): kept in memory as the numbers are. `phone_messages` and `phone_calls` carry `blocked` (1: sent or rung while the receiver blocked the sender). The panel does not touch `phone_blocks`: after its `ReloadCache`, whip_phone moves a changed number's blocks to the number it became and drops a deleted number's.

**Items** (done 7 Oct 2026, `server/items.lua`):
- whip_phone registers `phone` (a panel item with a one-slot SIM tray) and `sim_card` (made for its receiver; a shop makes it for the buyer).
- The phone in use is the one last opened from its own menu, else a phone in accessory strip slot 1, else the first phone anywhere on the character (`Sim.phoneOf`). Slot 1 is whip_core's Phone slot, and while whip_phone runs it takes phones only (`server/items.lua` registers it). `sim_card`'s `phoneNumber` shows as `xxx-xxx-xxxx`.
- `whip_phone:session` refuses a player with no phone item.

**Calls and voice (7 Oct 2026).** The sound of a call is the voice system's (whip_voice). No phone code is in it:
- **The line:** `server/calls.lua` opens a voice line at answer (`Whip.voice('OpenLine', ...)`, which calls whichever voice system whip_core says is running) and closes it when the call ends. Mute and speaker are `SetLineMuted` / `SetLineSpeaker` (`whip_voice/docs/LINES.md`).
- **Talking:** a call carries what each side says with their normal talk key, and the people around them hear them as usual.
- **Speaker:** the people near the phone hear the other side, and the other side hears them too.
- **How it sounds:** `Config.CallSound`, a recipe of whip_voice's sound blocks (`whip_voice/shared/sound_blocks.lua`). `Config.SpeakerRange` sets how far the speaker carries.
- **When no voice system is running:** dialling is refused, and every phone shows `Config.VoiceDownText` over everything until one is back (`client/main.lua`, the shell's `status` message). whip_voice is not a dependency.

**Notifications.** whip_core's `Notify` carries text and 4 kinds only, and nothing else can put a banner in the HUD capsule. So the phone owns its own capsule-style notifications. Whether to add an app-notification API to the capsule is a framework decision.

**Banking and Business.** The old phone's server-rendered apps in whip_core are gone. They are the Bank and Business modules now (`html/modules/bank` + `server/bank.lua`, `html/modules/business` + `server/business.lua`), on whip_core's bank and job exports. whip_core does not know the phone exists. The old `RegisterApp` / `RegisterAppHandler` / `AppHTML` exports went with them; `ReloadCache` stays (`server/main.lua`).

**Keybind.** No phone key exists in whip_core (its emote menu is on the F1 wheel, with no key). whip_phone uses `Config.OpenKey = 'F3'`, labelled "Phone: open / close". A call ringing in can be answered or declined without opening the phone: `Config.AnswerKey = 'Y'` ("Phone: answer a call") and `Config.DeclineKey = 'U'` ("Phone: decline a call"), the same as its Answer and Decline buttons. Players rebind all three in GTA's Settings > Key Bindings > FiveM.

## Trying it without the game

`html/preview.html` runs the real core and modules on `html/dev/mock.js`, a stand-in that answers every callback above from sample data:
- calls ring and connect, except Ray, who never answers;
- contacts text back;
- the dev bar fires an incoming text, an incoming call and framework notifications.

The mock is a good reference for the exact shapes.
