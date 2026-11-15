Config = {}

-- Open / close key. Players can rebind it (Settings > Key Bindings > FiveM > "Phone: open / close"). A new default
-- reaches only players who have not bound the key yet.
Config.OpenKey = 'F3'

-- Answer / decline a call ringing in, with the phone out or put away. Players can rebind them too ("Phone: answer a
-- call", "Phone: decline a call"). A new default reaches only players who have not bound the key yet.
Config.AnswerKey = 'Y'
Config.DeclineKey = 'U'

-- Folded phone height as a share of the screen height (the open tablet sizes itself to the screen).
Config.PhoneSize = 0.5

-- Built-in app modules, in html/modules/<id>/module.js. A module whose folder is deleted is simply skipped, and with
-- no modules at all the phone still works with an empty home screen. A new one also needs its own line in
-- fxmanifest.lua's files { } or players never receive it. Other resources add apps with
-- exports.whip_phone:RegisterModule (docs/MODULES.md).
Config.Modules = { 'phone', 'messages', 'bank', 'business', 'settings', 'skillcheck' }

-- Built-in apps only developers see: players with dev tools who turned developer mode on in /w. They come and go as
-- it is switched. Each also needs its own line in fxmanifest.lua's files { }.
--   skilltest   Skill Check Tester: plays any skill check (the ring or a phone game) at any level, with the numbers
--               changed for the test (they are never saved: config.lua stays as it is)
Config.DeveloperApps = { 'skilltest' }

-- The framework must answer the 'whip_phone:session' callback before the phone opens (refuse it for "no phone / no
-- SIM"). false lets the phone open without one (development).
Config.RequireSession = true

-- Status-bar clock: true = in-game time, false = the player's real clock.
Config.GameClock = true

-- whip_core BlockControls groups held while the phone has focus (walking stays free).
Config.BlockControls = { 'combat', 'look', 'vehicleCombat', 'weaponWheel' }

-- What the player holds while the phone is out: an emote's /e name from whip_core's emote list
-- (whip_core/shared/emote_list.lua). The tablet one plays while the phone is unfolded. '' plays nothing.
-- A player already in an emote (sitting, leaning) is left as they are.
Config.Emotes = {
    phone  = 'phone',    -- a phone held to read and type
    tablet = 'tablet',   -- a tablet held in both hands
}

-- Look and sound on a fresh phone; the player's own choices (Settings app) come back with the session. The layout is
-- not set here: it follows what the player uses (a controller or the mouse and keyboard) on its own.
--   wallpaper    dusk, aurora, ocean, sunset, berry, lagoon, citrus, neon, ember, glacier, orchid, midnight
--                (colourful gradients, made by the phone: html/core/wallpaper.js)
--   ringtone     marimba, classic, oldphone, digital, chimes, pulse, arcade, vibrate, silent
--   messageTone  note, tritone, ding, glass, pop, blip, knock, chord, vibrate, none   (a text arriving)
--   notifyTone   the same list                                                         (any other notification)
--   soundVolume  0 to 100 (the Settings app offers 25, 50, 75 and 100)
-- The sounds are made by the phone itself (html/core/sounds.js), no files. Each SIM keeps its own choices.
Config.Defaults = {
    wallpaper   = 'dusk',
    ringtone    = 'marimba',
    messageTone = 'note',
    notifyTone  = 'ding',
    soundVolume = 75,
}

-- ---------------------------------------------------------------- numbers and SIM cards (Josh, 7 Oct 2026)
-- A number belongs to a character. A SIM card carries one: put it in any phone and you call and text as
-- that number, with its contacts and messages. A SIM bought in a shop gets a new number for its buyer;
-- one made for nobody (a stash, a reward) gets one for whoever first puts it in a phone.

-- New numbers start with one of these, then 7 random digits.
Config.NumberPrefixes = { '689', '041', '227', '869', '915' }

-- Seconds an unanswered call rings before it is missed.
Config.RingSeconds = 30

-- How many of a number's messages and calls the phone loads.
Config.MessageHistory = 300
Config.RecentCalls = 50

-- ---------------------------------------------------------------- the sound of a call (the voice system)
-- A call carries what each side says with their normal talk key; the people around them still hear them as
-- usual. The voice system plays it; the phone only says how it sounds (a recipe: a list of blocks — every block
-- and setting is listed in whip_voice/shared/sound_blocks.lua). Tune it by ear. whip_voice plays all of it.
Config.CallSound = {
    { 'band', low = 300, high = 3400 },          -- the telephone band: no lows, no highs
    { 'drive', k = 1.5 },                         -- a little codec grit
    { 'compress', threshold = -24, ratio = 4 },   -- even, like a phone line
    { 'noise', kind = 'pink', level = 0.008 },    -- a faint line hiss, only while they talk
    { 'gain', db = -2 },
}

-- How far a phone on speaker carries, in metres (1-30). The people near it hear the other side, and the
-- other side hears them, each within their own voice range of the phone.
Config.SpeakerRange = 8

-- What the phone shows, over everything, while no voice system (whip_voice) is running.
Config.VoiceDownText = 'Voice connection failed, is the voice resource started?'

-- ---------------------------------------------------------------- skill check games on the phone
-- whip's skill check can play one of these on the phone instead of the ring: the phone comes out unfolded to a
-- tablet, held to the game until it is over (no home, no folding, Back gives up). Pick one in the Director's Skill
-- Check card (Game), or from a script: exports.whip_core:SkillCheck(source, 'hard', { game = 'phone.reroute' }).
-- Every input is a single press, so a controller and a keyboard play the same game at the same difficulty.
--
-- A player with no phone is told this, and nothing starts. It is not a fail: they can try again with a phone.
Config.SkillGameNoPhone = 'You need a phone!'

-- Each game has three levels: easy, medium and hard. `seconds` is a level's clock (running out is a fail).
-- `enabled = false` takes a game out (the Director stops offering it). Times are in seconds unless they say Ms.
Config.SkillGames = {
    -- BRUTE FORCE: letters scroll through a reel; press as the reel's letter crosses the line to lock it.
    --   reels: how many · speed: letters a second · letters: on each reel · window: how close to the line counts
    --   (0.5 = half a letter) · missCost: seconds a miss costs · set: 'clear' (no lookalikes), 'mixed' or 'all' ·
    --   lookalikes: 8 and B, O and 0 right beside the real letter · bothWays: every other reel scrolls the other way
    bruteforce = {
        easy   = { reels = 4, speed = 3.2, letters = 12, window = 0.32, missCost = 2, set = 'clear', lookalikes = false, bothWays = false, seconds = 25 },
        medium = { reels = 6, speed = 4.4, letters = 16, window = 0.27, missCost = 3, set = 'mixed', lookalikes = false, bothWays = false, seconds = 32 },
        hard   = { reels = 8, speed = 5.6, letters = 20, window = 0.22, missCost = 4, set = 'all',   lookalikes = true,  bothWays = true,  seconds = 40 },
    },
    -- CODE RECALL: a code flashes one arrow at a time; enter it back. Each round is longer.
    --   rounds: the code's length each round · flashMs / gapMs: how long each arrow shows, and the pause after it ·
    --   mistakes: allowed (a mistake shows the code again) · newCode: a new code each round (otherwise it grows) ·
    --   lastBackwards: the last round is entered backwards
    coderecall = {
        easy   = { rounds = { 3, 4, 5 },    flashMs = 560, gapMs = 220, mistakes = 2, newCode = false, lastBackwards = false, seconds = 45 },
        medium = { rounds = { 4, 5, 6, 7 }, flashMs = 430, gapMs = 170, mistakes = 1, newCode = false, lastBackwards = false, seconds = 55 },
        hard   = { rounds = { 5, 6, 7, 8 }, flashMs = 330, gapMs = 130, mistakes = 0, newCode = true,  lastBackwards = true,  seconds = 60 },
    },
    -- FRAGMENT MATCH: slide each column until the middle line spells the code at the top, then check it.
    --   columns · letters: in each column · afterWrong: 'columns' (marks the wrong ones), 'count' (says how many) or
    --   'nothing' · lookalikes: beside the real one · wrongCost: seconds a wrong check costs
    fragmentmatch = {
        easy   = { columns = 4, letters = 6,  afterWrong = 'columns', lookalikes = false, wrongCost = 3, seconds = 40 },
        medium = { columns = 6, letters = 8,  afterWrong = 'count',   lookalikes = false, wrongCost = 4, seconds = 45 },
        hard   = { columns = 8, letters = 10, afterWrong = 'nothing', lookalikes = true,  wrongCost = 5, seconds = 50 },
    },
    -- OVERRIDE: arrows fall to a line; press each as it crosses. A press with nothing there is a miss too.
    --   lanes: 3 or 4 · arrows: how many · fallSeconds: top to line · windowMs: how early or late still counts ·
    --   gapMs: time between arrows, at least min and at most max · misses: allowed. Its clock is the track's length.
    override = {
        easy   = { lanes = 3, arrows = 14, fallSeconds = 1.9,  windowMs = 140, gapMs = { min = 620, max = 1000 }, misses = 4 },
        medium = { lanes = 4, arrows = 20, fallSeconds = 1.5,  windowMs = 110, gapMs = { min = 430, max = 760 },  misses = 3 },
        hard   = { lanes = 4, arrows = 26, fallSeconds = 1.15, windowMs = 85,  gapMs = { min = 300, max = 560 },  misses = 2 },
    },
    -- REROUTE: turn the tiles until a line of pipe runs from Power to Exit. Every grid can be solved.
    --   grid: 3 to 6 tiles a side · keepRight: share of the path's tiles already turned right (0-1) · decoys: how
    --   often each other tile is a straight, an elbow, a T or a dead end
    reroute = {
        easy   = { grid = 4, keepRight = 0.2,  decoys = { straight = 4, elbow = 5, tee = 1, dead = 0 }, seconds = 40 },
        medium = { grid = 5, keepRight = 0.15, decoys = { straight = 3, elbow = 5, tee = 2, dead = 1 }, seconds = 50 },
        hard   = { grid = 6, keepRight = 0.1,  decoys = { straight = 3, elbow = 4, tee = 3, dead = 2 }, seconds = 60 },
    },
    -- SAFE CRACK: turn the dial a notch at a time; the right number gives a heavy click. Set it, turn the other way.
    --   numbers: in the combination · hint: within how many notches the clicks get heavier (0 = the exact number
    --   only) · wrongCost: seconds a wrong number costs · wrongRestarts: a wrong number goes back to the first
    safecrack = {
        easy   = { numbers = 2, hint = 2, wrongCost = 3, wrongRestarts = false, seconds = 40 },
        medium = { numbers = 3, hint = 1, wrongCost = 4, wrongRestarts = false, seconds = 50 },
        hard   = { numbers = 4, hint = 0, wrongCost = 4, wrongRestarts = true,  seconds = 60 },
    },
    -- STABILISE: hold to push the needle up, let go and it falls; keep it in the band while the drill works.
    --   band: its size (share of the gauge) · bandSpeed: how fast it moves · drillSeconds: time in the band needed ·
    --   leaving: how fast the drill loses progress outside the band (0 = it only pauses) · overheatSeconds: in the red
    stabilise = {
        easy   = { band = 0.26, bandSpeed = 0.07, drillSeconds = 7,  leaving = 0,    overheatSeconds = 1.6, seconds = 25 },
        medium = { band = 0.2,  bandSpeed = 0.11, drillSeconds = 9,  leaving = 0.25, overheatSeconds = 1.3, seconds = 30 },
        hard   = { band = 0.14, bandSpeed = 0.16, drillSeconds = 11, leaving = 0.5,  overheatSeconds = 1.0, seconds = 36 },
    },
}

Config.Debug = false
