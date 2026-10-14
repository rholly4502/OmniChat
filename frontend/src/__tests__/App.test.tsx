import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import App from '../App';
import { CodeBlock } from '../App';

/**
 * Frontend component tests for the OmniChat App.
 *
 * These tests verify the core UI behaviours: rendering, mode toggle,
 * model catalog fetching with fallback, API key persistence, and
 * input/send button interactions. fetch is mocked globally so no
 * real network calls are made.
 */

// Default mock model catalog returned by /api/models
const MOCK_CATALOG = {
  agent: [{ id: 'test-agent', label: 'Test Agent Model' }],
  direct: [{ id: 'test-direct', label: 'Test Direct Model' }],
};

/**
 * Configure the global fetch mock. Each call returns a response shaped
 * like a fetch Response so the App code can call .ok, .json(), etc.
 */
function setupFetchMock(opts?: {
  modelsOk?: boolean;
  modelsData?: unknown;
}) {
  const fetchMock = vi.fn().mockImplementation((url: string | URL) => {
    const urlStr = String(url);
    if (urlStr.includes('/api/models')) {
      if (opts?.modelsOk === false) {
        return Promise.resolve({
          ok: false,
          status: 401,
          json: () => Promise.resolve({}),
        });
      }
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve(opts?.modelsData ?? MOCK_CATALOG),
      });
    }
    // /api/chat/stream or any other endpoint — return 401 by default
    return Promise.resolve({
      ok: false,
      status: 401,
      headers: new Headers(),
      body: null,
    });
  });
  global.fetch = fetchMock as unknown as typeof fetch;
  return fetchMock;
}

