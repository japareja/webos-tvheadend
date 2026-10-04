import EPGChannel from './EPGChannel';
import EPGEvent from './EPGEvent';
import EPGDataView from './EPGDataView';
import StorageHelper from '../utils/StorageHelper';
import { t } from '../i18n/I18n';

export const GROUP_ALL = 'all';
export const GROUP_FAVORITES = 'favorites';

export interface ChannelGroup {
    id: string;
    name: string;
}

/**
 * Created by satadru on 3/30/17.
 */
export default class EPGData {
    private channels: EPGChannel[] = [];
    private recordings: EPGEvent[] = [];
    // tvheadend channel tags that are used by at least one channel
    private tags: ChannelGroup[] = [];
    private favorites = new Set<string>(StorageHelper.getFavorites());
    private currentGroupId = StorageHelper.getChannelGroup() || GROUP_ALL;
    private view?: EPGDataView;

    //constructor() {
    //new MockDataService().getChannels(this.channels);
    //if (this.data) {
    /*this.data.forEach((values, key) => {
                this.channels.push(key);
                values.forEach((value) => {
                    this.events.push(value);
                });
            });*/
    //this.channels = this.data;
    //this.events = Array.from(this.data.values());
    //}
    //}

    getChannels(): EPGChannel[] {
        return this.channels;
    }

    getChannel(channelPosition: number): EPGChannel | null {
        const channel = this.channels[channelPosition];
        return channel || null;
    }

    getEvents(channelPosition: number): EPGEvent[] {
        const channel = this.getChannel(channelPosition);
        const events = channel?.getEvents();
        return events || [];
    }

    getEventCount(channelPosition: number): number {
        return this.getEvents(channelPosition).length;
    }

    getEvent(channelPosition: number, eventPosition: number) {
        const channel = this.channels[channelPosition];
        const events = channel.getEvents();
        return events[eventPosition];
    }

    getEventBeforeTimestamp(channelPosition: number, timestamp: number) {
        const channel = this.channels[channelPosition];
        const events = channel.getEvents();

        // find the first event before the timestamp
        return events
            .filter((event) => event.getEnd() <= timestamp)
            .reduce((prev, current) => (prev.getEnd() > current.getEnd() ? prev : current));
    }

    getEventAtTimestamp(channelPosition: number, timestamp: number) {
        const channel = this.channels[channelPosition];
        const events = channel.getEvents();

        // find the event at the timestamp
        return events.find((event) => event.getStart() <= timestamp && timestamp <= event.getEnd());
    }

    getEventAfterTimestamp(channelPosition: number, timestamp: number) {
        const channel = this.channels[channelPosition];
        const events = channel.getEvents();

        // find the first event after the timestamp
        return events
            .filter((event) => event.getStart() >= timestamp)
            .reduce((prev, current) => (prev.getStart() < current.getStart() ? prev : current));
    }

    isRecording(epgEvent: EPGEvent) {
        return !!this.getRecording(epgEvent);
    }

    getRecording(epgEvent: EPGEvent) {
        return this.recordings.find((recEvent) => epgEvent.isMatchingRecording(recEvent));
    }

    getEventPosition(channelPosition: number, eventToFind: EPGEvent) {
        return this.channels[channelPosition].getEvents().findIndex((event) => this.isEventSame(event, eventToFind));
    }

    getChannelCount(): number {
        if (this.channels == null) {
            return 0;
        }
        return this.channels.length;
    }

    isEventSame(event1: EPGEvent, event2: EPGEvent): boolean {
        return event1.getId() === event2.getId();
    }

    hasData(): boolean {
        return this.getChannelCount() > 0;
    }

    updateChannels(channels: EPGChannel[]): void {
        if (this.channels !== channels) {
            this.view = undefined;
        }
        this.channels = channels;
    }

    /**
     * all groups the user can choose from: all channels, favorites and the tvheadend channel tags
     */
    getGroups(): ChannelGroup[] {
        return [
            { id: GROUP_ALL, name: t('All channels') },
            { id: GROUP_FAVORITES, name: t('Favorites') }
        ].concat(this.tags);
    }

    /**
     * read favorites and the selected group again, e.g. after the settings were restored from a backup
     */
    reloadPreferences() {
        this.favorites = new Set<string>(StorageHelper.getFavorites());
        this.currentGroupId = StorageHelper.getChannelGroup() || GROUP_ALL;
        this.view = undefined;
    }

    updateTags(tags: ChannelGroup[]) {
        this.tags = tags;
        this.view = undefined;
    }

    getCurrentGroup(): ChannelGroup {
        const groups = this.getGroups();
        return groups.find((group) => group.id === this.currentGroupId) || groups[0];
    }

    setCurrentGroup(groupId: string) {
        this.currentGroupId = groupId;
        this.view = undefined;
        StorageHelper.setChannelGroup(groupId);
    }

    /**
     * switch to the next group, empty groups are skipped
     */
    nextGroup(): ChannelGroup {
        const groups = this.getGroups();
        const currentIndex = groups.findIndex((group) => group.id === this.getCurrentGroup().id);
        for (let i = 1; i <= groups.length; i++) {
            const group = groups[(currentIndex + i) % groups.length];
            if (this.getGroupPositions(group.id).length > 0) {
                this.setCurrentGroup(group.id);
                return group;
            }
        }
        return this.getCurrentGroup();
    }

    private getGroupPositions(groupId: string): number[] {
        const positions: number[] = [];
        this.channels.forEach((channel, position) => {
            if (
                groupId === GROUP_ALL ||
                (groupId === GROUP_FAVORITES && this.favorites.has(channel.getUUID())) ||
                channel.getTags().indexOf(groupId) >= 0
            ) {
                positions.push(position);
            }
        });
        return positions;
    }

    /**
     * the channels of the current group. Falls back to all channels if the group is empty
     */
    getView(): EPGDataView {
        if (!this.view) {
            let positions = this.getGroupPositions(this.getCurrentGroup().id);
            if (positions.length === 0 && this.getCurrentGroup().id !== GROUP_ALL) {
                // e.g. the last favorite was removed
                this.setCurrentGroup(GROUP_ALL);
                positions = this.getGroupPositions(GROUP_ALL);
            }
            this.view = new EPGDataView(this, positions);
        }
        return this.view;
    }

    isFavorite(channel: EPGChannel) {
        return this.favorites.has(channel.getUUID());
    }

    toggleFavorite(channel: EPGChannel) {
        const uuid = channel.getUUID();
        this.favorites.has(uuid) ? this.favorites.delete(uuid) : this.favorites.add(uuid);
        const favorites: string[] = [];
        this.favorites.forEach((favorite) => favorites.push(favorite));
        StorageHelper.setFavorites(favorites);
        this.view = undefined;
    }

    /**
     * position of the first channel with the given channel number
     */
    getChannelPositionByNumber(channelNumber: number) {
        return this.channels.findIndex((channel) => channel.getChannelID() === channelNumber);
    }

    updateStreamUrl(channels: EPGChannel[]): void {
        for (let i = 0; i < channels.length; i++) {
            for (let k = 0; k < this.channels.length; k++) {
                if (channels[i].getUUID() == this.channels[k].getUUID()) {
                    this.channels[k].setStreamUrl(channels[i].getStreamUrl());
                    break;
                }
            }
        }
    }

    updateRecordings(recordings: EPGEvent[]): void {
        this.recordings = recordings;
    }
}
