import { useId, useRef, useState, type ReactNode } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import * as Select from '@radix-ui/react-select';
import * as Tooltip from '@radix-ui/react-tooltip';
import { X, Check, ChevronDown } from 'lucide-react';

export function IconButton({
  label,
  children,
  onClick,
  disabled,
  active,
  className = '',
}: {
  label: string;
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  active?: boolean;
  className?: string;
}) {
  return (
    <Tooltip.Root>
      <Tooltip.Trigger asChild>
        <button
          className={`icon-button ${active ? 'active' : ''} ${className}`}
          aria-label={label}
          disabled={disabled}
          onClick={onClick}
        >
          {children}
        </button>
      </Tooltip.Trigger>
      <Tooltip.Portal>
        <Tooltip.Content className="tooltip" sideOffset={8}>
          {label}
          <Tooltip.Arrow />
        </Tooltip.Content>
      </Tooltip.Portal>
    </Tooltip.Root>
  );
}
export function Modal({
  open,
  onOpenChange,
  title,
  description,
  children,
  wide = false,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  title: string;
  description?: string;
  children: ReactNode;
  wide?: boolean;
}) {
  const previousFocus = useRef<HTMLElement | null>(null),
    wasOpen = useRef(false),
    descriptionId = useId();
  if (open && !wasOpen.current) previousFocus.current = document.activeElement as HTMLElement;
  wasOpen.current = open;
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="modal-overlay" />
        <Dialog.Content
          className={`modal ${wide ? 'wide' : ''}`}
          onCloseAutoFocus={(e) => {
            e.preventDefault();
            if (previousFocus.current?.isConnected) previousFocus.current.focus();
          }}
          aria-describedby={description ? descriptionId : undefined}
        >
          <div className="modal-heading">
            <Dialog.Title>{title}</Dialog.Title>
            <Dialog.Close asChild>
              <button className="icon-button" aria-label="Fechar janela">
                <X size={18} />
              </button>
            </Dialog.Close>
          </div>
          {description && <Dialog.Description id={descriptionId}>{description}</Dialog.Description>}
          {children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
export function Choice({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <label className="field">
      <span>{label}</span>
      <Select.Root value={value} onValueChange={onChange}>
        <Select.Trigger className="select-trigger" aria-label={label}>
          <Select.Value />
          <Select.Icon>
            <ChevronDown size={13} />
          </Select.Icon>
        </Select.Trigger>
        <Select.Portal>
          <Select.Content className="select-content" position="popper" sideOffset={4}>
            <Select.Viewport>
              {options.map((o) => (
                <Select.Item className="select-item" key={o.value} value={o.value}>
                  <Select.ItemText>{o.label}</Select.ItemText>
                  <Select.ItemIndicator>
                    <Check size={12} />
                  </Select.ItemIndicator>
                </Select.Item>
              ))}
            </Select.Viewport>
          </Select.Content>
        </Select.Portal>
      </Select.Root>
    </label>
  );
}
export function NumberField({
  label,
  value,
  onChange,
  min,
  max,
  step = 1,
  suffix,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
  suffix?: string;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  return (
    <label className="field">
      <span>{label}</span>
      <div className="number-wrap">
        <input
          type="number"
          aria-label={label}
          value={draft ?? Math.round(value * 100) / 100}
          min={min}
          max={max}
          step={step}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => {
            if (draft !== null && draft !== '' && Number.isFinite(+draft))
              onChange(Math.min(max ?? Infinity, Math.max(min ?? -Infinity, +draft)));
            setDraft(null);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') e.currentTarget.blur();
            if (e.key === 'Escape') {
              setDraft(null);
              e.currentTarget.blur();
            }
          }}
        />
        {suffix && <small>{suffix}</small>}
      </div>
    </label>
  );
}
export function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="toggle-row">
      <span>{label}</span>
      <button
        className={`switch ${checked ? 'on' : ''}`}
        role="switch"
        aria-label={label}
        aria-checked={checked}
        onClick={() => onChange(!checked)}
      >
        <span />
      </button>
    </label>
  );
}
export function ColorField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false),
    [hex, setHex] = useState(value);
  const colors = [
    '#ffffff',
    '#f2f2f2',
    '#c9c9c9',
    '#8b8b8b',
    '#454545',
    '#202020',
    '#000000',
    '#edc6b5',
    '#f3d789',
    '#b6cdb3',
    '#b5c9d9',
    '#d7becf',
  ];
  return (
    <>
      <label className="field">
        <span>{label}</span>
        <button
          className="color-trigger"
          onClick={() => {
            setHex(value);
            setOpen(true);
          }}
          aria-label={label}
        >
          <i className={value === 'transparent' ? 'checker' : ''} style={{ backgroundColor: value }} />
          <span>{value === 'transparent' ? 'Transparente' : value.toUpperCase()}</span>
        </button>
      </label>
      <Modal open={open} onOpenChange={setOpen} title={label}>
        <div className="color-preview checker">
          <div style={{ backgroundColor: /^#[\da-f]{6}$/i.test(hex) ? hex : 'transparent' }} />
        </div>
        <label className="field">
          <span>Hexadecimal</span>
          <input
            aria-label="Cor hexadecimal"
            value={hex}
            maxLength={7}
            onChange={(e) => setHex(e.target.value)}
            placeholder="#ffffff"
          />
        </label>
        <div className="swatches">
          {colors.map((c) => (
            <button key={c} aria-label={`Cor ${c}`} style={{ background: c }} onClick={() => setHex(c)} />
          ))}
        </div>
        <div className="modal-actions">
          <button
            className="button secondary"
            onClick={() => {
              onChange('transparent');
              setOpen(false);
            }}
          >
            Transparente
          </button>
          <button
            className="button primary"
            disabled={!/^#[\da-f]{6}$/i.test(hex)}
            onClick={() => {
              onChange(hex.toLowerCase());
              setOpen(false);
            }}
          >
            Aplicar cor
          </button>
        </div>
      </Modal>
    </>
  );
}
