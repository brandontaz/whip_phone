-- Phone numbers: who owns each one, and whether it is locked. Every number is kept in memory (loaded at
-- start, written through on every change), so working out a player's SIM costs no database read.
--
-- A NUMBER IS MINTED IN MEMORY AND WRITTEN WHEN THE SIM IS FIRST USED. A SIM card's number is made when
-- the card is (server/items.lua, the item's default metadata), and that can run more than once for one
-- card: a give tries each pocket in turn. Writing the row there would leave a number behind for every
-- try that did not land. So minting only reserves it here, and the row is written by Numbers.activate
-- the first time the SIM is in a phone (server/sim.lua). The owner is on the card meanwhile. A reservation
-- lives in memory only, so after a restart a number on a card not used yet can be minted again: whichever
-- card is used second finds the row someone else's, and Sim.resolve gives it a new number (audit 13, PLY-1).

Numbers = {}

--- [number] = { charId, locked }: every number in phone_numbers that is in use
local rows = {}
--- [number] = the number it was changed to, or false: numbers the admin panel deleted or changed. They are kept
--- (retired), never removed, because a SIM card carries its number: a removed one came back the next time that
--- card's phone opened (audit 9, DAT-2). A deleted number's card works no more; a changed number's card is
--- written over with the new number (Sim.resolve). A retired number is never minted again.
local retired = {}
--- [number] = true: minted since start and not written yet (so it is never handed out twice)
local reserved = {}

local function prefixes()
    local p = Config.NumberPrefixes
    return (type(p) == 'table' and #p > 0) and p or { '689', '041', '227', '869', '915' }
end

--- A number's digits, or nil when it is not 10 of them.
---@return string|nil
function Numbers.clean(n)
    n = tostring(n or ''):gsub('%D', '')
    return #n == 10 and n or nil
end

--- A SIM's prefs as stored (JSON), as a table; {} when none or unreadable.
local function decodePrefs(s)
    if type(s) ~= 'string' or s == '' then return {} end
    local ok, t = pcall(json.decode, s)
    return (ok and type(t) == 'table') and t or {}
end

--- A number's row. A lore character's (server/lore.lua) has no charId and its loreKey instead.
local function rowOf(r)
    return { charId = tonumber(r.charId), loreKey = r.loreKey, locked = r.locked == 1 or r.locked == true,
             prefs = decodePrefs(r.prefs) }
end

--- Read every number again. The new list is built on the side and swapped in only once it has loaded: while
--- the read is out, and after one that failed, the old list stays in force (audit 9, DAT-4: it used to be
--- emptied first, so every text and call in that window, or until a restart after a failed read, was 'not in
--- service'). Answers true when it loaded.
---@return boolean
function Numbers.load()
    -- Every column: loreKey is there only once its migration ran (schema.lua migrateLore).
    local ok, res = pcall(MySQL.query.await, 'SELECT * FROM phone_numbers')
    if not ok or type(res) ~= 'table' then
        print('^1[whip_phone] the phone numbers could not be read: ' .. tostring(ok and 'no answer' or res) .. '^0')
        return false
    end
    local fresh, gone = {}, {}
    for _, r in ipairs(res) do
        if r.retiredAt then
            gone[r.phoneNumber] = Numbers.clean(r.renamedTo) or false
        else
            fresh[r.phoneNumber] = rowOf(r)
        end
    end
    rows, retired = fresh, gone
    return true
end

--- Whether the admin panel deleted or changed this number (see `retired`).
function Numbers.isRetired(n)
    return retired[n] ~= nil
end

--- Where a retired number went: the number in use it was changed to (following a number changed twice), or nil
--- when it was deleted.
---@return string|nil
function Numbers.forward(n)
    for _ = 1, 8 do
        local to = retired[n]
        if not to then return nil end
        if rows[to] then return to end
        n = to
    end
    return nil
end

--- What a SIM carries besides its number (the home arrangement): a table, never nil for a known number.
function Numbers.prefs(n)
    local r = rows[n]
    return r and r.prefs or {}
end

--- [number] = true while that SIM's prefs are being written: a second change waits its turn (audit 13, INV-7:
--- two at once each copied the prefs from before either, and the later write lost the earlier one's key)
local writing = {}

--- Change one key of a SIM's prefs and save them. Answers true, or false and why.
---@return boolean ok
---@return string|nil why
function Numbers.setPref(n, key, value)
    -- One write at a time for a SIM, waiting at most 5 s for the one before
    local deadline = GetGameTimer() + 5000
    while writing[n] and GetGameTimer() < deadline do Wait(50) end
    if writing[n] then return false, 'Busy, try again' end
    -- Read after the wait: the change before this one is in it (and a reload may have swapped the list)
    local r = rows[n]
    if not r then return false, 'No such number' end
    local prefs = {}
    for k, v in pairs(r.prefs or {}) do prefs[k] = v end
    prefs[key] = value
    local encoded = json.encode(prefs)
    if #encoded > 16000 then return false, 'Too much to keep on a SIM' end
    writing[n] = true
    local ok = pcall(MySQL.update.await, 'UPDATE phone_numbers SET prefs = ? WHERE phoneNumber = ?', { encoded, n })
    writing[n] = nil
    if not ok then return false, 'Could not save that' end
    r.prefs = prefs
    return true
end

--- A new number nobody has, reserved until it is written (activate). nil if none was found (it would take
--- millions of numbers in use).
---@return string|nil
function Numbers.mint()
    local p = prefixes()
    for _ = 1, 200 do
        local n = p[math.random(#p)] .. ('%07d'):format(math.random(0, 9999999))
        if not rows[n] and not reserved[n] and retired[n] == nil then
            reserved[n] = true
            return n
        end
    end
    return nil
end

--- { charId, locked } for a number, or nil when nobody has it.
function Numbers.get(n)
    return rows[n]
end

--- Write a minted (or admin-made) number for its owner, the first time its SIM is used. A number already
--- written keeps its owner. Answers its row, or nil when the database refused.
---@param n string
---@param charId number
---@return table|nil row
function Numbers.activate(n, charId)
    if rows[n] then return rows[n] end
    if retired[n] ~= nil then return nil end
    local ok = pcall(MySQL.insert.await,
        'INSERT IGNORE INTO phone_numbers (phoneNumber, charId) VALUES (?, ?)', { n, charId })
    reserved[n] = nil
    if not ok then return nil end
    -- Read back: INSERT IGNORE leaves a row someone else wrote first (the admin panel) as it was, a retired
    -- one included (retired since the last load).
    local rok, r = pcall(MySQL.single.await,
        'SELECT charId, locked, prefs, retiredAt, renamedTo FROM phone_numbers WHERE phoneNumber = ?', { n })
    if not rok or not r then return nil end
    if r.retiredAt then
        retired[n] = Numbers.clean(r.renamedTo) or false
        return nil
    end
    rows[n] = rowOf(r)
    return rows[n]
end

--- The lore character a number belongs to (its key), or nil.
function Numbers.loreOf(n)
    local r = rows[n]
    return r and r.loreKey or nil
end

--- A lore character's number, made the first time it is asked for (no character owns it). nil when the
--- database refused. Its contacts, texts and calls are the same rows as anyone's.
---@param key string
---@return string|nil
function Numbers.forLore(key, again)
    for n, r in pairs(rows) do
        if r.loreKey == key then return n end
    end
    local n = Numbers.mint()
    if not n then return nil end
    local ok = pcall(MySQL.insert.await, 'INSERT INTO phone_numbers (phoneNumber, charId, loreKey) VALUES (?, NULL, ?)', { n, key })
    reserved[n] = nil
    if ok then
        rows[n] = { loreKey = key, locked = false, prefs = {} }
        return n
    end
    -- The key is on a row already (one key, one number).
    local rok, r = pcall(MySQL.single.await,
        'SELECT phoneNumber, charId, loreKey, locked, prefs, retiredAt FROM phone_numbers WHERE loreKey = ?', { key })
    if not rok or not r then return nil end
    if not r.retiredAt then
        -- Made meanwhile (another call, a restart's sync): that one.
        rows[r.phoneNumber] = rowOf(r)
        return r.phoneNumber
    end
    -- The admin Phones panel changed or deleted it: the key comes off the retired row, and goes to the number it
    -- was changed to (no one's), or to a new one.
    if again or not pcall(MySQL.update.await, 'UPDATE phone_numbers SET loreKey = NULL WHERE phoneNumber = ?', { r.phoneNumber }) then
        return nil
    end
    local to = Numbers.forward(r.phoneNumber)
    if to and rows[to] and not rows[to].charId and not rows[to].loreKey then
        if not pcall(MySQL.update.await, 'UPDATE phone_numbers SET loreKey = ? WHERE phoneNumber = ?', { key, to }) then return nil end
        rows[to].loreKey = key
        return to
    end
    return Numbers.forLore(key, true)
end

--- The numbers a character owns: { { number, locked }, ... }, in number order.
function Numbers.ownedBy(charId)
    local out = {}
    for n, r in pairs(rows) do
        if r.charId == charId then out[#out + 1] = { number = n, locked = r.locked } end
    end
    table.sort(out, function(a, b) return a.number < b.number end)
    return out
end

--- Lock or unlock one of the character's own numbers. A locked number works in no phone.
---@return boolean ok
---@return string|nil why
function Numbers.setLocked(n, charId, on)
    local r = rows[n]
    if not r or r.charId ~= charId then return false, 'That is not your number' end
    on = on == true
    if r.locked == on then return true end
    local ok = pcall(MySQL.update.await, 'UPDATE phone_numbers SET locked = ? WHERE phoneNumber = ? AND charId = ?',
        { on and 1 or 0, n, charId })
    if not ok then return false, 'Could not save that' end
    r.locked = on
    return true
end
