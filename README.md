# whip_phone

The Duo phone for [WHIP](https://github.com/WHIPFX/txAdmin-recipe): a 3D phone that unfolds into a tablet. Calls,
texts, banking and jobs are apps, and every app is a module: leave out the ones you don't want, or add your own from
another resource.

## Features

- **A phone that folds.** The Duo sits in the bottom-right corner as a phone and unfolds into a tablet in the middle of
  the screen.
- **Calls.** Players call each other over [whip_voice](https://github.com/WHIPFX/whip_voice) and talk with their usual
  key. On speaker, the people around the phone join the call.
- **SIM cards.** A phone number lives on its SIM card. Put a SIM in any phone and you call and text as that number,
  with its contacts and messages. Its owner can lock a number so its SIM stops working.
- **Make it yours.** Wallpapers, ringtones and alert sounds, Do Not Disturb, a home screen you arrange, and a contact
  card with your name and picture.
- **Block a number.** Its texts and calls stop reaching your SIM, and its owner isn't told: their texts show as sent
  and their calls ring out. Block from a conversation in Messages or a number's page in Phone, and unblock in
  **Settings > Blocked numbers**. Lore characters can't be blocked.
- **Notifications.** They peek up from the corner while the phone is put away, and a ringing call can be answered
  without taking it out.
- **Mouse, keyboard or controller.** The layout follows what the player is using.
- **Skill check games.** Seven games on the tablet, such as Safe Crack and Reroute, for WHIP's skill checks and the
  Director.
- **Lore characters.** The Director's characters have phone numbers. They text players and call them with recorded
  lines.

## Apps are modules

The phone's core has no apps of its own. Each app is a module, and these come with it:

| App | What it does |
| --- | --- |
| Phone | Recents, contacts, keypad and the call screen |
| Messages | Text conversations |
| Bank | Accounts and their activity, transfers, opening savings and shared accounts, and sharing one |
| Business | Your jobs and duty and, for ranks that may, hiring, firing and ranks |
| Settings | Your contact card, wallpaper, sounds, SIM, blocked numbers, Do Not Disturb and installed apps |

`Config.Modules` lists the ones that load: `phone`, `messages`, `bank`, `business`, `settings` and `skillcheck`.
Take an id out and that app is gone from every phone. The phone works with any set, or none. Keep `skillcheck` for
the skill check games: it has no icon on the home screen.

Bank and Business act as the character holding the phone, whatever SIM is in it. Sharing an account and hiring send an
invite that the other player accepts on their own phone.

Other resources add apps of their own; see [For developers](#for-developers).

## Requirements

- `whip_core` and [oxmysql](https://github.com/WHIPFX/oxmysql).
- A voice system: [whip_voice](https://github.com/WHIPFX/whip_voice), or another voice resource set up as WHIP's
  voice system. Without one, the phone shows "Voice connection failed, is the voice resource started?" and can't be
  used.

## Installation

WHIP's txAdmin recipe installs it.

By hand, put `whip_phone` in your `resources` folder and add this line to `server.cfg`, after `ensure whip_core`:

```cfg
ensure whip_phone
```

whip_phone creates its own tables on its first start. There's no SQL to import.

## Getting a phone

1. Get a `phone` and a `sim_card` item: sell them in a shop, or take them from `/whip` → Economy → Items.
2. Right-click the phone in the inventory, choose **SIM tray**, and put the SIM in.
3. Press **F3**.

A SIM card gets a fresh number for whoever it's given to or bought by. One made for nobody, such as a SIM in a stash
or a Director reward, gets a number when it's first put in a phone.

## For players

| Key | Does |
| --- | --- |
| **F3** | Take the phone out or put it away |
| **Y** | Answer a ringing call |
| **U** | Decline a ringing call |

Players can rebind these in GTA's **Settings > Key Bindings > FiveM**. The phone is also on the F1 wheel and, on a
controller, on D-pad up.

The phone works with the mouse, or with the arrow keys, **Enter**, and **Esc** or **Backspace** to go back. On a
controller, **Y** folds and unfolds it; with the mouse, use the icon next to the clock to switch between phone and
tablet mode. The fold button in Control Centre also switches modes. Players can keep walking while the phone is out.

## For admins

- **`/whip` → Phones** lists every number. Open one to see whose it is and what it holds, change it, give yourself its
  SIM card, delete it, or read its messages and calls.
- **The Director's Lore cards** (Give Contact, Send Text and Phone Call) put lore characters on players' phones. Phone
  calls with recorded lines need whip_voice's voice bot: see **Lore phone calls** in WHIP's docs
  (`whip_core/docs.html`).
- **The Skill Check Tester** is an app that appears for admins with developer mode on (`/w`). It plays any skill check
  game at any level.

## Configuration

`config.lua` sets:

| Settings | What they control |
| --- | --- |
| `OpenKey`, `AnswerKey`, `DeclineKey` | The default keys |
| `PhoneSize` | The folded phone's height, as a share of the screen |
| `Modules`, `DeveloperApps` | Which apps load, for everyone and for developers |
| `Defaults` | A fresh phone's wallpaper, sounds and volume |
| `NumberPrefixes`, `RingSeconds`, `MessageHistory`, `RecentCalls` | Phone numbers, how long a call rings, and how much history the phone loads |
| `CallSound`, `SpeakerRange` | How a call sounds, and how far a phone on speaker carries |
| `Emotes` | What the player holds while the phone is out |
| `SkillGames` | Each skill check game's three levels |

## For developers

- **Your own app.** Register it from your resource with `exports.whip_phone:RegisterModule({ id, script })`; it goes
  when your resource stops. An app can use the phone's UI kit, or draw itself with any library (React, Vue, Preact),
  and its CSS is scoped to it. [docs/MODULES.md](docs/MODULES.md) is the guide, with working examples in
  `html/dev/example/app.js` (Preact) and `html/dev/example_3d/app.js` (three.js).
- **Exports.** On the server: `Notify`, `Push`, `Open`, `Close`, `SetSession`. On the client: `Open`, `Close`,
  `IsOpen`, `GetState`, `Notify`, `Push`, `RegisterModule`, `UnregisterModule`, `RunApp`, `IsHeld`. Every export,
  request and push is in [docs/FRAMEWORK.md](docs/FRAMEWORK.md).
- **Preview in a browser.** Serve the `html/` folder (for example `python -m http.server` inside it) and open
  `preview.html`. It runs the real phone on a mock server, with a bar to fire calls, texts and notifications.

## License

whip_phone is licensed under the GNU LGPL 3.0; see `COPYING.LESSER`, and `COPYING` for the GPL 3.0 it builds on.
`NOTICE.md` says what the licence doesn't cover, including three.js (MIT) and the phone's fonts (SIL Open Font License
1.1); `whip_core`'s `NOTICE.md` is the full list.
