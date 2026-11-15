-- Which phone a player is using, and which SIM is in it — worked out by the server on EVERY request
-- from the items they carry, never taken from the page. Swap the SIM and the next request is the new
-- number; take someone else's SIM and you are them on the phone (Josh, 7 Oct 2026).
--
-- THE PHONE: the one opened from its own menu (Use on that phone) while it is still carried; else the one in the
-- Phone accessory slot; else the first phone in the pockets, the lowest slot (Josh, 10 Oct 2026: "the first slot in
-- the list gets the phone if opening via hotkey, but they can always open context if they wanna open the other
-- phone"). The hotkey, the F1 wheel and the Open export forget the choice, so they open the first.
-- THE SIM: the card in that phone's SIM tray (its panel, server/items.lua: metadata.sim[1]).
--   { state = 'ok', number, owner }   the number works
--   { state = 'nosim' }               no card in the tray
--   { state = 'locked', number, owner } its owner locked it: no service
--   { state = 'blank' }               a card that could not be given a number (none left to mint), or whose
--                                     number an admin deleted ('SIM not working')
-- A card that has a number not yet written (minted for its buyer, server/numbers.lua) is written now, for
-- the owner on the card. A blank card (made for nobody) is given a new number now, for whoever is using it.

Sim = {}

local PHONE, CARD, TRAY = 'phone', 'sim_card', 'sim'

--- WHO HOLDS WHICH SIM, kept as it changes (audit 9, SRV-4): [number] = source and [source] = number, from the card
--- in each online player's phone tray. Sim.holderOf asks this and checks that one player again. It used to walk every
--- online player's pockets for a number nobody online held: one or two whip_core exports per player, per text and per
--- call. Kept current by every pocket change (whip_core:inventory:changed, which a SIM tray change is too), a player
--- loading or leaving, every resolve, and once for everyone when whip_phone starts.
local heldBy, numberHeld = {}, {}

--- Note that `src` now holds `number` (nil: no SIM card, or no phone).
local function index(src, number)
    local was = numberHeld[src]
    if was == number then return end
    if was and heldBy[was] == src then heldBy[was] = nil end
    numberHeld[src] = number
    if number then heldBy[number] = src end
end

--- [src] = the uid of the phone the player opened from its own menu (Sim.choose), until the hotkey opens the phone.
local chosen = {}

--- Use THIS phone (its uid), as its own Use asks; nil goes back to the first (the hotkey's). Calls and texts follow:
--- the number this player holds is the one in the phone now in use (Sim.reindex).
---@param src number
---@param uid any
function Sim.choose(src, uid)
    if chosen[src] == uid then return end
    chosen[src] = uid
    Sim.reindex(src)
end

--- The phone a player is using: { addr, metadata }, or nil.
function Sim.phoneOf(src)
    -- The one they opened from its own menu, while they still carry it; one they no longer carry is forgotten.
    local want = chosen[src]
    if want ~= nil then
        local all = exports.whip_core:FindAllItems(src, PHONE)
        for _, p in ipairs(type(all) == 'table' and all or {}) do
            if type(p) == 'table' and p.addr and type(p.metadata) == 'table' and p.metadata.uid == want then
                return { addr = p.addr, metadata = p.metadata }
            end
        end
        chosen[src] = nil
    end
    local slot1 = { kind = 'player', id = src, sub = 'accessory', slot = 1 }
    local it = exports.whip_core:GetItemAt(slot1)
    if type(it) == 'table' and it.item == PHONE then
        return { addr = slot1, metadata = it.metadata or {} }
    end
    local found = exports.whip_core:FindItem(src, PHONE)
    if type(found) == 'table' and found.addr then
        return { addr = found.addr, metadata = found.metadata or {} }
    end
    return nil
end

--- The card in a phone's tray, { item, amount, metadata }, or nil. (Kept as a list; a key that went through
--- JSON may come back as the string '1'.)
local function cardIn(phone)
    local tray = type(phone.metadata[TRAY]) == 'table' and phone.metadata[TRAY] or nil
    local e = tray and (tray[1] or tray['1'])
    if type(e) == 'table' and e.item == CARD then return e end
    return nil
end

--- Look at `src`'s phone again and note the SIM in it (no writes: the card's number as it is).
function Sim.reindex(src)
    local phone = Sim.phoneOf(src)
    local card = phone and cardIn(phone)
    index(src, card and Numbers.clean(card.metadata and card.metadata.phoneNumber) or nil)
