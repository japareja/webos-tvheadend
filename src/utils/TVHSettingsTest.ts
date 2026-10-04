import Config from '../config/Config';
import TVHDataService from '../services/TVHDataService';
import { t } from '../i18n/I18n';

export interface TestResults {
    firmwareInfo: ResultItem;
    serverInfo: ResultItem;
    playlist: ResultItem;
    stream: ResultItem;
    epg: ResultItem;
    dvr: ResultItem;
}

export interface ResultItem {
    label: string;
    accessible: boolean;
    result: string;
    payload: any;
}

export default class TVHSettingsTest {
    private tvhService: TVHDataService;

    constructor(tvhService: TVHDataService) {
        this.tvhService = tvhService;
    }

    /**
     * test
     * - webos firmware version
     * - server info
     * - playlist
     * - stream
     * - epg
     * - dvr
     */
    async testAll(): Promise<TestResults> {
        // test server info
        const firmwareVersionResult = this.testWebosFirmwareVersion();
        const serverInfoResult = this.testServerInfo();
        const epgResult = this.testEpg();
        const testDvr = this.testDvr();
        const playlistAndChannelStreamResult = this.testPlaylistAndChannelStream();

        const testResults: Promise<TestResults> = Promise.all([
            firmwareVersionResult,
            serverInfoResult,
            playlistAndChannelStreamResult,
            epgResult,
            testDvr
        ]).then(([firmwareInfo, serverInfo, { playlist, stream }, epg, dvr]) => {
            return { firmwareInfo, serverInfo, playlist, stream, epg, dvr };
        });

        return testResults;
    }

    testWebosFirmwareVersion = async () => {
        return Config.lunaServiceAdapter.getDeviceInfo().then((deviceInfo) => {
            const firmwareVersionLabel = t('Device Info: ');
            const firmwareVersionResult = this.toResult(
                firmwareVersionLabel,
                true,
                deviceInfo.modelName + ' - ' + deviceInfo.firmwareVersion + ' - ' + deviceInfo.sdkVersion,
                deviceInfo
            );
            return firmwareVersionResult;
        });
    };

    testPlaylistAndChannelStream = async () => {
        const { playlistResult, streamUrl } = await this.testPlaylist();
        return this.testChannelStream(streamUrl).then((channelStreamResult) => {
            return { playlist: playlistResult, stream: channelStreamResult };
        });
    };

    testServerInfo = async () => {
        const serverInfoLabel = t('Server Info: ');

        return this.tvhService
            .retrieveServerInfo()
            .then((serverInfo) =>
                this.toResult(
                    serverInfoLabel,
                    true,
                    'Version: ' + serverInfo.sw_version + ' - API Version: ' + serverInfo.api_version,
                    serverInfo
                )
            )
            .catch((error) => this.toResult(serverInfoLabel, false, this.getErrorText(error)));
    };

    testPlaylist = async () => {
        const playListLabel = t('Playlist: ');

        return this.tvhService
            .retrieveM3UChannels()
            .then((channels) => {
                const streamUrl = channels[0] && channels[0].getStreamUrl();
                const resultItem = this.toResult(playListLabel, true, t('loaded {0} channels', channels.length));
                return { playlistResult: resultItem, streamUrl };
            })
            .catch((error) => {
                const resultItem = this.toResult(playListLabel, false, this.getErrorText(error));
                return { playlistResult: resultItem, streamUrl: null };
            });
    };

    testChannelStream = async (streamUrl: string | URL | null) => {
        const streamLabel = t('Stream: ');

        if (streamUrl) {
            // stream url is called via frontend (video element) and can therfore not provice any credentials
            // so our test needs to be without credentials
            return this.tvhService
                .retrieveTest(streamUrl, false)
                .then(() => this.toResult(streamLabel, true, t('verified access to video stream')))
                .catch((error) => this.toResult(streamLabel, false, this.getErrorTextStream(error)));
        } else {
            return this.toResult(
                streamLabel,
                false,
                t('No channels available - verification of channel stream not possible')
            );
        }
    };

    testEpg = async () => {
        const epgLabel = t('EPG: ');

        return this.tvhService
            .retrieveTVEPGTest()
            .then(() => this.toResult(epgLabel, true, t('verified access to EPG')))
            .catch((error) => this.toResult(epgLabel, false, this.getErrorText(error)));
    };

    testDvr = async () => {
        const dvrLabel = t('DVR: ');

        return this.tvhService
            .retrieveDVRConfig()
            .then((dvrUuid) => this.toResult(dvrLabel, true, t('verified access to DVR'), dvrUuid))
            .catch((error) => this.toResult(dvrLabel, false, this.getErrorText(error)));
    };

    private toResult(label: string, accessible: boolean, result: string, payload?: unknown): ResultItem {
        return {
            label: label,
            accessible: accessible,
            result: result,
            payload: payload
        };
    }

    private getErrorText(error: any): string {
        const isUnauthorized = error.statusCode && error.statusCode === 401;
        const isForbidden = error.statusCode && error.statusCode === 403;
        let errorText = error.errorText || error.message;
        if (isUnauthorized) {
            errorText = t('User authentication is required or provided user/password is wrong');
        }
        if (isForbidden) {
            errorText = t('User is missing privileges please verify user setup in tvheadend');
        }
        return errorText;
    }

    private getErrorTextStream(error: any): string {
        const isUnauthorized = error.statusCode && error.statusCode === 401;
        const isForbidden = error.statusCode && error.statusCode === 403;
        let errorText = error.errorText || error.message;
        if (isUnauthorized) {
            errorText = t(
                'Using Version 4.3 with User Authentication requires activation of "Persistence Token" in the Users Password setttings of TVHeadend'
            );
        }
        if (isForbidden) {
            errorText = t('User is missing privileges to access the stream url');
        }
        return errorText;
    }
}
