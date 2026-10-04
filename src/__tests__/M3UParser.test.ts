import M3UParser from '../utils/M3UParser';

describe('M3UParser', () => {
    it('parses a tvheadend playlist with a byte order mark and windows line endings', () => {
        const result = M3UParser.parse(
            '﻿#EXTM3U\r\n#EXTINF:-1 logo="http://tvh/imagecache/1" tvg-id="abc" tvg-chno="5",La 1 HD\r\nhttp://tvh/stream/channelid/1?profile=pass\r\n'
        );
        expect(result.items.length).toBe(1);
        expect(result.items[0]).toMatchObject({
            channelId: 'abc',
            channelNumber: '5',
            channelName: 'La 1 HD',
            streamUrl: 'http://tvh/stream/channelid/1?profile=pass'
        });
    });

    it('shows what was received instead of a playlist', () => {
        expect(() => M3UParser.parse('<HTML><BODY>403 Forbidden</BODY></HTML>')).toThrow(
            'Playlist is not valid: "<HTML><BODY>403 Forbidden</BODY></HTML>"'
        );
    });
});
