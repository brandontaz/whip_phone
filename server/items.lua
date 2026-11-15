-- The phone and the SIM card (Josh, 7 Oct 2026: a phone item is needed, and a phone takes any SIM).
--
--   phone     Use: takes the phone out. Right-click > SIM tray: a one-slot panel that takes a SIM card
--             (whip_core's RegisterPanelItem; the card is kept in the phone's metadata, `sim`). The
--             phone's own look (Do Not Disturb, and its wallpaper while it has no SIM) is on it too,
--             `settings`, so a phone handed over keeps its look.
--   sim_card  metadata { phoneNumber, owner }. Made for whoever receives it (whip_core hands the item's
--             generator who it is for): given or bought, it is a new number of theirs; bought off a
--             shop's shelf it is made again for the buyer (forBuyer). Made for nobody (into a stash, a
--             Director reward) it is blank, and gets a number when first put in a phone (server/sim.lua).
-- The pictures (html/img/items/<key>.webp) are 3D Clanker's renders of the Duo and a whip mini-SIM (7 Oct
-- 2026: 512x512, WebP q90 with lossless alpha, the inventory's icon standard). An item's picture lives with
-- whoever registers it.

local PHONE, CARD = 'phone', 'sim_card'

--- A SIM card's metadata for whoever it is made for (whip_core's ctx), or blank for nobody.
local function newCard(_, ctx)
    local charId = type(ctx) == 'table' and tonumber(ctx.charId) or nil
    if not charId then return {} end
    local number = Numbers.mint()
    if not number then return {} end
    return { phoneNumber = number, owner = charId }
end

--- The holder of a phone whose SIM changed: an open phone is told at once (a new session), and a call on the
--- number that left it ends (server/calls.lua).
local function simChanged(ctx)
    local src = ctx and ctx.source
    if src then
        TriggerClientEvent('whip_phone:client:refresh', src)
        if Calls then Calls.recheck(src) end
    end
end

Whip.register(function()
    local ok, why = exports.whip_core:RegisterItem(PHONE, {
        name = 'Phone', desc = 'Also folds into a tablet.', weight = 0.2,
        type = 'electronics', stack = false, usable = true, image = 'html/img/items/phone.webp',
        prop = 'prop_npc_phone_02',
        contextOptions = { { action = 'phone_sim_tray', label = 'SIM tray' } },
    })
    if not ok then print('[whip_phone] could not register the phone item: ' .. tostring(why)) end

    ok, why = exports.whip_core:RegisterItem(CARD, {
        name = 'SIM Card', desc = 'A phone number. Put it in a phone.', weight = 0.01,
        type = 'electronics', stack = false, image = 'html/img/items/sim_card.webp',
        metaFields = { { key = 'phoneNumber', label = 'Number', format = 'phone' } },
    })
    if not ok then print('[whip_phone] could not register the SIM card item: ' .. tostring(why)) end

    ok, why = exports.whip_core:RegisterItemDefaultMetadata(CARD, newCard, { forBuyer = true })
    if not ok then print('[whip_phone] SIM cards will be blank: ' .. tostring(why)) end

    ok, why = exports.whip_core:RegisterPanelItem(PHONE, {
        action = 'phone_sim_tray', label = 'SIM tray', slots = 1, storageKey = 'sim', allowedItems = { CARD },
        onChange = simChanged,
    })
    if not ok then print('[whip_phone] no SIM tray on phones: ' .. tostring(why)) end

    -- The strip's first slot is its Phone slot, where a phone is looked for first (server/sim.lua): while this runs it
    -- takes phones only, and whip_core puts its own slot back when this stops. No strip, nothing to make.
    local strip = exports.whip_core:GetAccessorySlots()
    if type(strip) == 'table' and strip[1] then
        ok, why = exports.whip_core:RegisterAccessorySlot({ slot = 1, label = 'Phone', accepts = PHONE, icon = 'phone' })
        if not ok then print('[whip_phone] the strip\'s first slot takes anything, not only phones: ' .. tostring(why)) end
    end

    -- `false`: used, and KEPT. A use handler that answers nothing has its item consumed (whip_core's useItem: true or
    -- nothing = eaten, false = kept, false + why = refused), and "Use" on the phone ate it — the phone then opened, found
    -- no phone, and said so (Josh, 8 Oct 2026).
    -- THIS phone (Josh, 10 Oct 2026): Use on a phone opens that one, by its uid, while it is carried (Sim.choose);
    -- the open says it came from the item, so the session keeps the choice (the hotkey's forgets it).
    exports.whip_core:RegisterUseHandler(PHONE, function(source, _, slotData)
        local uid = type(slotData) == 'table' and type(slotData.metadata) == 'table' and slotData.metadata.uid or nil
        Sim.choose(source, uid)
        TriggerClientEvent('whip_phone:client:open', source, 'phone', true)
        return false
    end)
end)
