-- Lore characters on the phone. whip_core's Director keeps the story's named NPCs (lore characters: Irwin Dundee,
-- the boss who hands out the jobs). Each one gets a phone number here that no character owns, so its contacts,
-- texts and calls are the same rows as any player's: the Messages app, Recents and the admin Phones panel show them
-- like anyone else's.
--
--   * A text TO one is kept and never answered. A call to one rings and is never picked up (server/calls.lua).
--   * Director cards (the Lore group): Give Contact puts it in the SIM's contacts, Send Text texts the player, Phone
--     Call rings the player and plays a recording as the character talking (whip_voice's voice bot).
--   * A player's lore text or contact goes to the SIM in their phone, else to a number of theirs (it waits there).
--   * /lorecall <recording> (dev tools): a lore character phones you with that recording, to hear the voice bot.

LorePhones = {}

local function say(fmt, ...) print(('[whip_phone] lore: ' .. fmt):format(...)) end

--- A lore character's number, made the first time (nil when lore numbers are off or the database refused).
function LorePhones.numberOf(key)
    if not PhoneDB.ready or not PhoneDB.lore or type(key) ~= 'string' then return nil end
    return Numbers.forLore(key)
end

--- Every lore character in use has a number (whip_phone starting, whip_core back).
function LorePhones.syncAll()
    if not PhoneDB.ready or not PhoneDB.lore then return end
    local list = Whip.core:GetLoreCharacters()
    for _, c in ipairs(type(list) == 'table' and list or {}) do
        if type(c) == 'table' and type(c.key) == 'string' and not Numbers.forLore(c.key) then
            say('^3%s has no number: the database refused it^7', c.key)
        end
    end
end

Whip.register(function() CreateThread(LorePhones.syncAll) end)
AddEventHandler('whip_core:lore:changed', function(e)
    if GetInvokingResource() ~= 'whip_core' then return end
    if type(e) == 'table' and type(e.key) == 'string' and not e.retired then
        CreateThread(function() LorePhones.numberOf(e.key) end)
    end
end)

--- A lore character's picture by its number, for a contact that has it (whip_core checked the link when it was
--- set: only the accepted sites), and its framing ({ x, y, z }, or nil: the middle). Checked again here as a plain
--- https address; nil, nil for none.
function LorePhones.pictureOf(number)
    local key = Numbers.loreOf(number)
    if not key then return nil, nil end
    local c = Whip.core:GetLoreCharacter(key)
    if type(c) ~= 'table' then return nil, nil end
    local url = c.picture
    if type(url) ~= 'string' or not url:match('^https://[%w%-%.]+/[%w%-%._/]+$') then return nil, nil end
    return url, type(c.pictureFrame) == 'table' and c.pictureFrame or nil
end

--- The number a player gets a lore character's text or contact on: the SIM in their phone, else a number of theirs
--- that is not locked. nil when they have none.
---@return string|nil
function LorePhones.numberFor(src)
    local player = exports.whip_core:GetPlayer(src)
    if not player then return nil end
    local n = Sim.numberOf(src, player)
    if n then return n end
    for _, own in ipairs(Numbers.ownedBy(player.charId)) do
        if not own.locked then return own.number end
    end
    return nil
end

--- Put a lore character in a player's contacts (on the number they get it on). 'given', 'had' (that SIM already has
--- the number), or 'nophone'; nil and why when it could not.
function LorePhones.giveContact(key, name, src)
    local lore = LorePhones.numberOf(key)
    if not lore then return nil, 'The lore character has no phone number' end
    local to = LorePhones.numberFor(src)
    if not to then return 'nophone' end
    local ok, had = PhoneDB.call('scalar', 'SELECT 1 FROM phone_contacts WHERE phoneNumber = ? AND contactNumber = ? LIMIT 1', { to, lore })
    if not ok then return nil, PhoneDB.NET_DOWN end
    if had then return 'had' end
    local iok, id = PhoneDB.call('insert', 'INSERT INTO phone_contacts (phoneNumber, contactName, contactNumber) VALUES (?, ?, ?)',
        { to, tostring(name):sub(1, 50), lore })
    if not iok or not id then return nil, PhoneDB.NET_DOWN end
    -- Whoever holds that SIM sees it now: the contacts again, and a notification.
    local holder = Sim.holderOf(to)
    if holder then
        TriggerClientEvent('whip_phone:client:push', holder, 'contacts', 'changed', {})
        TriggerClientEvent('whip_phone:client:notify', holder,
            { app = 'phone', title = 'New contact', text = tostring(name), kind = 'success' })
    end
    return 'given'
