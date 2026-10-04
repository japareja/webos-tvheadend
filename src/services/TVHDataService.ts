import EPGChannel from '../models/EPGChannel';
import EPGEvent from '../models/EPGEvent';
import M3UParser from '../utils/M3UParser';
import EPGChannelRecording, { EPGChannelRecordingKind } from '../models/EPGChannelRecording';
import EPGCacheService from './EPGCacheService';
import WebOSService from './WebOSService';
import Config from '../config/Config';
import EPGUtils from '../utils/EPGUtils';
import { ChannelGroup } from '../models/EPGData';
import { t } from '../i18n/I18n';

export interface TVHDataServiceParms {
    tvhUrl: string;
    user: string;
    password: string;
    dvrUuid: number;
}

interface TVHServerInfo {
    sw_version: string;
    api_version: number;
    name: string;
    capabilities: string[];
}
interface TVHEvents {
    entries: TVHEventEntry[];
    totalCount: number;
}

interface TVHEventEntry {
    eventId: number;
    start: number;
    stop: number;
    title: string;
    description: string;
    subtitle: string;
    channelUuid: string;
    image?: string;
}

interface TVHChannelTags {
    entries: { key: string; val: string }[];
}

interface TVHChannelGrid {
    entries: { uuid: string; tags?: string[] }[];
}

interface TVHRecordings<T extends EPGChannelRecordingKind> {
    entries: TVHRecordingEntryEx<T>[];
    total: number;
}

interface TVHRecordingEntryEx<T extends EPGChannelRecordingKind> extends TVHRecordingEntry {
    kind: T;
}

interface TVHRecordingEntry {
    uuid: number;
    enabled: boolean;
    start: number;
    stop: number;
    disp_title: string;
    disp_description: string;
    disp_subtitle: string;
    channel: string;
    channel_icon: string;
    channelname: string;
    url: string;
    // and many more
}

interface TVHRecordingsConfig {
    entries: TVHRecordingConfigEntry[];
    total: number;
}

interface TVHRecordingConfigEntry {
    uuid: number;
    enabled: boolean;
    name: string;
    // and many more
}

interface DVRCallback {
    (recordings: EPGEvent[]): void;
}

interface EPGCallback<T extends EPGChannel | EPGChannelRecording = EPGChannel> {
    (channels: T[]): void;
}

export default class TVHDataService {
    static API_SERVER_INFO = 'api/serverinfo';
    static API_EPG_TEST = 'api/epg/events/grid?dir=ASC&sort=start&limit=1&start=0';
    static EPG_PAGE_SIZE = 500;
    static EPG_PARALLEL_REQUESTS = 4;
    // the epg is loaded for this time range, and refreshed in the given interval
    static EPG_HORIZON_MILLIS = 36 * 60 * 60 * 1000;
    static EPG_REFRESH_MILLIS = 6 * 60 * 60 * 1000;
    // safety limit for the number of epg events
    static EPG_MAX_ENTRIES = 60000;
    static API_CHANNEL_TAGS = 'api/channeltag/list';
    static API_CHANNEL_GRID = 'api/channel/grid?limit=100000';
    static API_EPG = 'api/epg/events/grid?dir=ASC&sort=start&limit=' + TVHDataService.EPG_PAGE_SIZE + '&start=';
    static API_DVR_CONFIG = 'api/dvr/config/grid';
    static API_DVR_CREATE_BY_EVENT = 'api/dvr/entry/create_by_event?';
    static API_DVR_CANCEL = 'api/dvr/entry/cancel?uuid=';
    static API_DVR_UPCOMING = 'api/dvr/entry/grid_upcoming?duplicates=0';
    static API_DVR_FAILED = 'api/dvr/entry/grid_failed?duplicates=0';
    static API_DVR_RECORDINGS = 'api/dvr/entry/grid_finished?sort=disp_title';
    static API_DVR_DELETE = 'api/dvr/entry/remove?uuid=';
    static M3U_PLAYLIST = 'playlist/%schannels';

