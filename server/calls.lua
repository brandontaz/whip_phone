-- Calls (the Phone module, whip_phone:phone:*): ringing, answering, declining and hanging up between two
-- numbers, and Recents. Who answers is whoever holds the called number's SIM at that moment.
--
-- THE SOUND IS THE VOICE SYSTEM'S (7 Oct 2026): an answered call is a voice line there (OpenLine,
-- whip_voice/docs/LINES.md) — what each side says with their normal talk key, through Config.CallSound,
-- the people around them hearing them as usual. On speaker, the people near the phone hear the other side (and,
-- where the voice system can, the other side hears them). No phone code lives in the voice system: this file
-- opens the line, puts a member on speaker or mute, and closes it. Every call is in phone_calls either way.
--
-- WHICHEVER VOICE SYSTEM RUNS: whip_voice, or another voice resource, asked through whip_core
-- (Whip.voice, lib/satellite.lua), never by name.
--
-- WITHOUT ONE (stopped, or none installed): dialling is refused with Config.VoiceDownText, and every phone shows
-- it over everything (client/main.lua). A call up when its voice system stops is ended.

local WRITE = { rateLimit = 500, burst = 3 }
local LIGHT = { rateLimit = 250, burst = 6 }
-- Hanging up, mute and speaker work while downed: they are not acts on the world, and a phone left on speaker
-- would otherwise play to everyone near with no way to turn it off.
local WRITE_DOWNED = { rateLimit = 500, burst = 3, whileDead = true }

--- [callId] = { id, row, caller, callerNumber, callee, calleeNumber, state = 'ringing'|'active', startedAt, lineId,
---   lineRes = the voice resource the line is on }
local calls = {}
--- [source] = callId: one call each
local inCall = {}
--- [voice line id] = callId
local byLine = {}
local nextId = 0

Calls = {}

local function push(src, event, data)
    if src then TriggerClientEvent('whip_phone:client:push', src, 'phone', event, data) end
end

-- ---------------------------------------------------------------- the voice system (the sound)

local function voiceDownText() return Config.VoiceDownText or 'Voice connection failed, is the voice resource started?' end

--- One of the voice system's exports, or false and why (never a throw; nothing when none runs).
local function voice(name, ...)
    if not Whip.voiceSystem() then return false, voiceDownText() end
    return Whip.voice(name, ...)
end

local function record(row, status, answered, ended)
    if not row then return end
    MySQL.update(('UPDATE phone_calls SET status = ?%s%s WHERE callId = ?'):format(
        answered and ', answeredAt = CURRENT_TIMESTAMP' or '', ended and ', endedAt = CURRENT_TIMESTAMP' or ''),
        { status, row })
end

--- A call that never connected, for Recents only (the called number was out of reach or busy). `blocked`: the callee
--- blocked the caller (server/blocks.lua), so it stays out of the callee's Recents.
local function recordMissed(fromNumber, toNumber, status, blocked)
    MySQL.insert('INSERT INTO phone_calls (callerNumber, calleeNumber, status, endedAt, blocked) VALUES (?, ?, ?, CURRENT_TIMESTAMP, ?)',
        { fromNumber, toNumber, status, blocked and 1 or 0 })
end

--- A call's row, out of its callee's Recents (they blocked the caller while it rang).
local function recordBlocked(row)
    if row then MySQL.update('UPDATE phone_calls SET blocked = 1 WHERE callId = ?', { row }) end
end

--- THE ONE PLACE A CALL ENDS: out of memory, and its sound with it. A lore character's call (Calls.fromLore) also
--- lets go of its voice bot and tells its card how it went: `outcome`, else failed (its sound could not start),
--- missed (still ringing) or hung up.
local function finish(call, outcome)
    calls[call.id] = nil
    if call.caller and inCall[call.caller] == call.id then inCall[call.caller] = nil end
    if call.callee and inCall[call.callee] == call.id then inCall[call.callee] = nil end
    if call.lineId then
        byLine[call.lineId] = nil
        voice('CloseLine', call.lineId)
        call.lineId, call.lineRes = nil, nil
    end
    if call.botKey then voice('RemoveVoiceBot', call.botKey); call.botKey = nil end
    if call.onOutcome then
        local fn = call.onOutcome
        call.onOutcome = nil
        fn(outcome or (call.failed and 'failed') or (call.state == 'ringing' and 'missed' or 'hungup'), call.failed)
    end
