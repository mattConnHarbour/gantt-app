import { useId, useState } from 'react';
import type { InputHTMLAttributes } from 'react';

interface Props extends Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'type'> {
  customers: string[];
  value: string;
  onChange: (value: string) => void;
}

export function CustomerInput({ customers, value, onChange, onKeyDown, ...inputProps }: Props) {
  const listId = useId();
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const query = value.trim().toLowerCase();
  const suggestions = [...new Set(customers.map(customer => customer.trim()).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b))
    .filter(customer => customer.toLowerCase().includes(query));
  const expanded = open && !inputProps.disabled && suggestions.length > 0;

  const selectCustomer = (customer: string) => {
    onChange(customer);
    setOpen(false);
    setActiveIndex(-1);
  };

  return (
    <div className="customer-autocomplete">
      <input
        {...inputProps}
        type="text"
        role="combobox"
        autoComplete="off"
        aria-autocomplete="list"
        aria-expanded={expanded}
        aria-controls={expanded ? listId : undefined}
        aria-activedescendant={expanded && activeIndex >= 0 ? `${listId}-${activeIndex}` : undefined}
        value={value}
        onFocus={(event) => {
          setOpen(true);
          setActiveIndex(-1);
          inputProps.onFocus?.(event);
        }}
        onClick={() => setOpen(true)}
        onBlur={(event) => {
          setOpen(false);
          setActiveIndex(-1);
          inputProps.onBlur?.(event);
        }}
        onChange={(event) => {
          onChange(event.target.value);
          setOpen(true);
          setActiveIndex(-1);
        }}
        onKeyDown={(event) => {
          if (suggestions.length && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) {
            event.preventDefault();
            setOpen(true);
            const nextIndex = event.key === 'ArrowDown'
              ? (activeIndex + 1) % suggestions.length
              : (activeIndex <= 0 ? suggestions.length - 1 : activeIndex - 1);
            setActiveIndex(nextIndex);
            document.getElementById(`${listId}-${nextIndex}`)?.scrollIntoView({ block: 'nearest' });
          } else if (expanded && event.key === 'Enter' && activeIndex >= 0) {
            event.preventDefault();
            selectCustomer(suggestions[activeIndex]);
          } else if (open && event.key === 'Escape') {
            event.preventDefault();
            event.stopPropagation();
            setOpen(false);
            setActiveIndex(-1);
          } else {
            onKeyDown?.(event);
          }
        }}
      />
      {expanded && (
        <ul id={listId} className="customer-suggestions" role="listbox" aria-label="Customers">
          {suggestions.map((customer, index) => (
            <li
              key={customer}
              id={`${listId}-${index}`}
              role="option"
              aria-selected={index === activeIndex}
              className={index === activeIndex ? 'active' : undefined}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => selectCustomer(customer)}
            >
              {customer}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
