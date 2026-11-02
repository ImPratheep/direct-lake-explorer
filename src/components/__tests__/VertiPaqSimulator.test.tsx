import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import VertiPaqSimulator from '../VertiPaqSimulator';
import App from '../App';

describe('VertiPaqSimulator container navigation', () => {
  it('switches between the real Module 1 to 8 components', () => {
    render(<VertiPaqSimulator explanationMode="beginner" />);
    expect(screen.getByRole('heading', { name: 'Dictionary Encoding Explorer' })).toBeTruthy();

    fireEvent.click(screen.getByTitle('🔄 Value vs Hash Encoding'));
    expect(screen.getByRole('heading', { name: 'Value vs Hash Encoding Simulator' })).toBeTruthy();
    expect(screen.queryByText(/Value vs Hash Encoding Simulator - Coming Soon/)).toBeNull();

    fireEvent.click(screen.getByTitle('📊 Segment Explorer'));
    expect(screen.getByRole('heading', { name: 'Segment Explorer' })).toBeTruthy();
    expect(screen.queryByText(/Segment Explorer - Coming Soon/)).toBeNull();

    fireEvent.click(screen.getByTitle('🔍 Segment Elimination'));
    expect(screen.getByRole('heading', { name: 'Segment Elimination Simulator' })).toBeTruthy();
    expect(screen.queryByText(/Segment Elimination Simulator - Coming Soon/)).toBeNull();

    fireEvent.click(screen.getByTitle('📦 Column Compression'));
    expect(screen.getByRole('heading', { name: 'Column Compression Explorer' })).toBeTruthy();
    expect(screen.queryByText(/Column Compression Explorer - Coming Soon/)).toBeNull();

    fireEvent.click(screen.getByTitle('⬆️ Direct Lake Loading'));
    expect(screen.getByRole('heading', { name: 'Direct Lake Column Loading Simulator' })).toBeTruthy();
    expect(screen.queryByText(/Column Loading Simulator - Coming Soon/)).toBeNull();

    fireEvent.click(screen.getByTitle('💾 Memory Residency'));
    expect(screen.getByRole('heading', { name: 'Memory Residency and Eviction Simulator' })).toBeTruthy();
    expect(screen.queryByText(/Eviction Simulator - Coming Soon/)).toBeNull();

    fireEvent.click(screen.getByTitle('⚙️ Storage Engine Scan'));
    expect(screen.getByRole('heading', { name: 'Storage Engine Scan Simulator' })).toBeTruthy();
    expect(screen.queryByText(/Coming Soon/)).toBeNull();

    fireEvent.click(screen.getByTitle('📚 Dictionary Encoding'));
    expect(screen.getByRole('heading', { name: 'Dictionary Encoding Explorer' })).toBeTruthy();
  });

  it('leaves no module as a placeholder: every tab shows a real module', () => {
    render(<VertiPaqSimulator explanationMode="beginner" />);
    const tabs = Array.from(document.querySelectorAll<HTMLButtonElement>('.module-tab'));
    expect(tabs).toHaveLength(8);
    for (const tab of tabs) {
      fireEvent.click(tab);
      expect(screen.queryByText(/Coming Soon/)).toBeNull();
      expect(document.querySelector('.placeholder-module')).toBeNull();
      expect(document.querySelector('.dictionary-explorer h2')).toBeTruthy();
    }
  });

  it('shows the simulation disclaimer footer', () => {
    render(<VertiPaqSimulator explanationMode="beginner" />);
    expect(screen.getByText(/does not reproduce Microsoft's actual/)).toBeTruthy();
  });
});

describe('App integration (regression)', () => {
  it('still renders the Stage 4 Architecture Explorer by default', () => {
    render(<App />);
    expect(screen.getByTitle('VertiPaq Simulator')).toBeTruthy();
    expect(screen.getByText(/Click a component to view details/)).toBeTruthy();
  });

  it('navigates to the VertiPaq Simulator and on to Module 2', () => {
    render(<App />);
    fireEvent.click(screen.getByTitle('VertiPaq Simulator'));
    expect(screen.getByRole('heading', { name: 'VertiPaq Simulator' })).toBeTruthy();

    fireEvent.click(screen.getByTitle('🔄 Value vs Hash Encoding'));
    expect(screen.getByRole('heading', { name: 'Value vs Hash Encoding Simulator' })).toBeTruthy();
  });

  it('keeps the Stage 5 modules reachable', () => {
    render(<App />);
    fireEvent.click(screen.getByTitle('Schema Evolution Explorer'));
    expect(screen.queryByRole('heading', { name: 'VertiPaq Simulator' })).toBeNull();
  });
});