describe('App', () => {
  beforeEach(() => {
    localStorage.clear();
    setupFetchMock();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  // ─── Rendering ───────────────────────────────────────────────

  it('renders the OmniChat title', () => {
    render(<App />);
    // OmniChat appears in both the sidebar <h1> and the mobile top bar <span>
    const titles = screen.getAllByText('OmniChat');
    expect(titles.length).toBeGreaterThanOrEqual(1);
    expect(titles[0]).toBeInTheDocument();
  });

  it('renders the subtitle', () => {
    render(<App />);
    expect(screen.getByText(/Hybrid AI Dashboard/)).toBeInTheDocument();
  });

  it('shows Agent Mode by default', () => {
    render(<App />);
    expect(screen.getByText(/Agent Mode/)).toBeInTheDocument();
  });

  it('shows the model selector', () => {
    render(<App />);
    expect(screen.getByRole('combobox')).toBeInTheDocument();
  });

  it('shows the API Key input', () => {
    render(<App />);
    // The API key input has type="password"
    const passwordInput = screen.getByPlaceholderText('(kosong = tanpa auth)');
    expect(passwordInput).toBeInTheDocument();
    expect(passwordInput).toHaveAttribute('type', 'password');
  });

  // ─── Model Catalog ───────────────────────────────────────────

  it('fetches /api/models on mount', () => {
    const fetchMock = setupFetchMock();
    render(<App />);
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/models',
      expect.objectContaining({})
    );
  });

  it('sends X-Api-Key header when API key is set', async () => {
    localStorage.setItem('omnichat_api_key', 'secret-key-123');
    const fetchMock = setupFetchMock();
    render(<App />);
    // The /api/models fetch should include the X-Api-Key header
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/models',
        expect.objectContaining({
          headers: { 'X-Api-Key': 'secret-key-123' },
        })
      );
    });
  });

  it('falls back to built-in defaults when /api/models fails', async () => {
    setupFetchMock({ modelsOk: false });
    render(<App />);
    // Default agent models should be shown (from DEFAULT_AGENT_MODELS)
    await waitFor(() => {
      expect(screen.getByText('Hermes (Default)')).toBeInTheDocument();
    });
  });

  it('falls back to built-in defaults when fetch rejects', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('Network error')) as unknown as typeof fetch;
    render(<App />);
    await waitFor(() => {
      expect(screen.getByText('Hermes (Default)')).toBeInTheDocument();
      expect(screen.getByText('Claude Sonnet')).toBeInTheDocument();
    });
  });

  it('loads custom models from /api/models response', async () => {
    setupFetchMock({
      modelsData: {
        agent: [{ id: 'custom-agent', label: 'Custom Agent Model' }],
        direct: [{ id: 'custom-direct', label: 'Custom Direct Model' }],
      },
    });
    render(<App />);
    // After the fetch resolves, the custom model should appear in the selector
    await waitFor(() => {
      expect(screen.getByText('Custom Agent Model')).toBeInTheDocument();
    });
  });

  // ─── Mode Toggle ─────────────────────────────────────────────

  it('toggles to Direct Mode when checkbox is clicked', async () => {
    // Use default models (fetch rejects → built-in defaults)
    global.fetch = vi.fn().mockRejectedValue(new Error('Network')) as unknown as typeof fetch;
    render(<App />);

    // Default is Agent Mode
    expect(screen.getByText(/Agent Mode/)).toBeInTheDocument();

    // Click the checkbox to toggle
    const checkbox = screen.getByRole('checkbox');
    fireEvent.click(checkbox);

    // Should now show Direct Mode
    expect(screen.getByText(/Direct Mode/)).toBeInTheDocument();
    // Direct models should now be in the selector
    expect(screen.getByText('Nemotron 3.5 (Free)')).toBeInTheDocument();
  });

  it('switches model when toggling modes', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('Network')) as unknown as typeof fetch;
    render(<App />);

    // Default model is 'hermes' (first agent model)
    const select = screen.getByRole('combobox') as HTMLSelectElement;
    expect(select.value).toBe('hermes');

    // Toggle to Direct Mode
    fireEvent.click(screen.getByRole('checkbox'));

    // Model should switch to first direct model
    expect(select.value).toBe('nvidia/nemotron-3.5-lightning:free');
  });

  // ─── API Key Persistence ─────────────────────────────────────

  it('persists API key to localStorage on change', () => {
    render(<App />);
    const input = screen.getByPlaceholderText('(kosong = tanpa auth)');
    fireEvent.change(input, { target: { value: 'my-api-key' } });
    expect(localStorage.getItem('omnichat_api_key')).toBe('my-api-key');
  });

  it('removes API key from localStorage when cleared', () => {
    localStorage.setItem('omnichat_api_key', 'existing-key');
    render(<App />);
    const input = screen.getByPlaceholderText('(kosong = tanpa auth)') as HTMLInputElement;
    expect(input.value).toBe('existing-key');

    // Clear the input
    fireEvent.change(input, { target: { value: '' } });
    expect(localStorage.getItem('omnichat_api_key')).toBeNull();
  });

  it('shows locked indicator when API key is set', () => {
    localStorage.setItem('omnichat_api_key', 'some-key');
    render(<App />);
    expect(screen.getByTestId('lock-icon')).toBeInTheDocument();
  });

  it('shows unlocked indicator when API key is empty', () => {
    render(<App />);
    expect(screen.getByTestId('unlock-icon')).toBeInTheDocument();
  });

  // ─── Send Button & Input ─────────────────────────────────────

  it('chat input has aria-label for accessibility', () => {
    render(<App />);
    const input = screen.getByLabelText('Ketik pesan');
    expect(input).toBeInTheDocument();
  });

  it('disables send button when input is empty', () => {
    render(<App />);
    const sendButton = screen.getByText('Kirim');
    expect(sendButton).toBeDisabled();
  });

  it('enables send button when input has text', () => {
    render(<App />);
    const input = screen.getByPlaceholderText('Ketik pesan…');
    fireEvent.change(input, { target: { value: 'Hello' } });
    expect(screen.getByText('Kirim')).toBeEnabled();
  });

  it('clears input after sending a message', async () => {
    render(<App />);
    const input = screen.getByPlaceholderText('Ketik pesan…') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'Hello world' } });
    fireEvent.click(screen.getByText('Kirim'));
    // Input should be cleared after sending
    await waitFor(() => {
      expect(input.value).toBe('');
    });
  });

  it('shows the user message after sending', async () => {
    render(<App />);
    const input = screen.getByPlaceholderText('Ketik pesan…');
    fireEvent.change(input, { target: { value: 'Test message' } });
    fireEvent.click(screen.getByText('Kirim'));
    // The user message should appear in the chat
    await waitFor(() => {
      expect(screen.getByText('Test message')).toBeInTheDocument();
    });
  });

  it('shows stop button while streaming', async () => {
    render(<App />);
    const input = screen.getByPlaceholderText('Ketik pesan…');
    fireEvent.change(input, { target: { value: 'Hello' } });
    fireEvent.click(screen.getByText('Kirim'));
    // While streaming, the stop button should appear
    await waitFor(() => {
      expect(screen.getByText('Stop')).toBeInTheDocument();
    });
  });

  // ─── Clear Chat ──────────────────────────────────────────────

  it('shows empty state message when no messages', () => {
    render(<App />);
    expect(screen.getByText(/Mulai chat/)).toBeInTheDocument();
  });

  it('clears messages when Clear chat button is clicked', async () => {
    render(<App />);
    // Send a message first
    const input = screen.getByPlaceholderText('Ketik pesan…');
    fireEvent.change(input, { target: { value: 'Hello' } });
    fireEvent.click(screen.getByText('Kirim'));

    // Wait for the message to appear
    await waitFor(() => {
      expect(screen.getByText('Hello')).toBeInTheDocument();
    });

    // Click clear chat
    fireEvent.click(screen.getByText(/Clear chat/));

    // Messages should be cleared — empty state should reappear
    await waitFor(() => {
      expect(screen.getByText(/Mulai chat/)).toBeInTheDocument();
    });
  });

  // ─── Sidebar Drawer (Mobile) ─────────────────────────────────

  it('locks body scroll when sidebar is opened', () => {
    render(<App />);
    // Body overflow should be empty by default
    expect(document.body.style.overflow).toBe('');
    // Open the sidebar via the hamburger menu button
    fireEvent.click(screen.getByLabelText('Open menu'));
    // Body scroll should now be locked
    expect(document.body.style.overflow).toBe('hidden');
  });

  it('restores body scroll when sidebar is closed', () => {
    render(<App />);
    // Open the sidebar
    fireEvent.click(screen.getByLabelText('Open menu'));
    expect(document.body.style.overflow).toBe('hidden');
    // Close the sidebar via the close button
    fireEvent.click(screen.getByLabelText('Close sidebar'));
    // Body scroll should be restored
    expect(document.body.style.overflow).toBe('');
  });

  it('renders the sidebar with dialog role when open', () => {
    render(<App />);
    // Open the sidebar
    fireEvent.click(screen.getByLabelText('Open menu'));
    // Sidebar should have role="dialog" and aria-modal="true"
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog).toHaveAttribute('aria-label', 'Chat settings');
  });

  // ─── ARIA State & Focus Management ──────────────────────────

  it('menu button has aria-expanded=false when sidebar is closed', () => {
    render(<App />);
    const menuBtn = screen.getByLabelText('Open menu');
    expect(menuBtn).toHaveAttribute('aria-expanded', 'false');
  });

  it('menu button has aria-expanded=true when sidebar is open', () => {
    render(<App />);
    fireEvent.click(screen.getByLabelText('Open menu'));
    const menuBtn = screen.getByLabelText('Open menu');
    expect(menuBtn).toHaveAttribute('aria-expanded', 'true');
  });

  it('menu button has aria-controls pointing to the sidebar', () => {
    render(<App />);
    const menuBtn = screen.getByLabelText('Open menu');
    expect(menuBtn).toHaveAttribute('aria-controls', 'chat-sidebar');
    // The sidebar should have the matching id
    const sidebar = document.getElementById('chat-sidebar');
    expect(sidebar).not.toBeNull();
  });

  it('moves focus to close button when sidebar opens', () => {
    render(<App />);
    const menuBtn = screen.getByLabelText('Open menu') as HTMLButtonElement;
    menuBtn.focus();
    expect(document.activeElement).toBe(menuBtn);
    // Open the sidebar
    fireEvent.click(menuBtn);
    // Focus should move to the close button
    const closeBtn = screen.getByLabelText('Close sidebar');
    expect(document.activeElement).toBe(closeBtn);
  });

  it('restores focus to menu button when sidebar closes', () => {
    render(<App />);
    const menuBtn = screen.getByLabelText('Open menu') as HTMLButtonElement;
    fireEvent.click(menuBtn);
    // Focus is now on the close button
    const closeBtn = screen.getByLabelText('Close sidebar');
    expect(document.activeElement).toBe(closeBtn);
    // Close the sidebar
    fireEvent.click(closeBtn);
    // Focus should be restored to the menu button
    expect(document.activeElement).toBe(menuBtn);
  });

  it('messages container has aria-label', () => {
    render(<App />);
    const liveRegion = screen.getByLabelText('Chat messages');
    expect(liveRegion).toHaveAttribute('aria-live', 'polite');
  });

  // ─── CodeBlock (Copy Button) ────────────────────────────────

  it('CodeBlock renders a copy button with correct aria-label', () => {
    render(<CodeBlock>const x = 42;</CodeBlock>);
    const btn = screen.getByRole('button', { name: 'Copy code to clipboard' });
    expect(btn).toBeInTheDocument();
  });

  it('CodeBlock renders a pre element with the code content', () => {
    const { container } = render(<CodeBlock>{'console.log("hello")'}</CodeBlock>);
    const pre = container.querySelector('pre');
    expect(pre).toBeInTheDocument();
    expect(pre?.textContent).toBe('console.log("hello")');
  });

  it('copies code to clipboard when button is clicked', async () => {
    const writeTextSpy = vi.fn().mockResolvedValue(undefined);
    navigator.clipboard.writeText = writeTextSpy;

    render(<CodeBlock>{'const answer = 42;'}</CodeBlock>);
    const btn = screen.getByRole('button', { name: 'Copy code to clipboard' });
    fireEvent.click(btn);

    await waitFor(() => {
      expect(writeTextSpy).toHaveBeenCalledWith('const answer = 42;');
    });
  });

  it('shows "Copied" text after clicking copy button', async () => {
    navigator.clipboard.writeText = vi.fn().mockResolvedValue(undefined);

    render(<CodeBlock>{'npm run build'}</CodeBlock>);
    const btn = screen.getByRole('button', { name: 'Copy code to clipboard' });
    fireEvent.click(btn);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Code copied to clipboard' })).toBeInTheDocument();
    });
    expect(screen.getByText('Copied')).toBeInTheDocument();
  });

  it('CodeBlock button has focus-visible ring class for keyboard nav', () => {
    render(<CodeBlock>{'test'}</CodeBlock>);
    const btn = screen.getByRole('button', { name: 'Copy code to clipboard' });
    expect(btn.className).toContain('focus-visible:ring');
  });
});
