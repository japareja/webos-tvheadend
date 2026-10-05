import { TVHDataServiceParms } from '../services/TVHDataService';

const STORAGE_TVH_SETTING_KEY = 'TVH_SETTINGS';
const STORAGE_KEY_LAST_CHANNEL = 'lastChannel';
const STORAGE_KEY_CHANNEL_GROUP = 'channelGroup';
const STORAGE_KEY_FAVORITES = 'favoriteChannels';
const STORAGE_KEY_TEXT_TRACK_PREFIX = 'textTrack:';
const STORAGE_KEY_FAST_PLAYER = 'fastPlayer';

type BackupWriter = (settings: { [key: string]: string }) => Promise<unknown>;

// write the backup a moment after the last change, not for every single change
const BACKUP_DELAY_MILLIS = 3000;
let backupWriter: BackupWriter | undefined;
let backupTimeout: ReturnType<typeof setTimeout> | undefined;

export default class StorageHelper {
    /**
     * all settings of the app (everything in the local storage)
     */
    static getAllSettings = (): { [key: string]: string } => {
        const settings: { [key: string]: string } = {};
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key !== null) {
                settings[key] = localStorage.getItem(key) || '';
            }
        }
        return settings;
    };

    /**
     * restore settings from a backup
     */
    static restoreAllSettings = (settings: { [key: string]: string }) => {
        Object.keys(settings).forEach((key) => localStorage.setItem(key, settings[key]));
    };

    /**
     * the writer is set by the app, so a backup outside of the app is written whenever a setting changes
     */
    static setBackupWriter = (writer: BackupWriter) => {
        backupWriter = writer;
    };

    /**
     * write the backup right away, returns the result of the backup writer
     */
    static writeBackupNow = (): Promise<unknown> => {
        backupTimeout && clearTimeout(backupTimeout);
        backupTimeout = undefined;
        return backupWriter ? backupWriter(StorageHelper.getAllSettings()) : Promise.resolve(undefined);
    };

    static scheduleBackup = () => {
        if (!backupWriter) return;
        backupTimeout && clearTimeout(backupTimeout);
        backupTimeout = setTimeout(() => {
            backupTimeout = undefined;
            backupWriter &&
                backupWriter(StorageHelper.getAllSettings()).catch((error) =>
                    console.log('Failed to write settings backup:', JSON.stringify(error))
                );
        }, BACKUP_DELAY_MILLIS);
    };

    static getTvhSettings = () => {
        const settingsStr = localStorage.getItem(STORAGE_TVH_SETTING_KEY);
        console.log(settingsStr);
        return settingsStr ? (JSON.parse(settingsStr) as TVHDataServiceParms) : undefined;
    };

    static setTvhSettings = (settings: TVHDataServiceParms) => {
        localStorage.setItem(STORAGE_TVH_SETTING_KEY, JSON.stringify(settings));
        StorageHelper.scheduleBackup();
    };

    /** experimental player with a short start time (mpegts.js), off by default */
    static isFastPlayerEnabled = (): boolean => {
        return localStorage.getItem(STORAGE_KEY_FAST_PLAYER) === 'true';
    };

    static setFastPlayerEnabled = (enabled: boolean) => {
        localStorage.setItem(STORAGE_KEY_FAST_PLAYER, enabled ? 'true' : 'false');
        StorageHelper.scheduleBackup();
    };

    static getLastChannelIndex = (): number => {
        const indexStr = localStorage.getItem(STORAGE_KEY_LAST_CHANNEL);
        return (indexStr && parseInt(indexStr)) || 0;
    };

    static setLastChannelIndex = (index: number) => {
        localStorage.setItem(STORAGE_KEY_LAST_CHANNEL, index.toString());
        StorageHelper.scheduleBackup();
    };

    static getChannelGroup = (): string | null => {
        return localStorage.getItem(STORAGE_KEY_CHANNEL_GROUP);
    };

    static setChannelGroup = (groupId: string) => {
        localStorage.setItem(STORAGE_KEY_CHANNEL_GROUP, groupId);
        StorageHelper.scheduleBackup();
    };

    /** uuids of the favorite channels */
    static getFavorites = (): string[] => {
        try {
            const favorites = JSON.parse(localStorage.getItem(STORAGE_KEY_FAVORITES) || '[]');
            return Array.isArray(favorites) ? favorites : [];
        } catch {
            return [];
        }
    };

    static setFavorites = (favorites: string[]) => {
        localStorage.setItem(STORAGE_KEY_FAVORITES, JSON.stringify(favorites));
        StorageHelper.scheduleBackup();
    };

    /** selected subtitle track per channel, 0 means subtitles off */
    static getLastTextTrackIndex = (channelName: string): number => {
        const indexStr = localStorage.getItem(STORAGE_KEY_TEXT_TRACK_PREFIX + channelName);
        return (indexStr && parseInt(indexStr)) || 0;
    };

    static setLastTextTrackIndex = (channelName: string, index: number) => {
        localStorage.setItem(STORAGE_KEY_TEXT_TRACK_PREFIX + channelName, index.toString());
        StorageHelper.scheduleBackup();
    };

    static getLastAudioTrackIndex = (channelName: string): number => {
        const indexStr = localStorage.getItem(channelName);
        return (indexStr && parseInt(indexStr)) || 0;
    };

    static setLastAudioTrackIndex = (channelName: string, index: number) => {
        localStorage.setItem(channelName, index.toString());
        StorageHelper.scheduleBackup();
    };
}
