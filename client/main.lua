-- whip_phone client: opens and closes the phone, owns NUI focus, tells the page which modules to load, and forwards
-- every module request to the framework (whip_core SecureCallbacks, see docs/FRAMEWORK.md). No phone data lives here:
-- the framework answers every request.

local RES = GetCurrentResourceName()
local nuiReady = false
local open = false          -- the player is using the phone (it has NUI focus)
local view = 'hidden'       -- what the page shows: hidden | peek | phone | tablet
local external = {}         -- module id -> { id, resource, ns, script } (apps from other resources)
local queue = {}            -- page messages sent before the page was ready

local function debug(...) if Config.Debug then print('[whip_phone]', ...) end end

local function nui(msg)
    if nuiReady then SendNUIMessage(msg) else queue[#queue + 1] = msg end
end

-- ---------------------------------------------------------------- modules
-- THE DEVELOPER APPS (Config.DeveloperApps): only while this player's developer mode is on (/w), coming and going as
-- it is switched (whip_core:devtools:modeChanged). Whatever one asks the server, the server checks again.
local devOn = false

--- A built-in app, added to `list` when its file is there.
local function builtIn(id, list)
    local path = ('html/modules/%s/module.js'):format(id)
    if LoadResourceFile(RES, path) then
        list[#list + 1] = { id = id, script = ('modules/%s/module.js'):format(id) }
    else
        debug(('module %s skipped: %s is not there'):format(id, path))
    end
end

--- Is this one of the developer apps?
local function isDevApp(id)
    for _, m in ipairs(Config.DeveloperApps or {}) do if m == id then return true end end
    return false
end

local function moduleList()
    local list = {}
    for _, id in ipairs(Config.Modules) do builtIn(id, list) end
    if devOn then
        for _, id in ipairs(Config.DeveloperApps or {}) do builtIn(id, list) end
    end
    for _, m in pairs(external) do
        list[#list + 1] = { id = m.id, script = m.script, ns = m.ns, external = true }
    end
    return list
end

--- An app from another resource. def = { id = 'mybank', script = 'html/phone_app.js', ns = 'my_bank' }
--- script is a path inside the calling resource (list it in that resource's files{}); ns prefixes the callback names
--- its requests use (defaults to the resource name). Call it again after whip_phone restarts (onResourceStart).
---
--- A RESOURCE MANAGES ONLY ITS OWN APPS (Josh, 8 Oct 2026; audit 10, DX-2 — whip's registry rule): an id another
--- running resource registered is refused, naming it; the same resource registering again replaces its own; a
--- stopped resource's apps go (onResourceStop below). UnregisterModule takes away only the caller's own.
exports('RegisterModule', function(def)
    local res = GetInvokingResource()
    if not res then return false, 'call RegisterModule from your own resource' end
    if type(def) ~= 'table' or type(def.id) ~= 'string' or #def.id > 32 or not def.id:match('^[a-z][a-z0-9_%-]*$') then
        return false, 'id must be lowercase letters, digits, _ or -'
    end
    for _, id in ipairs(Config.Modules) do
        if id == def.id then return false, 'that id is a built-in module' end
    end
    if isDevApp(def.id) then return false, 'that id is a built-in module' end
    local held = external[def.id]
    if held and held.resource ~= res and GetResourceState(held.resource) == 'started' then
        return false, ('the phone app "%s" belongs to %s'):format(def.id, held.resource)
    end
    local script = tostring(def.script or 'html/module.js'):gsub('^/+', '')
    local m = { id = def.id, resource = res, ns = def.ns or res, script = ('https://cfx-nui-%s/%s'):format(res, script) }
    external[def.id] = m
    if nuiReady then SendNUIMessage({ type = 'module', module = { id = m.id, script = m.script, ns = m.ns, external = true } }) end
    debug(('module %s registered by %s'):format(m.id, res))
    return true
end)

exports('UnregisterModule', function(id)
    local res = GetInvokingResource()
    local m = external[id]
    if not m then return false, ('there is no phone app "%s"'):format(tostring(id)) end
    if m.resource ~= res then return false, ('the phone app "%s" belongs to %s'):format(tostring(id), m.resource) end
    external[id] = nil
    nui({ type = 'unmodule', id = id })
    return true
end)

AddEventHandler('onResourceStop', function(res)
    for id, m in pairs(external) do
        if m.resource == res then external[id] = nil; nui({ type = 'unmodule', id = id }) end
    end
end)

-- Developer mode switched: the developer apps come or go. A page not loaded yet gets them with its list ('ready').
AddEventHandler('whip_core:devtools:modeChanged', function(e)
    local on = type(e) == 'table' and e.on == true
    if on == devOn then return end
    devOn = on
    if not nuiReady then return end
    for _, id in ipairs(Config.DeveloperApps or {}) do
        if on then
            local one = {}
            builtIn(id, one)
            if one[1] then SendNUIMessage({ type = 'module', module = one[1] }) end
        else
            SendNUIMessage({ type = 'unmodule', id = id })
        end
    end
end)

-- ---------------------------------------------------------------- the voice system (the sound of calls)
-- While no voice system runs (whip_voice, or another voice resource: whip_core says), the
-- phone shows Config.VoiceDownText over everything, and cannot be used (Josh, 7 Oct 2026). Back the moment one
-- starts again.
local function voiceState()
    nui({ type = 'status', voiceDown = not Whip.voiceSystem(), voiceDownText = Config.VoiceDownText })
end
AddEventHandler('whip_core:voice:systemChanged', voiceState)

-- ---------------------------------------------------------------- focus, open, close
-- The focus and a controller: whip's pad reader for screens (Whip.padScreen). No mouse cursor while a pad drives the
-- phone (Josh, 7 Oct 2026); the mouse brings it back. The page gets the commands its keys use (os.command: up down
-- left right a b x y lb rb menu); A's release too, for hold actions. Game input is kept with the mouse as well, so the
-- player walks with the phone out — the stick is theirs, not the phone's.
-- The D-pad's and RB's releases go too, and a held D-pad's repeats say so (rep): an app that reads the buttons
-- itself (a skill check game) steps a held direction at its own pace, the same on a pad as on a keyboard.
local screen = Whip.padScreen({
    buttons   = { 'up', 'down', 'left', 'right', 'a', 'b', 'x', 'y', 'lb', 'rb', 'menu' },
    stick     = false,
    releases  = { a = true, up = true, down = true, left = true, right = true, rb = true },
    keepInput = 'always',
    -- the pad buttons that would act in the world too: jump, get in, cover, reload, melee, sprint
    block     = { controls = { 21, 22, 23, 24, 25, 37, 44, 45, 140, 141, 142, 143, 257, 263, 264 } },
    onButton  = function(cmd, down, rep) nui({ type = 'cmd', cmd = cmd, down = down, rep = rep }) end,
    onDevice  = function() end,   -- the page has no cursor of its own to hide: the focus is it
})

-- IN HAND WHILE IT IS OUT (Config.Emotes): the phone held to read and type, swapped for a tablet when it unfolds
-- (Josh, 12 Oct 2026) and back when it folds. An emote the player was already in (sitting, leaning...) is left
-- alone, and so is one they ended or changed themselves: only ours is swapped or stopped.
local ours = false   -- the hands are the phone's: nothing else was playing when it came out, and the player kept it so
local held = nil     -- the emote we started, while it is still playing

local function emoteFor(mode)
    local e = Config.Emotes == nil and mode or Config.Emotes[mode]
    return type(e) == 'string' and e ~= '' and e or nil
end

--- mode: 'phone' or 'tablet' to hold that one, nil to put it away. starting: the phone is just coming out.
local function inHand(mode, starting)
    local now = Whip.core:IsEmoting()
    if held and now ~= held then ours, held = false, nil end   -- ended or changed by the player
    if starting then ours = not now end
    local want = ours and mode and emoteFor(mode) or nil
    if not mode then ours = false end
    if want == held then return end
    if not want then
        Whip.core:CancelEmote()   -- ours, still playing (checked above)
        held = nil
    elseif held or not now then
        -- COMING OUT OVER A DRAWN GUN, IT IS PUT AWAY FIRST (Josh, 16 Oct 2026): whip_core's FreeHands asks whatever
        -- holds the hands (whip_gunny holsters, with its animation) and waits for it; the phone emote, refused
        -- while armed, then plays. Only as the phone comes out: unfolding to a tablet keeps what is in the hands.
        if starting then
            Whip.core:FreeHands()
            -- FreeHands waits for the holster: the phone put away meanwhile (a check called off, a death, the key
            -- again) gets no phone in the hand afterwards
            if not open then ours = false return end
        end
        if Whip.core:PlayEmote(want) == true then
            held = want            -- replaces ours; refused (still armed, in a car), ours stays
        end
    end
end

local blockWarned = false     -- Config.BlockControls refused: said once per session (setOpen)

-- PUT AWAY BY WHAT HAPPENS TO YOU (Josh, 3 Nov 2026): the phone listens for what puts it away (a death, a logout,
-- being knocked down, whip_core going) rather than checking for them again before it opens, which would hold the open
-- up. Each of those runs closePhone, which bumps this: an open still waiting for the server's session when one came
-- sees it changed and does not come out (audit 20, PHN-3).
local putAway = 0
local closePhone   -- (below)

-- KNOCKED DOWN PUTS IT AWAY. GTA has no ragdoll event, so while the phone is out (and only then) it looks five times
-- a second, as whip_core's progress bar does (client/ui.lua). Held to an app, that is giving up.
local RAGDOLL_LOOK_MS = 200
local watching = 0            -- one watch per time the phone comes out
local function watchKnockedDown()
    watching = watching + 1
    local mine = watching
    CreateThread(function()
        while open and watching == mine do
            Wait(RAGDOLL_LOOK_MS)
            if open and watching == mine and IsPedRagdoll(PlayerPedId()) then
                closePhone()
                return
            end
        end
    end)
end

--- mode: what it opens as ('phone' or 'tablet'), for what goes in the hand.
local function setOpen(on, mode)
    if open == on then return end
    open = on
    if on then watchKnockedDown() end
    if on then screen:open() else screen:close() end
    if on then
        -- Chat and prompts make way. THE HUD STAYS (keepHud, Josh 7 Nov 2026): the status HUD, the minimap and the
        -- vehicle dial stay up while the phone is used, and the dial moves out of the phone's way (SetScreenArea, 'area').
        Whip.core:SetScreenOpen(true, 'phone', { keepHud = true })
        -- and Start / Esc (199, 200): the pause menu stays shut while the phone is up, and naming 200 tells whip the
        -- phone owns Esc (audit 10, DX-3: this was a DisableControlAction loop of its own in client/controller.lua)
        -- THE ANSWER IS READ (audit 11, DX-3): one wrong name in Config.BlockControls refused the whole block, Start and
        -- Esc with it, and nothing said so. Said once, with whip_core's reason (it lists the real group names), and
        -- the pause keys blocked on their own so Esc stays the phone's.
        local blocked, why = Whip.core:BlockControls('whip_phone', { groups = Config.BlockControls, controls = { 199, 200 } })
        if blocked ~= true and GetResourceState('whip_core') == 'started' then
            if not blockWarned then
                blockWarned = true
                print(('^3[whip_phone] Config.BlockControls was refused: %s. Only Start / Esc are blocked while the phone is up.^7')
                    :format(tostring(why)))
            end
            Whip.core:BlockControls('whip_phone', { controls = { 199, 200 } })
        end
    else
        Whip.core:UnblockControls('whip_phone')
        Whip.core:UnblockControls('whip_phone:keys')   -- (an app that took every key: the page says so too)
        Whip.core:SetScreenOpen(false, 'phone')
    end
    inHand(on and (mode or 'phone') or nil, on)
    TriggerEvent('whip_phone:client:opened', on)
end

--- first: an open that takes the FIRST phone (the hotkey, the F1 wheel, the Open export), so the server forgets a phone
--- chosen by its own Use. A refresh, or Use on a phone, keeps the choice.
local function loadSession(first)
    local session, reason = Whip.core:Callback('whip_phone:session', { first = first == true })
    if not session then
        if Config.RequireSession then return nil, reason end
        session = {}
    end
    return session
end

-- The page reloads contacts and every app's data when it gets a session, so it only gets one when something in it
-- changed: reopening the phone costs one session check, not a refetch of everything (live changes arrive as pushes).
local sentSession = nil       -- json of the last session the page got
local function sendSession(session, force)
    local key = json.encode(session)
    if force or key ~= sentSession then sentSession = key; nui({ type = 'session', session = session }) end
end

--- Used from the inventory: the inventory makes way, so the phone is not drawn over it (Josh, 12 Oct 2026).
local function inventoryAway()
    if Whip.core:IsInventoryOpen() == true then Whip.core:CloseInventory() end
end

--- mode: 'phone' (folded, cover display) or 'tablet' (opened straight into tablet mode)
--- fromItem: opened by Use on a phone (whip_phone server/items.lua): that phone, not the first.
local function openPhone(mode, fromItem)
    mode = mode == 'tablet' and 'tablet' or 'phone'
    -- NOT WHILE DOWN (Josh, 16 Oct 2026: a death hangs up and puts the phone away). The key mapping fires through the
    -- death's control lock; the server refuses a dead player's session too, but not every server requires one.
    if Whip.core:IsPlayerDead() == true then
        Whip.core:Notify("You can't use your phone right now", 'error')
        return false
    end
    -- Put away while the server answered (closePhone: a death, a logout, knocked down, the key): it stays away.
    local mine = putAway
    if open then
        -- Use on another phone while one is up: the page takes that phone's session (its number, its settings).
        if fromItem then
            inventoryAway()
            local s = loadSession(false)
            if putAway ~= mine then return false end
            if s then sendSession(s) end
        end
        nui({ type = 'open', mode = mode })
        return true
    end
    local session, reason = loadSession(not fromItem)
    if putAway ~= mine then return false end
    if not session then
        -- Refused (no SIM, not your phone): the inventory stays up, under the reason.
        Whip.core:Notify(type(reason) == 'string' and reason or 'You need a phone', 'error')
        return false
    end
    inventoryAway()
    sendSession(session)
    setOpen(true, mode)
    -- pad: opened from a controller, so the page starts in the pad's layout (and the focus has no cursor)
    nui({ type = 'open', mode = mode, pad = screen:isPad() })
    return true
end

local endForced   -- (below: an app the phone is held to lets go first)

closePhone = function()
    putAway = putAway + 1   -- and an open still coming out does not (above)
    -- Put away while held to an app (the key, a death, a logout, knocked down): that is giving up.
    if endForced then endForced({ passed = false, why = 'cancelled' }) end
    if not open then return end
    setOpen(false)
    nui({ type = 'close' })
end

-- ---------------------------------------------------------------- an app the phone is held to (RunApp)
-- The phone comes out unfolded to a tablet (or unfolds, if it is out), opened on one app, and is HELD to it: no home,
-- no folding, no other app, Back is the app's own (a skill check game: Give up), every game control held off as the
-- skill check ring holds them. It lets go when the app answers (app.done(result) on the page), when it is called off
-- (endForced), or when it is put away (giving up). Afterwards it goes back to how it was: put away, or out as it was.
local forced = nil   -- { app, p, wasOpen, wasView }

endForced = function(result)
    local f = forced
    if not f then return end
    forced = nil
    Whip.core:UnblockControls('whip_phone:forced')
    nui({ type = 'unforce' })
    if not f.wasOpen then
        if open then setOpen(false); nui({ type = 'close' }) end
    elseif open and f.wasView == 'phone' then
        nui({ type = 'open', mode = 'phone' })
    end
    f.p:resolve(type(result) == 'table' and result or {})
end

--- Is this a phone app (built in, or another resource's)?
local function hasApp(id)
    for _, m in ipairs(Config.Modules) do if m == id then return true end end
    if devOn and isDevApp(id) then return true end
    return external[id] ~= nil
end

--- Open `id` on the phone, held to it, and wait for its answer. Blocks (call it from a thread).
---@param id string    the app (a module id)
---@param args table|nil  what it opens with (the module's open(app, args))
---@return table|nil result  the app's app.done(result); { passed = false, why = 'cancelled' } when put away
---@return string|nil why   with nil: 'busy' (held to one already), 'dead', 'no app', 'not ready'
local function runApp(id, args)
    if forced then return nil, 'busy' end
    if not hasApp(id) then return nil, 'no app' end
    if not nuiReady then return nil, 'not ready' end
    if Whip.core:IsPlayerDead() == true then return nil, 'dead' end
    local f = { app = id, p = promise.new(), wasOpen = open, wasView = view }
    forced = f
    -- Held still while it plays, as the ring holds the player (the page still hears the keyboard and the pad). Taken
    -- BEFORE anything waits (setOpen waits for the hands: a gun holstered), so an endForced meanwhile lets it go.
    Whip.core:BlockControls('whip_phone:forced', { all = true })
    if not open then
        inventoryAway()
        setOpen(true, 'tablet')
    end
    -- Called off while it came out (put away, a death, the run over): already answered, nothing shown
    if forced ~= f then return Citizen.Await(f.p) end
    nui({ type = 'force', app = id, args = type(args) == 'table' and args or {}, pad = screen:isPad() })
    return Citizen.Await(f.p)
end

RegisterNUICallback('forcedDone', function(data, cb)
    cb({})
    if forced and type(data) == 'table' and data.app == forced.app then endForced(data.result) end
end)

-- A shake on the controller (app.rumble on the page): a mouse and keyboard feel nothing.
RegisterNUICallback('rumble', function(data, cb)
    cb({})
    if not (open and screen:isPad()) then return end
    local ms = math.max(30, math.min(1000, math.floor(tonumber(type(data) == 'table' and data.ms) or 150)))
    local strength = math.max(0, math.min(1, tonumber(type(data) == 'table' and data.strength) or 0.6))
    SetPadShake(0, ms, math.floor(strength * 255))
end)

-- An app that takes every key is open (def.keys 'all': WASD, Space, Q and E are its own): walking and jumping held
-- off meanwhile, so those keys do nothing in the world.
RegisterNUICallback('keys', function(data, cb)
    cb({})
    if type(data) == 'table' and data.on == true and open then
        Whip.core:BlockControls('whip_phone:keys', { groups = { 'move' } })
    else
        Whip.core:UnblockControls('whip_phone:keys')
    end
end)

exports('RunApp', function(id, args) return runApp(id, args) end)
exports('IsHeld', function() return forced ~= nil end)

-- ---------------------------------------------------------------- the skill check games (shared/skillgames.lua)
-- The client half of each: whip_core's skill check asks for one (SkillCheck with { game = 'phone.reroute' }, the
-- Director's Skill Check card) and this plays it on the phone. The server half checks they have a phone first.
for _, g in ipairs(PhoneSkillGames.list()) do
    Whip.skillCheckGame(g.id, {
        -- A client script's SkillCheck({ game }) asks here (the server's asks server/skillgames.lua): no phone, no game
        -- (Josh, 31 Oct). From what this game already knows of the pockets: it must not wait.
        canStart = function()
            if (tonumber(Whip.core:GetItemCount('phone')) or 0) > 0 then return true end
            return false, Config.SkillGameNoPhone or 'You need a phone!'
        end,
        run = function(difficulty)
            local cfg = PhoneSkillGames.level(g.key, difficulty)
            if not cfg then return false, 'failed' end
            local result, why = runApp('skillcheck', { game = g.key, level = difficulty, cfg = cfg, label = g.name, goal = g.goal })
            if not result then return false, (why == 'busy' and 'busy') or 'cancelled' end
            if result.passed == true then return true end
            return false, (result.why == 'cancelled' or result.why == 'timeout') and result.why or 'failed'
        end,
        cancel = function()
            if forced and forced.app == 'skillcheck' then endForced({ passed = false, why = 'cancelled' }) end
        end,
    })
end

-- ---------------------------------------------------------------- the Skill Check Tester (a developer app)
-- html/modules/skilltest asks the server (server/skilltest.lua checks it is a developer), and the server hands the
-- test here. TEST RUNS ONLY: it plays with the tester's numbers, never saved, and nothing hangs on
-- the answer, which goes back to the app as a push ('result').
--   The ring: it takes no focus (whip_core reads the hands through the game) and will not start over a screen that
--   has it, so the phone is put away first, and comes back out with the answer.
--   A phone game: it plays on the phone as any skill check does (held to it), and the tester is back when it ends.
local testing = false

local function testAnswer(t, passed, why, ms, reason)
    nui({ type = 'push', module = 'skilltest', event = 'result', data = {
        game = t.game, level = t.level, passed = passed == true, why = passed ~= true and (why or 'failed') or nil,
        ms = tonumber(ms), reason = type(reason) == 'string' and reason or nil } })
end

RegisterNetEvent('whip_phone:client:skilltest', function(t)
    if type(t) ~= 'table' or type(t.settings) ~= 'table' then return end
    if testing or forced then return testAnswer(t, false, 'busy') end
    if not (devOn and Whip.core:HasDevTools() == true) then return testAnswer(t, false, 'not a developer') end
    testing = true
    CreateThread(function()
        if t.game == 'ring' then
            closePhone()
            local started = GetGameTimer()
            local passed, why = Whip.core:SkillCheck({ level = t.settings })
            local ms = GetGameTimer() - started
            openPhone('phone')
            testAnswer(t, passed, why, ms)
        else
            local g = PhoneSkillGames.info(t.game)
            if not g then
                testAnswer(t, false, 'no such game')
            else
                local result, why = runApp('skillcheck', { game = g.key, level = t.level, cfg = t.settings, label = g.name, goal = g.goal })
                if result then testAnswer(t, result.passed, result.why, result.ms, result.reason)
                else testAnswer(t, false, why) end
            end
        end
        testing = false
    end)
end)

RegisterCommand('+whip_phone', function()
    if open then closePhone() return end
    if Whip.core:IsGameInputFree() == false then return end              -- typing in chat or another UI has the keys
    CreateThread(function() openPhone('phone') end)
end, false)
RegisterCommand('-whip_phone', function() end, false)
RegisterKeyMapping('+whip_phone', 'Phone: open / close', 'keyboard', Config.OpenKey)

-- ANSWER / DECLINE A CALL FROM A KEY (Josh, 7 Nov 2026), with the phone out or put away. Players change them in GTA's
-- Settings > Key Bindings > FiveM. The page does it, as its Answer and Decline buttons do (html/modules/phone,
-- on.callKey), and only to a call ringing in: any other time the key does nothing.
local function callKey(which)
    -- Typing in chat or another UI has the keys; the phone's own focus is not that (its typing keeps the keys anyway)
    if not open and Whip.core:IsGameInputFree() == false then return end
    nui({ type = 'push', module = 'phone', event = 'callKey', data = { key = which } })
end
RegisterCommand('whip_phone_answer', function() callKey('answer') end, false)
RegisterCommand('whip_phone_decline', function() callKey('decline') end, false)
RegisterKeyMapping('whip_phone_answer', 'Phone: answer a call', 'keyboard', Config.AnswerKey or 'Y')
RegisterKeyMapping('whip_phone_decline', 'Phone: decline a call', 'keyboard', Config.DeclineKey or 'U')

-- ON THE F1 WHEEL (7 Oct 2026), for a player carrying a phone. Opening asks the server as the key does
-- (no phone: "You need a phone").
Whip.register(function()
    local ok, why = exports.whip_core:AddAction({
        id = 'phone', at = { radial = true }, label = 'Phone', icon = 'phone',
        description = 'Take out your phone',
        require = { item = 'phone' },
        onSelect = function() openPhone('phone') end,
    })
    if not ok then print('[whip_phone] no Phone on the wheel: ' .. tostring(why)) end
    -- On a controller: D-pad up unless the player put it elsewhere (the pause menu's Controller screen).
    local padOk, padWhy = exports.whip_core:RegisterPadAction('phone', { label = 'Phone', command = '+whip_phone', slot = 'dpad_up' })
    if not padOk then print('[whip_phone] no Phone on the controller: ' .. tostring(padWhy)) end
end)

-- ---------------------------------------------------------------- page -> Lua
RegisterNUICallback('ready', function(data, cb)
    nuiReady = true
    sentSession = nil                                            -- a (re)loaded page has no session yet
    devOn = Whip.core:HasDevTools() == true                     -- (whip_phone started with developer mode on)
    SendNUIMessage({ type = 'init', modules = moduleList(), config = {
        phoneScale = Config.PhoneSize, defaults = Config.Defaults, clock = Config.GameClock and 'game' or 'real',
    } })
    for _, m in ipairs(queue) do SendNUIMessage(m) end
    queue = {}
    voiceState()
    if data and data.error then print('[whip_phone] the page could not load the phone model: ' .. tostring(data.error)) end
    cb({})
end)

--- a callback name a module may use: the core and built-in modules use 'whip_phone:', other modules their own ns
local function allowed(name)
    if type(name) ~= 'string' or #name > 96 then return false end
    if name:sub(1, 11) == 'whip_phone:' then return true end
    for _, m in pairs(external) do
        if name:sub(1, #m.ns + 1) == m.ns .. ':' then return true end
    end
    return false
end

RegisterNUICallback('request', function(data, cb)
    local name = data and data.name
    if not allowed(name) then return cb({ ok = false, reason = 'not allowed' }) end
    CreateThread(function()
        local result, reason = Whip.core:Callback(name, data.args or {})
        if result == false then
            cb({ ok = false, reason = type(reason) == 'string' and reason or 'refused' })
        else
            cb({ ok = true, data = result })
        end
    end)
end)

-- the player put the phone away from the phone itself (Back at the top level); the page already hid it
-- (Held to an app, a close is giving up: the hold goes with it, so a page that lost its held state leaves none behind.)
RegisterNUICallback('close', function(_, cb)
    if forced then endForced({ passed = false, why = 'cancelled' }) end
    setOpen(false)
    cb({})
end)

-- The fold animation photographs the screen, and that picture can't load files: images and fonts in apps are copied
-- in as data: URLs. A file in another resource may not be fetchable from this page (cross-origin), so the page asks
-- here: https://cfx-nui-<resource>/<path> (or nui://) -> LoadResourceFile -> base64. Images and fonts only, <= 3 MB.
local ASSET_TYPES = {
    png = 'image/png', jpg = 'image/jpeg', jpeg = 'image/jpeg', gif = 'image/gif', webp = 'image/webp', svg = 'image/svg+xml',
    avif = 'image/avif', woff2 = 'font/woff2', woff = 'font/woff', ttf = 'font/ttf', otf = 'font/otf',
}
local B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
local PAIR = {}                      -- 12 bits -> 2 base64 characters
for i = 0, 4095 do
    local hi, lo = (i >> 6) + 1, (i & 63) + 1
    PAIR[i] = B64:sub(hi, hi) .. B64:sub(lo, lo)
end
local function base64(s)
    local out, n, k = {}, #s, 0
    local full = n - n % 3
    for i = 1, full, 3 do
        local a, b, c = s:byte(i, i + 2)
        local v = (a << 16) | (b << 8) | c
        k = k + 1; out[k] = PAIR[v >> 12] .. PAIR[v & 4095]
        if k % 20000 == 0 then Wait(0) end                       -- big files: spread over frames
    end
    if n - full == 1 then
        k = k + 1; out[k] = PAIR[s:byte(n) << 4] .. '=='
    elseif n - full == 2 then
        local v = (s:byte(n - 1) << 16) | (s:byte(n) << 8)
        local c = ((v >> 6) & 63) + 1
        k = k + 1; out[k] = PAIR[v >> 12] .. B64:sub(c, c) .. '='
    end
    return table.concat(out)
end
RegisterNUICallback('asset', function(data, cb)
    local url = type(data) == 'table' and type(data.url) == 'string' and data.url or ''
    local res, path = url:match('^https://cfx%-nui%-([^/]+)/([^?#]+)')
    if not res then res, path = url:match('^nui://([^/]+)/([^?#]+)') end
    if not res then return cb({}) end
    path = path:gsub('%%(%x%x)', function(h) return string.char(tonumber(h, 16)) end)
    local mime = ASSET_TYPES[(path:match('%.(%w+)$') or ''):lower()]
    if not mime or path:find('..', 1, true) or GetResourceState(res) ~= 'started' then return cb({}) end
    CreateThread(function()
        local raw = LoadResourceFile(res, path)
        if not raw or #raw == 0 or #raw > 3 * 1024 * 1024 then return cb({}) end
        cb({ data = ('data:%s;base64,%s'):format(mime, base64(raw)) })
    end)
end)

RegisterNUICallback('typing', function(data, cb)
    screen:typing(data and data.on == true)
    cb({})
end)

-- THE CALL'S VOLUME is the voice system's own "Phone call volume" (the pause menu's Server Settings, voice.callVolume;
-- whip_voice has it), read and changed here: the phone's Settings and Server Settings are
-- one setting. { value? } -> { value } (nil: no voice system offers it).
RegisterNUICallback('callVolume', function(data, cb)
    local v = type(data) == 'table' and tonumber(data.value) or nil
    if v then pcall(function() exports.whip_core:SetPlayerSetting('voice.callVolume', v) end) end
    local ok, now = pcall(function() return exports.whip_core:GetPlayerSetting('voice.callVolume') end)
    cb({ value = ok and tonumber(now) or nil })
end)

-- WHERE THE PHONE WILL SIT (html/core/duo.js #area), as fractions of the screen, or nil when it is out of sight: its
-- notifications peeking up, the phone, the tablet. whip_core's HUD makes room for it (SetScreenArea: the vehicle dial moves
-- up over the notifications, or left beside the phone; Josh, 7 Nov 2026). Kept, so a whip_core that comes back
-- (Whip.register below) hears it again.
local area = nil
local function sendArea()
    Whip.core:SetScreenArea(area or false, 'phone')
end
RegisterNUICallback('area', function(data, cb)
    cb({})
    local a = type(data) == 'table' and type(data.area) == 'table' and data.area or nil
    area = a and { left = tonumber(a.left), top = tonumber(a.top), right = tonumber(a.right), bottom = tonumber(a.bottom) } or nil
    if area and not (area.left and area.top and area.right and area.bottom) then area = nil end
    sendArea()
end)
-- whip_core (re)started: it forgot every area, so the phone's is said again (nothing to say while it is out of sight)
Whip.register(function() if area then sendArea() end end)

RegisterNUICallback('state', function(data, cb)
    view = data and data.state or view
    -- Unfolded into a tablet, or folded back: what is in the hand follows (sent once the fold has settled).
    if open and (view == 'phone' or view == 'tablet') then inHand(view) end
    TriggerEvent('whip_phone:client:state', view)
    cb({})
end)

-- ---------------------------------------------------------------- server / other resources -> page
RegisterNetEvent('whip_phone:client:push', function(module, event, data)
    nui({ type = 'push', module = module, event = event, data = data })
end)
RegisterNetEvent('whip_phone:client:notify', function(n)
    if type(n) == 'table' then nui({ type = 'notify', notification = n }) end
end)
RegisterNetEvent('whip_phone:client:session', function(session)
    sendSession(session, true)
end)
-- whip_core gave up on a question (its timeout, the run's end, a logout): if it was an invite ringing on this phone
-- (server/calls.lua, the 'phone' ask channel), its capsule and call screen come down. Any other question: nothing.
-- (whip_core's local news, whip_core:ask:cancelled { token }: not its network message, which is whip's own)
AddEventHandler('whip_core:ask:cancelled', function(e)
    if GetInvokingResource() ~= 'whip_core' or type(e) ~= 'table' then return end
    if e.token ~= nil then nui({ type = 'push', module = 'phone', event = 'inviteGone', data = { token = e.token } }) end
end)
RegisterNetEvent('whip_phone:client:open', function(mode, fromItem) CreateThread(function() openPhone(mode, fromItem == true) end) end)
RegisterNetEvent('whip_phone:client:close', closePhone)
-- the admin Phones panel changed numbers (exports.whip_phone:ReloadCache): refresh an open phone's session
RegisterNetEvent('whip_phone:client:refresh', function()
    if not open then return end
    CreateThread(function()
        local session = loadSession()
        if session then sendSession(session, true) end
    end)
end)

exports('Open', function(mode) CreateThread(function() openPhone(mode) end) end)
exports('Close', closePhone)
exports('IsOpen', function() return open end)
exports('GetState', function() return view end)
exports('Notify', function(n) if type(n) == 'table' then nui({ type = 'notify', notification = n }) end end)
exports('Push', function(module, event, data) nui({ type = 'push', module = module, event = event, data = data }) end)

-- ---------------------------------------------------------------- game clock on the status bar
CreateThread(function()
    local lastH, lastM
    while true do
        Wait(2000)
        if Config.GameClock and view ~= 'hidden' then
            local h, m = GetClockHours(), GetClockMinutes()
            if h ~= lastH or m ~= lastM then lastH, lastM = h, m; nui({ type = 'time', h = h, m = m }) end
        end
    end
end)

-- A LOGOUT PUTS THE PHONE AWAY (audit 10, CLI-5). Sent to the character screen with it out, it stayed drawn with its
-- focus, its control block and its screen claim, and the next character saw the last one's session until the phone
-- was reopened. The next open sends the new character's session whatever it is.
AddEventHandler('whip_core:player:logout', function()
    closePhone()
    sentSession = nil
end)

-- A DEATH PUTS IT AWAY (Josh, 16 Oct 2026: "when you die, close the phone if open, and end the call"). The server
-- hangs the call up (server/calls.lua); this takes the phone off the screen, with its focus and its control block —
-- which also kept the death screen's hide key from working.
AddEventHandler('whip_core:player:died', closePhone)
