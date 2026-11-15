-- The Business app's server side (Josh, 8 Oct 2026: whip_core's old Business manager, rebuilt as a phone module).
-- Requests `whip_phone:business:*`, answered from whip_core's job exports with the player as `by`: every rule is the
-- jobs system's own (hire / fire / promote / demote / manage permissions, the rank rule, the job's own duty rule).
-- Always the character holding the phone, whatever SIM is in it.
--
-- LIVE: a player who opened a job in the app is watching it, while the app is in front of them (leaving it or putting
-- the phone away sends `unwatch`; audit 9, NEW-3). Anyone hired, fired, re-ranked or going on or off duty there, or
-- the job changing, tells their phone to read it again; the person it happened to is told too.

local LIGHT = { rateLimit = 250, burst = 6 }
local WRITE = { rateLimit = 500, burst = 3 }

local BUILTIN = {
    { key = 'canHire', label = 'Hire' }, { key = 'canFire', label = 'Fire' },
    { key = 'canPromote', label = 'Promote' }, { key = 'canDemote', label = 'Demote' },
    { key = 'canManage', label = 'Manage the business' },
}
local BANK = { none = true, view = true, deposit = true, withdraw = true, manager = true }

--- [source] = { [jobId] = true }: the jobs each player's Business app looked at.
local watching = {}
AddEventHandler('playerDropped', function() watching[source] = nil end)
AddEventHandler('whip_core:player:logout', function(e)
    local src = type(e) == 'table' and tonumber(e.source) or nil
    if src then watching[src] = nil end
end)

local function cb(name, schema, fn)
    exports.whip_core:SecureCallback('whip_phone:business:' .. name, PhoneSchema(schema), function(source, player, args)   -- args: server/main.lua
        if not player or not player.charId then return false, 'Your character is not loaded' end
        if not Sim.phoneOf(source) then return false, 'You need a phone' end
        return fn(source, player, type(args) == 'table' and args or {})
    end)
end

local function whole(v)
    local n = math.tointeger(tonumber(v))
    return n and n > 0 and n or nil
end

--- This player's place at a job ({ jobId, name, icon, roleId, roleName, roleLevel, clockedOn, permissions }), or nil
--- and why.
local function place(source, jobId)
    local jobs = exports.whip_core:GetPlayerJobs(source) or {}
    local j = jobId and jobs[jobId]
    if not j then return nil, 'You do not work there' end
    return j
end

local function watch(source, jobId)
    watching[source] = watching[source] or {}
    watching[source][jobId] = true
end

local BANK_RANK = { none = 0, view = 1, deposit = 2, withdraw = 3, manager = 4 }

--- What this player's rank holds at a job: { perms = { [key] = true }, bank, level }. For the app to offer only what
--- they could give (Josh, 8 Oct 2026: never more than you have). A hint: whip_core decides (jobs.lua actorCovers).
local function holds(j, roles)
    local bank = 'none'
    for _, r in ipairs(roles) do
        if r.roleId == j.roleId then bank = (r.permissions or {}).bankAccess or 'none' end
    end
    if (j.roleLevel or 0) >= 100 then bank = 'manager' end
    return { perms = j.permissions or {}, bank = bank, level = j.roleLevel or 0 }
end

--- Could they hand this rank to someone: below their level, and nothing in it they lack? (`known`: the job's
--- permissions now; a stale key on a rank gives nothing.)
local function mayGive(h, role, known)
    if h.level >= 100 then return true end
    if (role.level or 0) >= h.level then return false end
    for k, v in pairs(role.permissions or {}) do
        if known[k] and v == true and not h.perms[k] then return false end
    end
    return (BANK_RANK[(role.permissions or {}).bankAccess] or 0) <= (BANK_RANK[h.bank] or 0)
end