end

--- Write a number onto the card in the phone's tray (a blank card being given one). False when it was not written.
---
--- READ AGAIN WHERE IT WAS, FIRST (audit 20, PHN-5): a wait before this (Numbers.activate) may have moved the phone,
--- or the card may have been taken out of its tray. Written from the copy read before, the whole tray went back with
--- the card in it (a SIM card twice), or onto whatever item now sits in that slot.
local function stampCard(phone, number, owner)
    local now = exports.whip_core:GetItemAt(phone.addr)
    if type(now) ~= 'table' or now.item ~= PHONE or type(now.metadata) ~= 'table' then return false end
    if phone.metadata.uid ~= nil and now.metadata.uid ~= phone.metadata.uid then return false end
    local card = cardIn({ metadata = now.metadata })
    if not card then return false end
    local tray = {}
    for k, v in pairs(now.metadata[TRAY] or {}) do tray[k] = v end
    local key = tray[1] and 1 or '1'
    local meta = {}
    for k, v in pairs(card.metadata or {}) do meta[k] = v end
    meta.phoneNumber, meta.owner = number, owner
    tray[key] = { item = card.item, amount = card.amount or 1, metadata = meta }
    if not exports.whip_core:SetItemMetadata(phone.addr, { [TRAY] = tray }) then return false end
    phone.metadata = now.metadata
    phone.metadata[TRAY] = tray
    return true
end

