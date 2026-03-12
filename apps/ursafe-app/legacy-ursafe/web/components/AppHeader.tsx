'use client';

import Link from 'next/link';
import { ReactNode } from 'react';
import { useTheme } from '@/contexts/ThemeContext';

type HeaderAccent = 'emerald' | 'blue' | 'indigo' | 'slate' | 'amber' | 'rose';
type HeaderTone = 'neutral' | 'primary' | 'danger';

const ACCENT_STYLES: Record<HeaderAccent, { light: string; dark: string }> = {
  emerald: { light: 'text-emerald-600', dark: 'text-emerald-300' },
  blue: { light: 'text-blue-500', dark: 'text-blue-300' },
  indigo: { light: 'text-indigo-500', dark: 'text-indigo-300' },
  slate: { light: 'text-slate-400', dark: 'text-slate-400' },
  amber: { light: 'text-amber-500', dark: 'text-amber-300' },
  rose: { light: 'text-rose-500', dark: 'text-rose-300' },
};

const BUTTON_TONES: Record<HeaderTone, { light: string; dark: string }> = {
  neutral: {
    light: 'border-gray-200 text-gray-700 hover:bg-gray-100',
    dark: 'border-white/15 text-slate-100 hover:bg-white/10',
  },
  primary: {
    light: 'border-blue-200 text-blue-700 hover:bg-blue-50',
    dark: 'border-emerald-400/40 text-emerald-200 hover:bg-emerald-400/10',
  },
  danger: {
    light: 'border-rose-200 text-rose-600 hover:bg-rose-50',
    dark: 'border-rose-400/40 text-rose-200 hover:bg-rose-500/10',
  },
};

const baseActionClasses =
  'group inline-flex h-8 max-w-8 items-center justify-center overflow-hidden rounded-full border transition-[max-width,background-color,border-color,box-shadow] duration-300 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 focus-visible:ring-offset-2 focus-visible:ring-offset-white';
const baseActionDarkRing = 'focus-visible:ring-offset-slate-950';
const expandedActionClasses =
  'hover:max-w-[10rem] focus-visible:max-w-[10rem]';
const iconClasses = 'flex h-8 w-8 items-center justify-center text-sm';
const labelClasses =
  'ml-0 max-w-0 overflow-hidden pr-0 text-[11px] font-semibold tracking-wide text-current opacity-0 transition-[max-width,opacity,margin,padding] duration-200 group-hover:ml-1 group-hover:max-w-[10rem] group-hover:pr-3 group-hover:opacity-100 group-focus-visible:ml-1 group-focus-visible:max-w-[10rem] group-focus-visible:pr-3 group-focus-visible:opacity-100';

type HeaderActionButtonProps = {
  label: string;
  icon: string;
  tone?: HeaderTone;
  onClick?: () => void;
  href?: string;
  disabled?: boolean;
  type?: 'button' | 'submit' | 'reset';
  ariaPressed?: boolean;
};

export function HeaderActionButton({
  label,
  icon,
  tone = 'neutral',
  onClick,
  href,
  disabled,
  type = 'button',
  ariaPressed,
}: HeaderActionButtonProps) {
  const { theme } = useTheme();
  const isDarkTheme = theme === 'dark';
  const toneClasses = BUTTON_TONES[tone][isDarkTheme ? 'dark' : 'light'];
  const ringOffset = isDarkTheme ? baseActionDarkRing : '';
  const classes = `${baseActionClasses} ${expandedActionClasses} ${toneClasses} ${ringOffset} ${disabled ? 'cursor-not-allowed opacity-60' : ''} group-hover:justify-start group-focus-visible:justify-start`;

  if (href) {
    return (
      <Link
        href={href}
        className={classes}
        aria-label={label}
        title={label}
        aria-pressed={ariaPressed}
      >
        <span className={iconClasses} aria-hidden="true">
          {icon}
        </span>
        <span className={labelClasses}>{label}</span>
      </Link>
    );
  }

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={classes}
      aria-label={label}
      title={label}
      aria-pressed={ariaPressed}
    >
      <span className={iconClasses} aria-hidden="true">
        {icon}
      </span>
      <span className={labelClasses}>{label}</span>
    </button>
  );
}

type HeaderToggleButtonProps = {
  label: string;
  iconOn: string;
  iconOff: string;
  pressed: boolean;
  onToggle: () => void;
  tone?: HeaderTone;
};

export function HeaderToggleButton({
  label,
  iconOn,
  iconOff,
  pressed,
  onToggle,
  tone = 'neutral',
}: HeaderToggleButtonProps) {
  return (
    <HeaderActionButton
      label={label}
      icon={pressed ? iconOn : iconOff}
      tone={tone}
      onClick={onToggle}
      type="button"
      ariaPressed={pressed}
    />
  );
}

type AppHeaderProps = {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  accent?: HeaderAccent;
  badge?: string;
  badgeTone?: HeaderAccent;
  actions?: ReactNode;
  meta?: string;
  showThemeToggle?: boolean;
};

export default function AppHeader({
  eyebrow,
  title,
  subtitle,
  accent = 'emerald',
  badge,
  badgeTone = 'blue',
  actions,
  meta,
  showThemeToggle = true,
}: AppHeaderProps) {
  const { theme, toggleTheme } = useTheme();
  const isDarkTheme = theme === 'dark';
  const accentClasses = ACCENT_STYLES[accent][isDarkTheme ? 'dark' : 'light'];
  const badgeClasses = ACCENT_STYLES[badgeTone][isDarkTheme ? 'dark' : 'light'];
  const headerBg = isDarkTheme
    ? 'border-b border-white/10 bg-slate-950/80 text-slate-100'
    : 'border-b bg-white text-slate-900 shadow-sm';
  const subtitleClass = isDarkTheme ? 'text-slate-300' : 'text-gray-500';

  return (
    <header className={headerBg}>
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-4 py-2.5 sm:px-6 lg:px-8">
        <div className="space-y-1">
          {eyebrow && (
            <p className={`text-[10px] font-semibold uppercase tracking-[0.35em] ${accentClasses}`}>
              {eyebrow}
            </p>
          )}
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-xl font-bold sm:text-2xl">{title}</h1>
            {badge && (
              <span className={`rounded-full border border-current/20 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.25em] ${badgeClasses}`}>
                {badge}
              </span>
            )}
          </div>
          {subtitle && <p className={`text-xs sm:text-sm ${subtitleClass}`}>{subtitle}</p>}
        </div>
        <div className="flex flex-col items-end gap-2">
          <div className="flex flex-wrap items-center justify-end gap-2">
            {actions}
            {showThemeToggle && (
              <HeaderToggleButton
                label={isDarkTheme ? 'Light Mode' : 'Dark Mode'}
                iconOn="☀️"
                iconOff="🌙"
                pressed={isDarkTheme}
                onToggle={toggleTheme}
                tone="neutral"
              />
            )}
          </div>
          {meta && <p className={`text-xs font-medium ${subtitleClass}`}>{meta}</p>}
        </div>
      </div>
    </header>
  );
}
