import { describe, expect, it, vi } from 'vitest';
import { act, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderApp, stubApi, STORAGE_KEY } from './helpers.jsx';

const PHONE = '+447700900123';
const where = () => screen.getByTestId('where').textContent;

async function enterPhone(user, value = PHONE) {
  await user.type(screen.getByLabelText('Mobile number'), value);
  await user.click(screen.getByRole('button', { name: 'Send code' }));
}

describe('LoginPage mobile input hints', () => {
  it('asks phones for the phone keypad and SMS autofill on the code box', async () => {
    stubApi({ 'POST /auth/request-otp': [200, { ok: true, resendAfterSeconds: 30 }] });
    renderApp('/login');
    const phone = screen.getByLabelText('Mobile number');
    expect(phone).toHaveAttribute('type', 'tel');
    expect(phone).toHaveAttribute('inputmode', 'tel');
    expect(phone).toHaveAttribute('autocomplete', 'tel');
    await enterPhone(userEvent.setup());
    const code = await screen.findByLabelText('6-digit code');
    expect(code).toHaveAttribute('inputmode', 'numeric');
    expect(code).toHaveAttribute('autocomplete', 'one-time-code');
    expect(code).toHaveAttribute('pattern', '[0-9]*');
  });
});

describe('LoginPage phone step', () => {
  it('disables Send code until something is typed', async () => {
    stubApi({});
    renderApp('/login');
    expect(screen.getByRole('button', { name: 'Send code' })).toBeDisabled();
    await userEvent.type(screen.getByLabelText('Mobile number'), '+');
    expect(screen.getByRole('button', { name: 'Send code' })).toBeEnabled();
  });

  it('shows the server validation error and stays on the phone step', async () => {
    stubApi({
      'POST /auth/request-otp': [400, { error: 'Enter a mobile number in international format.' }],
    });
    renderApp('/login');
    await enterPhone(userEvent.setup(), '0770');
    expect(await screen.findByRole('alert')).toHaveTextContent('international format');
    expect(screen.queryByLabelText('6-digit code')).not.toBeInTheDocument();
  });

  it('moves to the code step after a successful request and sends the number as typed', async () => {
    const fetchMock = stubApi({
      'POST /auth/request-otp': [200, { ok: true, resendAfterSeconds: 30 }],
    });
    renderApp('/login');
    await enterPhone(userEvent.setup(), '+44 7700 900123');
    expect(await screen.findByLabelText('6-digit code')).toBeInTheDocument();
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ phone: '+44 7700 900123' });
  });

  it('shows a rate-limit error and starts the resend countdown from retryAfterSeconds', async () => {
    stubApi({
      'POST /auth/request-otp': [429, { error: 'Please wait 20 seconds.', retryAfterSeconds: 20 }],
    });
    renderApp('/login');
    await enterPhone(userEvent.setup());
    expect(await screen.findByRole('alert')).toHaveTextContent('Please wait 20 seconds.');
  });

  it('shows a friendly error when the server cannot be reached', async () => {
    stubApi({ 'POST /auth/request-otp': new TypeError('offline') });
    renderApp('/login');
    await enterPhone(userEvent.setup());
    expect(await screen.findByRole('alert')).toHaveTextContent('Cannot reach the server');
  });
});

describe('LoginPage code step', () => {
  async function toCodeStep(extra = {}) {
    const fetchMock = stubApi({
      'POST /auth/request-otp': [200, { ok: true, resendAfterSeconds: 30 }],
      ...extra,
    });
    const user = userEvent.setup();
    renderApp('/login');
    await enterPhone(user);
    await screen.findByLabelText('6-digit code');
    return { user, fetchMock };
  }

  it('keeps only digits and enables Sign in at exactly 6', async () => {
    const { user } = await toCodeStep();
    const input = screen.getByLabelText('6-digit code');
    await user.type(input, '12 ab-34');
    expect(input).toHaveValue('1234');
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeDisabled();
    await user.type(input, '567');
    expect(input).toHaveValue('123456'); // maxLength 6
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeEnabled();
  });

  it('signs in with the right code, stores the session and goes to the home page', async () => {
    const { user, fetchMock } = await toCodeStep({
      'POST /auth/verify-otp': [
        200,
        { token: 'abc', expiresAt: new Date(Date.now() + 1e6).toISOString() },
      ],
      'GET /auth/me': [200, { phone: PHONE, expiresAt: 'x' }],
    });
    await user.type(screen.getByLabelText('6-digit code'), '123456');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));
    await waitFor(() => expect(where()).toBe('/'));
    expect(await screen.findByText(PHONE)).toBeInTheDocument();
    const verify = fetchMock.mock.calls.find(([url]) => url === '/api/auth/verify-otp');
    expect(JSON.parse(verify[1].body)).toEqual({ phone: PHONE, code: '123456' });
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)).token).toBe('abc');
  });

  it('shows the wrong-code message, keeps the entered phone, and allows another try', async () => {
    const { user } = await toCodeStep({
      'POST /auth/verify-otp': [401, { error: 'Wrong code. 4 tries left.' }],
    });
    await user.type(screen.getByLabelText('6-digit code'), '000000');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Wrong code. 4 tries left.');
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeEnabled();
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it('shows the lockout message from the server', async () => {
    const { user } = await toCodeStep({
      'POST /auth/verify-otp': [429, { error: 'Too many wrong attempts. Request a new code.' }],
    });
    await user.type(screen.getByLabelText('6-digit code'), '000000');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Too many wrong attempts');
  });

  it('"Change number" returns to the phone step with the number kept', async () => {
    const { user } = await toCodeStep();
    await user.click(screen.getByRole('button', { name: 'Change number' }));
    expect(screen.getByLabelText('Mobile number')).toHaveValue(PHONE);
  });

  it('counts down the resend button, then allows a resend that clears the old code', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const fetchMock = stubApi({
      'POST /auth/request-otp': [200, { ok: true, resendAfterSeconds: 30 }],
    });
    renderApp('/login');
    await enterPhone(user);
    await user.type(await screen.findByLabelText('6-digit code'), '123');

    const resend = () => screen.getByRole('button', { name: /Resend code/ });
    expect(resend()).toHaveTextContent('Resend code in 30s');
    expect(resend()).toBeDisabled();

    // The countdown re-arms a 1s timer after each render, so advance one second at a time.
    const tick = async (seconds) => {
      for (let i = 0; i < seconds; i++) await act(() => vi.advanceTimersByTimeAsync(1000));
    };
    await tick(10);
    expect(resend()).toHaveTextContent('Resend code in 20s');

    await tick(20);
    expect(resend()).toHaveTextContent('Resend code');
    expect(resend()).toBeEnabled();

    await user.click(resend());
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(screen.getByLabelText('6-digit code')).toHaveValue('');
    expect(resend()).toBeDisabled();
  });
});
