import React, { useContext, useEffect, useLayoutEffect, useRef, useState } from 'react';
import Rect from '../models/Rect';
import CanvasUtils from '../utils/CanvasUtils';
import AppContext from '../AppContext';
import '../styles/app.css';
import ChannelListDetails from './ChannelListDetails';
import EPGEvent from '../models/EPGEvent';
import EPGChannel from '../models/EPGChannel';
import EPGUtils from '../utils/EPGUtils';
import { t } from '../i18n/I18n';
import GroupPicker from './GroupPicker';

const VERTICAL_SCROLL_TOP_PADDING_ITEM = 5;
// holding the yellow button this long opens the list of all groups
const LONG_PRESS_MILLIS = 600;
const IS_DEBUG = false;

enum State {
    NORMAL = 'normal',
    DETAILS = 'details'
}

interface DetailsState {
    focusedChannel?: EPGChannel;
    focusedEvent?: EPGEvent;
}

const ChannelList = (props: {
    toggleRecording: (event: EPGEvent, callback: () => unknown) => void;
    unmount: () => void;
}) => {
    const { epgData, imageCache, currentChannelPosition, setCurrentChannelPosition, isAnimationsEnabled } = useContext(
        AppContext
    );
    const canvas = useRef<HTMLCanvasElement>(null);
    const listWrapper = useRef<HTMLDivElement>(null);
    const scrollAnimationId = useRef(0);
    const scrollY = useRef(0);
    // the list shows the channels of the current group, positions in this component are rows of that view
    const view = useRef(epgData.getView());
    const channelPosition = useRef(Math.max(0, view.current.getRow(currentChannelPosition)));

    const focusedEventOffset = useRef(0);
    const nextEvents = useRef<EPGEvent[]>([]);
    const nextSameEvents = useRef<EPGEvent[]>([]);

    const mChannelLayoutTextSize = 32;
    const mChannelLayoutEventTextSize = 26;
    const mChannelLayoutNumberTextSize = 38;
    const mChannelLayoutTextColor = '#cccccc';
    const mChannelLayoutTitleTextColor = '#969696';
    const mChannelLayoutMargin = 3;
    const mChannelLayoutPadding = 7;
    const mChannelLayoutHeight = 90;
    const mChannelLayoutWidth = 900;
    const mChannelLayoutBackgroundFocus = 'rgba(29,170,226,1)';

    const [state, setState] = useState<State>(State.NORMAL);
    const [detailsState, setDetailsState] = useState<DetailsState>();
    const [groupName, setGroupName] = useState(epgData.getCurrentGroup().name);
    const [isGroupPickerOpen, setGroupPickerOpen] = useState(false);
    // the button that opened the picker and is still held
    const [pickerHeldKeys, setPickerHeldKeys] = useState<number[]>([]);
    // short press of the yellow button: next group, long press: list of all groups
    const isYellowPressed = useRef(false);
    const yellowLongPressTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

    const getTopFrom = (position: number) => {
        const y = position * mChannelLayoutHeight; //+ this.mChannelLayoutMargin;
        return y - scrollY.current;
    };

    const scrollToChannelPosition = (channelPosition: number, withAnimation: boolean) => {
        // start scrolling after padding position top
        if (channelPosition < VERTICAL_SCROLL_TOP_PADDING_ITEM) {
            scrollY.current = 0;
            updateCanvas();
            return;
        }

        // stop scrolling before top padding position
        const maxPosition = view.current.getChannelCount() - VERTICAL_SCROLL_TOP_PADDING_ITEM;
        if (channelPosition >= maxPosition) {
            // fix scroll to channel in case it is within bottom padding
            if (scrollY.current === 0) {
                // short lists (e.g. small groups) don't scroll at all
                scrollY.current = Math.max(0, mChannelLayoutHeight * (maxPosition - VERTICAL_SCROLL_TOP_PADDING_ITEM));
            }
            updateCanvas();
            return;
        }

        // scroll to channel position
        const scrollTarget = mChannelLayoutHeight * (channelPosition - VERTICAL_SCROLL_TOP_PADDING_ITEM);
        if (!withAnimation) {
            scrollY.current = scrollTarget;
            updateCanvas();
            return;
        }

        const scrollDistance = scrollTarget - scrollY.current;
        const scrollDelta = scrollDistance / (mChannelLayoutHeight / 5);
        // stop existing animation if we have a new request
        cancelAnimationFrame(scrollAnimationId.current);
        scrollAnimationId.current = requestAnimationFrame(() => {
            animateScroll(scrollDelta, scrollTarget);
        });
    };

    const animateScroll = (scrollDelta: number, scrollTarget: number) => {
        if (scrollDelta < 0 && scrollY.current <= scrollTarget) {
            //this.scrollY = scrollTarget;
            cancelAnimationFrame(scrollAnimationId.current);
            return;
        }
        if (scrollDelta > 0 && scrollY.current >= scrollTarget) {
            //this.scrollY = scrollTarget;
            cancelAnimationFrame(scrollAnimationId.current);
            return;
        }
        //console.log("scrolldelta=%d, scrolltarget=%d, scrollY=%d", scrollDelta, scrollTarget, this.scrollY);
        scrollY.current = scrollY.current + scrollDelta;
        scrollAnimationId.current = requestAnimationFrame(() => {
            animateScroll(scrollDelta, scrollTarget);
        });
        updateCanvas();
    };

    const drawChannelListItems = (canvas: CanvasRenderingContext2D) => {
        // Background
        const drawingRect = new Rect();
        drawingRect.left = 0;
        drawingRect.top = 0;
        drawingRect.right = drawingRect.left + mChannelLayoutWidth;
        drawingRect.bottom = drawingRect.top + getHeight();
        canvas.globalAlpha = 1.0;
        // put stroke color to transparent
        //canvas.strokeStyle = "transparent";
        canvas.strokeStyle = 'gradient';
        //mPaint.setColor(mChannelLayoutBackground);
        // canvas.fillStyle = this.mChannelLayoutBackground;
        // Create gradient
        const grd = canvas.createLinearGradient(
            drawingRect.bottom,
            drawingRect.top,
            drawingRect.bottom,
            drawingRect.bottom
        );
        // Important bit here is to use rgba()
        grd.addColorStop(0, 'rgba(11, 39, 58, 0.7)');
        grd.addColorStop(0.2, 'rgba(35, 64, 84, 0.9)');
        grd.addColorStop(0.8, 'rgba(35, 64, 84, 0.9)');
        grd.addColorStop(1, 'rgba(11, 39, 58, 0.7)');

        // Fill with gradient
        canvas.fillStyle = grd;
        canvas.fillRect(drawingRect.left, drawingRect.top, drawingRect.width, drawingRect.height);

        const firstPos = getFirstVisibleChannelPosition();
        const lastPos = getLastVisibleChannelPosition();

        //console.log("Channel: First: " + firstPos + " Last: " + lastPos);
        //let transparentTop = firstPos + 3;
        //let transparentBottom = lastPos - 3;
        canvas.globalAlpha = 1.0;
        for (let pos = firstPos; pos < lastPos; pos++) {
            // if (pos <= transparentTop) {
            //     canvas.globalAlpha += 0.25;
            // } else if (pos >= transparentBottom) {
            //     canvas.globalAlpha -= 0.25;
            // } else {
            //     canvas.globalAlpha = 1;
            // }
            drawChannelItem(canvas, pos);
        }
    };

    const drawChannelItem = (canvas: CanvasRenderingContext2D, position: number) => {
        const isSelectedChannel = position === channelPosition.current;
        const channel = view.current.getChannel(position);
        const drawingRect = new Rect();

        // should not happen, but better check it
        if (!channel) return;

        drawingRect.left = 0;
        drawingRect.top = getTopFrom(position);
        drawingRect.right = mChannelLayoutWidth;
        drawingRect.bottom = drawingRect.top + mChannelLayoutHeight;
        IS_DEBUG && CanvasUtils.drawDebugRect(canvas, drawingRect);

        // highlight selected channel
        if (isSelectedChannel) {
            canvas.fillStyle = mChannelLayoutBackgroundFocus;
            canvas.fillRect(drawingRect.left, drawingRect.top, drawingRect.width, drawingRect.height);
        }

        // channels that could not be played recently are dimmed
        const isFailed = view.current.isFailed(position);
        canvas.globalAlpha = isFailed ? 0.45 : 1.0;

        // channel number, long channel numbers get a smaller font
        const channelNumberText = channel.getChannelID().toString();
        CanvasUtils.writeText(canvas, channelNumberText, drawingRect.left + 75, drawingRect.middle, {
            fontSize: channelNumberText.length > 3 ? mChannelLayoutNumberTextSize - 12 : mChannelLayoutNumberTextSize,
            textAlign: 'right',
            fillStyle: mChannelLayoutTextColor,
            isBold: true
        });

        // channel line
        const currentEvent = view.current.getEventAtTimestamp(position, EPGUtils.getNow());
        const channelIconWidth = mChannelLayoutHeight * 1.3;
        const channelNameWidth = mChannelLayoutWidth - channelIconWidth - 90;

        const leftBeforeRecMark = drawingRect.left;
        // recording mark
        if (currentEvent && view.current.isRecording(currentEvent)) {
            const radius = 10;
            canvas.fillStyle = '#FF0000';
            canvas.beginPath();
            canvas.arc(drawingRect.left + 90 + radius, drawingRect.middle - radius, radius, 0, 2 * Math.PI);
            canvas.fill();
            drawingRect.left += 2 * radius + mChannelLayoutPadding;
        }
        // favorite mark
        if (view.current.isFavorite(position)) {
            drawStar(canvas, drawingRect.left + 90 + 11, drawingRect.top + mChannelLayoutHeight * 0.33, 11);
            drawingRect.left += 22 + mChannelLayoutPadding;
        }
        // failed mark
        if (isFailed) {
            drawFailedMark(canvas, drawingRect.left + 90 + 11, drawingRect.top + mChannelLayoutHeight * 0.33, 11);
            drawingRect.left += 22 + mChannelLayoutPadding;
        }
        // channel name
        CanvasUtils.writeText(
            canvas,
            channel.getName(),
            drawingRect.left + 90,
            drawingRect.top + mChannelLayoutHeight * 0.33,
            {
                fontSize: mChannelLayoutTextSize,
                fillStyle: mChannelLayoutTextColor,
                isBold: true,
                maxWidth: channelNameWidth
            }
        );
        drawingRect.left = leftBeforeRecMark;

        // channel event
        if (currentEvent) {
            // channel event progress bar
            const channelEventProgressRect = new Rect();
            channelEventProgressRect.left = drawingRect.left + 90;
            channelEventProgressRect.right = channelEventProgressRect.left + 80;
            channelEventProgressRect.top = drawingRect.top + mChannelLayoutHeight * 0.66;
            channelEventProgressRect.bottom = channelEventProgressRect.top + mChannelLayoutEventTextSize * 0.5;
            canvas.strokeStyle = mChannelLayoutTextColor;
            canvas.strokeRect(
                channelEventProgressRect.left,
                channelEventProgressRect.top,
                channelEventProgressRect.width,
                channelEventProgressRect.height
            );
            canvas.fillStyle = isSelectedChannel ? mChannelLayoutTextColor : mChannelLayoutTitleTextColor;
            canvas.fillRect(
                channelEventProgressRect.left + 2,
                channelEventProgressRect.top + 2,
                (channelEventProgressRect.width - 4) * currentEvent.getDoneFactor(),
                channelEventProgressRect.height - 4
            );

            // channel event text
            const channelEventWidth = mChannelLayoutWidth - channelIconWidth - 90 - channelEventProgressRect.width;
            CanvasUtils.writeText(
                canvas,
                currentEvent.getTitle(),
                channelEventProgressRect.right + mChannelLayoutPadding,
                channelEventProgressRect.middle,
                {
                    fontSize: mChannelLayoutEventTextSize,
                    fillStyle: canvas.fillStyle,
                    maxWidth: channelEventWidth
                }
            );
        }

        // channel logo
        const imageURL = channel.getImageURL();
        const image = imageURL && imageCache.get(imageURL);
        if (image !== undefined) {
            const channelImageRect = getDrawingRectForChannelImage(position, image);
            canvas.drawImage(
                image,
                channelImageRect.left,
                channelImageRect.top,
                channelImageRect.width,
                channelImageRect.height
            );
            IS_DEBUG && CanvasUtils.drawDebugRect(canvas, channelImageRect);
        }
        canvas.globalAlpha = 1.0;
    };

    /**
     * red circle with an exclamation mark for channels that could not be played recently
     */
    const drawFailedMark = (canvas: CanvasRenderingContext2D, centerX: number, centerY: number, radius: number) => {
        const alpha = canvas.globalAlpha;
        // the mark itself is not dimmed
        canvas.globalAlpha = 1.0;
        canvas.fillStyle = '#EF3343';
        canvas.beginPath();
        canvas.arc(centerX, centerY, radius, 0, 2 * Math.PI);
        canvas.fill();
        CanvasUtils.writeText(canvas, '!', centerX, centerY + 1, {
            fontSize: radius * 2 - 2,
            fillStyle: '#ffffff',
            textAlign: 'center',
            isBold: true
        });
        canvas.globalAlpha = alpha;
    };

    const drawStar = (canvas: CanvasRenderingContext2D, centerX: number, centerY: number, radius: number) => {
        canvas.fillStyle = '#FBC821';
        canvas.beginPath();
        for (let i = 0; i < 10; i++) {
            const pointRadius = i % 2 === 0 ? radius : radius * 0.45;
            const angle = (Math.PI / 5) * i - Math.PI / 2;
            const x = centerX + pointRadius * Math.cos(angle);
            const y = centerY + pointRadius * Math.sin(angle);
            i === 0 ? canvas.moveTo(x, y) : canvas.lineTo(x, y);
        }
        canvas.closePath();
        canvas.fill();
    };

    const getDrawingRectForChannelImage = (position: number, image: HTMLImageElement) => {
        const drawingRect = new Rect();
        drawingRect.right = mChannelLayoutWidth - mChannelLayoutMargin;
        drawingRect.left = drawingRect.right - mChannelLayoutHeight * 1.3;
        drawingRect.top = getTopFrom(position);
        drawingRect.bottom = drawingRect.top + mChannelLayoutHeight;

        const imageWidth = image.width;
        const imageHeight = image.height;
        const imageRatio = imageHeight / imageWidth;

        const rectWidth = drawingRect.right - drawingRect.left;
        const rectHeight = drawingRect.bottom - drawingRect.top;

        // Keep aspect ratio.
        if (imageWidth > imageHeight) {
            const padding = (rectHeight - rectWidth * imageRatio) / 2;
            drawingRect.top += padding;
            drawingRect.bottom -= padding;
        } else if (imageWidth <= imageHeight) {
            const padding = (rectWidth - rectHeight / imageRatio) / 2;
            drawingRect.left += padding;
            drawingRect.right -= padding;
        }

        return drawingRect;
    };

    /**
     * get first visible channel position
     */
    const getFirstVisibleChannelPosition = () => {
        const y = scrollY.current;
        let position = Math.floor(y / mChannelLayoutHeight);

        if (position < 0) {
            position = 0;
        }
        //console.log("First visible item: ", position);
        return position;
    };

    const getLastVisibleChannelPosition = () => {
        const y = scrollY.current;
        const screenHeight = getHeight();
        let position = Math.floor((y + screenHeight) / mChannelLayoutHeight);

        const channelCount = view.current.getChannelCount();
        // this will fade the bottom channel in while scrolling
        if (position < channelCount) {
            position += 1;
        }
        // this is the max channel available
        if (position > channelCount) {
            position = channelCount;
        }
        //console.log("Last visible item: ", position);
        return position;
    };

    const recalculateAndRedraw = (withAnimation: boolean) => {
        if (epgData !== null && view.current.hasData()) {
            // calculateMaxVerticalScroll();
            scrollToChannelPosition(channelPosition.current, withAnimation);
        }
    };

    const getWidth = () => {
        return mChannelLayoutWidth;
    };

    const getHeight = () => {
        return window.innerHeight;
    };

    const focus = () => {
        listWrapper.current?.focus();
    };

    const handleKeyPress = (event: React.KeyboardEvent<HTMLDivElement>) => {
        const keyCode = event.keyCode;

        switch (keyCode) {
            case 33: // programm up
            case 38: // arrow up
                event.stopPropagation();
                scrollUp();
                break;
            case 34: // programm down
            case 40: // arrow down
                event.stopPropagation();
                scrollDown();
                break;
            case 67: // keyboard 'c'
            case 461: // back button
                event.stopPropagation();
                props.unmount();
                break;
            case 13: // ok button -> switch to focused channel
                event.stopPropagation();
                selectFocusedChannel();
                props.unmount();
                break;
            case 405: // yellow button -> next channel group, held -> list of all groups
            case 89: // keyboard 'y'
                event.stopPropagation();
                // the key repeats while it is held, only the first press counts
                if (!isYellowPressed.current) {
                    isYellowPressed.current = true;
                    yellowLongPressTimeout.current = setTimeout(() => {
                        // long press: the picker gets the release of the still held button
                        yellowLongPressTimeout.current = null;
                        isYellowPressed.current = false;
                        setPickerHeldKeys([keyCode]);
                        setGroupPickerOpen(true);
                    }, LONG_PRESS_MILLIS);
                }
                break;
            case 406: // blue button -> add/remove favorite
            case 70: // keyboard 'f'
                event.stopPropagation();
                toggleFavorite();
                break;
            case 82: // keyboard 'r'
            case 403: {
                // red button trigger recording
                event.stopPropagation();
                toggleRecording();
                break;
            }
            case 39: // right arrow
                event.stopPropagation();
                if (state === State.DETAILS) {
                    // switch to next event details
                    focusedEventOffset.current += 1;
                    setDetailsData();
                } else {
                    // show channelListDetails
                    setState(State.DETAILS);
                }
                break;
            case 37: // left arrow
                event.stopPropagation();
                if (state === State.DETAILS && focusedEventOffset.current > 0) {
                    // switch to previous event details
                    focusedEventOffset.current -= 1;
                    setDetailsData();
                } else if (state === State.DETAILS) {
                    // hide channelListDetails
                    setState(State.NORMAL);
                } else {
                    // list of all groups (the magic remote has no physical yellow button to hold)
                    setPickerHeldKeys([keyCode]);
                    setGroupPickerOpen(true);
                }
                break;
            default:
                console.log('ChannelList-keyPressed:', keyCode);
        }

        // pass unhandled events to parent
        if (!event.isPropagationStopped()) return event;
    };

    const handleKeyUp = (event: React.KeyboardEvent<HTMLDivElement>) => {
        if ((event.keyCode === 405 || event.keyCode === 89) && isYellowPressed.current) {
            event.stopPropagation();
            isYellowPressed.current = false;
            // released before the long press time -> short press
            if (yellowLongPressTimeout.current) {
                clearTimeout(yellowLongPressTimeout.current);
                yellowLongPressTimeout.current = null;
                changeGroup();
            }
        }
    };

    const selectGroup = (groupId: string) => {
        setGroupPickerOpen(false);
        epgData.setCurrentGroup(groupId);
        updateView();
        focus();
    };

    const closeGroupPicker = () => {
        setGroupPickerOpen(false);
        focus();
    };

    /**
     * all groups with channels, for the group picker
     */
    const getPickerGroups = () =>
        epgData
            .getGroups()
            .map((group) => ({ id: group.id, name: group.name, channelCount: epgData.getGroupChannelCount(group.id) }))
            .filter((group) => group.channelCount > 0);

    const toggleRecording = () => {
        const epgEvent =
            detailsState?.focusedEvent ||
            view.current
                .getChannel(channelPosition.current)
                ?.getEvents()
                .find((e) => e.isCurrent());
        if (epgEvent) {
            // call passed toggle recording function
            props.toggleRecording(epgEvent, () => {
                updateCanvas();
                // trigger rerender
                setDetailsState({ ...detailsState });
            });
        }
    };

    const handleScrollWheel = (event: React.WheelEvent<HTMLDivElement>) => {
        event.deltaY < 0 ? scrollUp() : scrollDown();
        focus();
    };

    const handleClick = () => {
        selectFocusedChannel();
        props.unmount();
    };

    const selectFocusedChannel = () => {
        const position = view.current.getPosition(channelPosition.current);
        position !== undefined && setCurrentChannelPosition(position);
    };

    /**
     * reload the view after the group or the favorites changed and keep the focused channel if possible
     */
    const updateView = () => {
        const focusedPosition = view.current.getPosition(channelPosition.current);
        view.current = epgData.getView();
        const row = focusedPosition !== undefined ? view.current.getRow(focusedPosition) : -1;
        channelPosition.current =
            row >= 0 ? row : Math.min(channelPosition.current, view.current.getChannelCount() - 1);
        channelPosition.current = Math.max(0, channelPosition.current);
        setGroupName(epgData.getCurrentGroup().name);
        state === State.DETAILS && setDetailsData();
        scrollY.current = 0;
        scrollToChannelPosition(channelPosition.current, false);
    };

    const changeGroup = () => {
        epgData.nextGroup();
        updateView();
    };

    const toggleFavorite = () => {
        const channel = view.current.getChannel(channelPosition.current);
        if (!channel) return;
        epgData.toggleFavorite(channel);
        updateView();
    };

    const scrollUp = () => {
        // if we reached 0 we scroll to end of list
        if (channelPosition.current === 0) {
            setChannelPosition(view.current.getChannelCount() - 1);
        } else {
            // channel down
            setChannelPosition(channelPosition.current - 1);
        }
    };

    const scrollDown = () => {
        // when channel position increased channelcount we scroll to beginning
        if (channelPosition.current === view.current.getChannelCount() - 1) {
            setChannelPosition(0);
        } else {
            // channel up
            setChannelPosition(channelPosition.current + 1);
        }
    };

    const updateCanvas = () => {
        if (canvas.current) {
            const ctx = canvas.current.getContext('2d');
            // clear
            ctx && ctx.clearRect(0, 0, getWidth(), getHeight());

            // draw child elements
            ctx && onDraw(ctx);
        }
    };

    const onDraw = (canvas: CanvasRenderingContext2D) => {
        if (epgData && view.current.hasData()) {
            drawChannelListItems(canvas);
        }
    };

    const setChannelPosition = (channelPos: number) => {
        channelPosition.current = channelPos;
        if (state === State.DETAILS) {
            setDetailsData();
        }
        scrollToChannelPosition(channelPos, isAnimationsEnabled);
    };

    const setDetailsData = () => {
        const channel = view.current.getChannel(channelPosition.current);
        // in case channel changed
        if (channel?.getChannelID() !== detailsState?.focusedChannel?.getChannelID()) {
            focusedEventOffset.current = 0;
        }
        // get current event
        const currentEvent = view.current.getEventAtTimestamp(channelPosition.current, EPGUtils.getNow()) || undefined;
        let newFocusedEvent;
        if (currentEvent) {
            // get next event position with offset
            const eventPos =
                view.current.getEventPosition(channelPosition.current, currentEvent) + focusedEventOffset.current;
            const nextEventsArray: EPGEvent[] = [];
            for (let i = eventPos; i < eventPos + 5; i++) {
                const nextEvent = view.current.getEvent(channelPosition.current, i + 1);
                nextEvent && nextEventsArray.push(nextEvent);
            }
            nextEvents.current = nextEventsArray;
            // get same

            // set event with offset
            newFocusedEvent = view.current.getEvent(channelPosition.current, eventPos);
        } else {
            nextEvents.current = [];
            nextSameEvents.current = [];
        }

        // trigger rerender
        setDetailsState({
            focusedEvent: newFocusedEvent || undefined,
            focusedChannel: channel || undefined
        });
    };

    useEffect(() => {
        recalculateAndRedraw(false);
        focus();

        return () => {
            // stop animation when unmounting
            cancelAnimationFrame(scrollAnimationId.current);
            yellowLongPressTimeout.current && clearTimeout(yellowLongPressTimeout.current);
        };
    }, []);

    useLayoutEffect(() => {
        if (state === State.DETAILS) {
            setDetailsData();
        }
    }, [state]);

    return (
        <div
            id="channellist-wrapper"
            ref={listWrapper}
            tabIndex={-1}
            onKeyDown={handleKeyPress}
            onKeyUp={handleKeyUp}
            onWheel={handleScrollWheel}
            onClick={handleClick}
            className="channelList"
        >
            <canvas ref={canvas} width={getWidth()} height={getHeight()} style={{ display: 'block' }} />

            <div className="channelListFooter">
                <span className="colorKey yellow"></span>
                {t('Group')}: {groupName}
                <span className="colorKey blue"></span>
                {t('Favorite')}
                <span className="footerHint">&#9664; {t('All groups')}</span>
            </div>

            {isGroupPickerOpen && (
                <GroupPicker
                    groups={getPickerGroups()}
                    currentGroupId={epgData.getCurrentGroup().id}
                    onSelect={selectGroup}
                    onClose={closeGroupPicker}
                    heldKeys={pickerHeldKeys}
                />
            )}

            {state === State.DETAILS && (
                <ChannelListDetails
                    isRecording={(event: EPGEvent) => {
                        return view.current.isRecording(event);
                    }}
                    epgChannel={detailsState?.focusedChannel}
                    currentEvent={detailsState?.focusedEvent}
                    nextEvents={nextEvents.current}
                    nextSameEvents={nextSameEvents.current}
                />
            )}
        </div>
    );
};

export default ChannelList;