end

--- A lore character texts a player. 'sent', or 'nophone'; nil and why when it could not.
function LorePhones.sendText(key, src, text)
    text = tostring(text or ''):gsub('^%s+', ''):gsub('%s+$', '')
    if text == '' then return nil, 'Nothing to send' end
    if #text > 500 then text = text:sub(1, 500) end
    local lore = LorePhones.numberOf(key)
    if not lore then return nil, 'The lore character has no phone number' end
    local to = LorePhones.numberFor(src)
    if not to then return 'nophone' end
    local ok, id = PhoneDB.call('insert', 'INSERT INTO phone_messages (senderNumber, receiverNumber, content) VALUES (?, ?, ?)',
        { lore, to, text })
    if not ok or not id then return nil, PhoneDB.NET_DOWN end
    PhoneDB.deliver(to, { id = id, number = lore, text = text, time = os.time() })
    return 'sent'
end

--- A lore character phones a player: the phone they carry rings from its number; answered, the recording plays into
--- the call as the character talking (whip_voice's voice bot, server/calls.lua Calls.fromLore) and it hangs up when
--- done. Answers 'ringing' and the call's id (done(outcome, why) follows: 'answered', 'hungup', 'declined', 'missed',
--- 'failed', 'cancelled'), or at once 'busy' / 'nophone', or nil and why when it could not ring at all.
function LorePhones.call(key, name, src, audio, done)
    local lore = LorePhones.numberOf(key)
    if not lore then return nil, 'The lore character has no phone number' end
    local player = exports.whip_core:GetPlayer(src)
    local to = player and Sim.numberOf(src, player)   -- a call rings the phone in their hands (its SIM)
    if not player or not to then return 'nophone' end
    -- Down: they cannot take it (their phone is put away), so it does not ring (audit 20, PHN-4)
    if Calls.busy(src) or player.isDead then return 'busy' end
    local botKey, d = Whip.voice('CreateVoiceBot', { name = tostring(name), audio = audio })
    if not botKey then
        if tostring(d):find('CreateVoiceBot', 1, true) or tostring(d):find('no voice system', 1, true) then
            return nil, 'lore characters\' calls need whip_voice and its voice bot'
        end
        return nil, d
    end
    -- Rung by someone else while the bot joined: busy after all.
    if Calls.busy(src) then Whip.voice('RemoveVoiceBot', botKey) return 'busy' end
    local id, why = Calls.fromLore(lore, src, to, botKey, done)
    if not id then
        Whip.voice('RemoveVoiceBot', botKey)
        if why == 'busy' then return 'busy' end
        return nil, why
    end
    return 'ringing', id
end

-- ============================================
-- The Director's cards (the Lore group, whip_core's Director API)
-- ============================================

