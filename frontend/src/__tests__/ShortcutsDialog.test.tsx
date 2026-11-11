import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { ShortcutsDialog } from '../components/ShortcutsDialog';

function renderOpen(onClose = vi.fn()) {
  return render(<ShortcutsDialog open onClose={onClose} />);
}

describe('ShortcutsDialog', () => {
  it('renders nothing when closed', () => {
    const { container } = render(<ShortcutsDialog open={false} onClose={vi.fn()} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders the dialog with an accessible name and the shortcut rows', () => {
    renderOpen();
    expect(screen.getByRole('dialog', { name: 'Pintasan keyboard' })).toBeInTheDocument();
    expect(screen.getAllByText('Fokus kolom ketik').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('Cari di percakapan saat ini')).toBeInTheDocument();
    expect(screen.getByText('Buka chat baru')).toBeInTheDocument();
    expect(screen.getByText('Salin percakapan sebagai Markdown')).toBeInTheDocument();
    expect(screen.getByText('Ctrl + Alt + C')).toBeInTheDocument();
    expect(screen.getByText('Kirim pesan')).toBeInTheDocument();
    expect(screen.getByText(/\(admin\)/)).toBeInTheDocument();
    expect(screen.getAllByText('Ctrl + K').length).toBeGreaterThanOrEqual(1);
  });

  it('close button invokes onClose', () => {
    const onClose = vi.fn();
    renderOpen(onClose);
    fireEvent.click(screen.getByRole('button', { name: 'Tutup pintasan' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('Escape invokes onClose', () => {
    const onClose = vi.fn();
    renderOpen(onClose);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('backdrop click invokes onClose', () => {
    const onClose = vi.fn();
    renderOpen(onClose);
    const backdrop = document.body.querySelector('[role="presentation"]');
    expect(backdrop).not.toBeNull();
    fireEvent.click(backdrop as Element);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('focuses the close button when opened and locks body scroll, restoring on unmount', () => {
    const { unmount } = renderOpen();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Tutup pintasan' }));
    expect(document.body.style.overflow).toBe('hidden');
    unmount();
    expect(document.body.style.overflow).toBe('');
  });
});