end

--- The call a player is part of, by the id the page sent. With no id (`own`): their one call (a page that hung up
--- before the dial's answer brought the id, or whose dial timed out: audit 20, PHN-1).
local function mine(source, args, own)
    local id = tonumber(args.callId)
    if id == nil and own then id = inCall[source] end
    local call = calls[id or -1]
    if not call or (call.caller ~= source and call.callee ~= source) then return nil end
    return call
end

--- The other side of a call, or nil when there is none in the game: a blocked call (no callee rings) or a lore
--- character's. Not `a and b or c`: with no callee that answered the caller themself, and a blocked caller who hung
--- up was told 'missed' as if the call had rung out, which an unblocked caller never is.
local function other(call, source)
    if call.caller == source then return call.callee end
    return call.caller
end

--- A player leaving ends their call: the other side hears it end.
local function hangUp(source, reason)
    local call = calls[inCall[source] or -1]
    if not call then return end
    local far = other(call, source)
    if call.state == 'ringing' then
        record(call.row, 'missed', false, true)
        push(far, 'state', { callId = call.id, state = 'missed', reason = reason })
    else
        record(call.row, 'answered', false, true)
        push(far, 'state', { callId = call.id, state = 'ended', reason = reason })
    end
    push(source, 'state', { callId = call.id, state = 'ended', reason = reason })
    finish(call)
end

--- Both sides still hold the numbers the call is between (the phone in hand, that SIM in it), or not. A lore
--- character's call has only the callee to ask.
local function stillTheirs(call)
    if call.caller and Sim.numberOf(call.caller) ~= call.callerNumber then return false, call.caller end
    if call.callee and Sim.numberOf(call.callee) ~= call.calleeNumber then return false, call.callee end
    return true
end

--- The sound of an answered call: a voice line between the two (the voice system). Answers its id, or false and why.
local function openLine(call)
    local v = Whip.voiceSystem()
    local lineId, why = voice('OpenLine', {
        members = { call.caller, call.callee }, track = 'voice', pickup = true, minMembers = 2,
        recipe = Config.CallSound, speakerRange = Config.SpeakerRange or 8,
        -- The voice system let go of one of them (they left, logged out): the call ends for the other.
        onLeave = function(_, src) if inCall[src] == call.id then hangUp(src, 'Call dropped') end end,
        onEnd = function(lineId)
            local id = byLine[lineId]
            if id and calls[id] then byLine[lineId] = nil; calls[id].lineId = nil; hangUp(calls[id].caller, 'Call dropped') end
        end,
    })
    if not lineId then return false, why end
    call.lineId, call.lineRes = lineId, v and v.resource or nil
    byLine[lineId] = call.id
    return lineId
end

AddEventHandler('playerDropped', function() hangUp(source, 'Call dropped') end)
-- Logging out ends a call: the next character on this source must not inherit it.
AddEventHandler('whip_core:player:logout', function(e) if type(e) == 'table' and e.source then hangUp(e.source, 'Call ended') end end)
-- DYING ENDS IT TOO (Josh, 16 Oct 2026: "for the phone, it's a hangup situation and close the phone"), ringing or
-- answered; the other side hears it end. The client closes the phone itself (client/main.lua).
AddEventHandler('whip_core:player:died', function(e) if type(e) == 'table' and e.source then hangUp(e.source, 'Call ended') end end)

--- The phone or its SIM changed hands (anything moved in their pockets, the SIM tray): a call whose number they
--- no longer hold ends. Whoever no longer holds that SIM must not keep hearing the other side.
function Calls.recheck(src)
    local call = calls[inCall[src] or -1]
    if not call then return end
    local ok, who = stillTheirs(call)
    if not ok then hangUp(who, 'Call ended') end
end
AddEventHandler('whip_core:inventory:changed', function(e)
    local src = type(e) == 'table' and e.source or nil
    if src and inCall[src] then Calls.recheck(src) end
end)

--- A number was locked: a call on it ends (found by the number: the one who locks it may not hold the SIM).
function Calls.numberLocked(number)
    for _, call in pairs(calls) do
        if call.callerNumber == number then hangUp(call.caller, 'Number locked')
        elseif call.calleeNumber == number and call.callee then hangUp(call.callee, 'Number locked') end
    end
end

--- The SIM with `by` blocked `number` (server/blocks.lua): a call from it still ringing there stops ringing, as if
--- declined, and leaves the callee's Recents. The caller is told nothing: their side rings on and runs out as any
--- unanswered call ("No answer", the dial's timer), with nobody at the other end to answer it. A call already
--- answered goes on: hanging up is the blocker's.
function Calls.blocked(by, number)
    for _, call in pairs(calls) do
        if call.state == 'ringing' and call.callee and not call.lore and call.calleeNumber == by and call.callerNumber == number then
            local callee = call.callee
            if inCall[callee] == call.id then inCall[callee] = nil end
            call.callee, call.blocked = nil, true
            recordBlocked(call.row)   -- (not written yet: the dial marks it when it is)
            push(callee, 'state', { callId = call.id, state = 'declined' })
        end
    end
end

-- The voice system stopping: the sound of every call on it is gone (the calls end; the phones show it is down).
-- Known by the resource each call's line is on, not by asking whip_core: by now it may have let go of it.
-- Started again: nothing to bring back (no call was left up).
AddEventHandler('onResourceStop', function(res)
    local ids = {}
    for id, call in pairs(calls) do
        if call.state == 'active' and call.lineRes == res then ids[#ids + 1] = id end
    end
    for _, id in ipairs(ids) do
        local call = calls[id]
        if call then
            if call.lineId then byLine[call.lineId] = nil; call.lineId, call.lineRes = nil, nil end   -- (gone with it)
            hangUp(call.caller, voiceDownText())
        end
    end
end)

--- A call to a LORE CHARACTER's number (server/lore.lua): it rings like any call and nobody ever picks up. After
--- the usual ring the caller hears "No answer", and it is a missed call on the lore number's side. No sound is
--- opened, so it needs no voice system. Answers the dial's reply.
local function ringLore(source, me, to)
    nextId = nextId + 1
    local call = { id = nextId, caller = source, callerNumber = me, calleeNumber = to, state = 'ringing' }
    calls[call.id], inCall[source] = call, call.id
    ---@type boolean, integer|string|nil
    local okRow, row = pcall(MySQL.insert.await, 'INSERT INTO phone_calls (callerNumber, calleeNumber) VALUES (?, ?)', { me, to })
    if not okRow then row = nil end
    if calls[call.id] ~= call then
        record(row, 'missed', false, true)
        return false, 'That call has ended'
    end
    call.row = row
    push(source, 'state', { callId = call.id, state = 'ringing' })
    SetTimeout((Config.RingSeconds or 30) * 1000, function()
        if calls[call.id] ~= call or call.state ~= 'ringing' then return end
        record(call.row, 'missed', false, true)
        push(call.caller, 'state', { callId = call.id, state = 'unavailable', reason = 'No answer' })
        finish(call)
    end)
    return { callId = call.id, state = 'dialing' }
end

-- ---------------------------------------------------------------- a lore character phoning a player
--
-- server/lore.lua's Call card: the lore number rings the player like any call. Answered, the call's line opens with
-- the player and a VOICE BOT (whip_voice: the recording played into the call as the lore character talking), so the
-- call's sound and a phone on speaker work as always; when the recording has finished, the call hangs up. The card
-- hears how it went: 'answered' (heard to the end), 'hungup' (they hung up while it played), 'declined', 'missed'.

--- Is this player on a call (or being rung)?
function Calls.busy(src)
    return inCall[src] ~= nil
end

--- The answered lore call's sound: its line, the bot on it, the recording playing. Answers the line's id, or false and why.
local function openLoreLine(call)
    local v = Whip.voiceSystem()
    local lineId, why = voice('OpenLine', {
        members = { call.callee }, track = 'voice', pickup = true, minMembers = 2,
        recipe = Config.CallSound, speakerRange = Config.SpeakerRange or 8,
        onLeave = function(_, src) if inCall[src] == call.id then hangUp(src, 'Call dropped') end end,
        -- The line ends when the bot leaves it, and the bot leaves when the recording has finished: its "done" and
        -- this end are told at the same moment, in no set order. Done wins: this one waits half a second first.
        onEnd = function(lineId)
            SetTimeout(500, function()
                if byLine[lineId] ~= call.id or calls[call.id] ~= call then return end
                byLine[lineId] = nil
                call.lineId = nil
                hangUp(call.callee, 'Call ended')
            end)
        end,
    })
    if not lineId then return false, why end
    call.lineId, call.lineRes = lineId, v and v.resource or nil
    byLine[lineId] = call.id
    local put, pwhy = voice('PutVoiceBotOnLine', call.botKey, lineId)
    if not put then return false, pwhy end
    -- The recording played to the end: the call ends well.
    local played, dwhy = voice('PlayVoiceBot', call.botKey, function(_, how)
        if calls[call.id] ~= call or how ~= 'done' then return end
        call.botKey = nil
        record(call.row, 'answered', false, true)
        push(call.callee, 'state', { callId = call.id, state = 'ended', reason = 'Call ended' })
        finish(call, 'answered')
    end)
    if not played then return false, dwhy end
    return lineId
end

--- Ring a player from a lore number. `botKey` is a voice bot made for the recording (whip_voice CreateVoiceBot);
--- the call owns it from here (it goes when the call ends). onOutcome(outcome, why) once (why: a failed one's).
--- Answers the call's id, or false and why.
function Calls.fromLore(loreNumber, src, toNumber, botKey, onOutcome)
    if inCall[src] then return false, 'busy' end
    nextId = nextId + 1
    local call = { id = nextId, lore = true, callerNumber = loreNumber, callee = src, calleeNumber = toNumber,
                   state = 'ringing', botKey = botKey, onOutcome = onOutcome }
    calls[call.id], inCall[src] = call, call.id
    ---@type boolean, integer|string|nil
    local okRow, row = pcall(MySQL.insert.await, 'INSERT INTO phone_calls (callerNumber, calleeNumber) VALUES (?, ?)', { loreNumber, toNumber })
    if not okRow then row = nil end
    if calls[call.id] ~= call then
        record(row, 'missed', false, true)
        return call.id   -- (ended while the row was written: its outcome is told)
    end
    call.row = row
    push(src, 'incoming', { callId = call.id, number = loreNumber, sounds = PhoneDB.sounds(toNumber) })
    push(src, 'state', { callId = call.id, state = 'ringing' })
    SetTimeout((Config.RingSeconds or 30) * 1000, function()
        if calls[call.id] ~= call or call.state ~= 'ringing' then return end
        record(call.row, 'missed', false, true)
        push(call.callee, 'state', { callId = call.id, state = 'missed' })
        finish(call, 'missed')
    end)
    return call.id
end

--- A lore character's call called off (its card gave up, its scenario ended): it stops ringing, or hangs up.
function Calls.cancel(id)
    local call = calls[id]
    if not call or not call.lore then return end
    if call.state == 'ringing' then
        record(call.row, 'missed', false, true)
        push(call.callee, 'state', { callId = call.id, state = 'missed' })
    else
        record(call.row, 'answered', false, true)
        push(call.callee, 'state', { callId = call.id, state = 'ended', reason = 'Call ended' })
    end
    finish(call, 'cancelled')
end

Whip.register(function()
    local function cb(name, schema, fn)
        exports.whip_core:SecureCallback(name, PhoneSchema(schema), function(source, player, args)   -- args: server/main.lua
            if not PhoneDB.ready then return false, 'The phone network is starting, try again' end
            return fn(source, player, type(args) == 'table' and args or {})
        end)
    end

    -- -> { { id, number, dir = 'in'|'out'|'missed', time, duration, noBlock }, ... } newest first. noBlock: a lore
    -- character's number, which the page offers no Block for (server/blocks.lua)
    cb('whip_phone:phone:recents', LIGHT, function(source, player)
        local me = Sim.numberOf(source, player)
        if not me then return {} end
        -- Each side is its own seek (schema.lua idx_caller_id, idx_callee_shown), newest first, merged here: one query
        -- with an OR sorted every call the number ever had before its LIMIT (audit 20, PHN-7).
        local limit = Config.RecentCalls or 50
        local q = [[SELECT callId, callerNumber, calleeNumber, status,
                UNIX_TIMESTAMP(startedAt) AS t, UNIX_TIMESTAMP(answeredAt) AS a, UNIX_TIMESTAMP(endedAt) AS e
            FROM phone_calls WHERE %s ORDER BY callId DESC LIMIT ?]]
        local ok, made = PhoneDB.call('query', q:format('callerNumber = ?'), { me, limit })
        if not ok then return false, PhoneDB.NET_DOWN end   -- (server/contract.lua: answers instead of throwing)
        -- Not the calls from a number this SIM had blocked: never shown here, after an unblock too (server/blocks.lua)
        local okIn, got = PhoneDB.call('query', q:format('calleeNumber = ? AND blocked = 0'), { me, limit })
        if not okIn then return false, PhoneDB.NET_DOWN end
        local rows, seen = {}, {}
        for _, list in ipairs({ made or {}, got or {} }) do
            for _, r in ipairs(list) do
                if not seen[r.callId] then seen[r.callId] = true; rows[#rows + 1] = r end
            end
        end
        table.sort(rows, function(a, b) return tonumber(a.callId) > tonumber(b.callId) end)
        for i = #rows, limit + 1, -1 do rows[i] = nil end
        local out = {}
        for i, r in ipairs(rows) do
            local outgoing = r.callerNumber == me
            local answered = r.status == 'answered'
            local number = outgoing and r.calleeNumber or r.callerNumber
            out[i] = {
                id = r.callId,
                number = number,
                dir = outgoing and 'out' or (answered and 'in' or 'missed'),
                time = tonumber(r.t) or os.time(),
                duration = (answered and r.a and r.e) and math.max(0, math.floor(tonumber(r.e) - tonumber(r.a))) or 0,
                noBlock = Numbers.loreOf(number) ~= nil or nil,
            }
        end
        return out
    end)

    -- args = { number } -> { callId, state = 'dialing' }, then pushes as it rings, connects or ends
    cb('whip_phone:phone:dial', WRITE, function(source, player, args)
        local me, why = Sim.numberOf(source, player)
        if not me then return false, why end
        local to = Numbers.clean(args.number)
        if not to then return false, 'A phone number is 10 digits' end
        if to == me then return false, 'You cannot call yourself' end
        local row = Numbers.get(to)
        if not row or row.locked then return false, 'Number not in service' end
        if inCall[source] then return false, 'You are already in a call' end
        if row.loreKey then return ringLore(source, me, to) end
        if not Whip.voiceSystem() then return false, voiceDownText() end

        local callee = Sim.holderOf(to)
        -- THE CALLED SIM BLOCKED THIS NUMBER (server/blocks.lua): every answer below is what it would be unblocked —
        -- unavailable, busy, or ringing until "No answer" — so nothing tells the caller. Only nobody is rung, and every
        -- row it leaves is marked, out of the callee's Recents.
        local blocked = Blocks.has(to, me)
        -- Down is unavailable: their phone is put away and they can neither answer nor decline, so it rang out its
        -- whole ring for nothing (audit 20, PHN-4; Josh 16 Oct: a death hangs up and puts the phone away)
        local calleeSheet = callee and exports.whip_core:GetPlayer(callee)
        if not callee or (calleeSheet and calleeSheet.isDead) then
            recordMissed(me, to, 'unavailable', blocked)
            return false, 'The number you called is unavailable'
        end
        if inCall[callee] then
            recordMissed(me, to, 'missed', blocked)
            return false, 'Busy'
        end

        nextId = nextId + 1
        -- Blocked: a call with nobody at the other end (as Calls.blocked leaves one that was ringing). It rings the caller
        -- out on the timer below; the callee's line stays free.
        local call = { id = nextId, caller = source, callerNumber = me, callee = (not blocked) and callee or nil, calleeNumber = to,
                       state = 'ringing', blocked = blocked or nil }
        calls[call.id], inCall[source] = call, call.id
        if call.callee then inCall[call.callee] = call.id end

        -- THE HISTORY ROW CANNOT STRAND THE CALL (audit 9, DAT-1). The state above is taken before the await, so two
        -- dials cannot both find the callee free. A database error used to throw out of here with that state left in
        -- place: both players "in a call" until they logged off, every dial to either one "Busy". Caught now: the call
        -- goes on without its Recents row.
        ---@type boolean, integer|string|nil
        local okRow, historyRow = pcall(MySQL.insert.await, 'INSERT INTO phone_calls (callerNumber, calleeNumber, blocked) VALUES (?, ?, ?)',
            { me, to, blocked and 1 or 0 })
        if not okRow then
            print(('^3[whip_phone] a call\'s history row could not be written (%s): the call goes on without it^7'):format(tostring(historyRow)))
            historyRow = nil
        end
        -- Ended while the row was written (one of them hung up, or left): nothing to ring, and the row says so.
        if calls[call.id] ~= call then
            record(historyRow, 'missed', false, true)
            return false, 'That call has ended'
        end
        call.row = historyRow
        -- Blocked while the row was written (Calls.blocked let go of the callee before it had a row to mark).
        if call.blocked and not blocked then recordBlocked(call.row) end

        -- With the called SIM's sounds (its ringtone, its volume), for a page that has not had its session yet.
        if call.callee then
            push(call.callee, 'incoming', { callId = call.id, number = me, sounds = PhoneDB.sounds(to) })
            push(call.callee, 'state', { callId = call.id, state = 'ringing' })
        end
        push(source, 'state', { callId = call.id, state = 'ringing' })

        SetTimeout((Config.RingSeconds or 30) * 1000, function()
            if calls[call.id] ~= call or call.state ~= 'ringing' then return end
            record(call.row, 'missed', false, true)
            push(call.caller, 'state', { callId = call.id, state = 'unavailable', reason = 'No answer' })
            push(call.callee, 'state', { callId = call.id, state = 'missed' })
            finish(call)
        end)
        return { callId = call.id, state = 'dialing' }
    end)

    -- args = { callId } -> { state = 'active', startedAt }
    cb('whip_phone:phone:answer', WRITE, function(source, _, args)
        local call = mine(source, args)
        if not call or call.callee ~= source or call.state ~= 'ringing' then return false, 'That call has ended' end
        -- Both still hold the numbers it is between: a phone handed on while it rang cannot be answered by the
        -- one who gave it away (they would hear a call meant for that number).
        local still, who = stillTheirs(call)
        if not still then
            hangUp(who, 'Call ended')
            return false, 'That call has ended'
        end
        -- The sound first: no sound, no call (it ends saying why, on both screens). A lore character's call: its
        -- line, with the voice bot playing the recording.
        local lineId, why
        if call.lore then lineId, why = openLoreLine(call) else lineId, why = openLine(call) end
        if not lineId then
            if call.lore then call.failed = tostring(why) end   -- (its card hears why)
            hangUp(source, why)
            return false, why
        end
        if calls[call.id] ~= call then return false, 'That call has ended' end
        call.state, call.startedAt = 'active', os.time()
        record(call.row, 'answered', true, false)
        push(call.caller, 'state', { callId = call.id, state = 'active', startedAt = call.startedAt })
        return { state = 'active', startedAt = call.startedAt }
    end)

    -- args = { callId }: the one being called said no
    cb('whip_phone:phone:decline', WRITE, function(source, _, args)
        local call = mine(source, args)
        if not call or call.state ~= 'ringing' then return true end
        record(call.row, 'declined', false, true)
        push(other(call, source), 'state', { callId = call.id, state = 'declined' })
        finish(call, 'declined')
        return true
    end)

    -- args = { callId }: either side hung up (the caller before an answer: a missed call for the other)
    cb('whip_phone:phone:end', WRITE_DOWNED, function(source, _, args)
        local call = mine(source, args, true)
        if not call then return true end
        local far = other(call, source)
        if call.state == 'ringing' then
            record(call.row, 'missed', false, true)
            push(far, 'state', { callId = call.id, state = 'missed' })
        else
            record(call.row, 'answered', false, true)
            push(far, 'state', { callId = call.id, state = 'ended' })
        end
        finish(call)
        return true
    end)

    -- args = { callId, on }: the other side stops hearing me (the people near me still do)
    cb('whip_phone:phone:mute', WRITE_DOWNED, function(source, _, args)
        local call = mine(source, args)
        if not call or call.state ~= 'active' or not call.lineId then return false, 'Not in a call' end
        return voice('SetLineMuted', call.lineId, source, args.on == true)
    end)
    -- args = { callId, on }: out loud — the people near me hear the other side, and the other side hears them
    cb('whip_phone:phone:speaker', WRITE_DOWNED, function(source, _, args)
        local call = mine(source, args)
        if not call or call.state ~= 'active' or not call.lineId then return false, 'Not in a call' end
        return voice('SetLineSpeaker', call.lineId, source, args.on == true)
    end)
    cb('whip_phone:phone:dtmf', LIGHT, function() return true end)

    -- ---------------------------------------------------------------- invites that ring like a call
    -- Josh, 8 Oct 2026: a Director job invite arrives on the phone like an incoming call, Accept / Decline, when the
    -- player carries a phone that can be used; whip_core asks on screen otherwise (whip_core server/ask.lua,
    -- channels). The question, its clock and its answer stay whip_core's: this shows it (the 'invite' push, the
    -- Phone module's call screen) and hands the answer back (AnswerAsk). A question whip_core gives up on takes the
    -- phone's screen down (client/main.lua, whip_core:client:serverAskCancel).
    local function phoneModuleOn()
        for _, id in ipairs(Config.Modules or {}) do if id == 'phone' then return true end end
        return false
    end
    local okCh, whyCh = exports.whip_core:RegisterAskChannel('phone', function(source, token, kind, payload)
        if kind ~= 'confirm' or type(payload) ~= 'table' or not phoneModuleOn() then return false end
        if not Whip.voiceSystem() then return false end   -- no voice system: the phone cannot be used then
        if not Sim.phoneOf(source) then return false end                        -- no phone on them
        push(source, 'invite', { token = token, title = payload.title, message = payload.message,
            yes = payload.yes, no = payload.no })
        return true
    end)
    if not okCh then print(('^3[whip_phone] invites will not ring the phone: %s^7'):format(tostring(whyCh))) end

    -- args = { token, yes }: the player answered an invite on the phone (whip_core checks it is theirs, and theirs now).
    -- Taken while downed too (audit 11, CLI-5): refused, the asker waited out its clock; whip_core counts a downed
    -- player's answer as 'dead', as the on-screen dialog's.
    cb('whip_phone:phone:inviteAnswer', WRITE_DOWNED, function(source, _, args)
        local token = tonumber(args.token)
        if not token then return false, 'That invite is gone' end
        local done, why = exports.whip_core:AnswerAsk(source, token, args.yes == true)
        if not done then return false, why or 'That invite is gone' end
        return true
    end)
end)
