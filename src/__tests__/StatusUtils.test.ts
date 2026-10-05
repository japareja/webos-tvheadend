import StatusUtils from '../utils/StatusUtils';

describe('StatusUtils', () => {
    it('formats the signal depending on its scale', () => {
        expect(StatusUtils.formatSignal(65535, 1)).toBe('100 %');
        expect(StatusUtils.formatSignal(32768, 1)).toBe('50 %');
        expect(StatusUtils.formatSignal(-45500, 2)).toBe('-45.5 dBm');
        expect(StatusUtils.formatSignal(1234, 0)).toBe('–');
    });

    it('formats the snr depending on its scale', () => {
        expect(StatusUtils.formatSnr(13107, 1)).toBe('20 %');
        expect(StatusUtils.formatSnr(28300, 2)).toBe('28.3 dB');
        expect(StatusUtils.formatSnr(0, 2)).toBe('–');
    });

    it('gives a signal level only for relative values', () => {
        expect(StatusUtils.getSignalLevel(65535, 1)).toBe(1);
        expect(StatusUtils.getSignalLevel(-45500, 2)).toBeUndefined();
    });

    it('formats bitrates', () => {
        expect(StatusUtils.formatBitsPerSecond(8500000)).toBe('8.5 Mbit/s');
        expect(StatusUtils.formatBytesPerSecond(1000000)).toBe('8.0 Mbit/s');
    });

    it('formats the running time', () => {
        expect(StatusUtils.formatDuration(100, 100000 + 307000)).toBe('5:07');
        expect(StatusUtils.formatDuration(100, 100000 + 3729000)).toBe('1:02:09');
    });
});
