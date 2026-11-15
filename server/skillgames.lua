-- The phone's skill check games, given to whip_core's skill check (shared/skillgames.lua has the list and the
-- timings; client/main.lua plays them). Anything that runs a skill check can then ask for one: the Director's
-- Skill Check card (its Game field), or exports.whip_core:SkillCheck(source, 'hard', { game = 'phone.reroute' }).
--
-- THEY NEED A PHONE (Josh, 31 Oct 2026): a player with none is told Config.SkillGameNoPhone and nothing starts.
-- It is not a fail: the check answers 'not started', and pressing the button again with a phone plays it.

for _, g in ipairs(PhoneSkillGames.list()) do
    Whip.skillCheckGame(g.id, {
        label = g.label,
        desc = g.goal .. ' On the phone, opened to a tablet.',
        levels = PhoneSkillGames.levels(g.key),
        canStart = function(source)
            if Sim.phoneOf(source) then return true end
            return false, Config.SkillGameNoPhone or 'You need a phone!'
        end,
    })
end