--- The lore character a card acts as (its field, else the scenario's own), or an error the run is told of.
local function loreOf(card)
    local c = card.props.lore
    if type(c) ~= 'table' or type(c.key) ~= 'string' then
        error('no lore character: pick one, or make the NPC that starts the scenario one', 0)
    end
    return c
end

--- Each player the card is for: the first 'given'/'sent' wins, then 'had', else 'nophone'.
local function forEach(card, fn)
    local best = 'nophone'
    for _, src in ipairs(card.props.who or {}) do
        local res, why = fn(src)
        if res == nil then error(why or 'the phone could not do it', 0) end
        if res ~= 'nophone' and res ~= 'had' then best = res
        elseif res == 'had' and best == 'nophone' then best = 'had' end
    end
    return best
end

Whip.card('phone.giveContact', {
    category = 'lore', categoryTitle = 'Lore', color = 'green', icon = 'phone',
    title = 'Give Contact',
    desc = 'Puts a lore character in the player\'s phone contacts: their name and number.',
    help = 'Saved on the SIM in their phone (else on a number of theirs). Skipped when it already has that number.',
    outputs = { 'given', 'had', 'nophone' },
    labels = { given = 'Given', had = 'Already had it', nophone = 'No phone' },
    props = {
        { key = 'lore', kind = 'lore', label = 'Whose' },
        { key = 'who', kind = 'players', label = 'To' },
    },
    testSays = 'Would give {lore}\'s contact to {who}',
    run = function(card)
        local c = loreOf(card)
        return forEach(card, function(src) return LorePhones.giveContact(c.key, c.name, src) end)
    end,
})

Whip.card('phone.sendText', {
    category = 'lore', categoryTitle = 'Lore', color = 'green', icon = 'phone',
    title = 'Send Text',
    desc = 'A lore character texts the player, as any number would.',
    help = 'From their number: named if the player has them in their contacts, else just the number. Replies go nowhere.',
    outputs = { 'sent', 'nophone' },
    labels = { sent = 'Sent', nophone = 'No phone' },
    props = {
        { key = 'lore', kind = 'lore', label = 'From' },
        { key = 'text', kind = 'text', label = 'Text', maxLength = 500, lines = 3, default = 'Change of plan. Check your map.' },
        { key = 'who', kind = 'players', label = 'To' },
    },
    testSays = 'Would text {who} from {lore}: {text}',
    run = function(card)
        local c = loreOf(card)
        local text = card.props.text
        return forEach(card, function(src) return LorePhones.sendText(c.key, src, text) end)
    end,
})

-- How a call to several players went, best first: someone heard it all, else hung up early, ...
local CALL_RANK = { answered = 6, hungup = 5, declined = 4, missed = 3, busy = 2, nophone = 1 }

-- [card.callId] = { [phone call id] = true }: a Phone Call card's calls still up, called off when it ends early.
local cardCalls = {}

--- A recording as the card takes it: a file a resource ships ("@my_story/audio/line.ogg", never downloaded by
--- players), or a plain https link to one. Which sites are accepted is the voice bot's (its config.json, Fivemanage
--- unless the server owner added more): it says so when the card runs.
local function recordingProblem(url)
    if type(url) ~= 'string' or url == '' then return 'Give it the recording: @resource/file.ogg, or a link' end
    if url:sub(1, 1) == '@' then
        if not url:match('^@[%w_%-%.]+/[%w%-%._/]+%.[%a%d]+$') or url:find('..', 1, true) then
            return 'A resource\'s recording is "@resource/folder/file.ogg"'
        end
        local ext = url:match('%.(%w+)$'):lower()
        if ext ~= 'mp3' and ext ~= 'ogg' and ext ~= 'wav' then return 'Only mp3, ogg and wav files are played' end
        return nil
    end
    if not url:match('^https://[%w%-]+%.[%w%-%.]+/[%w%-%._/]+$') or url:find('..', 1, true) then
        return 'The recording is "@resource/folder/file.ogg", or a plain https link to an audio file, like https://r2.fivemanage.com/.../call.mp3'
    end
    return nil
end

