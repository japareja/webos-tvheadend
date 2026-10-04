import StorageHelper from '../utils/StorageHelper';

describe('StorageHelper settings backup', () => {
    beforeEach(() => {
        localStorage.clear();
        jest.useFakeTimers();
    });

    afterEach(() => jest.useRealTimers());

    it('writes a backup of all settings shortly after a change', () => {
        const writer = jest.fn(() => Promise.resolve());
        StorageHelper.setBackupWriter(writer);

        StorageHelper.setTvhSettings({ tvhUrl: 'http://tvh:9981/', user: 'u', password: 'p', dvrUuid: 1 });
        StorageHelper.setFavorites(['a']);
        expect(writer).not.toHaveBeenCalled();

        jest.advanceTimersByTime(3000);
        // several changes end up in one backup
        expect(writer).toHaveBeenCalledTimes(1);
        const settings = (writer.mock.calls[0] as unknown[])[0] as { [key: string]: string };
        expect(JSON.parse(settings.TVH_SETTINGS).tvhUrl).toBe('http://tvh:9981/');
        expect(JSON.parse(settings.favoriteChannels)).toEqual(['a']);
    });

    it('restores all settings from a backup', () => {
        StorageHelper.restoreAllSettings({
            TVH_SETTINGS: JSON.stringify({ tvhUrl: 'http://tvh/', user: '', password: '', dvrUuid: 0 }),
            lastChannel: '12'
        });
        expect(StorageHelper.getTvhSettings()?.tvhUrl).toBe('http://tvh/');
        expect(StorageHelper.getLastChannelIndex()).toBe(12);
    });
});
