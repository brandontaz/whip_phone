-- The phone's data: every request the core and the built-in modules make, answered from whip_phone's
-- own tables (server/schema.lua). Shapes: docs/FRAMEWORK.md.
--
-- Each handler is fn(source, player, args): player is whip_core's sheet (charId, fullName), args what the
-- module sent. Answer the data, or false, 'reason' (the player sees it).
--
-- WHOSE DATA (Josh, 7 Oct 2026). SIM-scoped (contacts, messages, calls): the number of the SIM in the
-- phone the player holds now, worked out on every request (Sim.numberOf) — with someone else's SIM you are
-- them on the phone; the home arrangement and the wallpaper too. Device-scoped (the rest of the look): the phone
-- item. Character-scoped apps (bank, business, later) use `player`, whatever SIM is in.

local LIGHT = { rateLimit = 250, burst = 6 }     -- reads
local WRITE = { rateLimit = 500, burst = 3 }     -- writes / actions

local function cb(name, schema, fn)
    exports.whip_core:SecureCallback(name, PhoneSchema(schema), function(source, player, args)   -- args declared: server/main.lua
        if not PhoneDB.ready then return false, 'The phone network is starting, try again' end
        return fn(source, player, type(args) == 'table' and args or {})
    end)
end

--- A time from the database as seconds (the UI takes seconds or milliseconds).
local function secs(v) return tonumber(v) or os.time() end

--- A database call that answers instead of throwing (audit 10, INV-8): true and the result, or false. A database
--- that does not answer becomes an error after whip_core's db_guard limit (loaded in fxmanifest.lua); here that is
--- said in the console and the player is told the network is not answering, instead of a generic server error.
local NET_DOWN = 'The phone network is not answering, try again'
---@return boolean ok
---@return any result  what MySQL[method].await answered
local function db(method, query, params)
    local ok, result = pcall(MySQL[method].await, query, params)
    if not ok then
        print(('^3[whip_phone] a database %s failed: %s^0'):format(method, tostring(result)))
        return false
    end
    return true, result
end
PhoneDB.call, PhoneDB.NET_DOWN = db, NET_DOWN   -- for server/calls.lua

