import React, { useEffect, useRef, useState } from 'react';
import { t } from '../i18n/I18n';
import '../styles/app.css';

export interface GroupPickerItem {
    id: string;
    name: string;
    channelCount: number;
}

/**
 * List of all channel groups to jump directly to one, instead of cycling through them
 */
const GroupPicker = (props: {
    groups: GroupPickerItem[];
    currentGroupId: string;
    onSelect: (groupId: string) => void;
    onClose: () => void;
    // keys that are still held when the picker opens (e.g. the long pressed yellow button) are ignored until released
    heldKeys?: number[];
}) => {
    const wrapper = useRef<HTMLDivElement>(null);
    const heldKeys = useRef(props.heldKeys || []);
    const [focusedIndex, setFocusedIndex] = useState(
        Math.max(
            0,
            props.groups.findIndex((group) => group.id === props.currentGroupId)
        )
    );

    const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
        // the picker handles all keys while it is open
        event.stopPropagation();
        if (heldKeys.current.indexOf(event.keyCode) >= 0) {
            // repeated key of a button that is still held
            return;
        }
        const count = props.groups.length;
        switch (event.keyCode) {
            case 38: // arrow up
            case 33: // programm up
                setFocusedIndex((focusedIndex - 1 + count) % count);
                break;
            case 40: // arrow down
            case 34: // programm down
                setFocusedIndex((focusedIndex + 1) % count);
                break;
            case 13: // ok
                props.groups[focusedIndex] && props.onSelect(props.groups[focusedIndex].id);
                break;
            case 461: // back
            case 405: // yellow
            case 89: // keyboard 'y'
            case 37: // arrow left
                props.onClose();
                break;
        }
    };

    useEffect(() => {
        wrapper.current?.focus();
    }, []);

    useEffect(() => {
        // keep the focused group visible in long lists
        const item = wrapper.current?.querySelector('.groupPickerItem.focused');
        item && (item as HTMLElement).scrollIntoView({ block: 'nearest' });
    }, [focusedIndex]);

    return (
        <div
            className="groupPicker"
            ref={wrapper}
            tabIndex={-1}
            onKeyDown={handleKeyDown}
            onKeyUp={(event) => {
                event.stopPropagation();
                heldKeys.current = heldKeys.current.filter((keyCode) => keyCode !== event.keyCode);
            }}
            onClick={(event) => event.stopPropagation()}
        >
            <div className="groupPickerTitle">{t('Channel groups')}</div>
            <div className="groupPickerList">
                {props.groups.map((group, index) => (
                    <div
                        key={group.id}
                        className={
                            'groupPickerItem' +
                            (index === focusedIndex ? ' focused' : '') +
                            (group.id === props.currentGroupId ? ' current' : '')
                        }
                        onClick={() => props.onSelect(group.id)}
                    >
                        <span className="groupPickerName">{group.name}</span>
                        <span className="groupPickerCount">{group.channelCount}</span>
                    </div>
                ))}
            </div>
        </div>
    );
};

export default GroupPicker;
