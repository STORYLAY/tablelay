import React, { useState, useEffect } from 'react';
import { ICONS } from '../constants';
import { api } from '../services/api';

export const UserCellDisplay = ({ 
    tableId, 
    rowId, 
    colId, 
    value,
    searchKeyword,
    onDelete
}: { 
    tableId: string, 
    rowId: string, 
    colId: string, 
    value: any,
    searchKeyword?: string,
    onDelete?: (index: number) => void
}) => {
    const [displayValue, setDisplayValue] = useState<any>(value);
    const [loading, setLoading] = useState(false);

    // Highlight text helper
    const highlightText = (text: any) => {
        if (text === null || text === undefined || text === '') return null;
        const str = String(text);
        if (!searchKeyword || !str.toLowerCase().includes(searchKeyword.toLowerCase())) {
            return str;
        }
        
        const parts = str.split(new RegExp(`(${searchKeyword})`, 'gi'));
        return (
            <>
                {parts.map((part, i) => 
                    part.toLowerCase() === searchKeyword.toLowerCase() ? (
                        <span key={i} className="bg-[#ffec3d] text-black rounded-[2px] box-decoration-clone">{part}</span>
                    ) : part
                )}
            </>
        );
    };

    useEffect(() => {
        // If value is already an object with name, we don't need to fetch
        const isRich = Array.isArray(value) 
            ? (value.length > 0 && value.every(v => typeof v === 'object' && v !== null && v.name))
            : (typeof value === 'object' && value !== null && value.name);
        
        if (isRich) {
            setDisplayValue(value);
            return;
        }

        // Otherwise, fetch using Interface 56
        const fetchDisplay = async () => {
            if (!value || (Array.isArray(value) && value.length === 0) || rowId === 'new' || !rowId || rowId === 'undefined') {
                setDisplayValue(value);
                return;
            }
            setLoading(true);
            try {
                const res = await api.getCell(tableId, rowId, colId);
                if (res.data && res.data.value !== undefined) {
                    let newValue = res.data.value;
                    if (typeof newValue === 'string') {
                        try {
                            if (newValue.includes("'")) newValue = newValue.replace(/'/g, '"');
                            newValue = JSON.parse(newValue);
                        } catch(e) {}
                    }
                    setDisplayValue(newValue);
                }
            } catch (e) {
                console.error('Failed to fetch user display info', e);
            }
            setLoading(false);
        };

        fetchDisplay();
    }, [tableId, rowId, colId, value]);

    const users = Array.isArray(displayValue) ? displayValue : (displayValue ? [displayValue] : []);

    return (
        <div className="flex items-center gap-1 overflow-hidden h-full">
            {users.map((u: any, i: number) => (
                <div key={i} className="flex items-center gap-1 bg-primary-50 text-primary-700 px-1.5 py-0.5 rounded-full text-[10px] border border-primary-100 shrink-0 group">
                    <div className="w-3.5 h-3.5 rounded-full bg-primary-200 flex items-center justify-center overflow-hidden text-[8px]">
                        {u.avatar ? <img src={u.avatar} className="w-full h-full object-cover" alt="" referrerPolicy="no-referrer" /> : ((u.real_name || u.name)?.[0] || 'U')}
                    </div>
                    <span className="truncate max-w-[120px]">{highlightText(u.real_name || u.name || (typeof u === 'string' ? u : 'User'))}</span>
                    {onDelete && (
                        <button 
                            className="text-gray-400 hover:text-gray-600 ml-0.5"
                            onClick={(e) => {
                                e.stopPropagation();
                                onDelete(i);
                            }}
                        >
                            <ICONS.Close className="w-2.5 h-2.5" />
                        </button>
                    )}
                </div>
            ))}
            {users.length === 0 && !loading && <span className="text-gray-300 text-xs">选择人员</span>}
            {loading && <div className="w-3 h-3 border-2 border-primary-500 border-t-transparent rounded-full animate-spin ml-1" />}
        </div>
    );
};
