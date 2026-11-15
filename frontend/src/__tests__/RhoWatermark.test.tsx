import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import RhoWatermark from '../components/RhoWatermark';

describe('RhoWatermark', () => {
  it('menampilkan logo Rho + nama', () => {
    render(<RhoWatermark />);
    expect(screen.getByText('RHO')).toBeTruthy();
    expect(screen.getByText('Rholly Kurnia Putra')).toBeTruthy();
  });
});
