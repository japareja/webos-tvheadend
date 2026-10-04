/**
 * Helpers to attach stream sources to the html5 video element in a way
 * the webOS media pipeline can start them as fast as possible.
 */
export default class MediaUtils {
    // UHD hint for the webOS media pipeline, so a 4k capable decoder is allocated
    static MAX_WIDTH = 3840;
    static MAX_HEIGHT = 2160;
    // the picture in picture window only asks for a full hd decoder
    static PIP_MAX_WIDTH = 1920;
    static PIP_MAX_HEIGHT = 1080;
    // set when the typed source failed on this tv but the untyped one played
    static TYPED_SOURCE_DISABLED_KEY = 'typedSourceDisabled';

    static isTypedSourceDisabled() {
        try {
            return localStorage.getItem(MediaUtils.TYPED_SOURCE_DISABLED_KEY) === 'true';
        } catch {
            return false;
        }
    }

    /**
     * Seconds of video that are buffered ahead of the current position, undefined if unknown
     */
    static getBufferedAhead(videoElement: HTMLVideoElement): number | undefined {
        const buffered = videoElement.buffered;
        if (!buffered || buffered.length === 0) {
            return undefined;
        }
        return Math.max(0, buffered.end(buffered.length - 1) - videoElement.currentTime);
    }

    /**
     * Check whether the app can read the stream itself (needed to decode it without the video element).
     * Reads the first bytes and stops, resolves false on any problem (e.g. cross origin restrictions).
     */
    static canReadStreamDirectly(url: URL, timeoutMillis = 5000): Promise<boolean> {
        return new Promise<boolean>((resolve) => {
            if (typeof fetch === 'undefined' || typeof AbortController === 'undefined') {
                resolve(false);
                return;
            }
            const controller = new AbortController();
            const timeout = setTimeout(() => {
                controller.abort();
                resolve(false);
            }, timeoutMillis);
            fetch(url.toString(), { signal: controller.signal })
                .then((response) => {
                    if (!response.ok || !response.body) {
                        throw new Error('status ' + response.status);
                    }
                    return response.body.getReader().read();
                })
                .then((chunk) => {
                    clearTimeout(timeout);
                    controller.abort();
                    resolve(!!chunk.value && chunk.value.length > 0);
                })
                .catch((error) => {
                    console.log('stream can not be read directly:', error && error.message);
                    clearTimeout(timeout);
                    resolve(false);
                });
        });
    }

    /**
     * Returns a copy of the stream url that requests the given tvheadend streaming profile
     */
    static withProfile(url: URL, profile: string): URL {
        const profileUrl = new URL(url.toString());
        profileUrl.searchParams.set('profile', profile);
        return profileUrl;
    }

    /**
     * Guess the container mime type from the tvheadend streaming profile in the url.
     * Returns undefined if the container cannot be determined, in which case the
     * media pipeline has to probe the stream itself.
     */
    static getMimeType(url: URL): string | undefined {
        const profile = (url.searchParams.get('profile') || '').toLowerCase();

        if (profile === 'pass' || profile === 'htsp' || profile.indexOf('mpegts') >= 0) {
            return 'video/mp2t';
        }
        if (profile.indexOf('matroska') >= 0 || profile.indexOf('mkv') >= 0) {
            return 'video/x-matroska';
        }
        if (profile.indexOf('webm') >= 0) {
            return 'video/webm';
        }
        if (profile.indexOf('mp4') >= 0) {
            return 'video/mp4';
        }

        return undefined;
    }

    /**
     * Build the webOS specific mediaOption parameter that is appended to the mime type.
     * It tells the pipeline up front that this is a plain URI video stream and that it
     * might be UHD, instead of letting it find that out by probing.
     */
    static getMediaOption(maxWidth = MediaUtils.MAX_WIDTH, maxHeight = MediaUtils.MAX_HEIGHT) {
        const options = {
            mediaTransportType: 'URI',
            option: {
                mediaFormat: {
                    type: 'video'
                },
                adaptiveStreaming: {
                    maxWidth: maxWidth,
                    maxHeight: maxHeight
                }
            }
        };

        return encodeURI(JSON.stringify(options));
    }

    /**
     * Short quality label for the video resolution, e.g. 'UHD 3840x2160'
     */
    static getQualityLabel(width: number, height: number) {
        if (!width || !height) {
            return '';
        }
        let label = 'SD';
        if (width >= 3200 || height >= 1800) {
            label = 'UHD';
        } else if (width >= 1200 || height >= 700) {
            label = 'HD';
        }
        return label + ' ' + width + 'x' + height;
    }

    /**
     * Stop the current playback and release the stream (and with that the tvheadend subscription)
     */
    static resetVideoElement(videoElement: HTMLVideoElement) {
        // Remove all source elements
        while (videoElement.firstChild) {
            videoElement.removeChild(videoElement.firstChild);
        }

        // Reset video
        videoElement.load();
    }

    /**
     * Attach a new source to the video element.
     *
     * If the container type is known a typed source with mediaOption is added first. An untyped
     * source with the same url is always added as fallback, so playback still works in case the
     * typed source is rejected by the pipeline.
     *
     * Returns the last source element, which fires an error event if no source could be played.
     */
    static attachSource(
        videoElement: HTMLVideoElement,
        url: URL,
        maxWidth = MediaUtils.MAX_WIDTH,
        maxHeight = MediaUtils.MAX_HEIGHT
    ) {
        const mimeType = MediaUtils.getMimeType(url);
        const fallbackSource = document.createElement('source');
        fallbackSource.setAttribute('src', url.toString());

        if (mimeType && !MediaUtils.isTypedSourceDisabled()) {
            const typedSource = document.createElement('source');
            typedSource.setAttribute('src', url.toString());
            typedSource.setAttribute(
                'type',
                mimeType + ';mediaOption=' + MediaUtils.getMediaOption(maxWidth, maxHeight)
            );
            typedSource.addEventListener('error', () => {
                if (typedSource.parentNode !== videoElement) return;
                // if the untyped source plays, the typed one only costs start time on this tv -> don't use it anymore
                const handlePlaying = () => {
                    videoElement.removeEventListener('playing', handlePlaying);
                    if (fallbackSource.parentNode === videoElement) {
                        console.log('typed source not supported by this tv, using untyped sources from now on');
                        try {
                            localStorage.setItem(MediaUtils.TYPED_SOURCE_DISABLED_KEY, 'true');
                        } catch {
                            // only an optimization
                        }
                    }
                };
                videoElement.addEventListener('playing', handlePlaying);
            });
            videoElement.appendChild(typedSource);
        }

        videoElement.appendChild(fallbackSource);

        return fallbackSource;
    }
}
