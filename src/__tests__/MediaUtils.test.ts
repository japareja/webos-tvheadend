import MediaUtils from '../utils/MediaUtils';
import { setLocale, t } from '../i18n/I18n';

describe('MediaUtils', () => {
    it('derives the mime type from the streaming profile', () => {
        expect(MediaUtils.getMimeType(new URL('http://tvh/stream/channelid/1?profile=pass'))).toBe('video/mp2t');
        expect(MediaUtils.getMimeType(new URL('http://tvh/s?profile=webtv-h264-aac-matroska'))).toBe(
            'video/x-matroska'
        );
        expect(MediaUtils.getMimeType(new URL('http://tvh/s?profile=custom'))).toBeUndefined();
    });

    it('replaces the streaming profile', () => {
        const url = MediaUtils.withProfile(new URL('http://tvh/s?auth=abc&profile=pass'), 'webtv-h264-aac-mpegts');
        expect(url.searchParams.get('profile')).toBe('webtv-h264-aac-mpegts');
        expect(url.searchParams.get('auth')).toBe('abc');
    });

    it('labels the video quality', () => {
        expect(MediaUtils.getQualityLabel(3840, 2160)).toBe('UHD 3840x2160');
        expect(MediaUtils.getQualityLabel(1920, 1080)).toBe('HD 1920x1080');
        expect(MediaUtils.getQualityLabel(1280, 720)).toBe('HD 1280x720');
        expect(MediaUtils.getQualityLabel(720, 576)).toBe('SD 720x576');
        expect(MediaUtils.getQualityLabel(0, 0)).toBe('');
    });
});

describe('I18n', () => {
    afterEach(() => setLocale('en-US'));

    it('translates to spanish and replaces placeholders', () => {
        setLocale('es-ES');
        expect(t('Favorites')).toBe('Favoritos');
        expect(t('Channel {0} not found', 123)).toBe('No existe el canal 123');
    });

    it('falls back to the english text', () => {
        setLocale('fr-FR');
        expect(t('Favorites')).toBe('Favorites');
        expect(t('Channel {0} not found', 5)).toBe('Channel 5 not found');
    });
});
