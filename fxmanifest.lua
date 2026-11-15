fx_version 'cerulean'
game 'gta5'
lua54 'yes'

name 'whip_phone'
author 'whip'
description 'The whip Duo phone: an NUI phone shell with no apps of its own. Every app is a module (html/modules or another resource).'
version '1.1.0'
whip_updates 'WHIPFX/whip_phone'   -- whip_core checks this repository's releases for a newer version

shared_scripts {
    '@whip_core/lib/satellite.lua',   -- first: Whip.register / Whip.core
    'config.lua',
    'shared/skillgames.lua',          -- the skill check games: which, their levels and timings (both sides)
}

client_scripts {
    'client/main.lua',
}

server_scripts {
    '@oxmysql/lib/MySQL.lua', -- whip_phone keeps its own tables (Josh, 7 Oct 2026)
    -- whip_core's guard on that MySQL (audit 10, INV-8): a database that does not answer becomes an error after a
    -- limit instead of a wait for ever. Right after MySQL.lua, before anything uses it.
    '@whip_core/server/db_guard.lua',
    'server/numbers.lua',     -- phone numbers: owners and locks, kept in memory
    'server/schema.lua',      -- the tables, made and brought up to date on start
    'server/sim.lua',         -- which phone and which SIM a player is using
    'server/items.lua',       -- the phone (with its SIM tray) and the SIM card
    'server/main.lua',        -- exports: Notify, Push, Open, Close, SetSession, ReloadCache (the admin Phones panel)
    'server/contract.lua',    -- the phone's data: session, settings, contacts, messages, the SIM page
    'server/calls.lua',       -- calls and Recents
    'server/blocks.lua',      -- the block list: numbers a SIM gets no texts or calls from
    'server/lore.lua',        -- lore characters' numbers (whip_core's Director) and the Lore cards: Give Contact, Send Text, Phone Call
    'server/card.lua',        -- a player's own contact card: their name and profile picture (Settings > My card)
    'server/people.lua',      -- who is on and who is near (picking a person: sharing, hiring)
    'server/bank.lua',        -- the Bank app: whip_core's bank, asked as the player
    'server/business.lua',    -- the Business app: whip_core's jobs, with the player as `by`
    'server/skillgames.lua',  -- the skill check games, given to whip_core (they need a phone)
    'server/skilltest.lua',   -- the Skill Check Tester's requests (developers only)
}

ui_page 'html/index.html'
nui_callback_strict_mode 'true'

-- html/preview.html and html/dev/ are for the browser preview only and are not shipped to players
files {
    'html/index.html',
    'html/core/*.js',
    -- The built-in apps (Config.Modules): ONE LINE PER APP FOLDER. A `*` in a folder name matches nothing
    -- here — 'html/modules/*/module.js' shipped no app at all (F8: "could not find file"), and the phone
    -- opened empty. A new app folder needs its own line.
    'html/modules/phone/module.js',
    'html/modules/messages/module.js',
    'html/modules/bank/module.js',
    'html/modules/business/module.js',
    'html/modules/settings/module.js',
    'html/modules/skillcheck/module.js',   -- hidden: the skill check games (shared/skillgames.lua)
    'html/modules/skilltest/module.js',    -- a developer app (Config.DeveloperApps): the Skill Check Tester
    'html/vendor/three/three.module.min.js',
    'html/vendor/three/addons/loaders/GLTFLoader.js',
    'html/vendor/three/addons/environments/RoomEnvironment.js',
    'html/vendor/three/addons/utils/BufferGeometryUtils.js',
    'html/img/items/*.webp',  -- the phone and SIM card in the inventory
}

dependency 'whip_core'
whip_requires '1.0'   -- the whip_core it is built for: the setup report flags an older one
dependency 'oxmysql'
