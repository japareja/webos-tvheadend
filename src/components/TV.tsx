import React, { useContext, useEffect, useRef, useState } from 'react';
import ChannelInfo from './ChannelInfo';
import TVGuide from './TVGuide';
import ChannelHeader from './ChannelHeader';
import ChannelList from './ChannelList';
import ChannelSettings from './ChannelSettings';
import EPGUtils from '../utils/EPGUtils';
import AppContext, { AppVisibilityState } from '../AppContext';
import '../styles/app.css';
import StorageHelper from '../utils/StorageHelper';
import EPGEvent from '../models/EPGEvent';
import EPGChannel from '../models/EPGChannel';
import Spinner from '@enact/moonstone/Spinner';
import { Panel } from '@enact/moonstone/Panels';
import { AppViewState } from '../App';
import MediaUtils from '../utils/MediaUtils';
import PipWindow from './PipWindow';
import { getLanguage, t } from '../i18n/I18n';

// if channels are switched faster than this, only the last selected channel gets started
const ZAP_DEBOUNCE_MILLIS = 400;
const MESSAGE_DURATION_MILLIS = 6000;
// channel numbers can have up to 4 digits (e.g. iptv channels)
const MAX_CHANNEL_NUMBER_DIGITS = 4;
// reconnect if the stream stalls for this time, with an increasing delay between the attempts
const STALL_TIMEOUT_MILLIS = 15000;
const MAX_RECONNECT_ATTEMPTS = 5;

export enum State {
    TV = 'tv',
    EPG = 'epg',
    CHANNEL_LIST = 'channleList',
    CHANNEL_INFO = 'channelInfo',
    CHANNEL_SETTINGS = 'channelSettings'
}

