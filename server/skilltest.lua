-- The Skill Check Tester (html/modules/skilltest), a developer app (Config.DeveloperApps). Every request is checked
-- here: dev tools and developer mode on (whip_core's HasDevTools).
--
-- TEST RUNS ONLY: the tester plays with its own numbers, and nothing is saved. The test itself
-- plays on the player's client (client/main.lua) and nothing hangs on its answer, so the server only says who may.

local LIGHT = { rateLimit = 250, burst = 6 }
local WRITE = { rateLimit = 500, burst = 3 }
local LEVELS = { easy = true, medium = true, hard = true }
local NOT_DEV = 'The Skill Check Tester is for developers: turn developer mode on in /w'

local function developer(source) return exports.whip_core:HasDevTools(source) == true end

--- A test's numbers as plain data: numbers, true / false, short words, and tables of those two deep (Override's gapMs,
--- Code Recall's rounds). Anything else is left out.
local function plain(v, depth)
    local t = type(v)
    if t == 'number' then return (v == v and v ~= math.huge and v ~= -math.huge) and v or nil end
    if t == 'boolean' then return v end
    if t == 'string' then return #v <= 32 and v or nil end
    if t ~= 'table' or depth > 2 then return nil end
    local out, n = {}, 0
    for k, x in pairs(v) do
        n = n + 1
        if n > 40 then break end
        if (type(k) == 'string' and #k <= 32) or math.type(k) == 'integer' then out[k] = plain(x, depth + 1) end
    end
    return out
end

Whip.register(function()
    -- -> { ring = { holdMs, mouseSpeed, difficulties }, games = { { key, name, goal, enabled, levels }, ... } }: the
    -- numbers each check plays with now (config.lua's, or the ring's as an admin changed it in /whip Config)
    exports.whip_core:SecureCallback('whip_phone:skilltest:settings', PhoneSchema(LIGHT), function(source)
        if not developer(source) then return false, NOT_DEV end
        return { ring = exports.whip_core:GetSkillCheckSettings(), games = PhoneSkillGames.all() }
    end)

    -- args = { game ('ring' or a phone game's key), level, settings }: played on their client, which answers the app
    -- with a push ('result')
    exports.whip_core:SecureCallback('whip_phone:skilltest:run', PhoneSchema(WRITE), function(source, _, args)
        if not developer(source) then return false, NOT_DEV end
        args = type(args) == 'table' and args or {}
        if args.game ~= 'ring' and not PhoneSkillGames.info(args.game) then return false, 'There is no such skill check' end
        if not LEVELS[args.level] then return false, 'Pick easy, medium or hard' end
        local settings = plain(args.settings, 1)
        if type(settings) ~= 'table' then return false, 'The test has no numbers' end
        TriggerClientEvent('whip_phone:client:skilltest', source, { game = args.game, level = args.level, settings = settings })
        return true
    end)
end)
