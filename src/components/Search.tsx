import React, { useContext, useEffect, useRef, useState } from 'react';
import Input from '@enact/moonstone/Input';
import Item from '@enact/moonstone/Item';
import Scroller from '@enact/moonstone/Scroller';
import BodyText from '@enact/moonstone/BodyText';
import { Header, Panel } from '@enact/moonstone/Panels';
import AppContext from '../AppContext';
import EPGEvent from '../models/EPGEvent';
import EPGChannel from '../models/EPGChannel';
import EPGUtils from '../utils/EPGUtils';
import { t } from '../i18n/I18n';
import '../styles/app.css';

const MAX_RESULTS = 100;
const MIN_QUERY_LENGTH = 2;
const SEARCH_DELAY_MILLIS = 300;

interface SearchResult {
    channelPosition: number;
    channel: EPGChannel;
    event: EPGEvent;
}

/** lower case without accents, so 'futbol' finds 'Fútbol' */
const normalize = (text: string) => (text || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/**
 * Search the epg of all channels by program title
 */
const Search = (props: { unmount: () => void }) => {
    const { epgData, locale, setCurrentChannelPosition } = useContext(AppContext);
    const [query, setQuery] = useState('');
    const [results, setResults] = useState<SearchResult[]>([]);
    const searchWrapper = useRef<HTMLDivElement>(null);

    const searchEvents = (text: string): SearchResult[] => {
        const normalizedQuery = normalize(text.trim());
        if (normalizedQuery.length < MIN_QUERY_LENGTH) {
            return [];
        }
        const now = EPGUtils.getNow();
        const matches: SearchResult[] = [];
        epgData.getChannels().forEach((channel, channelPosition) => {
            channel.getEvents().forEach((event) => {
                if (
                    event.getEnd() > now &&
                    (normalize(event.getTitle()).indexOf(normalizedQuery) >= 0 ||
                        normalize(event.getSubTitle()).indexOf(normalizedQuery) >= 0)
                ) {
                    matches.push({ channelPosition, channel, event });
                }
            });
        });
        return matches.sort((a, b) => a.event.getStart() - b.event.getStart()).slice(0, MAX_RESULTS);
    };

    const selectResult = (result: SearchResult) => {
        setCurrentChannelPosition(result.channelPosition);
        props.unmount();
    };

    const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
        if (event.keyCode === 461) {
            // back button
            event.stopPropagation();
            props.unmount();
        }
    };

    const formatResult = (result: SearchResult) => {
        const start = result.event.getStart();
        const when = result.event.isCurrent()
            ? t('Now')
            : EPGUtils.getWeekdayName(start, locale) + ' ' + EPGUtils.toTimeString(start, locale);
        return (
            when +
            ' · ' +
            result.channel.getChannelID() +
            ' ' +
            result.channel.getName() +
            ' · ' +
            result.event.getTitle()
        );
    };

    useEffect(() => {
        // start typing right away (opens the virtual keyboard on the tv)
        const input = searchWrapper.current?.querySelector('input');
        input && input.focus();
    }, []);

    useEffect(() => {
        // search after the user stopped typing
        const timeout = setTimeout(() => setResults(searchEvents(query)), SEARCH_DELAY_MILLIS);
        return () => clearTimeout(timeout);
    }, [query]);

    return (
        <div id="search" ref={searchWrapper} className="search" onKeyDown={handleKeyDown}>
            <Panel>
                <Header title={t('Search')} type="compact" centered />
                <Input
                    dismissOnEnter
                    value={query}
                    type="text"
                    onChange={(input: HTMLInputElement) => setQuery(input.value)}
                    placeholder={t('Program title')}
                />
                {query.trim().length >= MIN_QUERY_LENGTH && results.length === 0 && (
                    <BodyText>{t('No programs found')}</BodyText>
                )}
                <Scroller className="searchResults">
                    {results.map((result) => (
                        <Item
                            key={result.channel.getUUID() + '-' + result.event.getId()}
                            onClick={() => selectResult(result)}
                        >
                            {formatResult(result)}
                        </Item>
                    ))}
                </Scroller>
            </Panel>
        </div>
    );
};

export default Search;