    //private serviceAdapter = new LunaServiceAdapter();
    private httpProxyServiceAdapter = Config.httpProxyServiceAdapter;
    private epgCacheService = new EPGCacheService();
    private webosService = new WebOSService();
    private channels: EPGChannel[] = [];
    private isEpgLoading = false;
    private epgLoadedAt = 0;
    private authToken?: string;
    private url?: string;
    // private profile: string;
    private dvrUuid?: number;
    private user?: string;
    private password?: string;

    constructor(settings: TVHDataServiceParms) {
        this.url = settings.tvhUrl;
        // append trailing slash if it doesn't exist
        if (!this.url?.endsWith('/')) {
            this.url += '/';
        }
        this.dvrUuid = settings.dvrUuid;
        this.user = settings.user;
        this.password = settings.password;
    }

    async awaitReadyness() {
        // continue even if the luna service or the network don't report ready, the requests will tell
        if (!(await this.waitUntilLunaServiceAvailable())) {
            console.log('LunaService not available, trying anyway');
        }

        // wait until service is avaialble
        try {
            await this.httpProxyServiceAdapter.isAvailable();
        } catch (error) {
            console.log('HttpProxyService not available: ', error);
            return Promise.reject('HttpProxyService not available');
        }

        if (!(await this.waitUntilNetworkAvailable())) {
            console.log('Network not available, trying anyway');
        }

        return Promise.resolve();
    }

    private static sleep(millis: number) {
        return new Promise((resolve) => setTimeout(resolve, millis));
    }

    /**
     * wait up to 5 tries (2s apart) for the luna service
     */
    async waitUntilLunaServiceAvailable() {
        for (let count = 1; count <= 5; count++) {
            try {
                if (await this.webosService.isAvailable()) {
                    return true;
                }
            } catch (error) {
                console.log('LunaService not available: retry ' + count, error);
            }
            await TVHDataService.sleep(2000);
        }
        return false;
    }

    /**
     * wait up to 5 tries (2s apart) for a network connection
     */
    async waitUntilNetworkAvailable() {
        for (let count = 1; count <= 5; count++) {
            try {
                const networkInfo = await Config.lunaServiceAdapter.getNetworkInfo();
                console.log('networkInfo', networkInfo);
                if (
                    networkInfo.isInternetConnectionAvailable ||
                    networkInfo.wired?.state === 'connected' ||
                    networkInfo.wifi?.state === 'connected' ||
                    networkInfo.wifiDirect?.state === 'connected'
                ) {
                    return true;
                }
            } catch (error) {
                console.log('Network not available: retry ' + count, error);
            }
            await TVHDataService.sleep(2000);
        }
        return false;
    }

    /**
     * persistent auth token, used to load images from the tvheadend image cache
     */
    setAuthToken(authToken: string) {
        this.authToken = authToken;
    }

    /**
     * retrieve local information from tv
     */
    async getLocaleInfo() {
        const localeInfo = await this.webosService.getLocaleInfo();
        // console.log('getLocaleInfo:', localeInfo);
        return localeInfo;
    }

    async getDeviceInfo() {
        const deviceInfo = await this.webosService.getDeviceInfo();
        console.log('getDeviceInfo:', deviceInfo);
        return deviceInfo;
    }

    /**
     * retrieve tvh server info
     */
    async retrieveServerInfo(): Promise<TVHServerInfo> {
        // now create rec by event
        return await this.httpProxyServiceAdapter.call<TVHServerInfo>({
            url: this.url + TVHDataService.API_SERVER_INFO,
            user: this.user,
            password: this.password
        });
    }

    createRec(event: EPGEvent, callback: DVRCallback) {
        // now create rec by event
        return this.httpProxyServiceAdapter
            .call({
                url:
                    this.url +
                    TVHDataService.API_DVR_CREATE_BY_EVENT +
                    'event_id=' +
                    event.getId() +
                    '&config_uuid=' +
                    this.dvrUuid +
                    '&comment=webos-tvheadend',
                user: this.user,
                password: this.password
            })
            .then(() => {
                console.log('created record: %s', event.getTitle());

                // toast information
                this.webosService.showToastMessage(t('Added DVR entry: {0}', event.getTitle()));

                // update upcoming recordings
                this.retrieveUpcomingRecordings(callback);
            })
            .catch((error) => {
                console.log('Failed to create entry by eventid: ', JSON.stringify(error));
            });
    }

