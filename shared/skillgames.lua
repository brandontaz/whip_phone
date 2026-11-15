-- The phone's skill check games (Config.SkillGames), read the same way on both sides: which there are, a level's
-- settings, and how fast each level can honestly be played (whip_core's floor) and when the server gives up.
-- The games themselves are html/modules/skillcheck/module.js; client/main.lua plays them, server/skillgames.lua
-- registers them with whip_core.

PhoneSkillGames = {}

local GAMES = {
    { key = 'bruteforce',    name = 'Brute Force',    goal = 'Lock each reel when its letter is on the line.' },
    { key = 'coderecall',    name = 'Code Recall',    goal = 'Watch the code, then enter it.' },
    { key = 'fragmentmatch', name = 'Fragment Match', goal = 'Slide the columns until the middle line matches the code.' },
    { key = 'override',      name = 'Override',       goal = 'Press each arrow as it crosses the line.' },
    { key = 'reroute',       name = 'Reroute',        goal = 'Turn the tiles until power reaches the exit.' },
    { key = 'safecrack',     name = 'Safe Crack',     goal = 'Turn the dial and set each number on the heavy click.' },
    { key = 'stabilise',     name = 'Stabilise',      goal = 'Keep the needle inside the band until the drill is through.' },
}
local LEVELS = { 'easy', 'medium', 'hard' }

-- The page's own timings (module.js INTRO_MS and RESULT_MS): every honest game shows both.
local INTRO_MS, RESULT_MS = 1800, 1300
-- The phone coming out and unfolding, and the round trip: on top of a level's clock before the server gives up.
local SLACK_MS = 5000

local function num(v, d) return type(v) == 'number' and v == v and v ~= math.huge and v ~= -math.huge and v or d end

--- The games that are on (Config.SkillGames, enabled ~= false): { { key, id, name, goal, label }, ... }.
function PhoneSkillGames.list()
    local out = {}
    local all = type(Config.SkillGames) == 'table' and Config.SkillGames or {}
    for _, g in ipairs(GAMES) do
        local c = all[g.key]
        if type(c) == 'table' and c.enabled ~= false then
            out[#out + 1] = { key = g.key, id = 'phone.' .. g.key, name = g.name, goal = g.goal, label = g.name .. ' (phone)' }
        end
    end
    return out
end

--- One game by its key, on or off: { key, name, goal, enabled }, or nil.
function PhoneSkillGames.info(key)
    for _, g in ipairs(GAMES) do
        if g.key == key then
            local c = type(Config.SkillGames) == 'table' and Config.SkillGames[key] or nil
            return { key = g.key, name = g.name, goal = g.goal, enabled = type(c) == 'table' and c.enabled ~= false }
        end
    end
    return nil
end

--- Every game, on or off, with each level's settings (the Skill Check Tester): { { key, name, goal, enabled, levels } }.
function PhoneSkillGames.all()
    local out = {}
    for _, g in ipairs(GAMES) do
        local one = PhoneSkillGames.info(g.key)
        ---@cast one -nil   -- g is one of GAMES, so info finds it
        one.levels = {}
        for _, name in ipairs(LEVELS) do one.levels[name] = PhoneSkillGames.level(g.key, name) end
        out[#out + 1] = one
    end
    return out
end

--- One level's settings, as config.lua has them (a copy: plain data for the page), or nil.
---@param key string     'reroute'
---@param level string   'easy' | 'medium' | 'hard'
---@return table|nil
function PhoneSkillGames.level(key, level)
    local c = type(Config.SkillGames) == 'table' and Config.SkillGames[key] or nil
    local lv = type(c) == 'table' and type(level) == 'string' and c[level] or nil
    if type(lv) ~= 'table' then return nil end
    local function copy(t, depth)
        local o = {}
        for k, v in pairs(t) do
            if type(v) == 'table' then o[k] = depth < 3 and copy(v, depth + 1) or nil
            elseif type(v) ~= 'function' then o[k] = v end
        end
        return o
    end
    return copy(lv, 1)
end

--- The track's length for Override (its clock), as the page works it out.
local function overrideMs(c)
    local gap = type(c.gapMs) == 'table' and c.gapMs or {}
    local travel = math.max(0.5, math.min(5, num(c.fallSeconds, 1.5))) * 1000
    local arrows = math.max(1, math.min(80, math.floor(num(c.arrows, 20))))
    return travel + 700 + arrows * math.max(150, math.min(4000, num(gap.max, 760))) + 1600
end

--- How fast this level can honestly be played (the server refuses a pass quicker than this) and how long the
--- server waits. Deliberately low floors: the page's intro and result alone take 3.1 s, plus what the game itself
--- cannot be done faster than (Code Recall's flashes, Override's track, Stabilise's drill).
---@return number minMs
---@return number timeoutMs
function PhoneSkillGames.timing(key, c)
    c = type(c) == 'table' and c or {}
    local floor = 0
    local clock = num(c.seconds, 30) * 1000
    if key == 'bruteforce' then
        floor = math.max(1, num(c.reels, 6)) * 100
    elseif key == 'coderecall' then
        local per = math.max(160, num(c.flashMs, 430) + num(c.gapMs, 170))
        local rounds = type(c.rounds) == 'table' and c.rounds or { 4, 5, 6, 7 }
        for i, len in ipairs(rounds) do
            floor = floor + 700 + math.max(1, num(len, 4)) * per
            if i > 1 then floor = floor + 750 end
        end
        floor = floor * 0.9
    elseif key == 'fragmentmatch' then
        floor = math.max(1, num(c.columns, 6)) * 150
    elseif key == 'override' then
        local gap = type(c.gapMs) == 'table' and c.gapMs or {}
        local travel = math.max(0.5, math.min(5, num(c.fallSeconds, 1.5))) * 1000
        local arrows = math.max(1, math.floor(num(c.arrows, 20)))
        floor = (travel + 700 + (arrows - 1) * math.max(150, num(gap.min, 430)) - num(c.windowMs, 110)) * 0.95
        clock = overrideMs(c)
    elseif key == 'reroute' then
        floor = 1000
    elseif key == 'safecrack' then
        floor = math.max(1, num(c.numbers, 3)) * 400
    elseif key == 'stabilise' then
        floor = math.max(1, num(c.drillSeconds, 9)) * 1000 * 0.97
    end
    local minMs = math.floor((INTRO_MS + RESULT_MS) * 0.8 + math.max(0, floor))
    local timeoutMs = math.floor(math.min(120000, clock + INTRO_MS + RESULT_MS + SLACK_MS))
    if minMs >= timeoutMs then minMs = math.floor(timeoutMs / 2) end
    return minMs, timeoutMs
end

--- Every level of a game, timed: { easy = { minMs, timeoutMs }, ... } (the levels config.lua has).
function PhoneSkillGames.levels(key)
    local out = {}
    for _, name in ipairs(LEVELS) do
        local c = PhoneSkillGames.level(key, name)
        if c then
            local minMs, timeoutMs = PhoneSkillGames.timing(key, c)
            out[name] = { minMs = minMs, timeoutMs = timeoutMs }
        end
    end
    return out
end
