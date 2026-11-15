-- whip_phone's tables: made, and brought up to date, when it starts. whip_phone talks to the database
-- itself (Josh, 7 Oct 2026), the one satellite that does; everything else it needs from whip goes
-- through whip_core's exports.
--
--   phone_numbers   every number: which character owns it, whether its owner locked it, and what else the
--                   SIM carries (`prefs`: the home screen's arrangement). Several
--                   per character (a SIM bought is a new number). The old phone allowed one
--                   (`uk_charId`): that key is dropped and a plain index keeps the character link.
--                   A number the admin panel deleted or changed is RETIRED, not removed (`retiredAt`,
--                   and `renamedTo` for a change): the SIM cards still carrying it would otherwise bring
--                   it back the next time their phone opened (audit 9, DAT-2).
--                   A LORE CHARACTER's number (whip_core's Director, server/lore.lua here) has no character
--                   (charId NULL) and names it in `loreKey`; no SIM card ever carries one.
--   phone_contacts  a number's contacts (the SIM's, not the character's)
--   phone_messages  texts between two numbers. `blocked`: sent while the receiving SIM blocked the sender
--                   (server/blocks.lua), so the receiver never sees it, even after an unblock
--   phone_calls     calls between two numbers, for Recents. `blocked`: the same for a call, kept out of the
--                   callee's Recents
--   phone_blocks    the numbers each SIM blocked (server/blocks.lua): the SIM's, like its contacts
--
-- whip_core's admin Phones panel (server/devtools.lua) reads and writes the same tables.

PhoneDB = { ready = false }

local function count(sql, params)
    return tonumber(MySQL.scalar.await(sql, params or {})) or 0
end

local function hasIndex(tbl, name)
    return count([[SELECT COUNT(*) FROM information_schema.statistics
        WHERE table_schema = DATABASE() AND table_name = ? AND index_name = ?]], { tbl, name }) > 0
end

local function hasColumn(tbl, name)
    return count([[SELECT COUNT(*) FROM information_schema.columns
        WHERE table_schema = DATABASE() AND table_name = ? AND column_name = ?]], { tbl, name }) > 0
end