    cancelRec(event: EPGEvent, callback: EPGCallback<EPGChannelRecording>, authToken?: string) {
        // now create rec by event
        this.httpProxyServiceAdapter
            .call({
                url: this.url + TVHDataService.API_DVR_CANCEL + event.getId(),
                user: this.user,
                password: this.password
            })
            .then(() => {
                console.log('cancelled record: %s', event.getTitle());

                // toast information
                this.webosService.showToastMessage(t('Cancelled DVR entry: {0}', event.getTitle()));

                // update upcoming recordings
                this.retrieveRecordings(authToken).then((recordings) => callback(recordings));
            })
            .catch((error) => {
                console.log('Failed to cancel entry: ', JSON.stringify(error));
            });
    }

    deleteRec(event: EPGEvent, callback: EPGCallback<EPGChannelRecording>, authToken?: string) {
        // delete rec by event
        this.httpProxyServiceAdapter
            .call({
                url: this.url + TVHDataService.API_DVR_DELETE + event.getId(),
                user: this.user,
                password: this.password
            })
            .then(() => {
                console.log('deleted record: %s', event.getTitle());

                // toast information
                this.webosService.showToastMessage(t('Deleted DVR entry: {0}', event.getTitle()));

                // retrieve recordings
                this.retrieveRecordings(authToken).then((recordings) => callback(recordings));
            })
            .catch((error) => {
                console.log('Failed to delete entry by uuid: ', JSON.stringify(error));
            });
    }

    retrieveUpcomingRecordings(callback: DVRCallback) {
        // now create rec by event
        this.retrieveTVHRecordings('REC_UPCOMING').then((response) => {
            // update upcoming recordings
            const recordings = [] as EPGEvent[];
            response.entries.forEach((recordingEntry) => {
                recordings.push(this.toEpgEventRec(recordingEntry));
            });
            callback(recordings);
        });
    }

    private retrieveTVHRecordings(recordingKind: EPGChannelRecordingKind) {
        let URL;
        switch (recordingKind) {
            case 'REC_FAILED':
                URL = this.url + TVHDataService.API_DVR_FAILED;
                break;
            case 'REC_FINISHED':
                URL = this.url + TVHDataService.API_DVR_RECORDINGS;
                break;
            case 'REC_UPCOMING':
                URL = this.url + TVHDataService.API_DVR_UPCOMING;
                break;
        }

        // now create rec by event
        return this.httpProxyServiceAdapter
            .call<TVHRecordings<typeof recordingKind>>({
                url: URL,
                user: this.user,
                password: this.password
            })
            .then((response) => {
                console.log('retrieved ' + recordingKind + ' recordings: %s', response.total);
                response.entries.map((entry) => (entry.kind = recordingKind));
                return response;
            })
            .catch((error) => {
                console.log('Failed to retrieve ' + recordingKind + ' recordings: ', JSON.stringify(error));
                return {} as TVHRecordings<typeof recordingKind>;
            });
    }

    async retrieveRecordings(authToken?: string): Promise<EPGChannelRecording[]> {
        const [finishedTVHRecordings, failedTVHRecordings, upcomingTVHRecordings] = await Promise.all([
            this.retrieveTVHRecordings('REC_FINISHED'),
            this.retrieveTVHRecordings('REC_FAILED'),
            this.retrieveTVHRecordings('REC_UPCOMING')
        ]);

        const recordings: EPGChannelRecording[] = [];
        const tvhRecordings = [
            ...finishedTVHRecordings.entries,
            ...failedTVHRecordings.entries,
            ...upcomingTVHRecordings.entries
        ].sort((a, b) => {
            //if (a.channelname < b.channelname) return -1;
            //if (a.channelname > b.channelname) return 1;
            if (a.start < b.start) return -1;
            if (a.start > b.start) return 1;
            return 0;
        });

        // build recordings
        tvhRecordings.forEach((recordingEntry) => {
            recordings.push(
                this.toEpgChannelRecording(recordingEntry, authToken, recordings.length + 1, recordingEntry.kind)
            );
        });

        return recordings;
    }

