import TVHDataService from '../services/TVHDataService';
import EPGChannel from '../models/EPGChannel';

const mockHour = 60 * 60;
const mockNow = Math.floor(Date.now() / 1000);
const mockState = { requests: [] as string[], totalEvents: 10000, eventsPerHour: 50 };

jest.mock('../config/Config', () => ({
    __esModule: true,
    default: {
        lunaServiceAdapter: {},
        fileServiceAdapter: {
            readEpgCache: () => Promise.reject({}),
            writeEpgCache: () => Promise.resolve({})
        },
        httpProxyServiceAdapter: {
            call: ({ url }: { url: string }) => {
                mockState.requests.push(url);
                if (url.indexOf('playlist') >= 0) {
                    return Promise.resolve(
                        '#EXTM3U\n' +
                            '#EXTINF:-1 tvg-id="a" tvg-chno="7",Seven\nhttp://tvh/stream/channelid/1?profile=pass\n' +
                            '#EXTINF:-1 tvg-id="b",No number\nhttp://tvh/stream/channelid/2?profile=pass\n' +
                            '#EXTINF:-1 tvg-id="c" tvg-chno="1001",Iptv\nhttp://tvh/stream/channelid/3?profile=pass\n'
                    );
                }
                if (url.indexOf('api/epg/events/grid') >= 0) {
                    const start = parseInt(url.split('&start=')[1]);
                    const entries = [];
                    for (let i = start; i < Math.min(start + 500, mockState.totalEvents); i++) {
                        const eventStart = mockNow + Math.floor((i * mockHour) / mockState.eventsPerHour);
                        entries.push({
                            eventId: i,
                            start: eventStart,
                            stop: eventStart + mockHour,
                            title: 'event ' + i,
                            description: '',
                            subtitle: '',
                            channelUuid: ['a', 'b', 'c'][i % 3],
                            image: i === 0 ? 'imagecache/12' : undefined
                        });
                    }
                    return Promise.resolve({ entries, totalCount: mockState.totalEvents });
                }
                return Promise.reject({ errorText: 'unexpected ' + url });
            }
        }
    }
}));

const createService = () => new TVHDataService({ tvhUrl: 'http://tvh:9981', user: '', password: '', dvrUuid: 0 });

describe('TVHDataService', () => {
    beforeEach(() => (mockState.requests = []));

    it('uses the tvheadend channel numbers and numbers the rest after the highest one', async () => {
        const service = createService();
        const channels = await service.retrieveM3UChannels();
        expect(channels.map((channel) => channel.getChannelID())).toEqual([7, 1002, 1001]);

        // reloading doesn't duplicate the channels
        expect((await service.retrieveM3UChannels()).length).toBe(3);
    });

    it('loads the epg only up to the time horizon', async () => {
        const service = createService();
        service.setAuthToken('token');
        const channels = await service.retrieveM3UChannels();
        await service.retrieveTVHEPG(() => undefined);

        // 50 events per hour -> 36 hours are 1800 events. Pages already in flight when the horizon is reached
        // are still processed, but the remaining epg (10000 events) is not requested
        const epgRequests = mockState.requests.filter((url) => url.indexOf('api/epg') >= 0);
        expect(epgRequests.length).toBe(7);
        const eventCount = channels.reduce((count, channel: EPGChannel) => count + channel.getEvents().length, 0);
        expect(eventCount).toBe(3500);

        // events stay sorted per channel
        channels.forEach((channel) => {
            const starts = channel.getEvents().map((event) => event.getStart());
            expect(starts).toEqual(starts.slice().sort((a, b) => a - b));
        });

        // relative epg images are resolved with the auth token
        expect(channels[0].getEvents()[0].getImage()).toBe('http://tvh:9981/imagecache/12?auth=token');
    });

    it('replaces the events on refresh instead of adding them again', async () => {
        const service = createService();
        const channels = await service.retrieveM3UChannels();
        await service.retrieveTVHEPG(() => undefined);
        const countBefore = channels[0].getEvents().length;
        await service.retrieveTVHEPG(() => undefined, true);
        expect(channels[0].getEvents().length).toBe(countBefore);
    });
});
