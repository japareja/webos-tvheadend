import EPGUtils from '../utils/EPGUtils';
import KodiMarkup from '../utils/KodiMarkup';

/**
 * Created by satadru on 3/30/17.
 */
export default class EPGEvent {
    constructor(
        private id: number,
        private start: number,
        private end: number,
        private title: string,
        private description: string,
        private subTitle: string,
        private channelUuid: string,
        private image?: string
    ) {}

    // texts without kodi formatting codes, computed on first use
    private plainTitle?: string;
    private plainSubTitle?: string;
    private plainDescription?: string;

    getId() {
        return this.id;
    }

    /** title without formatting codes */
    getTitle() {
        if (this.plainTitle === undefined) {
            this.plainTitle = KodiMarkup.strip(this.title);
        }
        return this.plainTitle;
    }

    /** title as delivered by the epg, may contain kodi formatting codes like [COLOR red] */
    getRawTitle() {
        return this.title;
    }

    getStart() {
        return this.start;
    }

    getEnd() {
        return this.end;
    }

    getDuration() {
        return this.end - this.start;
    }

    getDoneFactor() {
        const now = EPGUtils.getNow();
        if (now > this.end) {
            return 1;
        } else if (now < this.start) {
            return 0;
        } else {
            return (now - this.start) / this.getDuration();
        }
    }

    isCurrent() {
        const now = EPGUtils.getNow();
        return now >= this.start && now <= this.end;
    }

    /** description without formatting codes, line breaks are kept */
    getDescription() {
        if (this.plainDescription === undefined) {
            this.plainDescription = KodiMarkup.strip(this.description, true);
        }
        return this.plainDescription;
    }

    /** description as delivered by the epg, may contain kodi formatting codes */
    getRawDescription() {
        return this.description;
    }

    /** subtitle without formatting codes */
    getSubTitle() {
        if (this.plainSubTitle === undefined) {
            this.plainSubTitle = KodiMarkup.strip(this.subTitle);
        }
        return this.plainSubTitle;
    }

    /** subtitle as delivered by the epg, may contain kodi formatting codes */
    getRawSubTitle() {
        return this.subTitle;
    }

    /**
     * url of the program image, if the epg provides one
     */
    getImage() {
        return this.image;
    }

    getChannelUuid() {
        return this.channelUuid;
    }

    isMatchingRecording(epgEvent: EPGEvent) {
        return (
            epgEvent.getStart() === this.getStart() &&
            epgEvent.getEnd() === this.getEnd() &&
            epgEvent.getChannelUuid() === this.getChannelUuid()
        );
    }

    isPastDated(now: number) {
        return now >= this.getEnd();
    }
}
