import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown, Check } from 'lucide-react';

interface MultiSelectProps {
  label: string;
  options: string[] | number[];
  selected: any[];
  onChange: (selected: any[]) => void;
}

export const MultiSelect: React.FC<MultiSelectProps> = ({ label, options, selected, onChange }) => {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const allSelected = options.length > 0 && options.every((o) => selected.includes(o));

  const toggleOption = (option: any) => {
    if (selected.includes(option)) {
      onChange(selected.filter((item) => item !== option));
    } else {
      onChange([...selected, option]);
    }
  };

  const toggleAll = () => {
    if (allSelected) {
      onChange([]);
    } else {
      onChange([...options]);
    }
  };

  return (
    <div className="relative min-w-[170px]" ref={containerRef}>
      <label className="block text-[10px] font-bold text-mars-navy mb-1 uppercase tracking-wider">
        {label}
      </label>
      <div
        className={`border rounded px-2.5 py-1.5 bg-white flex justify-between items-center cursor-pointer transition-colors ${
          isOpen ? 'border-mars-navy ring-1 ring-mars-navy' : 'border-gray-300 hover:border-mars-blue'
        }`}
        onClick={() => setIsOpen(!isOpen)}
      >
        <span className={`text-sm truncate mr-2 ${selected.length > 0 ? 'text-mars-navy font-semibold' : 'text-gray-400'}`}>
          {selected.length === 0 ? 'All' : `${selected.length} selected`}
        </span>
        <ChevronDown
          size={14}
          className={`text-mars-navy transition-transform shrink-0 ${isOpen ? 'rotate-180' : ''}`}
        />
      </div>

      {isOpen && (
        <div className="absolute z-50 mt-1 w-full bg-white border border-mars-blue-light rounded shadow-lg max-h-60 overflow-auto">
          {/* Select All row */}
          <div
            className="flex items-center px-3 py-2 hover:bg-mars-blue-pale cursor-pointer border-b border-gray-100"
            onClick={toggleAll}
          >
            <div
              className={`w-4 h-4 border rounded mr-2.5 flex items-center justify-center shrink-0 transition-colors ${
                allSelected
                  ? 'bg-mars-navy border-mars-navy'
                  : 'border-gray-300 hover:border-mars-blue'
              }`}
            >
              {allSelected && <Check size={11} className="text-white" strokeWidth={3} />}
            </div>
            <span className="text-sm font-semibold text-mars-navy">Select All</span>
          </div>

          {options.map((option) => (
            <div
              key={String(option)}
              className="flex items-center px-3 py-2 hover:bg-mars-blue-pale cursor-pointer"
              onClick={() => toggleOption(option)}
            >
              <div
                className={`w-4 h-4 border rounded mr-2.5 flex items-center justify-center shrink-0 transition-colors ${
                  selected.includes(option)
                    ? 'bg-mars-navy border-mars-navy'
                    : 'border-gray-300 hover:border-mars-blue'
                }`}
              >
                {selected.includes(option) && <Check size={11} className="text-white" strokeWidth={3} />}
              </div>
              <span className="text-sm text-gray-700">{option}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
