import React, { useEffect, useRef, useState } from 'react';
import EPGChannel from '../models/EPGChannel';
import MediaUtils from '../utils/MediaUtils';
import '../styles/app.css';
import { t } from '../i18n/I18n';

// if the pip stream is not playing after this time, we assume the tv can't play a second video
const PIP_START_TIMEOUT_MILLIS = 10000;
const PIP_HINT_DURATION_MILLIS = 5000;

/**
 * Small picture in picture window that plays a second channel (muted) with its own video element.
 * Whether this works depends on the tv providing a second hardware video decoder to the app.
 */
const PipWindow = (props: { channel: EPGChannel; profile?: string; onFailed: (reason: string) => void }) => {
    const video = useRef<HTMLVideoElement>(null);
    const startTimeout = useRef<NodeJS.Timeout | null>(null);
    const onFailed = useRef(props.onFailed);
    const [isPlaying, setIsPlaying] = useState(false);
    const [isHintVisible, setIsHintVisible] = useState(true);

    // always call the latest callback from the event handlers
    onFailed.current = props.onFailed;

    const clearStartTimeout = () => {
        startTimeout.current && clearTimeout(startTimeout.current);
        startTimeout.current = null;
    };

    const fail = (reason: string) => {
        clearStartTimeout();
        onFailed.current(reason);
    };

    const handlePlaying = () => {
        clearStartTimeout();
        setIsPlaying(true);
    };

    useEffect(() => {
        const videoElement = video.current;
        if (!videoElement) return;

        setIsPlaying(false);
        setIsHintVisible(true);

        const streamUrl = props.profile
            ? MediaUtils.withProfile(props.channel.getStreamUrl(), props.profile)
            : props.channel.getStreamUrl();

        // the audio always belongs to the main window
        videoElement.muted = true;
        const lastSource = MediaUtils.attachSource(
            videoElement,
            streamUrl,
            MediaUtils.PIP_MAX_WIDTH,
            MediaUtils.PIP_MAX_HEIGHT
        );
        // fired when none of the sources could be played
        const handleSourceError = () => fail('source error');
        lastSource.addEventListener('error', handleSourceError);

        const playPromise = videoElement.play();
        if (playPromise !== undefined) {
            playPromise.catch((error) => console.log('pip channel could not be played', error));
        }

        startTimeout.current = setTimeout(() => fail('timeout'), PIP_START_TIMEOUT_MILLIS);
        const hintTimeout = setTimeout(() => setIsHintVisible(false), PIP_HINT_DURATION_MILLIS);

        return () => {
            clearStartTimeout();
            clearTimeout(hintTimeout);
            lastSource.removeEventListener('error', handleSourceError);
            // stop the stream and release the decoder and the tvheadend subscription
            MediaUtils.resetVideoElement(videoElement);
        };
    }, [props.channel, props.profile]);

    return (
        <div className={isPlaying ? 'pip playing' : 'pip loading'}>
            <video
                ref={video}
                className="pipVideo"
                preload="none"
                onPlaying={handlePlaying}
                onError={() => fail('video error')}
            ></video>
            {!isPlaying && <div className="pipStatus">{t('Loading...')}</div>}
            {isHintVisible && (
                <div className="pipHint">
                    &#9664; {t('Swap')} &nbsp; &#9654; {t('Close')}
                </div>
            )}
            <div className="pipLabel">
                {props.channel.getChannelID()} {props.channel.getName()}
            </div>
        </div>
    );
};

export default PipWindow;
