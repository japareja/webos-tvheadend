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

        if (mimeType) {
            const typedSource = document.createElement('source');
            typedSource.setAttribute('src', url.toString());
            typedSource.setAttribute(
                'type',
                mimeType + ';mediaOption=' + MediaUtils.getMediaOption(maxWidth, maxHeight)
            );
            videoElement.appendChild(typedSource);
        }

        const fallbackSource = document.createElement('source');
        fallbackSource.setAttribute('src', url.toString());
        videoElement.appendChild(fallbackSource);

        return fallbackSource;
    }
}
