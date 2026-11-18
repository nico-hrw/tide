import React, { useEffect, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { cx } from './cx';

/* ── Schalter ───────────────────────────────────────────── */

export interface ToggleProps {
    checked: boolean;
    onChange: (next: boolean) => void;
    label: string;
    disabled?: boolean;
    id?: string;
}

export function Toggle({ checked, onChange, label, disabled, id }: ToggleProps) {
    return (
        <button
            id={id}
            type="button"
            role="switch"
            aria-checked={checked}
            aria-label={label}
            disabled={disabled}
            onClick={() => onChange(!checked)}
            className={cx(
                'relative h-6 w-10 shrink-0 rounded-full transition-colors duration-200 disabled:cursor-not-allowed disabled:opacity-40',
                checked ? 'bg-t2-accent' : 'bg-t2-line',
            )}
        >
            <span
                className={cx(
                    'absolute left-[3px] top-[3px] h-[18px] w-[18px] rounded-full shadow-sm transition-transform duration-200',
                    checked ? 'translate-x-4 bg-t2-accent-ink' : 'bg-t2-bg',
                )}
            />
        </button>
    );
}

/* ── Segmentierte Auswahl ───────────────────────────────── */

export interface SegmentOption<T extends string> {
    value: T;
    label: string;
    icon?: React.ReactNode;
}

export interface SegmentedProps<T extends string> {
    value: T;
    options: ReadonlyArray<SegmentOption<T>>;
    onChange: (next: T) => void;
    label: string;
    /** Auf schmalen Breiten ueber die ganze Zeile spannen */
    full?: boolean;
}

export function Segmented<T extends string>({ value, options, onChange, label, full }: SegmentedProps<T>) {
    return (
        <div
            role="radiogroup"
            aria-label={label}
            className={cx('inline-flex max-w-full gap-0.5 rounded-ui bg-t2-sub p-[3px] ring-1 ring-t2-line', full && 'w-full sm:w-auto')}
        >
            {options.map((o) => {
                const active = o.value === value;
                return (
                    <button
                        key={o.value}
                        type="button"
                        role="radio"
                        aria-checked={active}
                        onClick={() => onChange(o.value)}
                        className={cx(
                            'flex items-center justify-center gap-1.5 whitespace-nowrap rounded-[7px] px-3 py-1 text-[13px] transition-colors',
                            full && 'flex-1 sm:flex-none',
                            active ? 'bg-t2-surface font-semibold text-t2-ink shadow-sm ring-1 ring-t2-line' : 'text-t2-ink-2 hover:text-t2-ink',
                        )}
                    >
                        {o.icon}
                        {o.label}
                    </button>
                );
            })}
        </div>
    );
}

/* ── Auswahlliste ───────────────────────────────────────── */

export interface SelectFieldProps<T extends string | number> {
    value: T;
    options: ReadonlyArray<{ value: T; label: string }>;
    onChange: (next: T) => void;
    label: string;
    disabled?: boolean;
    id?: string;
}

export function SelectField<T extends string | number>({ value, options, onChange, label, disabled, id }: SelectFieldProps<T>) {
    return (
        <span className="relative inline-flex max-w-full">
            <select
                id={id}
                aria-label={label}
                disabled={disabled}
                value={String(value)}
                onChange={(e) => {
                    const picked = options.find((o) => String(o.value) === e.target.value);
                    if (picked) onChange(picked.value);
                }}
                className="max-w-full cursor-pointer appearance-none rounded-ui bg-t2-surface py-1.5 pl-[11px] pr-7 text-t2-ink ring-1 ring-t2-line outline-none transition-colors hover:bg-t2-hover focus-visible:ring-2 focus-visible:ring-t2-accent disabled:cursor-not-allowed disabled:opacity-50"
            >
                {options.map((o) => (
                    <option key={String(o.value)} value={String(o.value)}>
                        {o.label}
                    </option>
                ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-3 w-3 -translate-y-1/2 text-t2-ink-3" aria-hidden />
        </span>
    );
}

/* ── Texteingabe ────────────────────────────────────────── */

export type TextFieldProps = React.InputHTMLAttributes<HTMLInputElement> & {
    mono?: boolean;
    block?: boolean;
};

export const TextField = React.forwardRef<HTMLInputElement, TextFieldProps>(function TextField({ className, mono, block, ...rest }, ref) {
    return (
        <input
            ref={ref}
            {...rest}
            className={cx(
                'max-w-full rounded-ui bg-t2-surface px-3 py-1.5 text-t2-ink ring-1 ring-t2-line outline-none placeholder:text-t2-ink-3 focus:ring-2 focus:ring-t2-accent',
                block ? 'w-full' : 'w-full sm:w-[220px]',
                mono && 'font-mono text-[12.5px]',
                className,
            )}
        />
    );
});

/* ── Buttons ────────────────────────────────────────────── */

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
    variant?: 'default' | 'primary' | 'danger' | 'ghost';
    icon?: React.ReactNode;
}

export function Button({ variant = 'default', icon, className, children, type = 'button', ...rest }: ButtonProps) {
    const styles: Record<NonNullable<ButtonProps['variant']>, string> = {
        default: 'bg-t2-surface text-t2-ink ring-1 ring-t2-line hover:bg-t2-hover',
        primary: 'bg-t2-accent text-t2-accent-ink hover:opacity-90',
        danger: 'bg-t2-surface text-t2-late ring-1 ring-t2-line hover:bg-t2-hover',
        ghost: 'bg-transparent text-t2-ink-2 hover:bg-t2-hover hover:text-t2-ink',
    };
    return (
        <button
            type={type}
            {...rest}
            className={cx(
                'inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-ui px-3 py-1.5 text-[13px] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50',
                styles[variant],
                className,
            )}
        >
            {icon}
            {children}
        </button>
    );
}

/** Kleiner Icon-Button (z. B. Auge, Teilen, Loeschen in Listenzeilen). */
export function IconButton({
    label,
    children,
    tone = 'default',
    pressed,
    ...rest
}: Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'aria-label' | 'title'> & { label: string; tone?: 'default' | 'danger'; pressed?: boolean }) {
    return (
        <button
            type="button"
            aria-label={label}
            title={label}
            aria-pressed={pressed}
            {...rest}
            className={cx(
                'flex rounded-lg p-1.5 text-t2-ink-3 transition-colors hover:bg-t2-hover disabled:cursor-not-allowed disabled:opacity-40',
                tone === 'danger' ? 'hover:text-t2-late' : 'hover:text-t2-ink',
                pressed && 'bg-t2-hover text-t2-ink',
            )}
        >
            {children}
        </button>
    );
}

/**
 * Zweistufige Bestaetigung: erster Klick aendert die Beschriftung, der zweite fuehrt aus.
 * Faellt nach `timeoutMs` automatisch zurueck.
 */
export interface ConfirmButtonProps {
    label: string;
    confirmLabel: string;
    onConfirm: () => void | Promise<void>;
    variant?: ButtonProps['variant'];
    disabled?: boolean;
    timeoutMs?: number;
    icon?: React.ReactNode;
}

export function ConfirmButton({ label, confirmLabel, onConfirm, variant = 'danger', disabled, timeoutMs = 4000, icon }: ConfirmButtonProps) {
    const [armed, setArmed] = useState(false);
    const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

    const handle = () => {
        if (!armed) {
            setArmed(true);
            timer.current = setTimeout(() => setArmed(false), timeoutMs);
            return;
        }
        if (timer.current) clearTimeout(timer.current);
        setArmed(false);
        void onConfirm();
    };

    return (
        <Button variant={variant} disabled={disabled} onClick={handle} icon={icon} aria-live="polite">
            {armed ? confirmLabel : label}
        </Button>
    );
}

/* ── Chip & Status ──────────────────────────────────────── */

export function Chip({ children, className }: { children: React.ReactNode; className?: string }) {
    return (
        <span className={cx('inline-flex items-center gap-1.5 whitespace-nowrap rounded-full bg-t2-sub px-2 py-0.5 text-[12px] font-normal text-t2-ink-2', className)}>
            {children}
        </span>
    );
}

/** Statuspunkt mit Text. `tone` bestimmt die Farbe des Punkts. */
export function StatusPill({ children, tone = 'on' }: { children: React.ReactNode; tone?: 'on' | 'off' | 'warn' }) {
    return (
        <span className="inline-flex items-center gap-[5px] rounded-full bg-t2-sub px-2 py-px text-[11.5px] font-medium text-t2-ink-2">
            <span
                aria-hidden
                className={cx(
                    'h-1.5 w-1.5 rounded-full',
                    tone === 'on' && 'bg-emerald-500',
                    tone === 'off' && 'bg-t2-ink-3 opacity-50',
                    tone === 'warn' && 'bg-amber-500',
                )}
            />
            <span className={tone === 'off' ? 'text-t2-ink-3' : undefined}>{children}</span>
        </span>
    );
}

/** Meldung (Erfolg / Fehler / Info) in Karten und unter Formularen. */
export function Notice({ tone = 'info', children }: { tone?: 'info' | 'success' | 'error'; children: React.ReactNode }) {
    return (
        <p
            role={tone === 'error' ? 'alert' : 'status'}
            className={cx(
                'rounded-ui bg-t2-sub px-3 py-2 text-[12.5px] ring-1 ring-t2-line',
                tone === 'error' ? 'text-t2-late' : 'text-t2-ink-2',
            )}
        >
            {children}
        </p>
    );
}
