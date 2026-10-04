import React, { useContext, useEffect, useState } from 'react';
import TVHDataService from './services/TVHDataService';
import TV from './components/TV';
import Player from './components/Player';
import TVHSettings from './components/TVHSettings';
import './styles/app.css';
import AppContext, { AppVisibilityState } from './AppContext';
import EPGChannel from './models/EPGChannel';
import StorageHelper from './utils/StorageHelper';
import Menu, { MenuItem } from './components/Menu';
import Search from './components/Search';
import Config from './config/Config';
import { setLocale as setI18nLocale, t } from './i18n/I18n';

// how often we check if the epg needs to be refreshed
const EPG_REFRESH_CHECK_MILLIS = 15 * 60 * 1000;

export enum AppViewState {
    TV,
    SETTINGS,
    RECORDINGS,
    HELP,
    CONTACT,
    SEARCH
}

const App = () => {
    const {
        menuState,
        setMenuState,
        appViewState,
        setAppViewState,
        setAppVisibilityState,
        setLocale,
        tvhDataService,
        setTvhDataService,
        epgData,
        imageCache,
        setPersistentAuthToken,
        setAnimationsEnabled,
        setCurrentChannelPosition
    } = useContext(AppContext);

    const [isChannelsRetrieved, setIsChannelsRetrieved] = useState(false);
    const [debugInfo, setDebugInfo] = useState('');
    const isWebKit = typeof document['hidden'] === 'undefined';

    const menu: MenuItem[] = [
        {
            icon: 'liveplayback',
            label: t('TV'),
            action: () => updateAppViewState(AppViewState.TV),
            isActive: appViewState === AppViewState.TV
        },
        {
            icon: 'search',
            label: t('Search'),
            action: () => updateAppViewState(AppViewState.SEARCH),
            isActive: appViewState === AppViewState.SEARCH
        },
        {
            icon: 'recordings',
            label: t('Recordings'),
            action: () => updateAppViewState(AppViewState.RECORDINGS),
            isActive: appViewState === AppViewState.RECORDINGS
        },
        {
            icon: 'gear',
            label: t('Setup'),
            action: () => updateAppViewState(AppViewState.SETTINGS),
            isActive: appViewState === AppViewState.SETTINGS
        },
        {
            icon: 'denselist',
            label: t('Help'),
            action: () => console.log('not yet available') /*action: () => updateAppViewState(AppViewState.HELP)*/,
            isActive: false
        },
        {
            icon: 'circle',
            label: t('Contact'),
            action: () => console.log('not yet available') /*action: () => updateAppViewState(AppViewState.CONTACT)*/,
            isActive: false
        }
    ];

    const updateAppViewState = (appViewState: AppViewState) => {
        setMenuState(false);
        setAppViewState(appViewState);
    };

    const reloadData = async () => {
        if (!tvhDataService) {
            return;
        }
        setDebugInfo(t('Connecting...'));
        // await readyness
        try {
            await tvhDataService.awaitReadyness();
        } catch (error) {
            setDebugInfo(t('Failed to connect to TVH: {0}', JSON.stringify(error)));
            setAppViewState(AppViewState.SETTINGS);
            return;
        }

        // load locale
        setDebugInfo('Loading Locale...');
        await loadLocale(tvhDataService);

        // load animations enabled
        setDebugInfo('Check animations enabled...');
        await loadAnimationsEnabled(tvhDataService);
        setDebugInfo('Set retrieved channels to false...');
        // retrieve channel infos etc
        setIsChannelsRetrieved(false);

        try {
            setDebugInfo(t('Loading channels...'));
            const channels = await tvhDataService.retrieveM3UChannels();
            setDebugInfo('Updating channels (' + channels.length + ')...');
            epgData.updateChannels(channels);
            setDebugInfo('Channels retrieved true...');
            setIsChannelsRetrieved(true);

            // safe persistent token if available
            if (channels.length > 0) {
                setDebugInfo('Safe persistent auth token...');
                safePersistentAuthToken(channels[0].getStreamUrl());
            }
            setDebugInfo('Preload images...');
            // preload images
            preloadImages(channels);

            // retrieve channel tags for the channel groups
            tvhDataService.retrieveChannelTags().then((tags) => epgData.updateTags(tags));

            setDebugInfo('Retrieve EPG...');
            // retrieve epg and update channels
            tvhDataService.retrieveTVHEPG((channels) => {
                // note: channels are already updated as we are working on references here
                epgData.updateChannels(channels);
            });

            setDebugInfo('Retrieve recordings...');
            // retrieve recordings and update channels
            tvhDataService.retrieveUpcomingRecordings((recordings) => {
                epgData.updateRecordings(recordings);
            });
        } catch (error) {
            setDebugInfo(t('Failed to retrieve channels: {0}', JSON.stringify(error)));
            setAppViewState(AppViewState.SETTINGS);
            return;
        }

        setDebugInfo('');
        setAppViewState(AppViewState.TV);
    };

    const loadLocale = async (tvhDataService: TVHDataService) => {
        try {
            // retrieve local info
            const localInfoResult = await tvhDataService.getLocaleInfo();
            const locale = localInfoResult.settings.localeInfo.locales.UI;
            setI18nLocale(locale);
            setLocale(locale);
            console.log('Retrieved locale info:', locale);
        } catch (error) {
            console.log('Failed to retrieve locale info: ', error);
        }
    };

    const loadAnimationsEnabled = async (tvhDataService: TVHDataService) => {
        try {
            // retrieve local info
            const deviceInfoResult = await tvhDataService.getDeviceInfo();
            const majorVersion = deviceInfoResult.sdkVersion.split('.')[0];
            setAnimationsEnabled(Number(majorVersion) > 3);
            console.log('Retrieved Firmware Major Version:', majorVersion);
        } catch (error) {
            console.log('Failed to retrieve locale info: ', error);
        }
    };

    const safePersistentAuthToken = (url: URL) => {
        const authParam = url.searchParams.get('auth');
        if (authParam) {
            // put auth token to app context
            setPersistentAuthToken(authParam.trim());
            tvhDataService?.setAuthToken(authParam.trim());
        }
    };

    /**
     * preload all images and set placeholders
     * if images cannot be loaded
     */
    const preloadImages = (channels: EPGChannel[]) => {
        channels.forEach((channel) => {
            const imageURL = channel.getImageURL();
            // logo url is optional
            if (!imageURL) {
                return;
            }
            const img = new Image();
            img.src = imageURL.toString();
            img.onload = () => {
                imageCache.set(imageURL, img);
            };
        });
    };

    const handleKeyPress = (event: React.KeyboardEvent<HTMLDivElement>) => {
        const keyCode = event.keyCode;

        switch (keyCode) {
            case 404: // green button
            case 71: //'g'
                event.stopPropagation();
                setMenuState(!menuState);
                break;
            case 461: // back button
            case 66: // 'b'
                event.stopPropagation();
                if (menuState) {
                    setMenuState(false);
                }
                break;
            default:
                console.log('App-keyPressed:', keyCode);
        }
    };

    useEffect(() => {
        console.log('app component mounted');

        // add global event listeners for blur and focus of the app
        window.addEventListener('blur', handleBlur);
        window.addEventListener('focus', handleFocus);

        // add global event listener for visibility change of the app
        document.addEventListener(isWebKit ? 'webkitvisibilitychange' : 'visibilitychange', handleVisibilityChange);

        // webOSLaunch event
        document.addEventListener('webOSLaunch', handleWebOSLaunch);

        // webOSRelaunch event
        document.addEventListener('webOSRelaunch', handleWebOSRelaunch);

        // every change of the settings is also saved outside of the app, so it survives a reinstall
        StorageHelper.setBackupWriter((settings) => Config.fileServiceAdapter.writeSettingsBackup(settings));
        initSettings();
    }, []);

    /**
     * start with the stored settings, or the backup of a previous installation if there are none
     */
    const initSettings = async () => {
        let tvhSettings = StorageHelper.getTvhSettings();
        if (tvhSettings === undefined) {
            try {
                const backup = await Config.fileServiceAdapter.readSettingsBackup();
                if (backup.found && backup.result) {
                    console.log('restoring settings from backup in %s', backup.dir);
                    StorageHelper.restoreAllSettings(backup.result);
                    epgData.reloadPreferences();
                    setCurrentChannelPosition(StorageHelper.getLastChannelIndex());
                    tvhSettings = StorageHelper.getTvhSettings();
                }
            } catch (error) {
                console.log('No settings backup available: ', JSON.stringify(error));
            }
        } else {
            // make sure there is a backup of the current settings
            StorageHelper.scheduleBackup();
        }

        if (tvhSettings !== undefined) {
            setTvhDataService(new TVHDataService(tvhSettings));
        } else {
            setAppViewState(AppViewState.SETTINGS);
        }
    };

    const handleBlur = (event: FocusEvent) => {
        event.stopPropagation();
        console.log('app is blurred');
        setAppVisibilityState(AppVisibilityState.BLURRED);
    };

    const handleFocus = (event: FocusEvent) => {
        event.stopPropagation();
        console.log('app is focused');
        setAppVisibilityState(AppVisibilityState.FOCUSED);
    };

    const handleVisibilityChange = (event: Event) => {
        event.stopPropagation();

        if (isWebKit ? (document as never)['webkitHidden'] : document['hidden']) {
            console.log('app is in background');
            setAppVisibilityState(AppVisibilityState.BACKGROUND);
        } else {
            console.log('app is in foreground');
            setAppVisibilityState(AppVisibilityState.FOREGROUND);
        }
    };

    // for future use
    const handleWebOSLaunch = () => {
        console.log('app is launched');
    };

    // for future use
    const handleWebOSRelaunch = () => {
        console.log('app is relaunched');
    };

    useEffect(() => {
        reloadData();

        // keep the epg up to date while the app is running
        const refreshInterval = setInterval(() => {
            if (tvhDataService?.isEpgRefreshDue()) {
                console.log('refreshing epg');
                tvhDataService.retrieveTVHEPG((channels) => epgData.updateChannels(channels), true);
            }
        }, EPG_REFRESH_CHECK_MILLIS);

        return () => clearInterval(refreshInterval);
    }, [tvhDataService]);

    return (
        <div className="app" onKeyDown={handleKeyPress}>
            {debugInfo && <div className="debug-info">{debugInfo}</div>}
            {menuState && <Menu items={menu} unmount={() => setAppViewState(AppViewState.TV)} />}
            {appViewState === AppViewState.SETTINGS && <TVHSettings unmount={() => setAppViewState(AppViewState.TV)} />}
            {appViewState === AppViewState.TV && isChannelsRetrieved && <TV />}
            {appViewState === AppViewState.RECORDINGS && <Player />}
            {appViewState === AppViewState.SEARCH && <Search unmount={() => setAppViewState(AppViewState.TV)} />}
        </div>
    );
};

export default App;