-- ---------------------------------------------------------------- settings (on the phone item; the SIM's on the SIM)
-- No layout: it follows the input on the page (Josh, 12 Oct 2026). One stored before is dropped here, so it is neither
-- sent nor saved again.
local function id32(v) return type(v) == 'string' and #v <= 32 and v:match('^[%w_%-]+$') and v or nil end

--- What goes where the SIM goes (Josh, 12 Oct 2026): its wallpaper, and how it sounds — its ringtone, its message
--- tone, its notification sound and its volume (html/core/sounds.js has the tones; an id the page does not know, it
--- leaves).
local SIM_KEYS = { 'wallpaper', 'ringtone', 'messageTone', 'notifyTone', 'soundVolume' }
local SOUND_KEYS = { 'ringtone', 'messageTone', 'notifyTone', 'soundVolume' }

local function cleanSettings(s)
    s = type(s) == 'table' and s or {}
    local out = {}
    out.wallpaper = id32(s.wallpaper)
    if type(s.dnd) == 'boolean' then out.dnd = s.dnd end
    out.theme = id32(s.theme)
    out.ringtone, out.messageTone, out.notifyTone = id32(s.ringtone), id32(s.messageTone), id32(s.notifyTone)
    local vol = math.tointeger(tonumber(s.soundVolume))
    if vol and vol >= 0 and vol <= 100 then out.soundVolume = vol end
    return out
end

--- How the SIM with this number sounds, every key filled (its own choice, else Config.Defaults): sent with a call or
--- a text it rings in (calls.lua, deliver below), for a page that has not had that SIM's session yet.
---@param number string
---@return table
local function soundsOf(number)
    local own = cleanSettings(number and Numbers.prefs(number) or {})
    local def = cleanSettings(Config.Defaults)
    local out = {}
    for _, k in ipairs(SOUND_KEYS) do out[k] = own[k] or def[k] end
    return out
end
PhoneDB.sounds = soundsOf

-- ---------------------------------------------------------------- the home arrangement (the SIM's)
-- { phone = { [appId] = slot }, tablet = { ... } }: where each app sits on each grid (html/core/os.js). Kept to
-- that shape: app ids as the page allows them, whole slot numbers, a bounded count.
local MAX_SLOT, MAX_APPS = 16 * 12, 96

local function cleanHome(h)
    local out = { phone = {}, tablet = {} }
    if type(h) ~= 'table' then return out end
    for _, g in ipairs({ 'phone', 'tablet' }) do
        local src, n = h[g], 0
        if type(src) == 'table' then
            for id, slot in pairs(src) do
                slot = math.tointeger(tonumber(slot))
                if type(id) == 'string' and #id <= 32 and id:match('^[a-z][a-z0-9_%-]*$') and slot and slot >= 0 and slot < MAX_SLOT then
                    n = n + 1
                    if n > MAX_APPS then break end
                    out[g][id] = slot
                end
            end
        end
    end
    return out
end

--- The look the phone shows. THE WALLPAPER IS THE SIM'S (Josh, 12 Oct 2026): it goes where the SIM goes, so
--- someone using your SIM sees your wallpaper. SO ARE ITS SOUNDS (the same day): its ringtone, its tones, its volume.
--- A SIM without one shows the phone's own (no SIM: the phone's own), and always one: the next session must put the last
--- SIM's away. The rest (Do Not Disturb) is the phone's.
local function settingsOf(sim, player)
    local out = cleanSettings(sim.phone.metadata.settings)
    if sim.number then
        local own = cleanSettings(Numbers.prefs(sim.number))
        if own.wallpaper then
            out.wallpaper = own.wallpaper
        elseif out.wallpaper and player and sim.owner == player.charId then
            -- the owner's wallpaper from before it went on the SIM: moved onto their SIM, once
            Numbers.setPref(sim.number, 'wallpaper', out.wallpaper)
        end
        for _, k in ipairs(SOUND_KEYS) do
            if own[k] ~= nil then out[k] = own[k] end
        end
    end
    local def = cleanSettings(Config.Defaults)
    for _, k in ipairs(SIM_KEYS) do
        if out[k] == nil then out[k] = def[k] end
    end
    return out
end

--- The arrangement the phone shows: its SIM's, or (no SIM in it) the phone's own.
local function homeOf(sim)
    if sim.number then return cleanHome(Numbers.prefs(sim.number).home) end
    return cleanHome(sim.phone.metadata.home)
end

-- ---------------------------------------------------------------- messages: who receives a text
--- Push a new text to whoever holds the receiving number's SIM now (if anyone does). The client event,
--- not this resource's own Push export (no self-exports). A text the receiving SIM blocked never comes here: the one
--- who wrote its row decides (messages:send below; a lore character's text can't be blocked, server/blocks.lua).
local function deliver(toNumber, msg)
    local holder = Sim.holderOf(toNumber)
    if not holder then return end
    -- With the receiving SIM's sounds: its message tone, for a page that has not had its session yet.
    local m = {}
    for k, v in pairs(msg) do m[k] = v end
    m.sounds = soundsOf(toNumber)
    TriggerClientEvent('whip_phone:client:push', holder, 'messages', 'incoming', m)
end
PhoneDB.deliver = deliver   -- a lore character's texts (server/lore.lua)

Whip.register(function()
    -- ---------------------------------------------------------------- core
    -- Who is on the phone: refused without a phone item (it stays shut). No SIM, or a locked one, still
    -- opens: the apps that need a number say so.
    -- args.first: opened by the hotkey, the F1 wheel or the Open export, which open the FIRST phone, so a phone chosen
    -- by its own Use is forgotten (Sim.phoneOf). Use on a phone (server/items.lua) and a refresh keep the choice.
    cb('whip_phone:session', { rateLimit = 1000, burst = 3 }, function(source, player, args)
        if args.first == true then Sim.choose(source, nil) end
        local s, why = Sim.resolve(source, player)
        if not s then return false, why end
        -- THE NAME IS THE SIM'S OWNER'S (Josh, 12 Oct 2026: someone else's SIM showed the holder's own name): the
        -- phone is whoever's number is in it. No SIM, no name ("Your phone").
        local name = nil
        if s.owner and player and s.owner == player.charId then
            name = player.fullName
        elseif s.owner then
            name = (exports.whip_core:GetCharacterNames({ s.owner }) or {})[s.owner]
        end
        return {
            number = s.state == 'ok' and s.number or nil,
            name = name,
            sim = s.state,
            settings = settingsOf(s, player),
            home = homeOf(s),
            -- The number's contact card (server/card.lua): its name and picture. `mine`: this player may change it.
            card = s.state == 'ok' and PhoneCards.of(s.number) or nil,
            mine = s.state == 'ok' and player ~= nil and s.owner == player.charId,
        }
    end)

    -- args = { home = { phone = { [appId] = slot }, tablet = {...} } }: the home screen was rearranged. Kept on
    -- the SIM (it carries it to any phone), or on the phone itself while it has no SIM.
    cb('whip_phone:home:save', WRITE, function(source, player, args)
        local s, why = Sim.resolve(source, player)
        if not s then return false, why end
        local home = cleanHome(args.home)
        if s.number then
            local ok, err = Numbers.setPref(s.number, 'home', home)
            if not ok then return false, err end
            return true
        end
        local ok, err = exports.whip_core:SetItemMetadata(s.phone.addr, { home = home })
        if not ok then return false, err or 'Could not save that' end
        return true
    end)

    -- args = { wallpaper, dnd, ringtone, messageTone, notifyTone, soundVolume }: the SIM's (SIM_KEYS) on the SIM in the
    -- phone (settingsOf), each written only when it changed; the rest on the phone itself. No SIM: all of it on the phone.
    cb('whip_phone:settings:save', WRITE, function(source, player, args)
        local s, sWhy = Sim.resolve(source, player)
        if not s then return false, sWhy or 'You need a phone' end
        local phone = s.phone
        local new = cleanSettings(args)
        if s.number then
            local prefs = Numbers.prefs(s.number)
            for _, k in ipairs(SIM_KEYS) do
                if new[k] ~= nil then
                    if prefs[k] ~= new[k] then
                        local ok, err = Numbers.setPref(s.number, k, new[k])
                        if not ok then return false, err end
                    end
                    new[k] = nil
                end
            end
        end
        -- The phone again, after those waits (Numbers.setPref goes to the database): written only if it is still the
        -- same phone, merged onto what it holds now. From the copy read before, the settings went onto whatever item
        -- now sat in that slot (audit 20, PHN-5).
        local now = Sim.phoneOf(source)
        if not now or (phone.metadata.uid ~= nil and now.metadata.uid ~= phone.metadata.uid) then
            return false, 'Your phone moved while that saved — try again'
        end
        local merged = cleanSettings(now.metadata.settings)
        for k, v in pairs(new) do merged[k] = v end
        local ok, why = exports.whip_core:SetItemMetadata(now.addr, { settings = merged })
        if not ok then return false, why or 'Could not save that' end
        return true
    end)

    -- ---------------------------------------------------------------- contacts (the SIM's)
    -- At most CONTACTS_MAX a SIM: unbounded, one player could add thousands, and every session, every "contacts
    -- changed" push and every card save then paid for them (audit 20, PHN-6).
    local CONTACTS_MAX = 500
    cb('whip_phone:contacts:list', LIGHT, function(source, player)
        local me = Sim.numberOf(source, player)
        if not me then return {} end
        local ok, rows = db('query',
            'SELECT contactId, contactName, contactNumber FROM phone_contacts WHERE phoneNumber = ? ORDER BY contactName LIMIT ?',
            { me, CONTACTS_MAX })
        if not ok then return false, NET_DOWN end
        rows = rows or {}
        local out = {}
        for i, r in ipairs(rows) do
            -- Its picture: a lore character's (server/lore.lua), else what its owner put on their card (server/card.lua).
            local pic, frame = PhoneCards.pictureOf(r.contactNumber)
            out[i] = { id = r.contactId, name = r.contactName, number = r.contactNumber, picture = pic, pictureFrame = frame,
                       -- a lore character's number: the page offers no Block for it (server/blocks.lua)
                       noBlock = Numbers.loreOf(r.contactNumber) ~= nil or nil }
        end
        return out
    end)

    -- args = { id = nil (new) or id, name, number } -> the saved contact
    cb('whip_phone:contacts:save', WRITE, function(source, player, args)
        local me, why = Sim.numberOf(source, player)
        if not me then return false, why end
        local name = tostring(args.name or ''):gsub('^%s+', ''):gsub('%s+$', '')
        if name == '' or #name > 50 then return false, 'A name of 1 to 50 characters' end
        local number = Numbers.clean(args.number)
        if not number then return false, 'A phone number is 10 digits' end
        local id = tonumber(args.id)
        if id then
            local ok, n = db('update',
                'UPDATE phone_contacts SET contactName = ?, contactNumber = ? WHERE contactId = ? AND phoneNumber = ?',
                { name, number, id, me })
            if not ok then return false, NET_DOWN end
            if not n or n < 1 then return false, 'That contact is gone' end
        else
            local counted, have = db('scalar', 'SELECT COUNT(*) FROM phone_contacts WHERE phoneNumber = ?', { me })
            if not counted then return false, NET_DOWN end
            if (tonumber(have) or 0) >= CONTACTS_MAX then
                return false, ('This SIM holds %d contacts at most: delete one first'):format(CONTACTS_MAX)
            end
            local ok
            ok, id = db('insert',
                'INSERT INTO phone_contacts (phoneNumber, contactName, contactNumber) VALUES (?, ?, ?)', { me, name, number })
            if not ok then return false, NET_DOWN end
            if not id then return false, 'Could not save that' end
        end
        return { id = id, name = name, number = number }
    end)

    -- args = { id }
    cb('whip_phone:contacts:delete', WRITE, function(source, player, args)
        local me, why = Sim.numberOf(source, player)
        if not me then return false, why end
        if not db('update', 'DELETE FROM phone_contacts WHERE contactId = ? AND phoneNumber = ?', { tonumber(args.id) or -1, me }) then
            return false, NET_DOWN
        end
        return true
    end)

    -- ---------------------------------------------------------------- Messages module
    -- -> { { number, unread, last = { text, time, me }, noBlock }, ... } newest first. noBlock: a lore character's
    -- number, which the page offers no Block for (server/blocks.lua)
    --
    -- ONE ROW PER CONVERSATION: the latest message with each other number, then each one's unread count. Built from the
    -- number's newest 300 messages, one busy conversation (or a spammer: 2 texts a second) pushed every other one, and
    -- its unread badge, off the list (audit 20, PHN-2). THREADS_MAX conversations, newest first. Both halves of the
    -- union use an index (schema.lua: idx_pair, idx_shown_in), not every message the number ever had.
    --
    -- WHAT CAME WHILE THE SENDER WAS BLOCKED IS NOT HERE (server/blocks.lua): not as a conversation, its last message,
    -- or an unread count, after an unblock too. What this number sent is all here: a blocked sender sees their own
    -- texts as sent.
    local THREADS_MAX = 200
    cb('whip_phone:messages:threads', LIGHT, function(source, player)
        local me = Sim.numberOf(source, player)
        if not me then return {} end
        local ok, heads = db('query', [[SELECT other, MAX(messageId) AS last FROM (
                SELECT receiverNumber AS other, MAX(messageId) AS messageId FROM phone_messages
                    WHERE senderNumber = ? GROUP BY receiverNumber
                UNION ALL
                SELECT senderNumber AS other, MAX(messageId) AS messageId FROM phone_messages
                    WHERE receiverNumber = ? AND blocked = 0 GROUP BY senderNumber
            ) AS sides GROUP BY other ORDER BY last DESC LIMIT ?]], { me, me, THREADS_MAX })
        if not ok then return false, NET_DOWN end
        heads = heads or {}
        if #heads == 0 then return {} end

        local ids, marks = {}, {}
        for i, h in ipairs(heads) do ids[i], marks[i] = tonumber(h.last), '?' end
        local okLast, rows = db('query', ([[SELECT messageId, senderNumber, content, UNIX_TIMESTAMP(createdAt) AS t
            FROM phone_messages WHERE messageId IN (%s)]]):format(table.concat(marks, ',')), ids)
        if not okLast then return false, NET_DOWN end
        local okUnread, unread = db('query', [[SELECT senderNumber, COUNT(*) AS n FROM phone_messages
            WHERE receiverNumber = ? AND blocked = 0 AND readAt IS NULL GROUP BY senderNumber]], { me })
        if not okUnread then return false, NET_DOWN end

        local byId, unreadFrom = {}, {}
        for _, r in ipairs(rows or {}) do byId[tonumber(r.messageId)] = r end
        for _, u in ipairs(unread or {}) do unreadFrom[u.senderNumber] = tonumber(u.n) or 0 end
        local order = {}
        for _, h in ipairs(heads) do
            local r = byId[tonumber(h.last)]
            if r then
                local mine = r.senderNumber == me
                order[#order + 1] = { number = h.other, unread = h.other ~= me and unreadFrom[h.other] or 0,
                                      last = { text = r.content, time = secs(r.t), me = mine },
                                      noBlock = Numbers.loreOf(h.other) ~= nil or nil }
            end
        end
        return order
    end)

    -- args = { number } -> { { id, me, text, time }, ... } oldest first
    cb('whip_phone:messages:thread', LIGHT, function(source, player, args)
        local me = Sim.numberOf(source, player)
        local other = Numbers.clean(args.number)
        if not me or not other then return {} end
        -- Each way is its own seek on idx_pair (sender, receiver, messageId), newest first, merged here: one query with an
        -- OR walked every message the number had and sorted them all before its LIMIT (audit 20, PHN-7).
        local limit = Config.MessageHistory or 300
        local q = [[SELECT messageId, senderNumber, content, UNIX_TIMESTAMP(createdAt) AS t FROM phone_messages
            WHERE senderNumber = ? AND receiverNumber = ?%s ORDER BY messageId DESC LIMIT ?]]
        local ok, sent = db('query', q:format(''), { me, other, limit })
        if not ok then return false, NET_DOWN end
        local rows = sent or {}
        if other ~= me then
            -- Their half without what they sent while this SIM blocked them (server/blocks.lua), after an unblock too.
            local okIn, got = db('query', q:format(' AND blocked = 0'), { other, me, limit })
            if not okIn then return false, NET_DOWN end
            for _, r in ipairs(got or {}) do rows[#rows + 1] = r end
            table.sort(rows, function(a, b) return tonumber(a.messageId) > tonumber(b.messageId) end)
        end
        local out = {}
        for i = math.min(#rows, limit), 1, -1 do
            local r = rows[i]
            out[#out + 1] = { id = r.messageId, me = r.senderNumber == me, text = r.content, time = secs(r.t) }
        end
        return out
    end)

    -- args = { number, text } -> { id, time }. Whoever holds the receiving SIM now gets it at once; it is
    -- kept for them either way.
    -- BLOCKED (server/blocks.lua): the receiving SIM blocked this number. It is kept, marked, for the sender's own
    -- thread, and goes no further: no push, nothing on the blocker's list. The sender gets the same answer as for any
    -- text, so nothing tells them.
    cb('whip_phone:messages:send', WRITE, function(source, player, args)
        local me, why = Sim.numberOf(source, player)
        if not me then return false, why end
        local to = Numbers.clean(args.number)
        if not to then return false, 'A phone number is 10 digits' end
        local row = Numbers.get(to)
        if not row or row.locked then return false, 'Number not in service' end
        local text = tostring(args.text or ''):gsub('^%s+', ''):gsub('%s+$', '')
        if text == '' then return false, 'Nothing to send' end
        if #text > 500 then return false, 'A message is 500 characters at most' end
        local blocked = Blocks.has(to, me)
        local ok, id = db('insert',
            'INSERT INTO phone_messages (senderNumber, receiverNumber, content, blocked) VALUES (?, ?, ?, ?)',
            { me, to, text, blocked and 1 or 0 })
        if not ok then return false, NET_DOWN end
        if not id then return false, 'Could not send that' end
        local now = os.time()
        if to ~= me and not blocked then deliver(to, { id = id, number = me, text = text, time = now }) end
        return { id = id, time = now }
    end)

    -- args = { number }: the player read that conversation
    cb('whip_phone:messages:read', LIGHT, function(source, player, args)
        local me = Sim.numberOf(source, player)
        local other = Numbers.clean(args.number)
        if not me or not other then return true end
        if not db('update',
            'UPDATE phone_messages SET readAt = CURRENT_TIMESTAMP WHERE receiverNumber = ? AND senderNumber = ? AND readAt IS NULL',
            { me, other }) then
            return false, NET_DOWN
        end
        return true
    end)

    -- ---------------------------------------------------------------- the SIM page (Settings): my numbers
    -- -> { current = number|nil, state, currentMine, currentLocked, numbers = { { number, locked }, ... } } (the
    -- character's own). currentMine: the SIM in this phone is theirs, so they may lock it; anyone else holding it (a
    -- stolen phone) sees its lock greyed out (Josh, 12 Oct 2026). whip_phone:settings:lock refuses them either way.
    cb('whip_phone:settings:numbers', LIGHT, function(source, player)
        local s = Sim.resolve(source, player)
        return { current = s and s.number or nil, state = s and s.state or 'nophone',
            currentMine = s ~= nil and s.owner ~= nil and player ~= nil and s.owner == player.charId,
            currentLocked = s ~= nil and s.state == 'locked',
            numbers = player and Numbers.ownedBy(player.charId) or {} }
    end)

    -- args = { number, locked }: lock or unlock one of my own numbers (it works in no phone while locked)
    cb('whip_phone:settings:lock', WRITE, function(_, player, args)
        local number = Numbers.clean(args.number)
        if not number or not player then return false, 'Which number?' end
        local ok, why = Numbers.setLocked(number, player.charId, args.locked == true)
        if not ok then return false, why end
        -- Whoever has that SIM in their phone is told at once (no service now, or service again), and a call on
        -- it ends (server/calls.lua).
        local holder = Sim.holderOf(number, true)
        if holder then TriggerClientEvent('whip_phone:client:refresh', holder) end
        if args.locked == true and Calls then Calls.numberLocked(number) end
        return true
    end)
end)
