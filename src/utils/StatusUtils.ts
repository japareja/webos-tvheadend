// tvheadend signal scales, see api/status/inputs
const SCALE_RELATIVE = 1;
const SCALE_DECIBEL = 2;

const NOT_AVAILABLE = '–';

export default class StatusUtils {
    /** signal strength as percentage or dBm, depending on what the tuner reports */
    static formatSignal(value: number, scale: number) {
        switch (scale) {
            case SCALE_RELATIVE:
                return Math.round((value * 100) / 65535) + ' %';
            case SCALE_DECIBEL:
                return (value * 0.001).toFixed(1) + ' dBm';
            default:
                return NOT_AVAILABLE;
        }
    }

    /** signal to noise ratio as percentage or dB, depending on what the tuner reports */
    static formatSnr(value: number, scale: number) {
        switch (scale) {
            case SCALE_RELATIVE:
                return Math.round((value * 100) / 65535) + ' %';
            case SCALE_DECIBEL:
                return value > 0 ? (value * 0.001).toFixed(1) + ' dB' : NOT_AVAILABLE;
            default:
                return NOT_AVAILABLE;
        }
    }

    /** signal strength 0..1 for the bar, undefined if the tuner reports nothing usable */
    static getSignalLevel(value: number, scale: number) {
        return scale === SCALE_RELATIVE ? Math.max(0, Math.min(1, value / 65535)) : undefined;
    }

    static formatBitsPerSecond(bitsPerSecond: number) {
        return (bitsPerSecond / 1000000).toFixed(1) + ' Mbit/s';
    }

    static formatBytesPerSecond(bytesPerSecond: number) {
        return StatusUtils.formatBitsPerSecond(bytesPerSecond * 8);
    }

    /** running time of a subscription, e.g. 5:07 or 1:02:09 */
    static formatDuration(startSeconds: number, nowMillis: number) {
        const total = Math.max(0, Math.floor(nowMillis / 1000 - startSeconds));
        const hours = Math.floor(total / 3600);
        const minutes = Math.floor((total % 3600) / 60);
        const seconds = total % 60;
        const pad = (value: number) => (value < 10 ? '0' : '') + value;
        return hours > 0 ? hours + ':' + pad(minutes) + ':' + pad(seconds) : minutes + ':' + pad(seconds);
    }
}