-- Each table names its collation, the one whip_core's own tables use (TABLE_COLLATION, whip_core/server/helpers.lua):
-- the database server's default differs between versions, and two tables that sort differently cannot compare their text.
local function migrate()
    MySQL.query.await([[CREATE TABLE IF NOT EXISTS `phone_numbers` (
        `phoneNumber` CHAR(10) NOT NULL,
        `charId` INT UNSIGNED NOT NULL,
        `locked` TINYINT(1) NOT NULL DEFAULT 0,
        `prefs` TEXT NULL DEFAULT NULL,
        `retiredAt` TIMESTAMP NULL DEFAULT NULL,
        `renamedTo` CHAR(10) NULL DEFAULT NULL,
        `createdAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (`phoneNumber`),
        KEY `idx_charId` (`charId`),
        CONSTRAINT `fk_phone_char` FOREIGN KEY (`charId`) REFERENCES `characters` (`charId`) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci]])

    -- The old phone's shape: one number per character, and no lock.
    if hasIndex('phone_numbers', 'uk_charId') then
        -- The character link (a foreign key) needs an index on charId, so the plain one goes in first.
        if not hasIndex('phone_numbers', 'idx_charId') then
            MySQL.query.await('ALTER TABLE `phone_numbers` ADD INDEX `idx_charId` (`charId`)')
        end
        MySQL.query.await('ALTER TABLE `phone_numbers` DROP INDEX `uk_charId`')
        print('[whip_phone] phone_numbers: a character may now own several numbers')
    end
    if not hasColumn('phone_numbers', 'locked') then
        MySQL.query.await('ALTER TABLE `phone_numbers` ADD COLUMN `locked` TINYINT(1) NOT NULL DEFAULT 0 AFTER `charId`')
    end
    -- What the SIM carries besides its number (7 Oct 2026): the home screen's arrangement, as JSON.
    if not hasColumn('phone_numbers', 'prefs') then
        MySQL.query.await('ALTER TABLE `phone_numbers` ADD COLUMN `prefs` TEXT NULL DEFAULT NULL AFTER `locked`')
    end
    -- Retired numbers (8 Oct 2026, see the top of this file).
    if not hasColumn('phone_numbers', 'retiredAt') then
        MySQL.query.await('ALTER TABLE `phone_numbers` ADD COLUMN `retiredAt` TIMESTAMP NULL DEFAULT NULL AFTER `prefs`')
    end
    if not hasColumn('phone_numbers', 'renamedTo') then
        MySQL.query.await('ALTER TABLE `phone_numbers` ADD COLUMN `renamedTo` CHAR(10) NULL DEFAULT NULL AFTER `retiredAt`')
    end

    MySQL.query.await([[CREATE TABLE IF NOT EXISTS `phone_contacts` (
        `contactId` INT UNSIGNED NOT NULL AUTO_INCREMENT,
        `phoneNumber` CHAR(10) NOT NULL,
        `contactName` VARCHAR(50) NOT NULL,
        `contactNumber` CHAR(10) NOT NULL,
        `createdAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (`contactId`),
        KEY `idx_phone` (`phoneNumber`),
        CONSTRAINT `fk_contacts_phone` FOREIGN KEY (`phoneNumber`) REFERENCES `phone_numbers` (`phoneNumber`) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci]])

    MySQL.query.await([[CREATE TABLE IF NOT EXISTS `phone_messages` (
        `messageId` INT UNSIGNED NOT NULL AUTO_INCREMENT,
        `senderNumber` CHAR(10) NOT NULL,
        `receiverNumber` CHAR(10) NOT NULL,
        `content` VARCHAR(500) NOT NULL,
        `readAt` TIMESTAMP NULL DEFAULT NULL,
        `blocked` TINYINT(1) NOT NULL DEFAULT 0,
        `createdAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (`messageId`),
        KEY `idx_sender` (`senderNumber`, `createdAt`),
        KEY `idx_receiver` (`receiverNumber`, `createdAt`),
        CONSTRAINT `fk_msg_sender` FOREIGN KEY (`senderNumber`) REFERENCES `phone_numbers` (`phoneNumber`) ON DELETE CASCADE,
        CONSTRAINT `fk_msg_receiver` FOREIGN KEY (`receiverNumber`) REFERENCES `phone_numbers` (`phoneNumber`) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci]])

    -- status: ringing | answered | missed | declined | unavailable
    MySQL.query.await([[CREATE TABLE IF NOT EXISTS `phone_calls` (
        `callId` INT UNSIGNED NOT NULL AUTO_INCREMENT,
        `callerNumber` CHAR(10) NOT NULL,
        `calleeNumber` CHAR(10) NOT NULL,
        `status` VARCHAR(12) NOT NULL DEFAULT 'ringing',
        `startedAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        `answeredAt` TIMESTAMP NULL DEFAULT NULL,
        `endedAt` TIMESTAMP NULL DEFAULT NULL,
        `blocked` TINYINT(1) NOT NULL DEFAULT 0,
        PRIMARY KEY (`callId`),
        KEY `idx_caller` (`callerNumber`, `startedAt`),
        KEY `idx_callee` (`calleeNumber`, `startedAt`),
        CONSTRAINT `fk_call_caller` FOREIGN KEY (`callerNumber`) REFERENCES `phone_numbers` (`phoneNumber`) ON DELETE CASCADE,
        CONSTRAINT `fk_call_callee` FOREIGN KEY (`calleeNumber`) REFERENCES `phone_numbers` (`phoneNumber`) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci]])

    -- The block list (14 Nov 2026, server/blocks.lua). The texts and calls that came while blocked carry `blocked`: kept,
    -- for the sender's own thread and Recents, and left out of the blocker's. Every query that reads them names the
    -- column, so it is here with the tables, not a step of its own.
    if not hasColumn('phone_messages', 'blocked') then
        MySQL.query.await('ALTER TABLE `phone_messages` ADD COLUMN `blocked` TINYINT(1) NOT NULL DEFAULT 0 AFTER `readAt`')
    end
    if not hasColumn('phone_calls', 'blocked') then
        MySQL.query.await('ALTER TABLE `phone_calls` ADD COLUMN `blocked` TINYINT(1) NOT NULL DEFAULT 0 AFTER `endedAt`')
    end
    -- One row a block: the SIM's number and the number it blocked. (The admin panel retires a number rather than
    -- deleting its row, so these keys rarely fire: blocks.lua moves a retired number's blocks itself.)
    -- The two numbers sort as phone_numbers' own does, whatever that is: a foreign key needs both sides to match, and
    -- phone_numbers on an older database may still sort the server's default way (whip_core's migration 042 aligns it,
    -- but not on a whip_core from before it). A mismatch would refuse the table and leave the phone off.
    local numberSort = MySQL.single.await([[SELECT CHARACTER_SET_NAME AS cs, COLLATION_NAME AS coll
        FROM information_schema.columns
        WHERE table_schema = DATABASE() AND table_name = 'phone_numbers' AND column_name = 'phoneNumber']])
    local cs, coll = numberSort and numberSort.cs, numberSort and numberSort.coll
    local sort = (type(cs) == 'string' and cs:match('^[%w_]+$') and type(coll) == 'string' and coll:match('^[%w_]+$'))
        and (' CHARACTER SET %s COLLATE %s'):format(cs, coll) or ''
    MySQL.query.await(([[CREATE TABLE IF NOT EXISTS `phone_blocks` (
        `phoneNumber` CHAR(10)%s NOT NULL,
        `blockedNumber` CHAR(10)%s NOT NULL,
        `createdAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (`phoneNumber`, `blockedNumber`),
        KEY `idx_blocked` (`blockedNumber`),
        CONSTRAINT `fk_blocks_phone` FOREIGN KEY (`phoneNumber`) REFERENCES `phone_numbers` (`phoneNumber`) ON DELETE CASCADE,
        CONSTRAINT `fk_blocks_blocked` FOREIGN KEY (`blockedNumber`) REFERENCES `phone_numbers` (`phoneNumber`) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci]]):format(sort, sort))
end

--- The indexes the busy queries need (audit 20, PHN-2, PHN-6, PHN-7): a conversation each way, the Messages list and
--- its unread counts, Recents each side, and who saved a number (server/card.lua). Each its own try: one refused costs
--- that query's speed, never the phone. (On a big table the first start after this takes a moment to build them.)
--- The `_shown` two are what a number received less what came while blocked (server/blocks.lua): the Messages list, its
--- unread counts, a conversation's incoming half and the callee's side of Recents, without stepping over every blocked
--- row a pest piled up.
local INDEXES = {
    { 'phone_messages', 'idx_pair',         '(`senderNumber`, `receiverNumber`, `messageId`)' },
    { 'phone_messages', 'idx_pair_in',      '(`receiverNumber`, `senderNumber`, `messageId`)' },
    { 'phone_messages', 'idx_shown_in',     '(`receiverNumber`, `blocked`, `senderNumber`, `messageId`)' },
    { 'phone_calls',    'idx_caller_id',    '(`callerNumber`, `callId`)' },
    { 'phone_calls',    'idx_callee_id',    '(`calleeNumber`, `callId`)' },
    { 'phone_calls',    'idx_callee_shown', '(`calleeNumber`, `blocked`, `callId`)' },
    { 'phone_contacts', 'idx_contact',      '(`contactNumber`)' },
}
local function migrateIndexes()
    for _, ix in ipairs(INDEXES) do
        local ok, err = pcall(function()
            if not hasIndex(ix[1], ix[2]) then
                MySQL.query.await(('ALTER TABLE `%s` ADD INDEX `%s` %s'):format(ix[1], ix[2], ix[3]))
            end
        end)
        if not ok then print(('^3[whip_phone] index %s on %s could not be made: %s^0'):format(ix[2], ix[1], tostring(err))) end
    end
end

--- Lore characters' numbers: no character (charId NULL), the lore character's key instead, one number each. A
--- step of its own: if the database refuses it, only lore numbers are off, never the phone.
local function migrateLore()
    if count([[SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE()
            AND table_name = 'phone_numbers' AND column_name = 'charId' AND is_nullable = 'NO']]) > 0 then
        MySQL.query.await('ALTER TABLE `phone_numbers` MODIFY `charId` INT UNSIGNED NULL')
    end
    if not hasColumn('phone_numbers', 'loreKey') then
        MySQL.query.await('ALTER TABLE `phone_numbers` ADD COLUMN `loreKey` VARCHAR(64) NULL DEFAULT NULL AFTER `charId`')
    end
    if not hasIndex('phone_numbers', 'uk_loreKey') then
        MySQL.query.await('ALTER TABLE `phone_numbers` ADD UNIQUE KEY `uk_loreKey` (`loreKey`)')
    end
end

MySQL.ready(function()
    -- phone_numbers points at whip_core's `characters`, which whip_core makes as it starts: on an empty database it is
    -- not there yet when this runs, and the phone's tables were refused (a red error, and the phone off until a
    -- restart). Made once whip_core is ready, so every table it points at is there.
    Whip.ready()
    local ok, err = pcall(migrate)
    if not ok then
        print('^1[whip_phone] the phone tables could not be made: ' .. tostring(err) .. '^0')
        return
    end
    migrateIndexes()
    local lok, lerr = pcall(migrateLore)
    PhoneDB.lore = lok
    if not lok then print('^3[whip_phone] lore characters get no phone numbers: ' .. tostring(lerr) .. '^0') end
    if not Numbers.load() then return end   -- it printed why; the phone stays off, as when this threw
    -- The block lists after the numbers (a list on a retired number follows it). Off rather than without them: a
    -- phone that let blocked numbers through would ring a pest back in.
    if not Blocks.load() then return end
    PhoneDB.ready = true
    if PhoneDB.lore and LorePhones then LorePhones.syncAll() end
end)
