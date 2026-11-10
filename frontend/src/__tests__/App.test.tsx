import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
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
  conversations?: unknown[];
  forkResult?: unknown;
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
        status: 200,
        json: () => Promise.resolve(opts?.modelsData ?? MOCK_CATALOG),
      });
    }
    if (urlStr.includes('/fork')) {
      if (opts?.forkResult && opts?.forkResult !== undefined) {
        return Promise.resolve({ ok: true, status: 201, json: () => Promise.resolve(opts.forkResult) });
      }
    }
    if (urlStr.includes('/api/conversations')) {
      const idMatch = urlStr.match(/\/api\/conversations\/([0-9a-f-]+)$/);
      const rows = opts?.conversations ?? [];
      if (idMatch) {
        const conv = (rows as { id: string }[]).find((c) => c.id === idMatch[1]);
        if (conv) {
          return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(conv) });
        }
      }
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(rows) });
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
    // A stored key keeps the app unlocked so the dashboard tests exercise the
    // workspace rather than the login gate (the gate is tested on its own).
    localStorage.setItem('omnichat_api_key', 'test-key');
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
    expect(screen.getByRole('combobox', { name: /^Model$/ })).toBeInTheDocument();
  });

  it('restores a saved composer draft on load', () => {
    localStorage.setItem('omnichat_composer_draft_v1', 'pesan tersimpan');
    render(<App />);
    const textarea = screen.getByLabelText('Ketik pesan') as HTMLTextAreaElement;
    expect(textarea.value).toBe('pesan tersimpan');
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

  it('falls back to built-in defaults when the model catalog is empty', async () => {
    setupFetchMock({ modelsData: { agent: [], direct: [] } });
    render(<App />);
    // Default agent models should be shown (from DEFAULT_AGENT_MODELS)
    await waitFor(() => {
      expect(
        within(screen.getByRole('combobox', { name: /^Model$/ })).getByText('Hermes (Default)'),
      ).toBeInTheDocument();
    });
  });

  it('falls back to built-in defaults when fetch rejects', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('Network error')) as unknown as typeof fetch;
    render(<App />);
    await waitFor(() => {
      expect(
        within(screen.getByRole('combobox', { name: /^Model$/ })).getByText('Hermes (Default)'),
      ).toBeInTheDocument();
      expect(
        within(screen.getByRole('combobox', { name: /^Model$/ })).getByText('Claude Sonnet'),
      ).toBeInTheDocument();
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
      expect(
        within(screen.getByRole('combobox', { name: /^Model$/ })).getByText('Custom Agent Model'),
      ).toBeInTheDocument();
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
    const checkbox = screen.getByRole('checkbox', { name: 'Mode Agen' });
    fireEvent.click(checkbox);

    // Should now show Direct Mode
    expect(screen.getByText(/Direct Mode/)).toBeInTheDocument();
    // Direct models should now be in the selector
    expect(within(screen.getByRole('combobox', { name: /^Model$/ })).getByText('Nemotron 3.5 (Free)')).toBeInTheDocument();
  });

  it('switches model when toggling modes', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('Network')) as unknown as typeof fetch;
    render(<App />);

    // Default model is 'hermes' (first agent model)
    const select = screen.getByRole('combobox', { name: /^Model$/ }) as HTMLSelectElement;
    expect(select.value).toBe('hermes');

    // Toggle to Direct Mode
    fireEvent.click(screen.getByRole('checkbox', { name: 'Mode Agen' }));

    // Model should switch to first direct model
    expect(select.value).toBe('nvidia/nemotron-3.5-lightning:free');
  });

  it('applies the night-mode palette when Mode Malam is toggled', () => {
    const { container } = render(<App />);
    expect(container.firstChild as HTMLElement).not.toHaveClass('night-mode');
    fireEvent.click(screen.getByLabelText('Mode malam'));
    expect(container.firstChild as HTMLElement).toHaveClass('night-mode');
    const stored = JSON.parse(localStorage.getItem('omnichat_settings_v1') || '{}');
    expect(stored.nightMode).toBe(true);
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

  it('locks to the login screen when no API key is stored', () => {
    localStorage.removeItem('omnichat_api_key');
    render(<App />);
    expect(screen.getByText('OmniChat')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Masuk' })).toBeInTheDocument();
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
    // Scope to the transcript: the sidebar also lists sessions, and a session's
    // title is derived from its first user message, so the raw text now legitimately
    // appears in two places.
    await waitFor(() => {
      const transcript = within(screen.getByLabelText('Chat messages'));
      expect(transcript.getByText('Test message')).toBeInTheDocument();
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

  it('typing indicator has accessible label during streaming', async () => {
    // Make fetch hang so streaming state persists
    global.fetch = vi.fn().mockImplementation(() => new Promise(() => {}));
    render(<App />);
    const input = screen.getByPlaceholderText('Ketik pesan…');
    fireEvent.change(input, { target: { value: 'Hello' } });
    fireEvent.click(screen.getByText('Kirim'));
    // The typing indicator should have role="status" and aria-label
    await waitFor(() => {
      const status = screen.getByRole('status');
      // Fetch hangs in this test, so the catalog falls back to the engine agent
      // defaults and the selected model resolves to 'Hermes (Default)'.
      expect(status).toHaveAttribute('aria-label', 'Menunggu respons · Hermes (Default)');
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

    // Wait for the message to appear (transcript only -- the sidebar session
    // list repeats the title, which is derived from this first message)
    await waitFor(() => {
      const transcript = within(screen.getByLabelText('Chat messages'));
      expect(transcript.getByText('Hello')).toBeInTheDocument();
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

  // ─── Swipe Gesture (Mobile Sidebar) ──────────────────────────

  it('opens sidebar on rightward edge swipe', () => {
    render(<App />);
    const sidebar = document.getElementById('chat-sidebar');
    expect(sidebar?.className).toContain('-translate-x-full');

    // Simulate rightward swipe from left edge (clientX=5 → clientX=200)
    const root = document.querySelector('.flex.h-dvh') as HTMLElement;
    fireEvent.touchStart(root, { touches: [{ clientX: 5, clientY: 300 }] });
    fireEvent.touchMove(root, { touches: [{ clientX: 200, clientY: 300 }] });
    fireEvent.touchEnd(root);

    expect(sidebar?.className).toContain('translate-x-0');
  });

  it('closes sidebar on leftward swipe when open', () => {
    render(<App />);
    // Open sidebar first via button
    fireEvent.click(screen.getByLabelText('Open menu'));
    const sidebar = document.getElementById('chat-sidebar');
    expect(sidebar?.className).toContain('translate-x-0');

    // Simulate leftward swipe (clientX=200 → clientX=20)
    const root = document.querySelector('.flex.h-dvh') as HTMLElement;
    fireEvent.touchStart(root, { touches: [{ clientX: 200, clientY: 300 }] });
    fireEvent.touchMove(root, { touches: [{ clientX: 20, clientY: 300 }] });
    fireEvent.touchEnd(root);

    expect(sidebar?.className).toContain('-translate-x-full');
  });

  it('does not open sidebar on swipe from non-edge position', () => {
    render(<App />);
    const sidebar = document.getElementById('chat-sidebar');
    expect(sidebar?.className).toContain('-translate-x-full');

    // Swipe right but starting from center (not left edge)
    const root = document.querySelector('.flex.h-dvh') as HTMLElement;
    fireEvent.touchStart(root, { touches: [{ clientX: 150, clientY: 300 }] });
    fireEvent.touchMove(root, { touches: [{ clientX: 300, clientY: 300 }] });
    fireEvent.touchEnd(root);

    // Sidebar should remain closed
    expect(sidebar?.className).toContain('-translate-x-full');
  });

  it('does not trigger swipe on vertical scroll gesture', () => {
    render(<App />);
    // Open sidebar first
    fireEvent.click(screen.getByLabelText('Open menu'));
    const sidebar = document.getElementById('chat-sidebar');
    expect(sidebar?.className).toContain('translate-x-0');

    // Simulate primarily vertical movement (should not close)
    const root = document.querySelector('.flex.h-dvh') as HTMLElement;
    fireEvent.touchStart(root, { touches: [{ clientX: 100, clientY: 100 }] });
    fireEvent.touchMove(root, { touches: [{ clientX: 105, clientY: 400 }] });
    fireEvent.touchEnd(root);

    // Sidebar should remain open
    expect(sidebar?.className).toContain('translate-x-0');
  });

  // ─── Guest mode ───────────────────────────────────────────

  it('guest entry shows a sidebarless workspace with a logout button', async () => {
    localStorage.removeItem('omnichat_api_key');
    setupFetchMock();
    render(<App />);

    // Login screen → guest entry
    fireEvent.click(screen.getByRole('button', { name: 'Lanjut sebagai tamu' }));

    // Guest workspace: logout present, hamburger/sidebar absent
    expect(screen.getByRole('button', { name: 'Keluar' })).toBeInTheDocument();
    expect(screen.queryByLabelText('Open menu')).not.toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: /^Model$/ })).not.toBeInTheDocument();
  });

  it('guest workspace never offers the agent mode toggle', () => {
    localStorage.removeItem('omnichat_api_key');
    setupFetchMock();
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'Lanjut sebagai tamu' }));
    expect(screen.getByText(/Guest · Direct/)).toBeInTheDocument();
  });

  it('resumes a conversation with the model that conversation last used', async () => {
    const conv = {
      id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      title: 'Deploy',
      mode: 'agent',
      model: 'test-agent',
      createdAt: '2026-10-25T09:00:00+00:00',
      updatedAt: '2026-10-25T10:00:00+00:00',
      isPinned: false,
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
      messages: [{ id: 'm1', role: 'user', content: 'halo', createdAt: '2026-10-25T09:00:00+00:00' }],
    };
    setupFetchMock({ conversations: [conv] });
    render(<App />);

    await screen.findByText('Deploy');
    fireEvent.click(screen.getByRole('button', { name: 'Deploy' }));

    const select = (await screen.findByRole('combobox', { name: /^Model$/ })) as HTMLSelectElement;
    expect(select.value).toBe('test-agent');
  });

  it('fork seeds the live usage counter with the inherited transcript cost', async () => {
    const conv = {
      id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      title: 'Deploy',
      mode: 'agent',
      model: 'test-agent',
      createdAt: '2026-10-25T09:00:00+00:00',
      updatedAt: '2026-10-25T10:00:00+00:00',
      isPinned: false,
      promptTokens: 40,
      completionTokens: 20,
      totalTokens: 60,
      messages: [
        { id: 'm1', role: 'user', content: 'halo', createdAt: '2026-10-25T09:00:00+00:00' },
        { id: 'm2', role: 'assistant', content: 'hai', promptTokens: 40, completionTokens: 20, model: 'test-agent', createdAt: '2026-10-25T09:01:00+00:00' },
      ],
    };
    const forked = {
      ...conv,
      id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
      title: 'Salinan dari Deploy',
      isPinned: false,
    };
    setupFetchMock({ conversations: [conv], forkResult: forked });
    render(<App />);

    // Open the conversation first so its transcript is cached (the fork button
    // only appears on server conversations that have messages).
    await screen.findByText('Deploy');
    fireEvent.click(screen.getByTitle('Deploy'));
    const forkBtn = await screen.findByLabelText('Duplikat Deploy');
    fireEvent.click(forkBtn);

    // A fork inherits the source transcript, so the live usage counter should be
    // seeded with the copied turns' per-message usage (40 + 20 = 60 tokens),
    // not reset to zero.
    await waitFor(() => {
      const labels = screen.getAllByLabelText(/Penggunaan token: /);
      expect(labels.some((el) => el.getAttribute('aria-label')!.includes('60 token'))).toBe(true);
    });
  });

});

describe('App focus mode', () => {
  // This describe sits outside the main 'App' describe, so it owns its own auth
  // setup: a stored key plus a /api/models that resolves 200 keeps the workspace
  // unlocked (validateApiKey probes that endpoint).
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem('omnichat_api_key', 'test-key');
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/api/models')) {
        return new Response(JSON.stringify(MOCK_CATALOG), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      if (url.includes('/api/conversations/usage')) {
        return new Response(JSON.stringify({ totalPromptTokens: 0, totalCompletionTokens: 0, totalTokens: 0, conversationCount: 0, totalUpFeedback: 0, totalDownFeedback: 0, byModel: {} }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      if (url.includes('/api/conversations')) {
        return new Response(JSON.stringify([]), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      return new Response(JSON.stringify({}), { status: 200, headers: { 'Content-Type': 'application/json' } });
    });
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  it('applies the focus-mode surface when Mode Fokus is toggled', () => {
    const { container } = render(<App />);
    const root = container.firstChild as HTMLElement;
    expect(root).not.toHaveClass('focus-mode');
    fireEvent.click(screen.getByLabelText('Mode fokus'));
    expect(root).toHaveClass('focus-mode');
    const stored = JSON.parse(localStorage.getItem('omnichat_settings_v1') || '{}');
    expect(stored.focusMode).toBe(true);
  });

  it('applies focus-mode independently of night mode', () => {
    const { container } = render(<App />);
    fireEvent.click(screen.getByLabelText('Mode fokus'));
    fireEvent.click(screen.getByLabelText('Mode malam'));
    const root = container.firstChild as HTMLElement;
    expect(root).toHaveClass('focus-mode');
    expect(root).toHaveClass('night-mode');
  });
});

describe('App keyboard shortcuts', () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem('omnichat_api_key', 'test-key');
    setupFetchMock();
  });

  function fireWindowKey(init: KeyboardEventInit) {
    window.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init }));
  }

  it('Ctrl+Shift+F opens the in-transcript search toolbar', async () => {
    render(<App />);
    expect(screen.queryByLabelText('Cari pesan')).not.toBeInTheDocument();
    fireWindowKey({ key: 'F', ctrlKey: true, shiftKey: true });
    await waitFor(() => {
      expect(screen.getByLabelText('Cari pesan')).toBeInTheDocument();
    });
  });

  it('"/" focuses the composer textarea', async () => {
    render(<App />);
    const composer = screen.getByLabelText('Ketik pesan') as HTMLTextAreaElement;
    expect(document.activeElement).not.toBe(composer);
    fireWindowKey({ key: '/' });
    await waitFor(() => {
      expect(document.activeElement).toBe(composer);
    });
  });

  it('Ctrl+K focuses the composer textarea', async () => {
    render(<App />);
    const composer = screen.getByLabelText('Ketik pesan') as HTMLTextAreaElement;
    fireWindowKey({ key: 'k', ctrlKey: true });
    await waitFor(() => {
      expect(document.activeElement).toBe(composer);
    });
  });

  it('Ctrl+N starts a new session (returns to the empty transcript)', async () => {
    render(<App />);
    // Seed a transcript by sending a message (fetch mocks return 401, so the
    // turn completes with an error assistant bubble next to the user turn).
    const composer = screen.getByLabelText('Ketik pesan') as HTMLTextAreaElement;
    const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')!.set!;
    setter.call(composer, 'halo');
    composer.dispatchEvent(new Event('input', { bubbles: true }));
    fireEvent.click(screen.getByRole('button', { name: 'Kirim' }));
    // Wait for the stream to be fully settled: the Send button reappearing
    // (it swaps to Stop while streaming) means `streaming` is false, so the
    // new-session handler is no longer gated by the in-flight guard.
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Kirim' })).toBeInTheDocument();
    });
    fireWindowKey({ key: 'n', ctrlKey: true });
    // New session resets to the empty transcript: no message bubbles remain.
    await waitFor(() => {
      expect(document.querySelector('[data-msg-index]')).toBeNull();
    });
  });
});
