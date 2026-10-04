const fs = require('fs');
const path = require('path');

exports.handleSettingsBackup = handleSettingsBackup;

/**
 * Directories outside of the app installation, so a backup of the settings survives uninstalling
 * the app. Which of them are writable depends on the tv (developer mode, rooted, ...), so the backup
 * is written to all writable ones and read from the first one that has it.
 * /tmp survives a reinstall, but not a restart of the tv.
 */
var BACKUP_DIRS = [
    '/media/developer/temp/webos-tvheadend',
    '/media/internal/webos-tvheadend',
    '/var/lib/webos-tvheadend',
    '/tmp/webos-tvheadend'
];
var BACKUP_FILE = 'settings.json';

/**
 * create a directory and its parents (fs.mkdirSync has no recursive option in node 8)
 */
function mkdirs(dir) {
    if (fs.existsSync(dir)) {
        return;
    }
    mkdirs(path.dirname(dir));
    fs.mkdirSync(dir);
}

function writeBackup(data) {
    var content = JSON.stringify(data);
    var written = [];
    BACKUP_DIRS.forEach(function (dir) {
        try {
            mkdirs(dir);
            var file = path.join(dir, BACKUP_FILE);
            // write to a temporary file first, so a failing write can't destroy an existing backup
            fs.writeFileSync(file + '.tmp', content);
            fs.renameSync(file + '.tmp', file);
            written.push(dir);
        } catch (err) {
            // not writable on this tv
        }
    });
    return written;
}

function readBackup() {
    for (var i = 0; i < BACKUP_DIRS.length; i++) {
        try {
            var file = path.join(BACKUP_DIRS[i], BACKUP_FILE);
            if (fs.existsSync(file)) {
                return { dir: BACKUP_DIRS[i], data: JSON.parse(fs.readFileSync(file, 'utf8')) };
            }
        } catch (err) {
            // broken or not readable, try the next one
        }
    }
    return undefined;
}

/**
 * payload: { write: true, data: {...} } or { read: true }
 */
function handleSettingsBackup(message) {
    if (message.payload.write) {
        var written = writeBackup(message.payload.data || {});
        message.respond({
            returnValue: true,
            dirs: written
        });
        return;
    }

    var backup = readBackup();
    message.respond({
        returnValue: true,
        found: !!backup,
        dir: backup ? backup.dir : undefined,
        result: backup ? backup.data : undefined
    });
}
