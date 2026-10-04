import { TVHDataServiceParms } from '../services/TVHDataService';

const STORAGE_TVH_SETTING_KEY = 'TVH_SETTINGS';
const STORAGE_KEY_LAST_CHANNEL = 'lastChannel';
const STORAGE_PIP_SETTINGS_KEY = 'PIP_SETTINGS';
const STORAGE_KEY_CHANNEL_GROUP = 'channelGroup';
const STORAGE_KEY_FAVORITES = 'favoriteChannels';
const STORAGE_KEY_TEXT_TRACK_PREFIX = 'textTrack:';

export interface PipSettings {
    // optional tvheadend streaming profile used for the picture in picture stream
    profile: string;
}

export default class StorageHelper {
    static getTvhSettings = () => {
        const settingsStr = localStorage.getItem(STORAGE_TVH_SETTING_KEY);
        console.log(settingsStr);
        return settingsStr ? (JSON.parse(settingsStr) as TVHDataServiceParms) : undefined;
    };

    static setTvhSettings = (settings: TVHDataServiceParms) => {
        localStorage.setItem(STORAGE_TVH_SETTING_KEY, JSON.stringify(settings));
    };

    static getPipSettings = (): PipSettings => {
        const settingsStr = localStorage.getItem(STORAGE_PIP_SETTINGS_KEY);
        return settingsStr ? (JSON.parse(settingsStr) as PipSettings) : { profile: '' };
    };

    static setPipSettings = (settings: PipSettings) => {
        localStorage.setItem(STORAGE_PIP_SETTINGS_KEY, JSON.stringify(settings));
    };

    static getLastChannelIndex = (): number => {
        const indexStr = localStorage.getItem(STORAGE_KEY_LAST_CHANNEL);
        return (indexStr && parseInt(indexStr)) || 0;
    };

    static setLastChannelIndex = (index: number) => {
        localStorage.setItem(STORAGE_KEY_LAST_CHANNEL, index.toString());
    };

    static getChannelGroup = (): string | null => {
        return localStorage.getItem(STORAGE_KEY_CHANNEL_GROUP);
    };

    static setChannelGroup = (groupId: string) => {
        localStorage.setItem(STORAGE_KEY_CHANNEL_GROUP, groupId);
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
    };

    /** selected subtitle track per channel, 0 means subtitles off */
    static getLastTextTrackIndex = (channelName: string): number => {
        const indexStr = localStorage.getItem(STORAGE_KEY_TEXT_TRACK_PREFIX + channelName);
        return (indexStr && parseInt(indexStr)) || 0;
    };

    static setLastTextTrackIndex = (channelName: string, index: number) => {
        localStorage.setItem(STORAGE_KEY_TEXT_TRACK_PREFIX + channelName, index.toString());
    };

    static getLastAudioTrackIndex = (channelName: string): number => {
        const indexStr = localStorage.getItem(channelName);
        return (indexStr && parseInt(indexStr)) || 0;
    };

    static setLastAudioTrackIndex = (channelName: string, index: number) => {
        localStorage.setItem(channelName, index.toString());
    };
}
