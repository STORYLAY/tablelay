import React, { useState, useRef, useEffect, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
import { ICONS } from '../constants';

export interface SelectOption {
  label: string;
  value: string;
  group?: string;
  icon?: string;
}

interface SelectProps {
  options: SelectOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  triggerClassName?: string;
  portal?: boolean;
}

export const Select: React.FC<SelectProps> = ({
  options,
  value,
  onChange,
  placeholder = '请选择...',
  disabled = false,
  className = '',
  triggerClassName = 'w-full min-h-[36px] px-3 py-2 bg-white border rounded-xl flex items-center justify-between transition-all duration-200 text-sm shadow-sm',
  portal = true
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const selectRef = useRef<HTMLDivElement>(null);
  const [dropdownPosition, setDropdownPosition] = useState({ top: 0, left: 0, width: 0 });

  const dropdownRef = useRef<HTMLDivElement>(null);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (disabled) return;
    if (!isOpen) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        e.stopPropagation();
        e.nativeEvent.stopImmediatePropagation();
        setIsOpen(true);
      }
      return;
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      e.stopPropagation();
      e.nativeEvent.stopImmediatePropagation();
      setHighlightedIndex(prev => Math.min(prev + 1, options.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      e.stopPropagation();
      e.nativeEvent.stopImmediatePropagation();
      setHighlightedIndex(prev => Math.max(prev - 1, 0));
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      e.stopPropagation();
      e.nativeEvent.stopImmediatePropagation();
      if (highlightedIndex >= 0 && highlightedIndex < options.length) {
        onChange(options[highlightedIndex].value);
        setIsOpen(false);
      } else if (e.key === 'Enter' || e.key === ' ') {
        setIsOpen(false);
      }
    } else if (e.key === 'Escape' || e.key === 'Tab') {
      if (e.key === 'Escape') {
        e.stopPropagation();
        e.nativeEvent.stopImmediatePropagation();
      }
      setIsOpen(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      const idx = options.findIndex(opt => opt.value === value);
      setHighlightedIndex(idx >= 0 ? idx : 0);
    } else {
      setHighlightedIndex(-1);
    }
  }, [isOpen, options, value]);

  useEffect(() => {
    if (highlightedIndex !== -1 && dropdownRef.current) {
      const optionsElements = dropdownRef.current.querySelectorAll('.cursor-pointer');
      const targetElement = optionsElements[highlightedIndex] as HTMLElement;
      if (targetElement) {
        targetElement.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      }
    }
  }, [highlightedIndex]);

  const updateDropdownPosition = () => {
    if (!portal || !selectRef.current) return;
    const rect = selectRef.current.getBoundingClientRect();
    const viewportHeight = window.innerHeight;
    const spaceBelow = viewportHeight - rect.bottom;
    const spaceAbove = rect.top;
    const shouldShowAbove = spaceBelow < 200 && spaceAbove > spaceBelow;

    setDropdownPosition({
      top: shouldShowAbove ? rect.top - 200 : rect.bottom,
      left: rect.left,
      width: rect.width,
    });
  };

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const isClickInsideSelect = selectRef.current?.contains(event.target as Node);
      const isClickInsideDropdown = dropdownRef.current?.contains(event.target as Node);
      
      if (!isClickInsideSelect && !isClickInsideDropdown) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useLayoutEffect(() => {
    if (!isOpen) return;
    updateDropdownPosition();
  }, [isOpen, portal]);

  const selectedOption = options.find(opt => opt.value === value);

  // Group options
  const groupedOptions = options.reduce((acc, option) => {
    const group = option.group || '';
    if (!acc[group]) acc[group] = [];
    acc[group].push(option);
    return acc;
  }, {} as Record<string, SelectOption[]>);

  const dropdownContent = (
    <div 
      ref={dropdownRef} 
      data-select-dropdown="true"
      className={`z-[20000] bg-white border border-gray-100 rounded-xl shadow-xl shadow-black/[0.04] overflow-y-auto max-h-[200px] py-1 transform origin-top animate-in fade-in slide-in-from-top-2 duration-200 ${portal ? '' : 'absolute left-0 mt-2 min-w-full w-max max-w-[320px]'}`}
      style={portal ? { position: 'fixed', top: dropdownPosition.top, left: dropdownPosition.left, minWidth: dropdownPosition.width, width: 'max-content', maxWidth: 'min(400px, 90vw)' } : {}}
    >
      {options.length > 0 ? (
        Object.entries(groupedOptions).map(([group, opts]: [string, SelectOption[]]) => (
          <div key={group || 'ungrouped'}>
            {group && (
              <div className="px-3 py-1.5 text-[11px] font-bold text-gray-400 uppercase tracking-wider bg-gray-50/50 flex items-center gap-2">
                {/* Find the icon for this group from the first option in this group */}
                {opts[0].icon && <img src={opts[0].icon} alt="" className="w-3 h-3 object-contain" />}
                {group}
              </div>
            )}
            {opts.map(option => {
              const isSelected = option.value === value;
              const isHighlighted = highlightedIndex !== -1 && options[highlightedIndex]?.value === option.value;
              return (
                  <div
                    key={option.value}
                    className={`px-3 py-2 mx-1 cursor-pointer text-sm flex items-center justify-between rounded-lg transition-all duration-150 ${isSelected ? 'bg-primary-50/50 text-primary-700 font-medium' : isHighlighted ? 'bg-gray-50 text-primary-600' : 'text-gray-700 hover:bg-gray-50'}`}
                    onClick={() => {
                      onChange(option.value);
                      setIsOpen(false);
                    }}
                  >
                    <span className="whitespace-nowrap">{option.label}</span>
                    {isSelected && <ICONS.Check className="w-4 h-4 text-primary-600 shrink-0 ml-2" />}
                  </div>
              );
            })}
          </div>
        ))
      ) : (
        <div className="px-3 py-2 text-sm text-gray-400 text-center">
          无选项
        </div>
      )}
    </div>
  );

  return (
    <div className={`relative ${className}`} ref={selectRef}>
      <div
        className={`flex items-center justify-between ${triggerClassName} ${disabled ? 'bg-gray-50 border-gray-200 text-gray-400 cursor-not-allowed' : isOpen ? 'border-primary-500 ring-2 ring-primary-50 cursor-pointer' : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50/50 cursor-pointer'}`}
        tabIndex={disabled ? -1 : 0}
        onKeyDown={handleKeyDown}
        onClick={() => {
          if (disabled) return;
          if (!isOpen) updateDropdownPosition();
          setIsOpen(!isOpen);
        }}
      >
        <span className={`truncate min-w-0 flex items-center gap-2 ${!selectedOption ? 'text-gray-400' : 'text-gray-700'}`}>
          {selectedOption ? selectedOption.label : placeholder}
        </span>
        <ICONS.ChevronDown className={`w-4 h-4 shrink-0 ml-2 transition-transform duration-200 ${disabled ? 'text-gray-300' : 'text-gray-500'} ${isOpen ? 'rotate-180' : ''}`} />
      </div>

      {isOpen && !disabled && (
        portal ? createPortal(dropdownContent, document.body) : dropdownContent
      )}
    </div>
  );
};
