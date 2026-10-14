import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Footer from '../components/Footer';

describe('Footer component', () => {
  it('renders social links and contact info correctly', () => {
    render(
      <MemoryRouter>
        <Footer />
      </MemoryRouter>
    );

    expect(screen.getByRole('link', { name: /GitHub/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /LinkedIn/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Instagram/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Facebook/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 4, name: /Services/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 4, name: /Solutions/i })).toBeInTheDocument();
    expect(screen.getByText(/DHRUMIN TECH(NOTECH)? WORLD/i)).toBeInTheDocument();
  });

  it('shows the contact email without stray brackets and links it with a valid mailto', () => {
    render(
      <MemoryRouter>
        <Footer />
      </MemoryRouter>
    );

    const mail = screen.getByRole('link', { name: 'dhrumintechnotech@gmail.com' });
    expect(mail).toHaveAttribute('href', 'mailto:dhrumintechnotech@gmail.com');
    expect(mail.textContent).not.toMatch(/[[\]]/);
  });
});
