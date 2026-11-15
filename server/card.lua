-- A player's own CONTACT CARD (Settings > My card; Josh, 25 Oct 2026): the name their phone shows as theirs, and a
-- profile picture the people who have their number saved see, in Contacts, Messages, Recents and on calls.
--
--   * The picture is a link on whip's accepted picture sites (whip_core Config.LorePictureLinks: Fivemanage by
--     default), checked by whip_core's CheckPicture, the same rule as a lore character's. Every phone that shows it
--     loads it, so nothing else is taken.
--   * Its framing ({ x, y, z }: the point kept in view and the zoom) goes with it, as a lore character's does.
--   * Kept on the SIM (its number's prefs: `card`): it goes where the SIM goes. Only the number's owner changes it,
--     never someone holding their SIM.

PhoneCards = {}

local WRITE = { rateLimit = 1000, burst = 3 }

local function trim(s) return (tostring(s or ''):gsub('%c', ' '):gsub('^%s+', ''):gsub('%s+$', '')) end

--- A number's card as kept: { name?, picture?, frame? } copied, or nil for none.
function PhoneCards.of(number)
    local c = number and Numbers.prefs(number).card
    if type(c) ~= 'table' then return nil end
    local frame = type(c.frame) == 'table' and { x = tonumber(c.frame.x), y = tonumber(c.frame.y), z = tonumber(c.frame.z) } or nil
    local out = {
        name = type(c.name) == 'string' and c.name ~= '' and c.name or nil,
        picture = type(c.picture) == 'string' and c.picture ~= '' and c.picture or nil,
    }
    if out.picture and frame and frame.x and frame.y and frame.z then out.frame = frame end
    if not out.name and not out.picture then return nil end
    return out
end

--- The picture a contact shows for a number: a lore character's (server/lore.lua), else its owner's card. Answers
--- url, frame (nil, nil for none). Checked again as a plain https address: the page draws it.
function PhoneCards.pictureOf(number)
    if LorePhones then
        local url, frame = LorePhones.pictureOf(number)
        if url then return url, frame end
        if Numbers.loreOf(number) then return nil, nil end
    end
    local c = PhoneCards.of(number)
    local url = c and c.picture
    if not c or type(url) ~= 'string' or not url:match('^https://[%w%-%.]+/[%w%-%._/]+$') then return nil, nil end
    return url, c.frame
end

--- The phones that have this number saved, told their contacts changed (its picture shows there now).
local function tellSavers(number)
    CreateThread(function()
        local ok, rows = PhoneDB.call('query', 'SELECT DISTINCT phoneNumber FROM phone_contacts WHERE contactNumber = ?', { number })
        if not ok then return end
        for _, r in ipairs(rows or {}) do
            local holder = Sim.holderOf(r.phoneNumber)
            if holder then TriggerClientEvent('whip_phone:client:push', holder, 'contacts', 'changed', {}) end
        end
    end)
end

Whip.register(function()
    -- args = { name, picture, frame = { x, y, z } } -> the card as kept (or {} for none)
    exports.whip_core:SecureCallback('whip_phone:settings:card', PhoneSchema(WRITE), function(source, player, args)
        if not PhoneDB.ready then return false, 'The phone network is starting, try again' end
        args = type(args) == 'table' and args or {}
        local s, why = Sim.resolve(source, player)
        if not s then return false, why end
        if not s.number or s.state ~= 'ok' then return false, 'Put your SIM card in the phone first' end
        if not player or s.owner ~= player.charId then return false, 'Only this number\'s owner can change its card' end
        local name = trim(args.name)
        if #name > 50 then return false, 'A name of up to 50 characters' end
        local picture = trim(args.picture)
        local ok, frameOrWhy = exports.whip_core:CheckPicture(picture, type(args.frame) == 'table' and args.frame or nil)
        if not ok then return false, frameOrWhy end
        local card = nil
        if name ~= '' or picture ~= '' then
            card = { name = name ~= '' and name or nil, picture = picture ~= '' and picture or nil,
                     frame = picture ~= '' and frameOrWhy or nil }
        end
        local before = PhoneCards.of(s.number)
        local sok, swhy = Numbers.setPref(s.number, 'card', card)
        if not sok then return false, swhy end
        local was, now = before and before.frame or {}, card and card.frame or {}
        if (before and before.picture or '') ~= picture or was.x ~= now.x or was.y ~= now.y or was.z ~= now.z then
            tellSavers(s.number)
        end
        return PhoneCards.of(s.number) or {}
    end)
end)
