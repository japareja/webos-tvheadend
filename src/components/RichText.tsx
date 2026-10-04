import React from 'react';
import KodiMarkup, { TextSegment } from '../utils/KodiMarkup';

const toStyle = (segment: TextSegment): React.CSSProperties => ({
    color: segment.color,
    fontWeight: segment.bold ? 'bold' : undefined,
    fontStyle: segment.italic ? 'italic' : undefined
});

/**
 * Renders epg texts with kodi formatting codes ([COLOR], [B], [I], [CR], ...)
 */
const RichText = (props: { text?: string }) => {
    if (!KodiMarkup.hasMarkup(props.text)) {
        return <>{props.text || ''}</>;
    }
    const lines = KodiMarkup.parse(props.text);
    return (
        <>
            {lines.map((line, lineIndex) => (
                <React.Fragment key={lineIndex}>
                    {lineIndex > 0 && <br />}
                    {line.map((segment, segmentIndex) => (
                        <span key={segmentIndex} style={toStyle(segment)}>
                            {segment.text}
                        </span>
                    ))}
                </React.Fragment>
            ))}
        </>
    );
};

export default RichText;
