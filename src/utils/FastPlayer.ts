import mpegts from 'mpegts.js';

// playback starts as soon as this much video is buffered (the native webOS player waits several seconds)
const START_BUFFER_SECONDS = 0.8;
// once the stream info is known, the picture has to move within this time, otherwise the native player takes over
const PLAY_TIMEOUT_MILLIS = 8000;
const START_CHECK_INTERVAL_MILLIS = 100;

/**
 * Player for live MPEG-TS streams with a short start time: the app reads the stream itself and feeds it
 * to the video element through Media Source Extensions (mpegts.js). Not every stream works this way
 * (e.g. MPEG-2 video), so every problem is reported with onFatal and the native player has to take over.
 */
export default class FastPlayer {
    static isSupported() {
        try {
            return mpegts.isSupported() && mpegts.getFeatureList().mseLivePlayback;
        } catch {
            return false;
        }
    }

    private player?: ReturnType<typeof mpegts.createPlayer>;
    private startInterval?: ReturnType<typeof setInterval>;
    private playTimeout?: ReturnType<typeof setTimeout>;
    private hasFailed = false;

    constructor(readonly url: URL, readonly channelUuid: string, private onFatal: (reason: string) => void) {}

    start(videoElement: HTMLVideoElement) {
        mpegts.LoggingControl.applyConfig({ enableVerbose: false, enableDebug: false, enableInfo: false });

        const player = mpegts.createPlayer(
            { type: 'mpegts', isLive: true, url: this.url.toString() },
            {
                enableWorker: false,
                // hand the data to the video element right away instead of collecting it first
                enableStashBuffer: false,
                lazyLoad: false,
                autoCleanupSourceBuffer: true,
                // smooth playback is more important than the lowest latency
                liveBufferLatencyChasing: false
            }
        );
        this.player = player;

        player.on(mpegts.Events.ERROR, (type: string, detail: string) => this.fail(type + ': ' + detail));
        player.on(mpegts.Events.MEDIA_INFO, (mediaInfo: { hasVideo?: boolean; hasAudio?: boolean }) => {
            if (!mediaInfo.hasVideo && mediaInfo.hasAudio) {
                // the video codec is not supported (e.g. MPEG-2), only the audio would play
                this.fail('video codec not supported');
                return;
            }
            this.clearPlayTimeout();
            this.playTimeout = setTimeout(() => {
                if (videoElement.paused || videoElement.readyState < 3) {
                    this.fail('stream did not start');
                }
            }, PLAY_TIMEOUT_MILLIS);
        });

        player.attachMediaElement(videoElement);
        player.load();

        // start playing as soon as a little buffer is there
        this.startInterval = setInterval(() => {
            const buffered = videoElement.buffered;
            if (buffered.length === 0) return;
            const start = buffered.start(0);
            if (buffered.end(buffered.length - 1) - start < START_BUFFER_SECONDS) return;

            this.clearStartInterval();
            if (videoElement.currentTime < start) {
                videoElement.currentTime = start;
            }
            const playPromise = videoElement.play();
            if (playPromise !== undefined) {
                playPromise.catch((error) => console.log('fast player could not start playback', error));
            }
        }, START_CHECK_INTERVAL_MILLIS);
    }

    /**
     * the video element reported an error while this player was active
     */
    reportError(reason: string) {
        this.fail(reason);
    }

    destroy() {
        this.clearStartInterval();
        this.clearPlayTimeout();
        const player = this.player;
        this.player = undefined;
        if (!player) return;
        try {
            player.pause();
            player.unload();
            player.detachMediaElement();
            player.destroy();
        } catch (error) {
            console.log('failed to destroy the fast player', error);
        }
    }

    private fail(reason: string) {
        if (this.hasFailed) return;
        this.hasFailed = true;
        console.log('fast player failed: %s', reason);
        this.onFatal(reason);
    }

    private clearStartInterval() {
        this.startInterval && clearInterval(this.startInterval);
        this.startInterval = undefined;
    }

    private clearPlayTimeout() {
        this.playTimeout && clearTimeout(this.playTimeout);
        this.playTimeout = undefined;
    }
}
