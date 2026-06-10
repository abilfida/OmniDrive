import { describe, it, expect } from 'vitest';
import { validatePassword, validateWebhookUrl } from '../src/lib/validation';

describe('validatePassword', () => {
  it('rejects passwords shorter than 8 characters', () => {
    expect(validatePassword('Abc1')).toBe('Password must be at least 8 characters');
  });

  it('rejects passwords without uppercase letter', () => {
    expect(validatePassword('abcdefg1')).toBe('Password must contain an uppercase letter');
  });

  it('rejects passwords without lowercase letter', () => {
    expect(validatePassword('ABCDEFG1')).toBe('Password must contain a lowercase letter');
  });

  it('rejects passwords without number', () => {
    expect(validatePassword('Abcdefgh')).toBe('Password must contain a number');
  });

  it('accepts valid passwords', () => {
    expect(validatePassword('Abcdefg1')).toBeNull();
    expect(validatePassword('StrongP@ss1')).toBeNull();
  });
});

describe('validateWebhookUrl', () => {
  it('rejects non-HTTPS URLs', () => {
    expect(validateWebhookUrl('http://example.com/hook')).toBe('Webhook URL must use HTTPS');
  });

  it('rejects localhost', () => {
    expect(validateWebhookUrl('https://localhost/hook')).toBe('Webhook URL must not point to private/internal addresses');
  });

  it('rejects 127.0.0.1', () => {
    expect(validateWebhookUrl('https://127.0.0.1/hook')).toBe('Webhook URL must not point to private/internal addresses');
  });

  it('rejects cloud metadata IP', () => {
    expect(validateWebhookUrl('https://169.254.169.254/latest/meta-data')).toBe('Webhook URL must not point to private/internal addresses');
  });

  it('rejects private 10.x.x.x range', () => {
    expect(validateWebhookUrl('https://10.0.0.1/hook')).toBe('Webhook URL must not point to private/internal addresses');
  });

  it('rejects private 192.168.x.x range', () => {
    expect(validateWebhookUrl('https://192.168.1.1/hook')).toBe('Webhook URL must not point to private/internal addresses');
  });

  it('rejects private 172.16-31.x.x range', () => {
    expect(validateWebhookUrl('https://172.16.0.1/hook')).toBe('Webhook URL must not point to private/internal addresses');
    expect(validateWebhookUrl('https://172.31.255.255/hook')).toBe('Webhook URL must not point to private/internal addresses');
  });

  it('allows valid 172.x addresses outside private range', () => {
    expect(validateWebhookUrl('https://172.32.0.1/hook')).toBeNull();
  });

  it('rejects invalid URLs', () => {
    expect(validateWebhookUrl('not-a-url')).toBe('Invalid webhook URL');
  });

  it('accepts valid public HTTPS URLs', () => {
    expect(validateWebhookUrl('https://hooks.slack.com/services/xxx')).toBeNull();
    expect(validateWebhookUrl('https://example.com/webhook')).toBeNull();
  });
});
