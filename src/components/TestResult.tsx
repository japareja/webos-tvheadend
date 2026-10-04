import BodyText from '@enact/moonstone/BodyText';
import React from 'react';
import TestResultItem from './TestResultItem';
import { TestResults } from '../utils/TVHSettingsTest';
import { t } from '../i18n/I18n';

const TestResult = (results: TestResults) => (
    <>
        <BodyText>
            {results.firmwareInfo && <TestResultItem {...results.firmwareInfo} />}
            <br />
            {results.serverInfo && <TestResultItem {...results.serverInfo} />}
            <br />
            {results.playlist && <TestResultItem {...results.playlist} />}
            <br />
            {results.stream && <TestResultItem {...results.stream} />}
            <br />
            {results.epg && <TestResultItem {...results.epg} />}
            <br />
            {results.dvr && <TestResultItem {...results.dvr} />}
        </BodyText>
        {!results.serverInfo.accessible && (
            <BodyText>
                {t('App user needs TVHeadend "Web" privileges to handle EPG, DVR and version specific handling')}
            </BodyText>
        )}
    </>
);
export default TestResult;
