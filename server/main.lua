-- whip_phone server: exports so any resource (or the framework) can reach a player's phone.

--- A phone request's schema, with the one argument every request carries: the app's fields, as one table
--- (html/core/bridge.js request(name, args)). Every callback the phone registers goes through this (the `cb` in
--- contract.lua, calls.lua, bank.lua and business.lua).
---
--- DECLARED, OR IT NEVER ARRIVES (Josh, 11 Oct 2026: typed names and numbers "act like they're empty"). whip_core
--- hands a callback's handler only the params its schema names (server/secure.lua, SecureCallback), and these named
--- none: every request reached its handler as {}, so a contact had no number, a new account no name. 'any', because
--- each handler checks every field it reads itself; whip_core still refuses a function sent in its place.
---@param schema table  the rate limit and the rest, as SecureCallback takes them
---@return table
function PhoneSchema(schema)
    local out = { params = { { 'args', 'any' } } }
    for k, v in pairs(schema) do
        if k ~= 'params' then out[k] = v end
    end
    return out
end

--- a notification on the player's phone. n = { app = 'messages', title = '', text = '', kind = 'chat'|'command'|'success'|'error'|'warning'|'call', args = {} }
--- app is a module id (its icon is used; unknown ids get a bell), args are passed to the module when the player taps it.
exports('Notify', function(src, n)
    if type(n) ~= 'table' then return false end
    TriggerClientEvent('whip_phone:client:notify', src, n)
    return true
end)

--- an event for one module on the player's phone, e.g. Push(src, 'messages', 'incoming', { id, number, text, time })
exports('Push', function(src, module, event, data)
    TriggerClientEvent('whip_phone:client:push', src, module, event, data)
    return true
end)

--- open the phone for the player: mode 'phone' (folded) or 'tablet' (straight into tablet mode)
exports('Open', function(src, mode) TriggerClientEvent('whip_phone:client:open', src, mode) return true end)
exports('Close', function(src) TriggerClientEvent('whip_phone:client:close', src) return true end)

--- replace the player's session (number, name, settings) without waiting for them to reopen the phone
exports('SetSession', function(src, session) TriggerClientEvent('whip_phone:client:session', src, session) return true end)

--- the admin Phones panel (whip_core's devtools) changed phone_numbers / contacts: the numbers are read again, then
--- phones that are open fetch their session again. A retired number's cards in online players' phones are put
--- right at once (Sim.recheckRetired), and the block lists follow a changed number, or drop a deleted one (Blocks.load).
exports('ReloadCache', function()
    CreateThread(function()
        -- The block lists straight after the numbers, before recheckRetired waits on each player: in between, a
        -- changed number's texts would be checked against lists still keyed by the old one, and delivered. A list
        -- that would not load is tried again, so a database hiccup leaves no window open until the restart.
        if PhoneDB.ready and Numbers.load() then
            for try = 1, 3 do
                if Blocks.load() then break end
                if try < 3 then Wait(2000)
                else print('[whip_phone] the block lists did not load after an admin change: the next restart reads them') end
            end
            Sim.recheckRetired()
        end
        TriggerClientEvent('whip_phone:client:refresh', -1)
    end)
    return true
end)