--- Who the player is on the phone right now (see the top of this file), or nil and why when they have no
--- phone at all.
---@param src number
---@param player table  whip_core's sheet (charId, fullName)
---@return table|nil sim
---@return string|nil why
function Sim.resolve(src, player)
    local phone = Sim.phoneOf(src)
    if not phone then
        index(src, nil)
        return nil, 'You need a phone'
    end
    local card = cardIn(phone)
    if not card then
        index(src, nil)
        return { phone = phone, state = 'nosim' }
    end
    local meta = card.metadata or {}
    local number = Numbers.clean(meta.phoneNumber)
    -- A number the admin panel retired: changed, so the card is written over with the number it became and works
    -- as before; or deleted, so the card works no more (audit 9, DAT-2).
    if number and Numbers.isRetired(number) then
        local to = Numbers.forward(number)
        local moved = to and Numbers.get(to)
        if not moved then
            index(src, nil)
            return { phone = phone, state = 'blank' }
        end
        if not stampCard(phone, to, moved.charId) then
            index(src, nil)
            return { phone = phone, state = 'blank' }
        end
        number = to
    end
    local row = number and Numbers.get(number)
    -- A NUMBER TWO CARDS WERE MADE WITH (audit 13, PLY-1). Minting only reserves a number in memory until its
    -- card is first used (server/numbers.lua), so after a restart it could be minted again for another card —
    -- or the admin panel give it to someone — before this card's first use. A card names its owner: a written
    -- row that is someone else's belongs to that other card (or the panel), and this card gets a new number of
    -- its own rather than sharing theirs. (A card the panel spawned names no owner, and is never moved.)
    local cardOwner = tonumber(meta.owner)
    if row and cardOwner and row.charId ~= cardOwner then
        row, number = nil, nil
    end
    index(src, number)
    if not row then
        local owner = cardOwner or (player and player.charId)
        local mintedHere = false
        if not number then
            number = Numbers.mint()
            if not number or not owner then return { phone = phone, state = 'blank' } end
            if not stampCard(phone, number, owner) then return { phone = phone, state = 'blank' } end
            index(src, number)
            mintedHere = true
        end
        row = owner and Numbers.activate(number, owner)
        -- THE SAME RULE FOR A ROW READ BACK (audit 14, PLY-1). Memory may not have held the number (a failed load,
        -- or the moment before the admin panel's reload lands): activate then finds the row someone else wrote and
        -- answers it. The card's owner is a different one, so it gets a new number of its own here too.
        -- Compared with `owner`, the owner the card carries NOW (audit 15, PLY-3: with the owner read before a
        -- blank card was stamped — nil — a blank card skipped this), and each new number's row checked the same way.
        -- Only a card that names its owner or was given its number here: a card the panel spawned (a number, no
        -- owner) is the number's, and is never moved.
        local tries = 0
        while row and owner and (cardOwner or mintedHere) and row.charId ~= owner do
            tries = tries + 1
            number = tries <= 3 and Numbers.mint() or nil
            if not number or not stampCard(phone, number, owner) then
                index(src, nil)
                return { phone = phone, state = 'blank' }
            end
            index(src, number)
            row = Numbers.activate(number, owner)
        end
        if not row then return { phone = phone, state = 'blank' } end
    end
    if row.locked then
        return { phone = phone, state = 'locked', number = number, owner = row.charId }
    end
    return { phone = phone, state = 'ok', number = number, owner = row.charId }
end

--- The number a player's phone is on, or nil and a reason the page shows (no phone, no SIM, locked).
--- What every SIM-scoped request starts with.
---@return string|nil number
---@return string|nil why
function Sim.numberOf(src, player)
    local s, why = Sim.resolve(src, player)
    if not s then return nil, why end
    if s.state == 'nosim' then return nil, 'No SIM card' end
    if s.state == 'locked' then return nil, 'SIM locked' end
    if s.state ~= 'ok' then return nil, 'This SIM does not work' end
    return s.number
end

--- The online player whose phone holds this number's SIM now, or nil. The one the index names, checked again
--- (resolved: a card that moved since is noticed, and the index put right). Nobody else is looked at. One holder:
--- a SIM is one card.
---@param number string
---@param anyState boolean|nil  true: a locked SIM counts too (to tell its holder it was locked)
---@return number|nil source
function Sim.holderOf(number, anyState)
    local src = heldBy[number]
    if not src then return nil end
    local p = exports.whip_core:GetPlayer(src)
    if not p then index(src, nil) return nil end
    local s = Sim.resolve(src, p)
    if s ~= nil and s.number == number and (anyState or s.state == 'ok') then return src end
    return nil
end

--- After the numbers are read again (the admin panel changed or deleted some): every online player whose phone
--- holds a card with a retired number has it put right now (written over with the new number, or no service),
--- rather than when their phone next opens, so calls and texts to a changed number reach them at once.
function Sim.recheckRetired()
    local due = {}
    for src, number in pairs(numberHeld) do
        if Numbers.isRetired(number) then due[#due + 1] = src end
    end
    for _, src in ipairs(due) do
        local p = exports.whip_core:GetPlayer(src)
        if p then Sim.resolve(src, p) else index(src, nil) end
    end
end

-- Keeping the index (see heldBy).
AddEventHandler('whip_core:inventory:changed', function(e)
    local src = type(e) == 'table' and tonumber(e.source) or nil
    if src then Sim.reindex(src) end
end)
AddEventHandler('whip_core:player:loaded', function(e)
    local src = type(e) == 'table' and tonumber(e.source) or nil
    if src then Sim.reindex(src) end
end)
AddEventHandler('whip_core:player:logout', function(e)
    local src = type(e) == 'table' and tonumber(e.source) or nil
    if src then index(src, nil); chosen[src] = nil end
end)
AddEventHandler('playerDropped', function() index(source, nil); chosen[source] = nil end)
-- whip_phone starting (or whip_core back): everyone already in game, once.
Whip.register(function()
    for _, s in ipairs(GetPlayers()) do
        local src = tonumber(s)
        if src and exports.whip_core:GetPlayer(src) then Sim.reindex(src) end
    end
end)
