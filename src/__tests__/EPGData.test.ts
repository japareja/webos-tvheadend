import EPGData, { GROUP_ALL, GROUP_FAVORITES } from '../models/EPGData';
import EPGChannel from '../models/EPGChannel';
import EPGEvent from '../models/EPGEvent';

const createChannel = (number: number, tags: string[] = []) => {
    const channel = new EPGChannel(undefined, 'Channel ' + number, number, 'uuid' + number, new URL('http://tvh/s'));
    channel.setTags(tags);
    return channel;
};

describe('EPGData groups', () => {
    let epgData: EPGData;

    beforeEach(() => {
        localStorage.clear();
        epgData = new EPGData();
        epgData.updateChannels([createChannel(1, ['sat']), createChannel(2, ['tdt']), createChannel(3, ['sat'])]);
        epgData.updateTags([
            { id: 'sat', name: 'SAT' },
            { id: 'tdt', name: 'TDT' },
            { id: 'empty', name: 'Empty' }
        ]);
    });

    it('shows all channels by default', () => {
        expect(epgData.getCurrentGroup().id).toBe(GROUP_ALL);
        expect(epgData.getView().getChannelCount()).toBe(3);
    });

    it('cycles through non empty groups only', () => {
        // favorites are empty and skipped
        expect(epgData.nextGroup().id).toBe('sat');
        const view = epgData.getView();
        expect(view.getChannelCount()).toBe(2);
        expect(view.getPosition(1)).toBe(2);
        expect(view.getRow(1)).toBe(-1);
        expect(epgData.nextGroup().id).toBe('tdt');
        // 'empty' is skipped
        expect(epgData.nextGroup().id).toBe(GROUP_ALL);
    });

    it('persists favorites and falls back to all channels when the last favorite is removed', () => {
        const channel = epgData.getChannel(1) as EPGChannel;
        epgData.toggleFavorite(channel);
        expect(new EPGData().isFavorite(channel)).toBe(true);

        epgData.setCurrentGroup(GROUP_FAVORITES);
        expect(epgData.getView().getChannelCount()).toBe(1);

        epgData.toggleFavorite(channel);
        expect(epgData.getView().getChannelCount()).toBe(3);
        expect(epgData.getCurrentGroup().id).toBe(GROUP_ALL);
    });

    it('finds channels by their number', () => {
        expect(epgData.getChannelPositionByNumber(3)).toBe(2);
        expect(epgData.getChannelPositionByNumber(99)).toBe(-1);
    });
});

describe('EPGDataView', () => {
    it('handles channels without events', () => {
        const epgData = new EPGData();
        epgData.updateChannels([createChannel(1)]);
        const view = epgData.getView();
        expect(view.getEventBeforeTimestamp(0, Date.now())).toBeUndefined();
        expect(view.getEventAfterTimestamp(0, Date.now())).toBeUndefined();
        expect(view.getEvents(5)).toEqual([]);
        expect(view.getChannel(5)).toBeNull();
    });

    it('finds events around a timestamp', () => {
        const epgData = new EPGData();
        const channel = createChannel(1);
        [0, 1, 2].forEach((i) => channel.addEvent(new EPGEvent(i, i * 100, i * 100 + 100, 't' + i, '', '', 'uuid1')));
        epgData.updateChannels([channel]);
        const view = epgData.getView();
        expect(view.getEventAtTimestamp(0, 150)?.getId()).toBe(1);
        expect(view.getEventBeforeTimestamp(0, 150)?.getId()).toBe(0);
        expect(view.getEventAfterTimestamp(0, 150)?.getId()).toBe(2);
    });
});
