import { TVHDataServiceParms } from '../services/TVHDataService';

const STORAGE_TVH_SETTING_KEY = 'TVH_SETTINGS';
const STORAGE_KEY_LAST_CHANNEL = 'lastChannel';
const STORAGE_PIP_SETTINGS_KEY = 'PIP_SETTINGS';

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

    static getLastAudioTrackIndex = (channelName: string): number => {
        const indexStr = localStorage.getItem(channelName);
        return (indexStr && parseInt(indexStr)) || 0;
    };

    static setLastAudioTrackIndex = (channelName: string, index: number) => {
        localStorage.setItem(channelName, index.toString());
    };
}
