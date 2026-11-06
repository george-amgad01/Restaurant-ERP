import { describe, expect, it } from 'vitest';
import {
  cn,
  daysAgoISO,
  initials,
  money,
  num,
  orderTypeLabel,
  statusLabel,
  statusTone,
} from './utils';

describe('formatting helpers', () => {
  it('formats money with the configured currency', () => {
    expect(money(1234.5, 'EGP')).toContain('1,234.50');
    expect(money(null, 'EGP')).toContain('0.00');
  });

  it('formats fixed precision numbers', () => {
    expect(num('12.345', 2)).toBe('12.35');
    expect(num(undefined)).toBe('0.00');
  });

  it('derives stable initials', () => {
    expect(initials('Ahmed Hassan')).toBe('AH');
    expect(initials('  ')).toBe('?');
    expect(initials(null)).toBe('?');
  });

  it('exposes the order and status labels used by the UI', () => {
    expect(orderTypeLabel.dine_in).toBe('Dine-in');
    expect(orderTypeLabel.delivery).toBe('Delivery');
    expect(statusLabel.completed).toBe('Completed');
    expect(statusTone.cancelled).toContain('rose');
  });

  it('returns an ISO date in the past', () => {
    const date = daysAgoISO(7);
    expect(date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(new Date(date).getTime()).toBeLessThan(Date.now());
  });

  it('merges conditional class names', () => {
    expect(cn('base', false && 'hidden', ['extra'])).toBe('base extra');
  });
});
