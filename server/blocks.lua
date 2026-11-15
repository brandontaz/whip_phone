-- The block list (14 Nov 2026): numbers a SIM gets no texts or calls from. Like its contacts, the list is the SIM's
-- (server/contract.lua, WHOSE DATA): whoever has the SIM in their phone blocks and unblocks, and the list goes wherever
-- the SIM goes.
--
--   * A text from a blocked number is kept, marked `blocked` (phone_messages), and never pushed: no notification,
--     nothing in the blocker's conversations or unread counts, then or after an unblock. The sender's own thread shows
--     it sent, as any other (server/contract.lua).
--   * A call from one rings nobody. The caller hears it ring out ("No answer"), as any call nobody picks up, and its
--     row is marked `blocked`, so the blocker's Recents leave it out (server/calls.lua). A call already ringing when
--     the block is made stops ringing at the blocker's end and goes the same way (Calls.blocked).
--   * NOTHING TELLS THE BLOCKED NUMBER: every answer its phone gets is one an unblocked number could get.
--   * A lore character's number can't be blocked: their texts and calls drive the Director's scenarios
--     (server/lore.lua). The Bank and Business apps send nothing from a number (their notifications are the
--     character's), so there is nothing of theirs to block.
--
-- Every list is kept in memory (read at start, written through), as the numbers are: a text or a call asks it without
-- a database read, and without a wait between the asking and the ringing.

Blocks = {}

local LIGHT = { rateLimit = 250, burst = 6 }     -- reads
local WRITE = { rateLimit = 500, burst = 3 }     -- writes

--- At most BLOCKS_MAX numbers a SIM, as contacts have theirs (server/contract.lua): every list is held in memory.
local BLOCKS_MAX = 100

--- [number] = { [blocked number] = when it was blocked (seconds) }: every SIM's list
local lists = {}

--- Whether the SIM with `number` blocked `other`. A number that is a lore character's now is never held back, even if
--- it was blocked before it became one (the admin panel changing a lore character's number leaves the new number
--- no one's until the character next needs it: Numbers.forLore).
---@param number string|nil
---@param other string|nil
---@return boolean
function Blocks.has(number, other)
    local list = number and lists[number]
    if not list or not other or not list[other] then return false end
    return Numbers.loreOf(other) == nil
end

--- A SIM's list: { { number, time }, ... }, the latest block first.
---@param number string
---@return table[]
function Blocks.listOf(number)
    local out = {}
    for n, t in pairs(lists[number] or {}) do out[#out + 1] = { number = n, time = t } end
    table.sort(out, function(a, b)
        if a.time ~= b.time then return a.time > b.time end
        return a.number < b.number
    end)
    return out
end

--- A block whose list or number the admin Phones panel retired (server/numbers.lua): moved in the database to the
--- number each became, as the panel moves their contacts, texts and calls; removed when either was deleted. Answers
--- where it is now (nil, nil: gone). A database error leaves it as it was, to try again at the next read.
local function follow(by, number)
    -- (not `isRetired(n) and forward(n) or n`: a deleted number's nil would fall through to the number itself)
    local function now(n)
        if not Numbers.isRetired(n) then return n end
        return Numbers.forward(n)
    end
    local to, blocked = now(by), now(number)
    local gone = not to or not blocked or to == blocked
    local ok = pcall(function()
        if not gone then
            -- IGNORE: the new number may block it already. That row stays, and this one goes below.
            MySQL.update.await('UPDATE IGNORE phone_blocks SET phoneNumber = ?, blockedNumber = ? WHERE phoneNumber = ? AND blockedNumber = ?',
                { to, blocked, by, number })
        end
        MySQL.update.await('DELETE FROM phone_blocks WHERE phoneNumber = ? AND blockedNumber = ?', { by, number })
    end)
    if not ok then return by, number end
    if gone then return nil, nil end
    return to, blocked
end

--- Read every list again: whip_phone starting, and after the admin panel changed numbers (ReloadCache, after
--- Numbers.load, so retired numbers are known). Built on the side and swapped in once read, as the numbers are: a
--- failed read leaves the lists in force. Answers true when it read them.
---@return boolean
function Blocks.load()
    local ok, res = pcall(MySQL.query.await, 'SELECT phoneNumber, blockedNumber, UNIX_TIMESTAMP(createdAt) AS t FROM phone_blocks')
    if not ok or type(res) ~= 'table' then
        print('^1[whip_phone] the block lists could not be read: ' .. tostring(ok and 'no answer' or res) .. '^0')
        return false
    end
    local fresh = {}
    for _, r in ipairs(res) do
        local by, number = r.phoneNumber, r.blockedNumber
        if Numbers.isRetired(by) or Numbers.isRetired(number) then by, number = follow(by, number) end
        if by and number then
            fresh[by] = fresh[by] or {}
            fresh[by][number] = tonumber(r.t) or os.time()
        end
    end
    lists = fresh
    return true
end

Whip.register(function()
    local function cb(name, schema, fn)
        exports.whip_core:SecureCallback(name, PhoneSchema(schema), function(source, player, args)   -- args: server/main.lua
            if not PhoneDB.ready then return false, 'The phone network is starting, try again' end
            return fn(source, player, type(args) == 'table' and args or {})
        end)
    end

    -- -> { { number, time }, ... }, the latest first: the SIM in the phone's list (Settings > Blocked numbers)
    cb('whip_phone:blocks:list', LIGHT, function(source, player)
        local me = Sim.numberOf(source, player)
        if not me then return {} end
        return Blocks.listOf(me)
    end)

    -- args = { number }: block it. Blocking one already blocked is fine (true).
    cb('whip_phone:blocks:add', WRITE, function(source, player, args)
        local me, why = Sim.numberOf(source, player)
        if not me then return false, why end
        local number = Numbers.clean(args.number)
        if not number then return false, 'A phone number is 10 digits' end
        if number == me then return false, 'You cannot block your own number' end
        -- A number in service only: one typed at random could be minted for somebody later, who would start out blocked.
        local row = Numbers.get(number)
        if not row then return false, 'Number not in service' end
        if row.loreKey then return false, 'This number cannot be blocked' end
        local mine = lists[me] or {}
        if mine[number] then return true end
        local n = 0
        for _ in pairs(mine) do n = n + 1 end
        if n >= BLOCKS_MAX then return false, ('This SIM blocks %d numbers at most: unblock one first'):format(BLOCKS_MAX) end
        if not PhoneDB.call('update', 'INSERT IGNORE INTO phone_blocks (phoneNumber, blockedNumber) VALUES (?, ?)', { me, number }) then
            return false, PhoneDB.NET_DOWN
        end
        -- After the wait: a reload may have swapped the lists meanwhile.
        lists[me] = lists[me] or {}
        lists[me][number] = os.time()
        Calls.blocked(me, number)   -- a call from them ringing now stops ringing here
        return true
    end)

    -- args = { number }: unblock it. What it sent while blocked stays out of sight (server/contract.lua).
    cb('whip_phone:blocks:remove', WRITE, function(source, player, args)
        local me, why = Sim.numberOf(source, player)
        if not me then return false, why end
        local number = Numbers.clean(args.number)
        if not number then return false, 'A phone number is 10 digits' end
        if not PhoneDB.call('update', 'DELETE FROM phone_blocks WHERE phoneNumber = ? AND blockedNumber = ?', { me, number }) then
            return false, PhoneDB.NET_DOWN
        end
        if lists[me] then lists[me][number] = nil end
        return true
    end)
end)