--- The permissions a role can be given at this job: the built-ins, then the job's own ({ key, label, custom }).
local function permissionList(job)
    local list = {}
    for i, p in ipairs(BUILTIN) do list[i] = { key = p.key, label = p.label } end
    local declared = job and type(job.settings) == 'table' and job.settings.permissions
    if type(declared) == 'table' then
        local keys = {}
        for k in pairs(declared) do keys[#keys + 1] = k end
        table.sort(keys)
        for _, k in ipairs(keys) do list[#list + 1] = { key = k, label = tostring(declared[k]), custom = true } end
    end
    return list
end

-- ---------------------------------------------------------------- offers
--- A HIRE IS AN OFFER THE OTHER PLAYER ACCEPTS (Josh, 8 Oct 2026; audit 9, NEW-2, as the Bank app's invites). Hiring a
--- typed character ID put them on the staff list, which named whoever it was: a way round the name rule. Now nobody
--- works anywhere until they say yes on their own phone. Declined, the sender's phone says "Job offer declined";
--- accepted, they are hired at the offered rank (whip_core asks the sender's right to hire again then) and the staff
--- list names them. Kept in memory: gone after OFFER_TTL_S, or at a restart.
local OFFER_TTL_S = 24 * 3600
local OFFERS_PER_JOB = 10
--- [id] = { id, jobId, job, roleId, role, fromCharId, fromName, toCharId, toName (nil: the sender may not see it), at }
local offers, offerSeq = {}, 0

--- AFTER A TAKE-BACK OR A DECLINE, THE SAME SENDER WAITS BEFORE OFFERING THE SAME PERSON A JOB AGAIN (Josh, 8 Oct 2026;
--- audit 10, SEC-2), as the Bank app's invites (server/bank.lua). [fromCharId .. ':' .. toCharId] = when the last offer
--- between them was taken back or declined.
local AGAIN_S = 10
local endedAt = {}

local function tooSoon(fromCharId, toCharId)
    local t = endedAt[fromCharId .. ':' .. toCharId]
    return t ~= nil and os.time() - t < AGAIN_S
end

local function noteEnded(o)
    endedAt[o.fromCharId .. ':' .. o.toCharId] = os.time()
end

local function pruneOffers()
    local now = os.time()
    for id, o in pairs(offers) do
        if now - o.at > OFFER_TTL_S then offers[id] = nil end
    end
    for key, t in pairs(endedAt) do
        if now - t >= AGAIN_S then endedAt[key] = nil end
    end
end

--- The live offers at a job, oldest first.
local function offersOn(jobId)
    local out = {}
    for _, o in pairs(offers) do
        if o.jobId == jobId then out[#out + 1] = o end
    end
    table.sort(out, function(a, b) return a.id < b.id end)
    return out
end

--- An offer as the offered player's phone shows it.
local function offerView(o)
    return { offer = o.id, job = o.job, role = o.role, from = o.fromName }
end

--- A push to a character's phone, if they are on and carry one. Answers their source.
local function toPhone(charId, event, data)
    local src = People.sourceOf(charId)
    if src and Sim.phoneOf(src) then TriggerClientEvent('whip_phone:client:push', src, 'business', event, data) end
    return src
end

--- Tell the sender how it went: a notification (it opens the job), and their staff list read again.
local function tellSender(o, text, kind)
    local src = toPhone(o.fromCharId, 'changed', { id = o.jobId })
    if src and Sim.phoneOf(src) then
        TriggerClientEvent('whip_phone:client:notify', src, {
            app = 'business', title = o.job, text = text, kind = kind, args = { id = o.jobId },
        })
    end
end

Whip.register(function()
    -- args = { watch = false }: read without watching (the app is not in front of the player).
    -- -> { { id, name, icon, role, level, onDuty }, ... } by name
    cb('jobs', LIGHT, function(source, _, args)
        local out = {}
        if args.watch == false then watching[source] = nil end
        for _, j in pairs(exports.whip_core:GetPlayerJobs(source) or {}) do
            out[#out + 1] = { id = j.jobId, name = j.name, icon = j.icon, role = j.roleName, level = j.roleLevel, onDuty = j.clockedOn == true }
            if args.watch ~= false then watch(source, j.jobId) end
        end
        table.sort(out, function(a, b) return tostring(a.name) < tostring(b.name) end)
        return out
    end)

    -- The Business app left the screen: no more live pushes until it reads its jobs again (any phone or none).
    exports.whip_core:SecureCallback('whip_phone:business:unwatch', LIGHT, function(source)
        watching[source] = nil
        return true
    end)

    -- args = { id } -> { job, can, staff?, roles? }. The staff and the ranks only for someone who manages people.
    cb('job', LIGHT, function(source, player, args)
        local id = whole(args.id)
        local j, why = place(source, id)
        if not j then return false, why end
        ---@cast id -nil   -- place found the job
        if args.watch ~= false then watch(source, id) end
        local def = exports.whip_core:GetJob(id) or {}
        local p = j.permissions or {}
        local can = { hire = p.canHire == true, fire = p.canFire == true, promote = p.canPromote == true,
            demote = p.canDemote == true, manage = p.canManage == true }
        local out = {
            job = { id = id, name = j.name, icon = j.icon, role = j.roleName, level = j.roleLevel, onDuty = j.clockedOn == true,
                selfClock = not (type(def.settings) == 'table' and def.settings.selfClockOn == false) },
            can = can,
        }
        if not (can.hire or can.fire or can.promote or can.demote or can.manage) then return out end

        local emps = exports.whip_core:GetJobEmployees(id) or {}
        local ids = {}
        for charId in pairs(emps) do ids[#ids + 1] = charId end
        if def.ownerCharId and not emps[def.ownerCharId] then ids[#ids + 1] = def.ownerCharId end
        local names = exports.whip_core:GetCharacterNames(ids) or {}
        local staff = {}
        for charId, e in pairs(emps) do
            staff[#staff + 1] = { charId = charId, name = names[charId] or ('Character #' .. charId), roleId = e.roleId,
                role = e.roleName, level = e.roleLevel or 0, onDuty = e.onDuty == true, me = charId == player.charId,
                owner = charId == def.ownerCharId }
        end
        local full = exports.whip_core:GetJobRoles(id) or {}
        local h, known = holds(j, full), {}
        for _, perm in ipairs(permissionList(def)) do known[perm.key] = true end
        local roles = {}
        for i, r in ipairs(full) do roles[i] = { roleId = r.roleId, name = r.name, level = r.level, give = mayGive(h, r, known) } end
        if def.ownerCharId and not emps[def.ownerCharId] then
            -- The owner holds the top role without being on the payroll (whip_core's Jobs.getPlayerRole).
            local top = roles[1]
            staff[#staff + 1] = { charId = def.ownerCharId, name = names[def.ownerCharId] or 'The owner', role = top and top.name or 'Owner',
                level = top and top.level or 100, owner = true, me = def.ownerCharId == player.charId, onDuty = false, unhired = true }
        end
        table.sort(staff, function(a, b)
            if a.level ~= b.level then return a.level > b.level end
            return a.name < b.name
        end)
        out.staff, out.roles = staff, roles
        -- Offers not answered yet: named only if the sender could see the name, else #ID (see offers).
        pruneOffers()
        local waiting = {}
        for _, o in ipairs(offersOn(id)) do
            waiting[#waiting + 1] = { offer = o.id, charId = o.toCharId, name = o.toName or ('#' .. o.toCharId), role = o.role }
        end
        out.offers = waiting
        return out
    end)

    -- args = { id } -> true. On duty, as the player: a job whose resource puts people on duty itself refuses.
    cb('clockOn', WRITE, function(source, _, args)
        local id = whole(args.id)
        if not id then return false, 'No such job' end   -- whip_core's own answer
        local ok, why = exports.whip_core:ClockOn(source, id, { by = source })
        if not ok then return false, why or 'Could not clock on' end
        return true
    end)

    -- args = { id } -> true. Going off duty works even while down, as whip_core's own clock-off does. Always one job:
    -- whip_core's ClockOff with no job takes them off duty everywhere, which the page never asks for.
    cb('clockOff', { rateLimit = 500, burst = 3, whileDead = true }, function(source, _, args)
        local id = whole(args.id)
        if not id then return false, 'No such job' end   -- whip_core's own answer
        local ok, why = exports.whip_core:ClockOff(source, id)
        if not ok then return false, why or 'Could not clock off' end
        return true
    end)

    -- args = { id, charId, roleId } -> true
    cb('setRole', WRITE, function(source, _, args)
        local charId = whole(args.charId)
        if not charId then return false, 'Who?' end
        local id, roleId = whole(args.id), whole(args.roleId)
        if not id then return false, 'No such job' end   -- whip_core's own answers
        if not roleId then return false, 'No such role at that job' end
        local ok, why = exports.whip_core:SetPlayerRole({ charId = charId }, id, roleId, { by = source })
        if not ok then return false, why or 'Could not change their rank' end
        return true
    end)

    -- args = { id, charId } -> true
    cb('fire', WRITE, function(source, player, args)
        local charId = whole(args.charId)
        if not charId then return false, 'Who?' end
        if charId == player.charId then return false, 'You cannot fire yourself' end
        local id = whole(args.id)
        if not id then return false, 'No such job' end   -- whip_core's own answer
        local ok, why = exports.whip_core:FirePlayer({ charId = charId }, id, { by = source })
        if not ok then return false, why or 'Could not fire them' end
        return true
    end)

    -- args = { id, roleId, src = nearby player | charId = typed } -> { name, offered }. An OFFER the other player
    -- accepts or declines on their own phone (see offers): nobody is hired until they say yes.
    cb('hire', WRITE, function(source, player, args)
        local who, charId, name = People.picked(args, source)
        if not who then return false, charId end
        if charId == player.charId then return false, 'That is you' end
        local id, roleId = whole(args.id), whole(args.roleId)
        local j, why = place(source, id)
        if not j then return false, why end
        ---@cast id -nil   -- place found the job
        pruneOffers()
        if tooSoon(player.charId, charId) then return false, 'Wait a few seconds before offering them a job again' end
        local waiting = offersOn(id)
        for _, o in ipairs(waiting) do
            if o.toCharId == charId then return false, 'Already offered: waiting for their answer' end
        end
        if #waiting >= OFFERS_PER_JOB then return false, 'Too many job offers waiting at this business' end
        -- whip_core's own rules, asked now (and again when they accept): the rank, your right to hire, one character
        -- per player account at a job, already working there.
        local may, mayWhy = exports.whip_core:CanHirePlayer(who, id, roleId, { by = source })
        if not may then return false, mayWhy or 'Could not hire them' end
        -- the rank offered, by name (no roleId: the lowest, as HirePlayer gives)
        local role
        for _, r in ipairs(exports.whip_core:GetJobRoles(id) or {}) do
            if (roleId and r.roleId == roleId) or (not roleId and (not role or (r.level or 0) < (role.level or 0))) then role = r end
        end
        offerSeq = offerSeq + 1
        local o = { id = offerSeq, jobId = id, job = j.name or 'A business', roleId = role and role.roleId or roleId,
            role = role and role.name or 'Staff', fromCharId = player.charId, fromName = player.fullName or 'Someone',
            toCharId = charId, toName = name, at = os.time() }
        offers[o.id] = o
        toPhone(charId, 'offer', offerView(o))
        return { name = name, offered = true }
    end)

    -- -> { { offer, job, role, from }, ... }: job offers waiting for this character's answer, oldest first.
    cb('offers', LIGHT, function(_, player)
        pruneOffers()
        local out = {}
        for _, o in pairs(offers) do
            if o.toCharId == player.charId then out[#out + 1] = offerView(o) end
        end
        table.sort(out, function(a, b) return a.offer < b.offer end)
        return out
    end)

    -- args = { offer, accept = true|false } -> { id } (accepted: the job) | true (declined). The offered player only.
    -- Accepted, whip_core hires them on the sender's authority, asked now.
    cb('answerOffer', WRITE, function(_, player, args)
        pruneOffers()
        local o = offers[whole(args.offer)]
        if not o or o.toCharId ~= player.charId then return false, 'That job offer is gone' end
        offers[o.id] = nil
        if args.accept ~= true then
            noteEnded(o)
            tellSender(o, 'Job offer declined', 'warning')
            return true
        end
        local ok, why = exports.whip_core:HirePlayer({ charId = player.charId }, o.jobId, o.roleId, { by = { charId = o.fromCharId } })
        if not ok then
            tellSender(o, ('A job offer could not be used: %s'):format(why or 'refused'), 'error')
            return false, ('The job offer no longer works: %s'):format(why or 'refused')
        end
        tellSender(o, ('%s accepted: hired as %s'):format(player.fullName or 'They', o.role), 'success')
        return { id = o.jobId }
    end)

    -- args = { offer } -> true. Take back an offer not yet answered (anyone at that job who may hire).
    cb('unoffer', WRITE, function(source, _, args)
        local o = offers[whole(args.offer)]
        if not o then return true end
        local j, why = place(source, o.jobId)
        if not j then return false, why end
        if not (j.permissions or {}).canHire then return false, 'Your rank does not hire' end
        offers[o.id] = nil
        noteEnded(o)
        toPhone(o.toCharId, 'offerGone', { offer = o.id })
        return true
    end)

    -- -> { { src, name, dist }, ... }
    cb('nearby', LIGHT, function(source)
        return People.nearby(source)
    end)

    -- args = { id } -> { roles = { { roleId, name, level, permissions } }, perms = { { key, label, custom } }, level,
    --                   have = { perms, bank } } (what their own rank holds: a rank can be given no more)
    cb('roles', LIGHT, function(source, _, args)
        local id = whole(args.id)
        local j, why = place(source, id)
        if not j then return false, why end
        ---@cast id -nil   -- place found the job
        if not (j.permissions or {}).canManage then return false, 'Your rank does not manage the business' end
        local roles = exports.whip_core:GetJobRoles(id) or {}
        local h = holds(j, roles)
        return { roles = roles, perms = permissionList(exports.whip_core:GetJob(id)), level = j.roleLevel,
            have = { perms = h.perms, bank = h.bank } }
    end)

    -- args = { id, roleId = nil (new) | id, name, level, permissions = { [key] = bool, bankAccess } } -> { roleId }
    cb('saveRole', WRITE, function(source, _, args)
        local id = whole(args.id)
        if not id then return false, 'No such job' end   -- whip_core's own answer
        local perms
        if type(args.permissions) == 'table' then
            perms = {}
            for k, v in pairs(args.permissions) do
                if k == 'bankAccess' then
                    if BANK[v] then perms.bankAccess = v end
                elseif type(k) == 'string' and #k <= 40 and type(v) == 'boolean' then
                    perms[k] = v
                end
            end
        end
        local name = type(args.name) == 'string' and args.name:gsub('^%s+', ''):gsub('%s+$', '') or nil
        local roleId = whole(args.roleId)
        if roleId then
            local ok, why = exports.whip_core:UpdateJobRole(id, roleId, { name = name, level = whole(args.level), permissions = perms }, { by = source })
            if not ok then return false, why or 'Could not save the rank' end
            return { roleId = roleId }
        end
        -- A new rank needs a name and a level: whip_core's own answers when one is missing (it checks the rest).
        local level = whole(args.level)
        if not name then return false, 'A role name is 1 to 60 characters' end
        if not level then return false, 'A role\'s level is a whole number from 1 to 100' end
        local role, why = exports.whip_core:CreateJobRole(id, { name = name, level = level, permissions = perms }, { by = source })
        if not role then return false, why or 'Could not make the rank' end
        return { roleId = role.roleId }
    end)

    -- args = { id, roleId } -> true
    cb('deleteRole', WRITE, function(source, _, args)
        local id, roleId = whole(args.id), whole(args.roleId)
        if not id then return false, 'No such job' end   -- whip_core's own answers
        if not roleId then return false, 'No such role at that job' end
        local ok, why = exports.whip_core:DeleteJobRole(id, roleId, { by = source })
        if not ok then return false, why or 'Could not delete the rank' end
        return true
    end)
end)

-- ---------------------------------------------------------------- live
local function changed(e)
    if type(e) ~= 'table' or not e.jobId then return end
    local told = {}
    for src, seen in pairs(watching) do
        if seen[e.jobId] then
            TriggerClientEvent('whip_phone:client:push', src, 'business', 'changed', { id = e.jobId })
            told[src] = true
        end
    end
    local src = tonumber(e.source)
    if src and not told[src] then TriggerClientEvent('whip_phone:client:push', src, 'business', 'changed', { id = e.jobId }) end
end
for _, ev in ipairs({ 'hired', 'fired', 'roleChanged', 'clockedOn', 'clockedOff', 'updated', 'deleted' }) do
    AddEventHandler('whip_core:job:' .. ev, changed)
end