const TV = () => {
    const {
        menuState,
        appViewState,
        appVisibilityState,
        tvhDataService,
        epgData,
        currentChannelPosition,
        setCurrentChannelPosition
    } = useContext(AppContext);

    const tvWrapper = useRef<HTMLDivElement>(null);
    const video = useRef<HTMLVideoElement>(null);
    const timeoutChangeChannel = useRef<NodeJS.Timeout | null>(null);
    const timeoutStartStream = useRef<NodeJS.Timeout | null>(null);
    const lastSourceChange = useRef(0);
    const restartAfterPipFailure = useRef(false);
    const timeoutMessage = useRef<NodeJS.Timeout | null>(null);
    const timeoutReconnect = useRef<NodeJS.Timeout | null>(null);
    const timeoutStall = useRef<NodeJS.Timeout | null>(null);
    const reconnectAttempts = useRef(0);
    // identifies the current playback, so late diagnosis results of a previous channel are ignored
    const playbackId = useRef(0);
    const lastDiagnosis = useRef('');
    // time from requesting the stream until the picture is shown
    const streamRequestedAt = useRef(0);
    const startupMillis = useRef<number | undefined>(undefined);
    // the channel shown before the current one, for the back button
    const previousChannelPosition = useRef<number | null>(null);
    const shownChannelPosition = useRef<number | null>(null);
    const [pipSettings] = useState(StorageHelper.getPipSettings());
    const audioTracksRef = useRef<AudioTrackList>();
    const textTracksRef = useRef<TextTrackList>();

    const [isVideoPlaying, setIsVideoPlaying] = useState(false);
    const [state, setState] = useState<State>(State.CHANNEL_INFO);
    const [channelNumberText, setChannelNumberText] = useState('');
    const [pipChannelPosition, setPipChannelPosition] = useState<number | null>(null);
    const [message, setMessage] = useState('');
    const [videoQuality, setVideoQuality] = useState('');
    // shown instead of the spinner if the channel can't be played
    const [playbackError, setPlaybackError] = useState('');

    const focus = () => tvWrapper.current?.focus();

    const handleKeyPress = (event: React.KeyboardEvent<HTMLDivElement>) => {
        // in case we are in menu state we don't handle any keypress
        if (menuState) {
            return;
        }
        const keyCode = event.keyCode;

        switch (keyCode) {
            case 48: // 0
            case 49: // 1
            case 50: // 2
            case 51: // 3
            case 52: // 4
            case 53: // 5
            case 54: // 6
            case 55: // 7
            case 56: // 8
            case 57: // 9
                event.stopPropagation();
                enterChannelNumberPart(keyCode - 48);
                break;
            case 34: // programm down
                event.stopPropagation();
                zapInGroup(-1);
                break;
            case 40: // arrow down
                event.stopPropagation();
                setState(State.CHANNEL_LIST);
                break;
            case 33: // programm up
                event.stopPropagation();
                zapInGroup(1);
                break;
            case 67: // 'c'
            case 38: // arrow up
                event.stopPropagation();
                setState(State.CHANNEL_LIST);
                break;
            case 406: // blue button show epg
            case 66: // keyboard 'b'
                event.stopPropagation();
                setState(State.EPG);
                break;
            case 13: {
                // ok button ->show/disable channel info
                event.stopPropagation();
                handleChannelInfoSwitch();
                break;
            }
            case 405: // yellow button
            case 89: //'y'
                event.stopPropagation();
                handleChannelSettingsSwitch();
                break;
            case 403: {
                // red button to trigger or cancel recording
                event.stopPropagation();
                const channel = getCurrentChannel();
                const epgEvent = channel?.getEvents().find((event) => event.isCurrent());
                epgEvent && toggleRecording(epgEvent);
                break;
            }
            case 461: // backbutton
                event.stopPropagation();
                if (state === State.TV && previousChannelPosition.current !== null) {
                    // nothing shown on top of the video -> back to the previous channel
                    changeChannelPosition(previousChannelPosition.current);
                } else {
                    setState(State.TV);
                }
                break;
            case 39: // right arrow -> open/close picture in picture
            case 80: // keyboard 'p'
                event.stopPropagation();
                togglePip();
                break;
            case 37: // left arrow -> swap main and picture in picture channel
                event.stopPropagation();
                swapPip();
                break;
            default:
                console.log('TV-keyPressed:', keyCode);
        }

        // pass unhandled events to parent
        if (!event.isPropagationStopped()) return event;
    };

    const handleChannelInfoSwitch = () => {
        state !== State.CHANNEL_INFO ? setState(State.CHANNEL_INFO) : setState(State.TV);
    };

    const handleChannelSettingsSwitch = () => {
        // if we don't have any audio tracks or text tracks we don't get into channel settings state
        if (!audioTracksRef.current && !textTracksRef.current) {
            return;
        }

        state !== State.CHANNEL_SETTINGS ? setState(State.CHANNEL_SETTINGS) : setState(State.TV);
    };

    const handleScrollWheel = () => {
        setState(State.CHANNEL_LIST);
    };

    const handleClick = () => {
        handleChannelInfoSwitch();
    };

    const getMediaElement = () => video.current;

    const showMessage = (text: string) => {
        setMessage(text);
        timeoutMessage.current && clearTimeout(timeoutMessage.current);
        timeoutMessage.current = setTimeout(() => setMessage(''), MESSAGE_DURATION_MILLIS);
    };

    /**
     * switch to the next/previous channel of the current channel group (wraps around)
     */
    const zapInGroup = (direction: 1 | -1) => {
        const view = epgData.getView();
        const count = view.getChannelCount();
        if (count === 0) return;
        const row = view.getRow(currentChannelPosition);
        let nextRow: number;
        if (row >= 0) {
            nextRow = (row + direction + count) % count;
        } else {
            // the current channel is not part of the group (e.g. selected by number): take the nearest one
            nextRow = 0;
            for (let i = 0; i < count; i++) {
                const position = view.getPosition(i) as number;
                if (direction > 0 && position > currentChannelPosition) {
                    nextRow = i;
                    break;
                }
                if (direction < 0 && position < currentChannelPosition) {
                    nextRow = i;
                }
            }
        }
        const nextPosition = view.getPosition(nextRow);
        nextPosition !== undefined && changeChannelPosition(nextPosition);
    };

    /**
     * open the picture in picture window with the current channel, or close it if it is open
     */
    const togglePip = () => {
        setPipChannelPosition(pipChannelPosition === null ? currentChannelPosition : null);
    };

    /**
     * the picture in picture channel goes to the main window and vice versa
     */
    const swapPip = () => {
        if (pipChannelPosition === null || pipChannelPosition === currentChannelPosition) {
            return;
        }
        setPipChannelPosition(currentChannelPosition);
        changeChannelPosition(pipChannelPosition);
    };

    /**
     * the tv could not play the second video, close it and make sure the main video keeps running
     */
    const handlePipFailed = (reason: string) => {
        console.log('picture in picture failed:', reason);
        restartAfterPipFailure.current = true;
        setPipChannelPosition(null);
        showMessage(t('Picture in picture could not be started. Your TV might not support two videos at once.'));
    };

    /**
     * the main video should never pause on its own. If it does while picture in picture is open,
     * the second video took over the decoder of the main video
     */
    const handleMainVideoPause = () => {
        const videoElement = getMediaElement();
        // pauses without a source attached come from our own player resets
        if (pipChannelPosition !== null && videoElement?.firstChild && !videoElement.ended) {
            handlePipFailed('main video interrupted');
        }
    };

    const toggleRecording = (epgEvent: EPGEvent, callback?: () => unknown) => {
        // add current viewing channel to records
        // get current event

        if (!epgEvent) return;
        if (epgEvent.isPastDated(EPGUtils.getNow())) {
            // past dated do nothing
            return;
        }

        if (tvhDataService) {
            // check if event is already marked for recording
            const recEvent = epgData.getRecording(epgEvent);
            if (recEvent) {
                // cancel recording
                tvhDataService.cancelRec(recEvent, (recordings) => {
                    epgData.updateRecordings(
                        recordings.filter((rec) => rec.getKind() === 'REC_UPCOMING').map((rec) => rec.getEvents()[0])
                    );
                    callback && callback();
                });
            } else {
                // creat new recording from event
                tvhDataService.createRec(epgEvent, (recordings) => {
                    epgData.updateRecordings(recordings);
                    callback && callback();
                });
            }
        }
    };

    /**
     * Enters a digit that is used as part of the new channel number
     */
    const enterChannelNumberPart = (digit: number) => {
        // the header might still show the number of the current channel, a new input starts from scratch
        const currentText = timeoutChangeChannel.current ? channelNumberText : '';
        if (currentText.length >= MAX_CHANNEL_NUMBER_DIGITS) {
            return;
        }
        const newChannelNumberText = currentText + digit;
        setChannelNumberText(newChannelNumberText);

        // automatically switch to new channel after 2 seconds, or right away if no more digits are possible
        const switchChannel = () => {
            timeoutChangeChannel.current = null;
            const channelPosition = epgData.getChannelPositionByNumber(parseInt(newChannelNumberText));
            if (channelPosition >= 0) {
                changeChannelPosition(channelPosition);
            } else {
                showMessage(t('Channel {0} not found', newChannelNumberText));
            }
        };
        timeoutChangeChannel.current && clearTimeout(timeoutChangeChannel.current);
        if (newChannelNumberText.length >= MAX_CHANNEL_NUMBER_DIGITS) {
            switchChannel();
        } else {
            timeoutChangeChannel.current = setTimeout(switchChannel, 2000);
        }
    };

    const changeChannelPosition = (newChannelPosition: number) => {
        if (newChannelPosition === currentChannelPosition) {
            return;
        }
        setCurrentChannelPosition(newChannelPosition);
    };

    const handleLoadedMetaData = () => {
        const videoElement = getMediaElement();
        if (!videoElement) return;

        // restore selected audio channel from storage
        const audioTracks = videoElement.audioTracks;
        const textTracks = videoElement.textTracks;
        const currentChannel = getCurrentChannel();
        if (!currentChannel) return;
        const index = StorageHelper.getLastAudioTrackIndex(currentChannel.getName());
        if (index && index < audioTracks.length) {
            console.log('restore index %d for channel %s', index, currentChannel.getName());
            for (let i = 0; i < audioTracks.length; i++) {
                // stored track index is already enabled
                audioTracks[i].enabled = i === index;
            }
        }

        setAudioTracks(audioTracks);
        setTextTracks(textTracks);
        updateVideoQuality();

        // restore the selected subtitles, the tracks might be added later
        if (textTracks) {
            restoreTextTrack(textTracks, currentChannel.getName());
            textTracks.onaddtrack = () => restoreTextTrack(textTracks, currentChannel.getName());
        }
    };

    const restoreTextTrack = (textTracks: TextTrackList, channelName: string) => {
        const index = StorageHelper.getLastTextTrackIndex(channelName);
        if (index > 0 && index <= textTracks.length) {
            for (let i = 0; i < textTracks.length; i++) {
                textTracks[i].mode = i === index - 1 ? 'showing' : 'disabled';
            }
        }
    };

    const formatSeconds = (seconds: number) =>
        seconds.toLocaleString(getLanguage(), { minimumFractionDigits: 1, maximumFractionDigits: 1 });

    /**
     * quality, start time and buffer of the current stream for the channel info
     */
    const getPlaybackInfo = () => {
        const parts: string[] = [];
        videoQuality && parts.push(videoQuality);
        startupMillis.current !== undefined &&
            parts.push(t('start {0} s', formatSeconds(startupMillis.current / 1000)));
        const videoElement = getMediaElement();
        const bufferedAhead = videoElement && isVideoPlaying ? MediaUtils.getBufferedAhead(videoElement) : undefined;
        bufferedAhead !== undefined && parts.push(t('buffer {0} s', formatSeconds(bufferedAhead)));
        return parts.join(' · ');
    };

    const updateVideoQuality = () => {
        const videoElement = getMediaElement();
        setVideoQuality(
            videoElement ? MediaUtils.getQualityLabel(videoElement.videoWidth, videoElement.videoHeight) : ''
        );
    };

    const setAudioTracks = (audioTracks: AudioTrackList | undefined) => {
        audioTracksRef.current = audioTracks;
    };

    const setTextTracks = (textTracks: TextTrackList | undefined) => {
        textTracksRef.current = textTracks;
    };

    const cancelPendingStreamStart = () => {
        timeoutStartStream.current && clearTimeout(timeoutStartStream.current);
        timeoutStartStream.current = null;
    };

    const clearStallTimeout = () => {
        timeoutStall.current && clearTimeout(timeoutStall.current);
        timeoutStall.current = null;
    };

    const clearReconnect = () => {
        timeoutReconnect.current && clearTimeout(timeoutReconnect.current);
        timeoutReconnect.current = null;
    };

    const resetPlayer = (videoElement: HTMLVideoElement) => {
        cancelPendingStreamStart();
        clearStallTimeout();
        clearReconnect();
        setAudioTracks(undefined);
        setTextTracks(undefined);
        setVideoQuality('');
        MediaUtils.resetVideoElement(videoElement);
    };

    /**
     * the stream failed or stalls -> start it again, with an increasing delay between the attempts
     */
    const scheduleReconnect = (reason: string) => {
        const videoElement = getMediaElement();
        const currentChannel = getCurrentChannel();
        if (!videoElement || !currentChannel || timeoutReconnect.current) return;
        clearStallTimeout();

        // on the first failure ask tvheadend what is wrong
        if (reconnectAttempts.current === 0) {
            diagnosePlayback(currentChannel.getStreamUrl());
        }

        if (reconnectAttempts.current >= MAX_RECONNECT_ATTEMPTS) {
            console.log('giving up to reconnect: %s', reason);
            setPlaybackError(lastDiagnosis.current || t('The channel could not be played'));
            return;
        }

        const delay = Math.min(1000 * Math.pow(2, reconnectAttempts.current), 8000);
        console.log('reconnecting in %dms: %s', delay, reason);
        setIsVideoPlaying(false);
        timeoutReconnect.current = setTimeout(() => {
            timeoutReconnect.current = null;
            reconnectAttempts.current++;
            resetPlayer(videoElement);
            startSource(videoElement, currentChannel.getStreamUrl());
        }, delay);
    };

    const diagnosePlayback = (streamUrl: URL) => {
        if (!tvhDataService) return;
        const diagnosedPlaybackId = playbackId.current;
        tvhDataService.diagnoseStream(streamUrl).then((diagnosis) => {
            if (diagnosedPlaybackId !== playbackId.current) return;
            console.log('stream diagnosis:', diagnosis.message);
            lastDiagnosis.current = diagnosis.message;
            if (diagnosis.isFatal) {
                // retrying won't help, stop and tell the user why
                clearReconnect();
                clearStallTimeout();
                setPlaybackError(diagnosis.message);
            }
        });
    };

    const startStallTimeout = () => {
        clearStallTimeout();
        timeoutStall.current = setTimeout(() => scheduleReconnect('stalled'), STALL_TIMEOUT_MILLIS);
    };

    const handleVideoPlaying = () => {
        if (startupMillis.current === undefined && streamRequestedAt.current > 0) {
            startupMillis.current = Date.now() - streamRequestedAt.current;
            console.log('stream started after %dms', startupMillis.current);
        }
        clearStallTimeout();
        reconnectAttempts.current = 0;
        setPlaybackError('');
        setIsVideoPlaying(true);
    };

    const startSource = (videoElement: HTMLVideoElement, dataUrl: URL) => {
        timeoutStartStream.current = null;
        streamRequestedAt.current = Date.now();
        startupMillis.current = undefined;
        const lastSource = MediaUtils.attachSource(videoElement, dataUrl);
        // fired if none of the sources could be played
        lastSource.addEventListener('error', () => {
            lastSource.parentNode === videoElement && scheduleReconnect('source error');
        });
        // the stream has to start within the stall timeout
        startStallTimeout();

        // Auto-play video with some (unused) error handling
        const playPromise = videoElement.play();
        // workarund for promise not beeing returned in webos 3.x
        if (playPromise !== undefined) {
            playPromise.catch((error) => console.log('channel switched before it could be played', error));
        }
    };

    const changeSource = (dataUrl: URL) => {
        const videoElement = getMediaElement();
        if (!videoElement) return;

        // stop the current stream right away, so tvheadend can release the tuner
        resetPlayer(videoElement);
        reconnectAttempts.current = 0;
        playbackId.current++;
        lastDiagnosis.current = '';
        setPlaybackError('');
        setIsVideoPlaying(false);

        // start a single channel change immediately, but debounce fast zapping so we
        // don't open (and directly close again) a stream for every channel we pass
        const now = Date.now();
        const isZapping = now - lastSourceChange.current < ZAP_DEBOUNCE_MILLIS;
        lastSourceChange.current = now;
        if (isZapping) {
            timeoutStartStream.current = setTimeout(() => startSource(videoElement, dataUrl), ZAP_DEBOUNCE_MILLIS);
        } else {
            startSource(videoElement, dataUrl);
        }
    };

    const getWidth = () => window.innerWidth;
    const getHeight = () => window.innerHeight;
    const getCurrentChannel = () => epgData.getChannel(currentChannelPosition);

    const showCurrentChannelNumber = () => {
        const channel = epgData.getChannel(currentChannelPosition);
        setChannelNumberText(channel?.getChannelID().toString() || '');
    };

    const updateStreamSource = (streamUrl: URL) => {
        // show the channel info, if the channel was changed
        setState(State.CHANNEL_INFO);

        changeSource(streamUrl);

        // also show the current channel number
        showCurrentChannelNumber();
    };

    useEffect(() => {
        // the pip video is released now, restart the main video if it was interrupted
        if (pipChannelPosition === null && restartAfterPipFailure.current) {
            restartAfterPipFailure.current = false;
            const videoElement = getMediaElement();
            const currentChannel = getCurrentChannel();
            if (videoElement && currentChannel && (videoElement.paused || videoElement.readyState < 2)) {
                changeSource(currentChannel.getStreamUrl());
            }
        }
    }, [pipChannelPosition]);

    useEffect(() => {
        focus();

        // react has no handler for the resize event of media elements
        const videoElement = getMediaElement();
        videoElement && videoElement.addEventListener('resize', updateVideoQuality);

        return () => {
            videoElement && videoElement.removeEventListener('resize', updateVideoQuality);
            timeoutMessage.current && clearTimeout(timeoutMessage.current);
            timeoutChangeChannel.current && clearTimeout(timeoutChangeChannel.current);
            if (!videoElement) return;
            resetPlayer(videoElement);
        };
    }, []);

    useEffect(() => {
        // change channel in case we have channels retrieved and channel position changed
        if (epgData.getChannelCount() > 0) {
            const currentChannel = getCurrentChannel();
            if (currentChannel) {
                // remember the channel we come from for the back button
                if (shownChannelPosition.current !== null && shownChannelPosition.current !== currentChannelPosition) {
                    previousChannelPosition.current = shownChannelPosition.current;
                }
                shownChannelPosition.current = currentChannelPosition;

                updateStreamSource(currentChannel.getStreamUrl());
                // store last used channel
                StorageHelper.setLastChannelIndex(currentChannelPosition);
            }
        }
    }, [currentChannelPosition]);

    useEffect(() => {
        // if the channel info is shown, also show the current channel number
        if (state === State.CHANNEL_INFO) {
            showCurrentChannelNumber();
        }

        // request focus if none of the other components are active
        if (state === State.TV || state === State.CHANNEL_INFO) {
            focus();
        }
    }, [state]);

    useEffect(() => {
        // if the channel info is shown, also show the current channel number
        if (appViewState === AppViewState.TV) {
            focus();
        }
    }, [appViewState, menuState]);
    /**
     * handle app state changes
     */
    useEffect(() => {
        // state changed to focus -> refocus
        if (appVisibilityState === AppVisibilityState.FOCUSED) {
            console.log('TV: changed to focused');
            setState(State.CHANNEL_INFO);
            showCurrentChannelNumber();
            focus();
        }

        // state changed to background -> stop playback
        if (appVisibilityState === AppVisibilityState.BACKGROUND) {
            console.log('TV: changed to background');
            setPipChannelPosition(null);
            const videoElement = getMediaElement();
            if (!videoElement) return;
            resetPlayer(videoElement);
        }

        // state changed to foreground -> start playback
        if (appVisibilityState === AppVisibilityState.FOREGROUND) {
            console.log('TV: changed to foreground');
            const currentChannel = getCurrentChannel();
            // manually call update because we want to start the channel as we
            // have in the context -> no context change -> no effect
            // also we only do it if video has no source attached because on
            // first mount the source gets attached by currentChannelPosition effect
            currentChannel && !video.current?.firstChild && updateStreamSource(currentChannel.getStreamUrl());
            focus();
        }
    }, [appVisibilityState]);

    return (
        <div
            id="tv-wrapper"
            ref={tvWrapper}
            tabIndex={-1}
            onKeyDown={handleKeyPress}
            onWheel={handleScrollWheel}
            onClick={handleClick}
            className={isVideoPlaying ? 'tv playing' : 'tv loading'}
        >
            {channelNumberText !== '' && (
                <ChannelHeader channelNumberText={channelNumberText} unmount={() => setChannelNumberText('')} />
            )}

            {!isVideoPlaying && !playbackError && <Spinner centered component={Panel}></Spinner>}

            {playbackError !== '' && <div className="playbackError">{playbackError}</div>}

            {pipChannelPosition !== null && epgData.getChannel(pipChannelPosition) && (
                <PipWindow
                    channel={epgData.getChannel(pipChannelPosition) as EPGChannel}
                    profile={pipSettings.profile || undefined}
                    onFailed={handlePipFailed}
                />
            )}

            {message !== '' && <div className="tvMessage">{message}</div>}

            {state === State.CHANNEL_SETTINGS && (
                <ChannelSettings
                    channelName={getCurrentChannel()?.getName() || ''}
                    audioTracks={audioTracksRef.current}
                    textTracks={textTracksRef.current}
                    unmount={() => setState(State.TV)}
                />
            )}

            {state === State.CHANNEL_INFO && (
                <ChannelInfo
                    playbackInfo={getPlaybackInfo}
                    unmount={() => {
                        setState(State.TV);
                        setChannelNumberText('');
                    }}
                />
            )}

            {state === State.CHANNEL_LIST && (
                <ChannelList
                    toggleRecording={(event: EPGEvent, callback: () => unknown) => toggleRecording(event, callback)}
                    unmount={() => setState(State.CHANNEL_INFO)}
                />
            )}

            {state === State.EPG && (
                <TVGuide
                    toggleRecording={(event: EPGEvent, callback: () => unknown) => toggleRecording(event, callback)}
                    unmount={() => setState(State.CHANNEL_INFO)}
                />
            )}

            <video
                id="myVideo"
                ref={video}
                width={getWidth()}
                height={getHeight()}
                preload="none"
                onLoadedMetadata={handleLoadedMetaData}
                onPlaying={handleVideoPlaying}
                onPause={handleMainVideoPause}
                onWaiting={startStallTimeout}
                onError={() => scheduleReconnect('video error')}
                onEnded={() => scheduleReconnect('stream ended')}
            ></video>
        </div>
    );
};

export default TV;
