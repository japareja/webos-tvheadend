import Icon from '@enact/moonstone/Icon';
import Picker from '@enact/moonstone/Picker';
import React, { useEffect, useRef, useState } from 'react';
import StorageHelper from '../utils/StorageHelper';
import { t } from '../i18n/I18n';

const ChannelSettings = (props: {
    channelName: string;
    textTracks: TextTrackList | undefined;
    audioTracks: AudioTrackList | undefined;
    unmount: () => void;
}) => {
    const [textTracksDisplay, setTextTracksDisplay] = useState<string[]>([]);
    const [audioTracksDisplay, setAudioTracksDisplay] = useState<string[]>([]);

    const channelSettingsWrapper = useRef<HTMLDivElement>(null);
    const selectedAudioTrack = useRef(0);
    const selectedTextTrack = useRef(0);
    const timeoutReference = useRef<NodeJS.Timeout | null>(null);

    const handleTextChange = (event: { value: number }) => {
        updateAutomaticUnmount();

        // show the selected track, value 0 means subtitles off
        if (props.textTracks) {
            for (let i = 0; i < props.textTracks.length; i++) {
                props.textTracks[i].mode = event.value === i + 1 ? 'showing' : 'disabled';
            }
        }
        setSelectedTextTrack(event.value);

        // save selected text track index for channel
        StorageHelper.setLastTextTrackIndex(props.channelName, event.value);

        // do not pass this event further
        return false;
    };

    const handleAudioChange = (event: { value: number }) => {
        updateAutomaticUnmount();

        // enable new track
        if (props.audioTracks) {
            for (let i = 0; i < props.audioTracks.length; i++) {
                const audioTrack = props.audioTracks[i];
                audioTrack.enabled = event.value === i;
            }
        }
        setSelectedAudioTrack(event.value);

        // save selected audio track index for channel
        StorageHelper.setLastAudioTrackIndex(props.channelName, event.value);

        // do not pass this event further
        return false;
    };

    const handleKeyPress = (event: React.KeyboardEvent<HTMLDivElement>) => {
        const keyCode = event.keyCode;

        switch (keyCode) {
            case 13: // ok button
                // do not pass this event to parent
                event.stopPropagation();
                break;
            case 461: // back button
            case 405: // yellow button
            case 89: //'y'
                // do not pass this event to parent
                event.stopPropagation();
                props.unmount();
                break;
        }

        // pass unhandled events to parent
        if (!event.isPropagationStopped()) return event;
    };

    const setSelectedAudioTrack = (index: number) => {
        selectedAudioTrack.current = index;
    };

    const setSelectedTextTrack = (index: number) => {
        selectedTextTrack.current = index;
    };

    const updateAutomaticUnmount = () => {
        timeoutReference.current && clearTimeout(timeoutReference.current);
        timeoutReference.current = setTimeout(() => props.unmount(), 7000);
    };

    const focus = () => {
        channelSettingsWrapper.current?.focus();
    };

    useEffect(() => {
        focus();

        if (props.audioTracks) {
            for (let i = 0; i < props.audioTracks.length; i++) {
                const audioTrack = props.audioTracks[i];
                const label = audioTrack.language || audioTrack.label || t('Track {0}', i + 1);
                setAudioTracksDisplay((audioTracksDisplay) => [...audioTracksDisplay, label]);
                audioTrack.enabled && setSelectedAudioTrack(i);
            }
        }

        if (props.textTracks && props.textTracks.length > 0) {
            const textTracksLabels = [t('Off')];
            for (let i = 0; i < props.textTracks.length; i++) {
                const textTrack = props.textTracks[i];
                textTracksLabels.push(textTrack.language || textTrack.label || t('Track {0}', i + 1));
                textTrack.mode === 'showing' && setSelectedTextTrack(i + 1);
            }
            setTextTracksDisplay(textTracksLabels);
        }

        // automatic unmount
        updateAutomaticUnmount();

        return () => {
            // clear timeout in case component is unmounted
            timeoutReference.current && clearTimeout(timeoutReference.current);
        };
    }, []);

    return (
        <div
            id="channel-settings"
            ref={channelSettingsWrapper}
            tabIndex={-1}
            className="channelSettings"
            onKeyDown={handleKeyPress}
        >
            {audioTracksDisplay.length > 0 && (
                <>
                    <Icon>audio</Icon>
                    <Picker defaultValue={selectedAudioTrack.current} onChange={handleAudioChange} width="large">
                        {audioTracksDisplay}
                    </Picker>
                </>
            )}

            {textTracksDisplay.length > 0 && (
                <>
                    <Icon>sub</Icon>
                    <Picker defaultValue={selectedTextTrack.current} onChange={handleTextChange} width="large">
                        {textTracksDisplay}
                    </Picker>
                </>
            )}
        </div>
    );
};

export default ChannelSettings;
