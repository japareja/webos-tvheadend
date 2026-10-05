import React, { useContext, useEffect, useRef, useState } from 'react';
import BodyText from '@enact/moonstone/BodyText';
import { Header, Panel } from '@enact/moonstone/Panels';
import AppContext from '../AppContext';
import { TVHInputStatus, TVHSubscriptionStatus } from '../services/TVHDataService';
import StatusUtils from '../utils/StatusUtils';
import { t } from '../i18n/I18n';
import '../styles/app.css';

const REFRESH_MILLIS = 2000;
const SCROLL_STEP = 120;

/**
 * Tuners in use with their signal quality and the running streams, as tvheadend reports them
 */
const ServerStatus = (props: { unmount: () => void }) => {
    const { tvhDataService } = useContext(AppContext);
    const [inputs, setInputs] = useState<TVHInputStatus[]>([]);
    const [subscriptions, setSubscriptions] = useState<TVHSubscriptionStatus[]>([]);
    const [isLoaded, setLoaded] = useState(false);
    const [error, setError] = useState('');
    const wrapper = useRef<HTMLDivElement>(null);
    const body = useRef<HTMLDivElement>(null);

    useEffect(() => {
        wrapper.current?.focus();
        let isMounted = true;
        let timeout: ReturnType<typeof setTimeout> | undefined;

        const refresh = async () => {
            if (!tvhDataService) {
                return;
            }
            try {
                const status = await tvhDataService.retrieveServerStatus();
                if (!isMounted) {
                    return;
                }
                setInputs(status.inputs);
                setSubscriptions(status.subscriptions);
                setError('');
            } catch (failure) {
                if (!isMounted) {
                    return;
                }
                const statusCode = failure && (failure as ProxyErrorResponse).statusCode;
                setError(
                    statusCode === 401 || statusCode === 403
                        ? t(
                              'The TVHeadend user needs admin rights to see the server status (Configuration > Users > Access Entries).'
                          )
                        : t(
                              'TVHeadend is not reachable from the TV: {0}',
                              (failure && (failure as ProxyErrorResponse).errorText) || String(statusCode)
                          )
                );
            }
            setLoaded(true);
            // the next request starts after the previous one is answered, so slow answers don't pile up
            timeout = setTimeout(refresh, REFRESH_MILLIS);
        };
        refresh();

        return () => {
            isMounted = false;
            timeout && clearTimeout(timeout);
        };
    }, [tvhDataService]);

    const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
        switch (event.keyCode) {
            case 461: // back
                event.stopPropagation();
                props.unmount();
                break;
            case 38: // arrow up
            case 33: // programm up
                event.stopPropagation();
                body.current && (body.current.scrollTop -= SCROLL_STEP);
                break;
            case 40: // arrow down
            case 34: // programm down
                event.stopPropagation();
                body.current && (body.current.scrollTop += SCROLL_STEP);
                break;
        }
    };

    const renderSignal = (input: TVHInputStatus) => {
        const level = StatusUtils.getSignalLevel(input.signal, input.signal_scale);
        return (
            <span className="statusSignal">
                {level !== undefined && (
                    <span className="statusSignalBar">
                        <span
                            className={'statusSignalLevel' + (level < 0.4 ? ' weak' : level < 0.7 ? ' medium' : '')}
                            style={{ width: Math.round(level * 100) + '%' }}
                        />
                    </span>
                )}
                {StatusUtils.formatSignal(input.signal, input.signal_scale)}
            </span>
        );
    };

    const renderInputs = () => (
        <table className="statusTable">
            <thead>
                <tr>
                    <th>{t('Tuner')}</th>
                    <th>{t('Mux')}</th>
                    <th>{t('Subscriptions')}</th>
                    <th>{t('Signal')}</th>
                    <th>{t('SNR')}</th>
                    <th>{t('Bitrate')}</th>
                    <th>{t('Errors')}</th>
                </tr>
            </thead>
            <tbody>
                {inputs.map((input) => {
                    const errors = (input.cc || 0) + (input.te || 0) + (input.unc || 0);
                    return (
                        <tr key={input.uuid + input.stream}>
                            <td>{input.input}</td>
                            <td>{input.stream}</td>
                            <td>{input.subs}</td>
                            <td>{renderSignal(input)}</td>
                            <td>{StatusUtils.formatSnr(input.snr, input.snr_scale)}</td>
                            <td>{StatusUtils.formatBitsPerSecond(input.bps || 0)}</td>
                            <td className={errors > 0 ? 'statusErrors' : ''}>{errors}</td>
                        </tr>
                    );
                })}
            </tbody>
        </table>
    );

    const renderSubscriptions = () => {
        const now = Date.now();
        return (
            <table className="statusTable">
                <thead>
                    <tr>
                        <th>{t('Channel')}</th>
                        <th>{t('Client')}</th>
                        <th>{t('Profile')}</th>
                        <th>{t('State')}</th>
                        <th>{t('Bitrate')}</th>
                        <th>{t('Errors')}</th>
                        <th>{t('Duration')}</th>
                    </tr>
                </thead>
                <tbody>
                    {subscriptions.map((subscription) => (
                        <tr key={subscription.id}>
                            <td>{subscription.channel || subscription.service || subscription.title}</td>
                            <td>
                                {[subscription.username, subscription.hostname, subscription.client]
                                    .filter((part) => part)
                                    .join(' · ')}
                            </td>
                            <td>{subscription.profile}</td>
                            <td>{subscription.state}</td>
                            <td>{StatusUtils.formatBytesPerSecond(subscription.in || 0)}</td>
                            <td className={subscription.errors > 0 ? 'statusErrors' : ''}>
                                {subscription.errors || 0}
                            </td>
                            <td>{StatusUtils.formatDuration(subscription.start, now)}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
        );
    };

    return (
        <div className="serverStatus" ref={wrapper} tabIndex={-1} onKeyDown={handleKeyDown}>
            <Panel>
                <Header title={t('Server status')} type="compact" centered />
                <div className="serverStatusBody" ref={body}>
                    {error && <BodyText className="statusError">{error}</BodyText>}
                    {!isLoaded && <BodyText>{t('Loading...')}</BodyText>}
                    {isLoaded && !error && (
                        <>
                            <div className="statusSectionTitle">{t('Tuners in use')}</div>
                            {inputs.length > 0 ? renderInputs() : <BodyText>{t('No tuner in use')}</BodyText>}
                            <div className="statusSectionTitle">{t('Active streams')}</div>
                            {subscriptions.length > 0 ? (
                                renderSubscriptions()
                            ) : (
                                <BodyText>{t('No active streams')}</BodyText>
                            )}
                        </>
                    )}
                </div>
            </Panel>
        </div>
    );
};

export default ServerStatus;