Whip.card('phone.call', {
    category = 'lore', categoryTitle = 'Lore', color = 'green', icon = 'phone',
    title = 'Phone Call',
    desc = 'A lore character phones the player: a recording plays as them talking, then they hang up.',
    help = 'It rings the phone the player carries, from the lore character\'s number. The recording (mp3, ogg or wav, up '
        .. 'to 2 minutes) is a file a resource ships, like @my_story/audio/line.ogg (players never download it), or a '
        .. 'link to one on Fivemanage. Needs whip_voice and its voice bot: /voicecheck says whether it is running.',
    outputs = { 'answered', 'hungup', 'declined', 'missed', 'busy', 'nophone' },
    labels = { answered = 'Heard it all', hungup = 'Hung up early', declined = 'Declined', missed = 'Missed', busy = 'Busy',
               nophone = 'No phone' },
    bad = { 'declined', 'missed', 'busy', 'nophone' },
    props = {
        { key = 'lore', kind = 'lore', label = 'From' },
        { key = 'recording', kind = 'text', label = 'Recording', maxLength = 255, required = true,
          hint = '@my_story/audio/line.ogg, or a Fivemanage link' },
        { key = 'who', kind = 'players', label = 'To' },
    },
    -- The ring (Config.RingSeconds), the recording (the voice bot's maxSeconds at most) and room to spare.
    timeout = 300,
    -- RUNS IN A BUILDER'S TEST TOO (Josh, 25 Oct 2026: testing a scenario should ring), sandboxed: only the one
    -- testing is rung. A call changes nothing kept but its Recents row.
    test = 'run',
    testSays = 'Would phone {who} as {lore}, playing {recording}',
    check = function(props)
        return recordingProblem(props.recording)
    end,
    run = function(card)
        local c = loreOf(card)
        local url = card.props.recording
        local bad = recordingProblem(url)
        if bad then error(bad, 0) end
        local mine = {}
        cardCalls[card.callId] = mine
        local results, pending, failed, ringing = {}, 0, nil, true
        local p = promise.new()
        local function settled(outcome, why)
            if outcome == 'failed' then failed = why or 'the call\'s sound could not start'
            elseif outcome ~= 'cancelled' then results[#results + 1] = outcome end
            pending = pending - 1
            if pending == 0 and not ringing then p:resolve(true) end
        end
        local who = card.props.who or {}
        if card.test then who = card.starter and { card.starter } or {} end   -- a Test rings the one testing, only
        for _, src in ipairs(who) do
            pending = pending + 1
            local res, idOrWhy = LorePhones.call(c.key, c.name, src, url, settled)
            if res == 'ringing' then
                mine[idOrWhy --[[@as number]]] = true   -- ringing comes with the call's id
            else
                pending = pending - 1
                if res == nil then failed = idOrWhy else results[#results + 1] = res end
            end
        end
        ringing = false
        if pending > 0 then Citizen.Await(p) end
        cardCalls[card.callId] = nil
        -- Nobody could be rung at all: the card did not work (the voice bot down, a refused recording).
        if #results == 0 and failed then error(failed, 0) end
        local best = 'nophone'
        for _, o in ipairs(results) do if (CALL_RANK[o] or 0) > (CALL_RANK[best] or 0) then best = o end end
        return best
    end,
    -- Gave up (Took Too Long) or its scenario ended while it rang or played: those calls end now.
    onEnd = function(callId)
        local mine = cardCalls[callId]
        cardCalls[callId] = nil
        for id in pairs(mine or {}) do Calls.cancel(id) end
    end,
})

-- ============================================
-- /lorecall: hear the voice bot without building a scenario
-- ============================================
--
--   /lorecall <recording> [lore character's key]      the recording: @resource/folder/file.ogg, or a link
--
-- A lore character phones YOU (the first one, unless a key is given) and plays the recording, as the Phone Call card
-- does. Dev tools only (whip.devtools with the /w switch on).

local CALL_SAYS = {
    answered = 'Heard it all: the voice bot works.', hungup = 'You hung up before it finished.',
    declined = 'You declined it.', missed = 'Nobody answered.', cancelled = 'It was called off.',
}

-- A player in game (their phone rings) with developer mode on: Whip.command's dev gate, in its own thread.
Whip.command('lorecall', { dev = true, console = false }, function(src, args)
    local function tell(text, bad)
        TriggerClientEvent('chat:addMessage', src, { args = { (bad and '^1' or '^2') .. '[lore call]^7 ' .. text } })
    end
    local url, key = args[1], args[2]
    local bad = recordingProblem(url)
    if bad then return tell(bad .. '. Use: /lorecall <@resource/file.ogg or a link> [lore character]', true) end
    do
        local list = Whip.core:GetLoreCharacters()
        local c
        for _, x in ipairs(type(list) == 'table' and list or {}) do
            if type(x) == 'table' and (not key or x.key == key) then c = x break end
        end
        if not c then
            return tell(key and ('No lore character "' .. key .. '".')
                or 'There is no lore character yet: make one in /whip > Director > Lore characters.', true)
        end
        tell(('%s is calling you (fetching the recording first)...'):format(tostring(c.name)))
        local res, idOrWhy = LorePhones.call(c.key, c.name, src, url, function(outcome, why)
            if outcome == 'failed' then tell('The call\'s sound did not start: ' .. tostring(why), true)
            else tell(CALL_SAYS[outcome] or tostring(outcome), outcome ~= 'answered') end
        end)
        if res == 'busy' then tell('You are already on a call.', true)
        elseif res == 'nophone' then tell('You need a phone with a SIM on you.', true)
        elseif res == nil then tell('It could not call: ' .. tostring(idOrWhy), true) end
    end
end)
