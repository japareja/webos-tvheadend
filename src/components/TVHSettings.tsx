import Button from '@enact/moonstone/Button';
import Spinner from '@enact/moonstone/Spinner';
import Input from '@enact/moonstone/Input';
import { Header, Panel } from '@enact/moonstone/Panels';
import Heading from '@enact/moonstone/Heading';
import React, { useContext, useEffect, useRef, useState } from 'react';
import TVHDataService, { TVHDataServiceParms } from '../services/TVHDataService';
import TVHSettingsTest, { TestResults } from '../utils/TVHSettingsTest';
import AppContext from '../AppContext';
import TestResult from './TestResult';
import StorageHelper, { PipSettings } from '../utils/StorageHelper';
import { t } from '../i18n/I18n';
import BodyText from '@enact/moonstone/BodyText';

const TVHSettings = (props: { unmount: () => void }) => {
    const { tvhDataService, setTvhDataService } = useContext(AppContext);
    const [isValid, setIsValid] = useState(false);
    const [isConnectButtonEnabled, setConnectButtonEnabled] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [testResults, setTestResults] = useState<TestResults>();
    const [serviceParms, setServiceParms] = useState<TVHDataServiceParms>({
        tvhUrl: '',
        user: '',
        password: '',
        dvrUuid: 0
    });
    const [pipSettings, setPipSettings] = useState<PipSettings>(StorageHelper.getPipSettings());
    const [backupInfo, setBackupInfo] = useState('');
    const tvhSettingsWrapper = useRef<HTMLDivElement>(null);

    const focus = () => tvhSettingsWrapper.current?.focus();

    const handleSave = () => {
        // put to storage
        StorageHelper.setTvhSettings(serviceParms);
        StorageHelper.setPipSettings(pipSettings);
        // keep a copy outside of the app right away, so it survives uninstalling the app
        StorageHelper.writeBackupNow();
        setTvhDataService(new TVHDataService(serviceParms));
        props.unmount();
    };

    const handleUserChange = (input: HTMLInputElement) => {
        setServiceParms({ ...serviceParms, user: input.value });
        setIsValid(false);
        setConnectButtonEnabled(input.value.length > 0);
    };

    const handlePasswordChange = (input: HTMLInputElement) => {
        setServiceParms({ ...serviceParms, password: input.value });
        setIsValid(false);
        setConnectButtonEnabled(input.value.length > 0);
    };

    const handleUrlChange = (input: HTMLInputElement) => {
        setServiceParms({ ...serviceParms, tvhUrl: input.value });
        setIsValid(false);
        setConnectButtonEnabled(input.value.length > 0);
    };

    const handlePipProfileChange = (input: HTMLInputElement) => {
        setPipSettings({ ...pipSettings, profile: input.value.trim() });
    };

    const getDataService = () => {
        return new TVHDataService(serviceParms);
    };

    const handleConnectionTest = async () => {
        setIsLoading(true);
        setTestResults(undefined);

        //test url verify if it works
        const service = getDataService();
        const tester = new TVHSettingsTest(service);
        const result = await tester.testAll();

        setTestResults({ ...result });
        // use the dvr config of this test, the state still holds the previous results
        setServiceParms({ ...serviceParms, dvrUuid: result.dvr.payload });
        setConnectButtonEnabled(true);
        setIsLoading(false);
    };

    const isValidSetup = () => {
        return (
            (testResults?.serverInfo.accessible && testResults.playlist.accessible && testResults.stream.accessible) ||
            false
        );
    };

    /**
     * where the backup of the settings is kept (it survives uninstalling the app)
     */
    const updateBackupInfo = () => {
        if (!StorageHelper.getTvhSettings()) {
            setBackupInfo(t('A copy of the settings is kept outside of the app as soon as they are saved.'));
            return;
        }
        StorageHelper.writeBackupNow()
            .then((response) => {
                const dirs = ((response as SettingsBackupWriteResponse | undefined)?.dirs || []).filter(
                    (dir) => dir.length > 0
                );
                if (dirs.length === 0) {
                    setBackupInfo(t('This TV does not allow to keep a copy of the settings outside of the app.'));
                } else if (dirs.every((dir) => dir.indexOf('/tmp') === 0)) {
                    setBackupInfo(t('Copy of the settings in {0} (kept until the TV is restarted).', dirs.join(', ')));
                } else {
                    setBackupInfo(t('Copy of the settings in {0}.', dirs.join(', ')));
                }
            })
            .catch(() => setBackupInfo(t('This TV does not allow to keep a copy of the settings outside of the app.')));
    };

    useEffect(() => {
        // read state from storage if exists
        const settings = StorageHelper.getTvhSettings() || ({} as TVHDataServiceParms);
        setServiceParms(settings);
        updateBackupInfo();
        focus();
    }, []);

    useEffect(() => {
        // get current connection info, if possible
        tvhDataService && !testResults && serviceParms.tvhUrl && handleConnectionTest();
    }, [serviceParms]);

    useEffect(() => {
        setIsValid(isValidSetup());
    }, [testResults]);

    return (
        <div id="tvh-settings" ref={tvhSettingsWrapper} tabIndex={-1} className="tvhSettings">
            <Panel>
                <Header title={t('TVheadend Setup')} type="compact" centered />
                <Heading spacing="auto">{t('TVheadend URL')}</Heading>
                <Input
                    value={serviceParms.tvhUrl}
                    type="url"
                    onChange={handleUrlChange}
                    placeholder="http://192.168.0.10:9981/"
                />
                <Input
                    className="username"
                    value={serviceParms.user}
                    type="text"
                    onChange={handleUserChange}
                    placeholder={t('User (Optional)')}
                />
                <Input
                    className="password"
                    value={serviceParms.password}
                    type="password"
                    onChange={handlePasswordChange}
                    placeholder={t('Password (Optional)')}
                />
                <Heading spacing="auto">{t('Picture in Picture')}</Heading>
                <Input
                    value={pipSettings.profile}
                    type="text"
                    onChange={handlePipProfileChange}
                    placeholder={t('Streaming profile (Optional)')}
                />
                <br /> <br />
                {!isLoading && (
                    <Button
                        disabled={!isConnectButtonEnabled}
                        backgroundOpacity="lightTranslucent"
                        onClick={handleConnectionTest}
                    >
                        {t('Connect')}
                    </Button>
                )}
                {isLoading && <Spinner component={Panel} size="medium" />}
                {/* saving is possible even if some checks fail, e.g. while tvheadend is not reachable */}
                <Button
                    disabled={!serviceParms.tvhUrl || serviceParms.tvhUrl.trim().length === 0}
                    backgroundOpacity="lightTranslucent"
                    onClick={handleSave}
                >
                    {t('Save')}
                </Button>
                {testResults && !isValid && (
                    <BodyText>{t('Some checks failed, the settings can be saved anyway.')}</BodyText>
                )}
                {backupInfo && <BodyText>{backupInfo}</BodyText>}
                <br /> <br />
                {testResults && (
                    <>
                        <Heading spacing="auto">{t('Connection Test Results')}</Heading>
                        <TestResult {...testResults} />
                    </>
                )}
            </Panel>
        </div>
    );
};

export default TVHSettings;
