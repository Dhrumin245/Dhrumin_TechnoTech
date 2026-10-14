import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import App from '../App';

vi.mock('../components/animations/Animations/SplashCursor/SplashCursor', () => ({
  default: () => null,
}));

const renderAt = (path) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>
  );

describe('Home page after case-study + admin removal', () => {
  beforeEach(() => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('no network in tests'));
  });

  it('shows the Projects section with View Project and View on GitHub buttons', () => {
    const { container } = renderAt('/');
    expect(container.querySelector('#projects')).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: 'View Project' }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('link', { name: 'View on GitHub' }).length).toBeGreaterThan(0);
  });

  it('has a Projects nav link pointing at #projects and no Work link', () => {
    renderAt('/');
    const nav = screen.getAllByRole('link', { name: 'Projects' });
    expect(nav.some((a) => a.getAttribute('href') === '#projects')).toBe(true);
    expect(screen.queryByRole('link', { name: 'Work' })).toBeNull();
  });

  it('contains no case-study content or links', () => {
    const { container } = renderAt('/');
    expect(container.querySelector('#work')).toBeNull();
    expect(container.querySelector('a[href^="/projects/"]')).toBeNull();
    expect(container.textContent).not.toMatch(/case study/i);
    expect(container.textContent).not.toMatch(/Project coming soon/i);
  });

  it('does not call the removed /api/projects endpoint', () => {
    renderAt('/');
    const urls = globalThis.fetch.mock.calls.map((c) => String(c[0]));
    expect(urls.some((u) => u.includes('/api/projects'))).toBe(false);
  });

  it.each(['/admin', '/admin/projects', '/projects/evomind', '/projects/coming-soon', '/projects/a/b/c', '/nope'])(
    '%s redirects to the home page (no admin or case-study routes exist)',
    (path) => {
      const { container } = renderAt(path);
      expect(container.querySelector('#projects')).toBeInTheDocument();
      expect(container.querySelector('input[type="password"]')).toBeNull();
    }
  );
});