    toEpgEvent(tvhEvent: TVHEventEntry) {
        return new EPGEvent(
            tvhEvent.eventId,
            tvhEvent.start * 1000,
            tvhEvent.stop * 1000,
            tvhEvent.title,
            tvhEvent.description,
            tvhEvent.subtitle,
            tvhEvent.channelUuid,
            this.toImageUrl(tvhEvent.image)
        );
    }

    /**
     * epg images are either absolute urls or relative to the tvheadend url (image cache)
     */
    private toImageUrl(image?: string) {
        if (!image) {
            return undefined;
        }
        if (/^https?:\/\//i.test(image)) {
            return image;
        }
        if (image.indexOf('://') >= 0) {
            // e.g. file:// urls are not reachable from the tv
            return undefined;
        }
        const authParam = this.authToken ? (image.indexOf('?') >= 0 ? '&' : '?') + 'auth=' + this.authToken : '';
        return this.url + image.replace(/^\//, '') + authParam;
    }

    toEpgEventRec(recordingEntry: TVHRecordingEntry) {
        return new EPGEvent(
            recordingEntry.uuid,
            recordingEntry.start * 1000,
            recordingEntry.stop * 1000,
            recordingEntry.disp_title,
            recordingEntry.disp_description,
            recordingEntry.disp_subtitle,
            recordingEntry.channel
        );
    }

    /**
     * build up data model from recording entry
     * One recording = one epg Channel with one epg event
     *
     * @param recordingEntry tvheadend record entry
     * @param authToken optional auth token
     * @param id number of fake channel
     */
    toEpgChannelRecording(
        recordingEntry: TVHRecordingEntry,
        authToken: string | undefined,
        id: number,
        kind: EPGChannelRecordingKind
    ): EPGChannelRecording {
        const event = this.toEpgEventRec(recordingEntry);
        const authParam = authToken ? '?auth=' + authToken : '';
        const channelRecording = new EPGChannelRecording(
            recordingEntry.channel_icon && recordingEntry.channel_icon.length > 0
                ? new URL(this.url + recordingEntry.channel_icon + authParam)
                : undefined,
            recordingEntry.channelname,
            id, // use our own numbers item.channelNumber
            recordingEntry.channel,
            new URL(this.url + recordingEntry.url + authParam),
            kind
        );
        channelRecording.addEvent(event);
        return channelRecording;
    }

    async retrieveDVRConfig() {
        // retrieve the default dvr config
        return this.httpProxyServiceAdapter
            .call<TVHRecordingsConfig>({
                url: this.url + TVHDataService.API_DVR_CONFIG,
                user: this.user,
                password: this.password
            })
            .then((response) => {
                console.log('dvr configs received: %d', response.total);

                // try first enabled
                for (let i = 0; i < response.entries.length; i++) {
                    if (response.entries[i].enabled) {
                        return response.entries[i].uuid;
                    }
                }

                // try default config -> name = ''
                for (let i = 0; i < response.entries.length; i++) {
                    if (response.entries[i].name === '') {
                        return response.entries[i].uuid;
                    }
                }

                // if no default config we use the first entry
                return response.entries[0].uuid;
            })
            .catch((error) => {
                console.log('Failed to retrieve dvr config: ', JSON.stringify(error));
                throw error;
            });
    }

    async retrieveM3UChannels(): Promise<EPGChannel[]> {
        try {
            return await this._retrieveM3UChannels((this.user || '').length > 0 && (this.password || '').length > 0);
        } catch (error) {
            return await this._retrieveM3UChannels(false);
        }
    }

    private async _retrieveM3UChannels(withAuth: boolean): Promise<EPGChannel[]> {
        try {
            // after we set the base url we retrieve channels async
            let playlistPath;
            // persistence token is only available for authentication on >= 4.3
            if (withAuth) {
                playlistPath = TVHDataService.M3U_PLAYLIST.replace('%s', 'auth/');
            } else {
                playlistPath = TVHDataService.M3U_PLAYLIST.replace('%s', '');
            }

            const result = await this.httpProxyServiceAdapter.call<string>({
                url: this.url + playlistPath,
                user: this.user,
                password: this.password
            });

            // start from scratch, in case channels are reloaded
            this.channels = [];
            if (result) {
                const parserResult = M3UParser.parse(result);
                const channelNumbers = parserResult.items.map((item) => parseFloat(item.channelNumber));
                // channels without a number in tvheadend are numbered after the highest channel number
                let nextFreeNumber =
                    channelNumbers.reduce((max, number) => (number > max ? number : max), 0) || 0;
                parserResult.items.forEach((item, index) => {
                    let channelNumber = channelNumbers[index];
                    if (!(channelNumber > 0)) {
                        nextFreeNumber = Math.floor(nextFreeNumber) + 1;
                        channelNumber = nextFreeNumber;
                    }
                    const channel = new EPGChannel(
                        item.logoUrl && item.logoUrl.length > 0 ? new URL(item.logoUrl) : undefined,
                        item.channelName,
                        channelNumber,
                        item.channelId,
                        new URL(item.streamUrl)
                    );
                    this.channels.push(channel);
                });
            }
            console.log('processed all channels %d', this.channels.length);
            return this.channels;
        } catch (error) {
            console.log('Failed to retrieve channel data: ', JSON.stringify(error));
            throw error;
        }
    }

    /** request 1 epg entry with HEAD mode */
    retrieveTVEPGTest() {
        return this.retrieveTest(this.url + TVHDataService.API_EPG_TEST, true);
    }

    /** request an url in head mode */
    retrieveTest(url: URL | string, withCredentials?: boolean) {
        return this.httpProxyServiceAdapter.call({
            url: url.toString(),
            user: withCredentials ? this.user : '',
            password: withCredentials ? this.password : '',
            method: 'HEAD'
        });
    }

    private retrieveTVHEPGPage(start: number) {
        return this.httpProxyServiceAdapter.call<TVHEvents>({
            url: this.url + TVHDataService.API_EPG + start,
            user: this.user,
            password: this.password
        });
    }

    private addTVHEvents(response: TVHEvents, channelsByUuid: Map<string, EPGChannel>) {
        response.entries.forEach((tvhEvent) => {
            channelsByUuid.get(tvhEvent.channelUuid)?.addEvent(this.toEpgEvent(tvhEvent));
        });
    }

    /**
     * Retrieve the channel tags of tvheadend and assign them to the channels.
     * Returns the tags that are used by at least one channel.
     */
    async retrieveChannelTags(): Promise<ChannelGroup[]> {
        try {
            const [tagResponse, channelResponse] = await Promise.all([
                this.httpProxyServiceAdapter.call<TVHChannelTags>({
                    url: this.url + TVHDataService.API_CHANNEL_TAGS,
                    user: this.user,
                    password: this.password
                }),
                this.httpProxyServiceAdapter.call<TVHChannelGrid>({
                    url: this.url + TVHDataService.API_CHANNEL_GRID,
                    user: this.user,
                    password: this.password
                })
            ]);

            const tagsByChannel = new Map<string, string[]>();
            (channelResponse.entries || []).forEach((entry) => tagsByChannel.set(entry.uuid, entry.tags || []));

            const usedTags = new Set<string>();
            this.channels.forEach((channel) => {
                const tags = tagsByChannel.get(channel.getUUID()) || [];
                channel.setTags(tags);
                tags.forEach((tag) => usedTags.add(tag));
            });

            return (tagResponse.entries || [])
                .filter((tag) => usedTags.has(tag.key))
                .map((tag) => ({ id: tag.key, name: tag.val }));
        } catch (error) {
            console.log('Failed to retrieve channel tags: ', JSON.stringify(error));
            return [];
        }
    }

    /**
     * true if the loaded epg is old enough to be refreshed
     */
    isEpgRefreshDue() {
        return (
            !this.isEpgLoading &&
            this.epgLoadedAt > 0 &&
            Date.now() - this.epgLoadedAt > TVHDataService.EPG_REFRESH_MILLIS
        );
    }

    /**
     * Retrieve the epg for the next hours (EPG_HORIZON_MILLIS) in pages.
     *
     * The events are sorted by start time, so we can stop as soon as a page reaches the horizon.
     * Pages are requested with a few requests in parallel, but processed in order, so the events
     * of each channel stay sorted by start time.
     *
     * On the first load the channels are filled while loading, so the guide shows up early. A refresh
     * collects the events first and replaces them at the end, so the guide stays complete meanwhile.
     */
    async retrieveTVHEPG(callback: EPGCallback, isRefresh = false) {
        if (this.isEpgLoading) {
            return;
        }
        this.isEpgLoading = true;

        const channelsByUuid = new Map<string, EPGChannel>();
        this.channels.forEach((channel) => channelsByUuid.set(channel.getUUID(), channel));
        const refreshedEvents = new Map<string, EPGEvent[]>();
        const horizon = EPGUtils.getNow() + TVHDataService.EPG_HORIZON_MILLIS;

        const addEvents = (page: TVHEvents) => {
            page.entries.forEach((tvhEvent) => {
                const channel = channelsByUuid.get(tvhEvent.channelUuid);
                if (!channel) return;
                const event = this.toEpgEvent(tvhEvent);
                if (isRefresh) {
                    const events = refreshedEvents.get(tvhEvent.channelUuid) || [];
                    events.push(event);
                    refreshedEvents.set(tvhEvent.channelUuid, events);
                } else {
                    channel.addEvent(event);
                }
            });
        };
        const isLastPage = (page: TVHEvents) =>
            page.entries.length === 0 || page.entries[page.entries.length - 1].start * 1000 > horizon;

        try {
            const firstPage = await this.retrieveTVHEPGPage(0);
            addEvents(firstPage);
            !isRefresh && callback(this.channels);

            const totalCount = Math.min(firstPage.totalCount || 0, TVHDataService.EPG_MAX_ENTRIES);
            let isDone = isLastPage(firstPage);
            let nextStart = firstPage.entries.length;

            // keep a limited number of requests in flight
            const pendingPages: Promise<TVHEvents | undefined>[] = [];
            const requestNextPage = () => {
                if (isDone || nextStart >= totalCount) return;
                const pageStart = nextStart;
                nextStart += TVHDataService.EPG_PAGE_SIZE;
                pendingPages.push(
                    this.retrieveTVHEPGPage(pageStart).catch((error) => {
                        console.log('Failed to retrieve epg data at %d: ', pageStart, JSON.stringify(error));
                        return undefined;
                    })
                );
            };
            for (let i = 0; i < TVHDataService.EPG_PARALLEL_REQUESTS; i++) {
                requestNextPage();
            }

            while (pendingPages.length > 0) {
                const page = await pendingPages.shift();
                if (page && page.entries) {
                    addEvents(page);
                    console.log('epg events received: %d of %d', page.entries.length, page.totalCount);
                    !isRefresh && callback(this.channels);
                    isDone = isDone || isLastPage(page);
                }
                requestNextPage();
            }

            if (isRefresh) {
                this.channels.forEach((channel) => channel.setEvents(refreshedEvents.get(channel.getUUID()) || []));
            }
            this.epgLoadedAt = Date.now();
        } catch (error) {
            console.log('Failed to retrieve epg data: ', JSON.stringify(error));
            return;
        } finally {
            this.isEpgLoading = false;
        }

        console.log('processed all epg events');

        try {
            this.epgCacheService.handleEpgCache(this.channels, callback);
        } catch (err) {
            console.log('Failure during handle epg cache processing', err);
        }
    }
}
