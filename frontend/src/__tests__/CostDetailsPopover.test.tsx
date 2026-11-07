import { describe, it, expect } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { CostDetailsPopover } from '../components/CostDetailsPopover';
import type { TokenUsage } from '../types';

const usage: TokenUsage = { promptTokens: 4000, completionTokens: 1000 };

describe('CostDetailsPopover', () => {
  it('renders nothing without a model', () => {
    const { container } = render(<CostDetailsPopover />);
    expect(container.querySelector('button')).toBeNull();
  });

  it('shows the known per-1K rates for a listed model', () => {
    render(<CostDetailsPopover model="claude-sonnet" />);
    fireEvent.click(screen.getByRole('button', { name: 'Perincian perkiraan biaya' }));
    expect(screen.getByText(/\$0\.0030 \/ 1K token/)).toBeInTheDocument();
    expect(screen.getByText(/\$0\.0150 \/ 1K token/)).toBeInTheDocument();
    expect(screen.getByText(/Tarif dari tabel model/)).toBeInTheDocument();
  });

  it('labels the conservative fallback for unknown models', () => {
    render(<CostDetailsPopover model="some/unknown-model" usage={usage} />);
    fireEvent.click(screen.getByRole('button', { name: 'Perincian perkiraan biaya' }));
    expect(screen.getByText(/Tarif konservatif untuk model tak dikenal/)).toBeInTheDocument();
  });

  it('labels free-tier endpoints and reports zero cost', () => {
    render(<CostDetailsPopover model="nvidia/nemotron-3.5-lightning:free" usage={usage} />);
    fireEvent.click(screen.getByRole('button', { name: 'Perincian perkiraan biaya' }));
    expect(screen.getByText(/Tier gratis/)).toBeInTheDocument();
    expect(screen.getByText('$0')).toBeInTheDocument();
  });

  it('shows the session cost when usage is present', () => {
    render(<CostDetailsPopover model="claude-sonnet" usage={usage} />);
    fireEvent.click(screen.getByRole('button', { name: 'Perincian perkiraan biaya' }));
    // 4*0.003 + 1*0.015 = $0.027
    expect(screen.getByText('$0.03')).toBeInTheDocument();
  });

  it('closes on Escape', () => {
    render(<CostDetailsPopover model="hermes" />);
    fireEvent.click(screen.getByRole('button', { name: 'Perincian perkiraan biaya' }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('toggles aria-expanded with open state', () => {
    render(<CostDetailsPopover model="hermes" />);
    const trigger = screen.getByRole('button', { name: 'Perincian perkiraan biaya' });
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(trigger);
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
  });
});
