import EPGData from './EPGData';
import EPGEvent from './EPGEvent';

/**
 * A filtered view on the channels of the epg data (e.g. the channels of a group).
 *
 * Components address channels by their row in this view, while the app context keeps
 * the global channel position. getPosition() and getRow() convert between both.
 */
export default class EPGDataView {
    constructor(private epgData: EPGData, private positions: number[]) {}

    /** global channel position of a row */
    getPosition(row: number): number | undefined {
        return this.positions[row];
    }

    /** row of a global channel position or -1 if the channel is not part of this view */
    getRow(position: number) {
        return this.positions.indexOf(position);
    }

    getChannelCount() {
        return this.positions.length;
    }

    hasData() {
        return this.positions.length > 0;
    }

    getChannel(row: number) {
        const position = this.positions[row];
        return position === undefined ? null : this.epgData.getChannel(position);
    }

    getEvents(row: number): EPGEvent[] {
        const position = this.positions[row];
        return position === undefined ? [] : this.epgData.getEvents(position);
    }

    getEventCount(row: number) {
        return this.getEvents(row).length;
    }

    getEvent(row: number, eventPosition: number): EPGEvent | undefined {
        return this.getEvents(row)[eventPosition];
    }

    getEventAtTimestamp(row: number, timestamp: number) {
        return this.getEvents(row).find((event) => event.getStart() <= timestamp && timestamp <= event.getEnd());
    }

    /** last event that ended before the timestamp */
    getEventBeforeTimestamp(row: number, timestamp: number) {
        let result: EPGEvent | undefined;
        this.getEvents(row).forEach((event) => {
            if (event.getEnd() <= timestamp && (!result || event.getEnd() > result.getEnd())) {
                result = event;
            }
        });
        return result;
    }

    /** first event that starts after the timestamp */
    getEventAfterTimestamp(row: number, timestamp: number) {
        let result: EPGEvent | undefined;
        this.getEvents(row).forEach((event) => {
            if (event.getStart() >= timestamp && (!result || event.getStart() < result.getStart())) {
                result = event;
            }
        });
        return result;
    }

    getEventPosition(row: number, eventToFind: EPGEvent) {
        return this.getEvents(row).findIndex((event) => event.getId() === eventToFind.getId());
    }

    isRecording(epgEvent: EPGEvent) {
        return this.epgData.isRecording(epgEvent);
    }

    getRecording(epgEvent: EPGEvent) {
        return this.epgData.getRecording(epgEvent);
    }

    isFavorite(row: number) {
        const channel = this.getChannel(row);
        return !!channel && this.epgData.isFavorite(channel);
    }
}
