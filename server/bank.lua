-- The Bank app's server side (Josh, 8 Oct 2026: whip_core's old Banking app, rebuilt as a phone module). Requests
-- `whip_phone:bank:*`, answered from whip_core's bank exports, called AS THE PLAYER (`source`): every rule is the
-- bank's own, so what it allows here it allows anywhere (transfers need withdraw, sharing checks the sharer, closing
-- checks the owner, the account limit is its setting).
--
-- WHOSE BANK: the character holding the phone, whatever SIM is in it (Josh, 7 Oct 2026: "if I have someone else's
-- sim, but open the bank app, it's my bank").
--
-- LIVE: a player who asked for their accounts is watching them, while the Bank app is in front of them. A deposit,
-- withdrawal or transfer on one of those accounts tells their phone to read them again. Leaving the app or putting the
-- phone away stops it (`unwatch`; audit 9, NEW-3: it used to last until they disconnected, so every sale on a shop's
-- account made each employee's phone, app open or not, read the bank again). Money arriving in someone's own account
-- (not a business's), that they did not move themselves, shows "Received $X" on their phone either way.

local LIGHT = { rateLimit = 250, burst = 6 }     -- reads
local WRITE = { rateLimit = 500, burst = 3 }     -- money and access
local HISTORY = 30                               -- transactions shown for an account

local RANK = { view = 1, deposit = 2, withdraw = 3, manager = 4, owner = 5 }
local SHAREABLE = { view = true, deposit = true, withdraw = true, manager = true }
local TX_TEXT = { deposit = 'Deposit', withdraw = 'Withdrawal', transfer = 'Transfer', payment = 'Payment' }

--- [source] = { [accountId] = true }: the accounts each player's Bank app last listed.
local watching = {}

AddEventHandler('playerDropped', function() watching[source] = nil end)
AddEventHandler('whip_core:player:logout', function(e)
    local src = type(e) == 'table' and tonumber(e.source) or nil
    if src then watching[src] = nil end
end)

local function cb(name, schema, fn)
    exports.whip_core:SecureCallback('whip_phone:bank:' .. name, PhoneSchema(schema), function(source, player, args)   -- args: server/main.lua
        if not player or not player.charId then return false, 'Your character is not loaded' end
        if not Sim.phoneOf(source) then return false, 'You need a phone' end
        return fn(source, player, type(args) == 'table' and args or {})
    end)
end

local function whole(v)
    local n = math.tointeger(tonumber(v))
    return n and n > 0 and n or nil
end

--- A line of text from the page: control characters out, trimmed, at most `max` bytes (whole characters).
local function text(v, max)
    if type(v) ~= 'string' then return '' end
    v = v:gsub('[%z\1-\31]', ''):gsub('^%s+', ''):gsub('%s+$', '')
    if #v > max then
        v = v:sub(1, max)
        v = v:gsub('[\192-\255][\128-\191]*$', '')    -- not half a character
    end
    return v
end

local function money(n)
    local s = tostring(math.floor(math.abs(tonumber(n) or 0)))
    return '$' .. s:reverse():gsub('(%d%d%d)', '%1,'):reverse():gsub('^,', '')
end

--- The accounts this character can use, each with their role on it, or nil and why.
local function accountsOf(charId)
    local rows, err = exports.whip_core:GetCharacterBankAccounts(charId)
    if err or type(rows) ~= 'table' then return nil, 'The bank is not answering, try again' end
    return rows
end

--- One of this character's accounts (their role on it included), or nil and why.
local function mine(charId, accountId)
    local rows, why = accountsOf(charId)
    if not rows then return nil, why end
    for _, r in ipairs(rows) do
        if r.accountId == accountId then return r, rows end
    end
    return nil, 'That account is not yours'
end

local jobNames = {}
local function jobName(jobId)
    if not jobId then return nil end
    if jobNames[jobId] == nil then
        local job = exports.whip_core:GetJob(jobId)
        jobNames[jobId] = job and job.name or false
    end
    return jobNames[jobId] or nil
end
AddEventHandler('whip_core:job:updated', function(e) if type(e) == 'table' then jobNames[e.jobId] = nil end end)

--- An account as the page shows it.
local function summary(r)
    return {
        id = r.accountId, number = r.accountNumber, label = r.label, type = r.type,
        balance = tonumber(r.balance) or 0, role = r.role,
        default = r.isDefault == true, frozen = r.frozen == true, job = jobName(r.jobId),
    }
end

--- May this account be closed from the phone? (The bank asks again: CloseBankAccount with who.)
local function closable(r)
    return r.role == 'owner' and r.isDefault ~= true and not r.jobId and (r.type == 'savings' or r.type == 'shared')
end

-- ---------------------------------------------------------------- invites
--- ADDING SOMEONE TO AN ACCOUNT IS AN INVITE THEY ACCEPT (Josh, 8 Oct 2026; audit 9, NEW-2). A typed character ID
--- used to go straight onto the account, and the access list then named whoever it was: a way round the name rule
--- (any ID to a full name, then unshare). Now nobody is on an account until they say yes on their own phone. Their
--- phone shows the invite (who from, which account, what they may do); declined, the sender's phone says "Invite
--- declined"; accepted, they are on it and their name shows in the list, as anyone on an account sees who shares it.
--- The bank's own rules are asked again when they accept (the sender may have lost the right since).
--- Kept in memory: gone after INVITE_TTL_S, or at a restart (sent again then).
local INVITE_TTL_S = 24 * 3600
local INVITES_PER_ACCOUNT = 10
--- [id] = { id, accountId, label, role, fromCharId, fromName, toCharId, toName (nil: the sender may not see it), at }
local invites, inviteSeq = {}, 0

--- AFTER A TAKE-BACK OR A DECLINE, THE SAME SENDER WAITS BEFORE INVITING THE SAME PERSON AGAIN (Josh, 8 Oct 2026; audit
--- 10, SEC-2). The rate limit slows a sender down but did not stop invite, take back, invite again: a capsule on the
--- other player's phone twice a second for as long as anyone liked. Any account: cycling five is the same person
--- asked. [fromCharId .. ':' .. toCharId] = when the last invite between them was taken back or declined.
local AGAIN_S = 10
local endedAt = {}

local function tooSoon(fromCharId, toCharId)
    local t = endedAt[fromCharId .. ':' .. toCharId]
    return t ~= nil and os.time() - t < AGAIN_S
end

local function noteEnded(inv)
    endedAt[inv.fromCharId .. ':' .. inv.toCharId] = os.time()
end

local function pruneInvites()
    local now = os.time()
    for id, inv in pairs(invites) do
        if now - inv.at > INVITE_TTL_S then invites[id] = nil end
    end
    for key, t in pairs(endedAt) do
        if now - t >= AGAIN_S then endedAt[key] = nil end
    end
end

--- The live invites on an account, oldest first.
local function invitesOn(accountId)
    local out = {}
    for _, inv in pairs(invites) do
        if inv.accountId == accountId then out[#out + 1] = inv end
    end
    table.sort(out, function(a, b) return a.id < b.id end)
    return out
end

--- An invite as the invited player's phone shows it.
local function inviteView(inv)
    return { invite = inv.id, account = inv.label, role = inv.role, from = inv.fromName }
end

--- Send a push to a character's phone, if they are on and carry one.
local function toPhone(charId, event, data)
    local src = People.sourceOf(charId)
    if src and Sim.phoneOf(src) then TriggerClientEvent('whip_phone:client:push', src, 'bank', event, data) end
    return src
end

--- Tell the sender how it went: a notification on their phone (it opens the account), and their Sharing list read again.
local function tellSender(inv, message, kind)
    local src = toPhone(inv.fromCharId, 'shared', { id = inv.accountId })
    if src and Sim.phoneOf(src) then
        TriggerClientEvent('whip_phone:client:notify', src, {
            app = 'bank', title = inv.label, text = message, kind = kind, args = { id = inv.accountId },
        })
    end
end

Whip.register(function()
    -- args = { watch = false }: listed without watching (the app is not in front of the player: the phone's session
    -- reading ahead). -> { { id, number, label, type, balance, role, default, frozen, job }, ... } (the default first)
    cb('accounts', LIGHT, function(source, player, args)
        local rows, why = accountsOf(player.charId)
        if not rows then return false, why end
        local out, seen = {}, {}
        for i, r in ipairs(rows) do
            out[i] = summary(r)
            seen[r.accountId] = true
        end
        watching[source] = args.watch ~= false and seen or nil
        return out
    end)

    -- The Bank app left the screen (another app, home, or the phone put away): no more live pushes until it lists the
    -- accounts again. Answered with or without a phone in hand (it may just have been dropped).
    exports.whip_core:SecureCallback('whip_phone:bank:unwatch', LIGHT, function(source)
        watching[source] = nil
        return true
    end)

    -- args = { id } -> { account, can = { transfer, share, close }, history = { { id, amount, dir, text, time, balance } } }
    cb('account', LIGHT, function(source, player, args)
        local id = whole(args.id)
        local r, why = mine(player.charId, id)
        if not r then return false, why end
        ---@cast id -nil   -- mine found it
        local rows = exports.whip_core:GetBankTransactions(id, HISTORY, 0) or {}
        -- A transfer's other side is named when no character owns it (a lore character's account, a business's):
        -- "From Big Evil Criminal Boss". A person's account is never named here.
        local named = {}
        local function partyOf(otherId)
            if not otherId or otherId == id then return nil end
            if named[otherId] == nil then
                local acc = exports.whip_core:GetBankAccount(otherId)
                named[otherId] = (acc and acc.ownerCharId == nil and type(acc.label) == 'string') and acc.label or false
            end
            return named[otherId] or nil
        end
        local history = {}
        for i, t in ipairs(rows) do
            local out = t.fromAccountId == id and t.toAccountId ~= id
            history[i] = {
                id = t.txId, amount = tonumber(t.amount) or 0, dir = out and 'out' or 'in',
                text = (type(t.message) == 'string' and t.message ~= '') and t.message or TX_TEXT[t.type] or 'Bank',
                time = t.createdAt, balance = tonumber(out and t.fromBalance or t.toBalance),
                party = t.type == 'transfer' and partyOf(out and t.toAccountId or t.fromAccountId) or nil,
            }
        end
        local rank = RANK[r.role] or 0
        if watching[source] then watching[source][id] = true end
        return {
            account = summary(r),
            can = { transfer = rank >= RANK.withdraw, share = rank >= RANK.manager, close = closable(r) },
            history = history,
        }
    end)

    -- args = { from, to = accountId (one of yours) | number = 'WB-000000', amount, message } -> true
    cb('transfer', WRITE, function(source, player, args)
        local from = whole(args.from)
        local amount = whole(args.amount)
        if not amount then return false, 'Enter a whole number of dollars' end
        local message = text(args.message, 100)
        if message == '' then message = 'Phone transfer' end

        local to
        if args.number ~= nil then
            local n = text(tostring(args.number), 12):upper():gsub('%s', '')
            if n:match('^%d%d%d%d%d%d$') then n = 'WB-' .. n end
            if not n:match('^WB%-%d%d%d%d%d%d$') then return false, 'An account number looks like WB-000000' end
            local acc = exports.whip_core:GetBankAccount({ number = n })
            if not acc then return false, ('There is no account %s'):format(n) end
            to = acc.accountId
        else
            to = whole(args.to)
            local _, rows = mine(player.charId, from)
            local found = false
            for _, r in ipairs(type(rows) == 'table' and rows or {}) do
                if r.accountId == to then found = true break end
            end
            if not found or not to then return false, 'Pick one of your accounts' end
        end
        if not from then return false, 'Pick the account to send from' end
        if to == from then return false, 'That is the same account' end

        local ok, why = exports.whip_core:BankTransfer(from, to, amount, source, { reason = message })
        if not ok then return false, why or 'The transfer did not go through' end
        return true
    end)

    -- args = { id } -> { { charId, name, role, me }, ..., { invite, charId, name, role, pending = true }, ... } (owner
    -- first, then invites waiting for an answer). Managers and the owner only. Everyone ON the account said yes to it
    -- (see the invites above), so they are named; an invite is named only if its sender could see the name.
    cb('access', LIGHT, function(_, player, args)
        local id = whole(args.id)
        local r, why = mine(player.charId, id)
        if not r then return false, why end
        ---@cast id -nil   -- mine found it
        if (RANK[r.role] or 0) < RANK.manager then return false, 'Only the owner and managers see who shares it' end
        local rows = exports.whip_core:GetBankAccessList(id) or {}
        local ids = {}
        for i, a in ipairs(rows) do ids[i] = a.charId end
        local names = exports.whip_core:GetCharacterNames(ids) or {}
        local out = {}
        for i, a in ipairs(rows) do
            out[i] = { charId = a.charId, name = names[a.charId] or ('Character #' .. a.charId), role = a.role,
                me = a.charId == player.charId }
        end
        pruneInvites()
        for _, inv in ipairs(invitesOn(id)) do
            out[#out + 1] = { invite = inv.id, charId = inv.toCharId, name = inv.toName or ('#' .. inv.toCharId),
                role = inv.role, pending = true }
        end
        return out
    end)

    -- args = { id, role, src = nearby player | charId = typed } -> { name, invited }. Someone already on the account:
    -- what they may do changes. Anyone else: an invite, which they accept or decline on their own phone (see invites).
    cb('share', WRITE, function(source, player, args)
        local id = whole(args.id)
        if not SHAREABLE[args.role] then return false, 'Pick what they may do' end
        local who, charId, name = People.picked(args, source)
        if not who then return false, charId end
        if charId == player.charId then return false, 'That is you' end
        local r, why = mine(player.charId, id)
        if not r then return false, why end
        ---@cast id -nil   -- mine found it
        if (RANK[r.role] or 0) < RANK.manager then return false, 'Only the owner and managers add people' end
        if RANK[args.role] >= RANK[r.role] then return false, 'You can give people less than you have yourself' end
        local list = exports.whip_core:GetBankAccessList(id)
        if type(list) ~= 'table' then return false, 'The bank is not answering, try again' end
        for _, a in ipairs(list) do
            if a.charId == charId then
                -- Already on it (they said yes once): only what they may do changes. The bank checks the rules.
                local ok, gwhy = exports.whip_core:GrantBankAccess(id, who, args.role, source)
                if not ok then return false, gwhy or 'The bank refused' end
                return { name = name }
            end
        end
        pruneInvites()
        if tooSoon(player.charId, charId) then return false, 'Wait a few seconds before inviting them again' end
        local waiting = invitesOn(id)
        for _, inv in ipairs(waiting) do
            if inv.toCharId == charId then return false, 'Already invited: waiting for their answer' end
        end
        if #waiting >= INVITES_PER_ACCOUNT then return false, 'Too many invites waiting on this account' end
        -- The bank's own rules, asked now (and again when they accept): not one of your other characters, a role below
        -- your own (whip_core's Config.BlockOwnCharacterTransfers among them).
        local may, mayWhy = exports.whip_core:CanGrantBankAccess(id, who, args.role, source)
        if not may then return false, mayWhy or 'The bank refused' end
        inviteSeq = inviteSeq + 1
        local inv = { id = inviteSeq, accountId = id, label = r.label, role = args.role, fromCharId = player.charId,
            fromName = player.fullName or 'Someone', toCharId = charId, toName = name, at = os.time() }
        invites[inv.id] = inv
        toPhone(charId, 'invite', inviteView(inv))
        return { name = name, invited = true }
    end)

    -- -> { { invite, account, role, from }, ... }: invites waiting for this character's answer, oldest first.
    cb('invites', LIGHT, function(_, player)
        pruneInvites()
        local out = {}
        for _, inv in pairs(invites) do
            if inv.toCharId == player.charId then out[#out + 1] = inviteView(inv) end
        end
        table.sort(out, function(a, b) return a.invite < b.invite end)
        return out
    end)

    -- args = { invite, accept = true|false } -> { id } (accepted: the account) | true (declined). The invited player
    -- only. Accepted, the bank adds them on the sender's authority, asked now.
    cb('answer', WRITE, function(_, player, args)
        pruneInvites()
        local inv = invites[whole(args.invite)]
        if not inv or inv.toCharId ~= player.charId then return false, 'That invite is gone' end
        invites[inv.id] = nil
        if args.accept ~= true then
            noteEnded(inv)
            tellSender(inv, 'Invite declined', 'warning')
            return true
        end
        local ok, why = exports.whip_core:GrantBankAccess(inv.accountId, { charId = player.charId }, inv.role,
            { charId = inv.fromCharId })
        if not ok then
            tellSender(inv, ('An invite could not be used: %s'):format(why or 'the bank refused'), 'error')
            return false, ('The invite no longer works: %s'):format(why or 'the bank refused')
        end
        tellSender(inv, ('%s accepted: they can use it now'):format(player.fullName or 'They'), 'success')
        return { id = inv.accountId }
    end)

    -- args = { invite } -> true. Take back an invite not yet answered (the owner or a manager of its account).
    cb('uninvite', WRITE, function(_, player, args)
        local inv = invites[whole(args.invite)]
        if not inv then return true end
        local r, why = mine(player.charId, inv.accountId)
        if not r then return false, why end
        if (RANK[r.role] or 0) < RANK.manager then return false, 'Only the owner and managers change who shares it' end
        invites[inv.id] = nil
        noteEnded(inv)
        toPhone(inv.toCharId, 'inviteGone', { invite = inv.id })
        return true
    end)

    -- args = { id, charId } -> true
    cb('unshare', WRITE, function(source, _, args)
        local id, charId = whole(args.id), whole(args.charId)
        if not id or not charId then return false, 'Who?' end
        local ok, why = exports.whip_core:RevokeBankAccess(id, { charId = charId }, source)
        if not ok then return false, why or 'The bank refused' end
        return true
    end)

    -- -> { { src, name, dist }, ... }: people near enough to pick
    cb('nearby', LIGHT, function(source)
        return People.nearby(source)
    end)

    -- args = { label, type = 'savings' | 'shared' } -> { id, number }
    cb('open', WRITE, function(source, _, args)
        local label = text(args.label, 50)
        if label == '' then return false, 'Give the account a name' end
        if args.type ~= 'savings' and args.type ~= 'shared' then return false, 'Pick savings or shared' end
        local acc, why = exports.whip_core:CreateBankAccount(source, label, { type = args.type })
        if not acc then return false, why or 'The bank refused' end
        return { id = acc.accountId, number = acc.accountNumber }
    end)

    -- args = { id } -> true. The owner, an empty savings or shared account (the bank checks).
    cb('close', WRITE, function(source, _, args)
        local id = whole(args.id)
        if not id then return false, 'Account not found' end   -- the bank's own answer
        local ok, why = exports.whip_core:CloseBankAccount(id, source)
        if not ok then return false, why or 'The bank refused' end
        return true
    end)
end)

-- ---------------------------------------------------------------- live
--- Money arrived in an account: its owner's phone says so, unless they moved it themselves or it is a business's
--- (a shop's every sale would buzz the owner). The account's owner, type and label ride the event (whip_core read the
--- account to write it; audit 9, NEW-3), so nothing is read here; an older whip_core without them is read, off the
--- event's thread (the bank is mid-write when it fires).
---@param acc table|nil  { ownerCharId, type, label } from the event
local function arrived(accountId, e, acc)
    CreateThread(function()
        if not acc or acc.ownerCharId == nil then acc = exports.whip_core:GetBankAccount(accountId) end
        if not acc or acc.type == 'business' or not acc.ownerCharId then return end
        if e.actorCharId and e.actorCharId == acc.ownerCharId then return end
        local src = People.sourceOf(acc.ownerCharId)
        if not src or not Sim.phoneOf(src) then return end
        local note = type(e.message) == 'string' and e.message ~= '' and e.message ~= 'Phone transfer' and (' · ' .. e.message) or ''
        TriggerClientEvent('whip_phone:client:notify', src, {
            app = 'bank', title = acc.label, kind = 'success', args = { id = accountId },
            text = ('Received %s%s'):format(money(e.amount), note),
        })
    end)
end

--- Whoever has one of these accounts on screen looks again.
local function pushChanged(ids)
    for src, seen in pairs(watching) do
        for _, id in ipairs(ids) do
            if seen[id] then
                TriggerClientEvent('whip_phone:client:push', src, 'bank', 'changed', { ids = ids })
                break
            end
        end
    end
end

-- An account changed with no money moving (renamed, frozen, closed, a new owner).
AddEventHandler('whip_core:bank:accountChanged', function(e)
    if type(e) == 'table' and e.accountId then pushChanged({ e.accountId }) end
end)

AddEventHandler('whip_core:bank:balanceChanged', function(e)
    if type(e) ~= 'table' then return end
    local ids = {}
    for _, k in ipairs({ 'accountId', 'fromAccountId', 'toAccountId' }) do
        if e[k] then ids[#ids + 1] = e[k] end
    end
    pushChanged(ids)
    local into =(e.type == 'deposit' and e.accountId) or (e.type == 'transfer' and e.toAccountId) or nil
    if into and (tonumber(e.amount) or 0) > 0 then
        local acc = e.type == 'deposit' and { ownerCharId = e.ownerCharId, type = e.accountType, label = e.label }
            or { ownerCharId = e.toOwnerCharId, type = e.toAccountType, label = e.toLabel }
        -- A business's money (every sale at a shop) never notifies: skipped here without a thread or a read.
        if acc.type == 'business' then return end
        arrived(into, e, acc)
    end
end)
