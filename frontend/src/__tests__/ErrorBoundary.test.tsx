import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ErrorBoundary } from '../components/ErrorBoundary';

/** A child that throws during render, to exercise the boundary. */
function Thrower() {
  throw new Error('graceful test boom');
}

/** A normal child that renders fine. */
function FineChild() {
  return <p>Konten normal</p>;
}

describe('ErrorBoundary', () => {
  const originalLocation = window.location;

  afterEach(() => {
    vi.restoreAllMocks();
    Object.defineProperty(window, 'location', {
      configurable: true,
      writable: true,
      value: originalLocation,
    });
  });

  it('renders its children unchanged when nothing throws', () => {
    render(
      <ErrorBoundary>
        <FineChild />
      </ErrorBoundary>,
    );
    expect(screen.getByText('Konten normal')).toBeInTheDocument();
  });

  it('renders the pixel fallback and the error detail when a child throws', () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    render(
      <ErrorBoundary>
        <Thrower />
      </ErrorBoundary>,
    );
    expect(screen.getByText('Ups, terjadi kesalahan')).toBeInTheDocument();
    expect(screen.getByText('Muat ulang')).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('graceful test boom');
    consoleSpy.mockRestore();
  });

  it('reloads the page when the reload action is triggered', () => {
    const reloadSpy = vi.fn();
    Object.defineProperty(window, 'location', {
      configurable: true,
      writable: true,
      value: { ...originalLocation, reload: reloadSpy },
    });
    render(
      <ErrorBoundary>
        <Thrower />
      </ErrorBoundary>,
    );
    fireEvent.click(screen.getByText('Muat ulang'));
    expect(reloadSpy).toHaveBeenCalledTimes(1);
  });
});
