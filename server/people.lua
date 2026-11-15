-- Who is on, and who is near: for the apps that pick a person (Bank: share an account; Business: hire), and for
-- telling a character's phone something (Bank: money arrived). Josh, 8 Oct 2026: a person is picked from the players
-- nearby, by name, or by a typed character ID.

People = {}

local RADIUS, MAX = 15.0, 10

--- [charId] = { src, name }: the characters in the world now, kept from whip_core's player events.
local online = {}

local function track(src, charId, name)
    src, charId = tonumber(src), tonumber(charId)
    if src and charId then online[charId] = { src = src, name = name } end
end

--- whip_core (re)started: who is on now. The events keep it after that.
Whip.register(function()
    online = {}
    for _, p in pairs(exports.whip_core:GetPlayers({ light = true }) or {}) do
        track(p.source, p.charId, p.fullName)
    end
end)

AddEventHandler('whip_core:player:loaded', function(e)
    if type(e) == 'table' then track(e.source, e.charId, e.name) end
end)

-- Renamed in the admin panel (whip_core Character.rename): the same charId, the new name to show.
AddEventHandler('whip_core:character:renamed', function(e)
    if type(e) ~= 'table' then return end
    local o = online[tonumber(e.charId)]
    if o and type(e.name) == 'string' then o.name = e.name end
end)

AddEventHandler('whip_core:player:logout', function(e)
    if type(e) ~= 'table' then return end
    local o = online[tonumber(e.charId)]
    if o and o.src == tonumber(e.source) then online[tonumber(e.charId)] = nil end
end)

AddEventHandler('playerDropped', function()
    local src = source
    for charId, o in pairs(online) do
        if o.src == src then online[charId] = nil end
    end
end)

--- The server id of a character who is on, or nil.
---@param charId number
---@return number|nil
function People.sourceOf(charId)
    local o = online[tonumber(charId)]
    return o and o.src or nil
end

--- How far `other` is from `src` when they count as near (the same routing bucket: someone in another world, an
--- instance or an isolated Director run, is not standing there; and `src` may see their name — whip_core's name rule,
--- Config.ShowPlayerNames, Josh 8 Oct 2026: the list names them, so anyone else is picked by character ID). Nil when
--- they do not count, or are further than `range`.
local function nearDist(src, other, range)
    if other == src or GetPlayerRoutingBucket(other) ~= GetPlayerRoutingBucket(src) then return nil end
    local ped, p = GetPlayerPed(src), GetPlayerPed(other)
    if not ped or ped == 0 or not p or p == 0 then return nil end
    local d = #(GetEntityCoords(p) - GetEntityCoords(ped))
    if d > range or not exports.whip_core:CanSeePlayerName(src, other) then return nil end
    return d
end

--- The players within RADIUS of `src`, nearest first (up to MAX): { { src, name, dist } }, by nearDist's rule.
---@param src number
---@return table[]
function People.nearby(src)
    local list = {}
    for _, o in pairs(online) do
        local d = nearDist(src, o.src, RADIUS)
        if d then list[#list + 1] = { src = o.src, name = o.name or 'Someone', dist = d } end
    end
    table.sort(list, function(a, b) return a.dist < b.dist end)
    local out = {}
    for i = 1, math.min(#list, MAX) do
        out[i] = { src = list[i].src, name = list[i].name, dist = math.floor(list[i].dist + 0.5) }
    end
    return out
end

--- A person `viewer` picked on the page: { src = n } (from the nearby list) or { charId = n } (typed). Answers
--- whip_core's person ({ charId = n }) and their charId, or nil and why. A typed ID must name a character. Their
--- name comes back only when `viewer` may see it (whip_core's name rule): a typed ID must not tell anyone who it is.
---@param args table
---@param viewer number
---@return table|nil who
---@return number|string charIdOrWhy
---@return string|nil name
function People.picked(args, viewer)
    local who, charId, name
    local src = math.tointeger(tonumber(args.src))
    if src then
        for c, o in pairs(online) do
            if o.src == src then who, charId, name = { charId = c }, c, o.name break end
        end
        if not who then return nil, 'They are not here any more' end
        -- PICKED FROM THE NEARBY LIST MEANS NEAR (audit 11, SEC-3): any server id used to pass as "picked nearby",
        -- from across the map or another world, and the Sharing / offer lists then showed its character ID. Held to
        -- the list's own rule, with a little slack for someone who stepped back between the list and the tap.
        if not nearDist(viewer, src, RADIUS + 5.0) then
            return nil, 'They are not near you any more: type their character ID'
        end
    else
        charId = math.tointeger(tonumber(args.charId))
        if not charId or charId < 1 then return nil, 'Pick someone nearby, or type a character ID' end
        name = (exports.whip_core:GetCharacterNames({ charId }) or {})[charId]
        if not name then return nil, ('No character has the ID %d'):format(charId) end
        who = { charId = charId }
    end
    if not exports.whip_core:CanSeePlayerName(viewer, who) then name = nil end
    return who, charId, name
end
