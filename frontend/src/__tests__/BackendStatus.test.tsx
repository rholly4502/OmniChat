import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { BackendStatus } from '../components/BackendStatus';

describe('BackendStatus', () => {
  it('renders the online state with an accessible label', () => {
    render(<BackendStatus status="online" />);
    expect(screen.getByLabelText('Backend terhubung')).toBeInTheDocument();
    expect(screen.getByText('Backend terhubung')).toBeInTheDocument();
  });

  it('renders the offline state', () => {
    render(<BackendStatus status="offline" />);
    expect(screen.getByLabelText('Backend tidak terjangkau')).toBeInTheDocument();
    expect(screen.getByText('Backend tidak terjangkau')).toBeInTheDocument();
  });

  it('renders the checking state', () => {
    render(<BackendStatus status="checking" />);
    expect(screen.getByLabelText('Memeriksa koneksi…')).toBeInTheDocument();
    expect(screen.getByText('Memeriksa koneksi…')).toBeInTheDocument();
  });
});
