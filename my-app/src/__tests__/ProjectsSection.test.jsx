import { describe, it, expect } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import ProjectsSection from '../components/ProjectsSection';
import projectsData from '../data/projects';

const sample = [
  {
    title: 'Alpha App',
    slug: 'alpha',
    category: 'Web App',
    description: 'Alpha introduction text.',
    stack: ['React', 'FastAPI'],
    url: 'https://alpha.example.com',
    github: 'https://github.com/Dhrumin245/alpha',
  },
  {
    title: 'Beta Tool',
    slug: 'beta',
    category: 'Automation',
    description: 'Beta introduction text.',
    stack: [],
    url: 'https://beta.example.com',
    github: 'https://github.com/Dhrumin245/beta',
  },
];

describe('ProjectsSection', () => {
  it('renders the Projects heading under the #projects anchor', () => {
    const { container } = render(<ProjectsSection projects={sample} />);
    expect(container.querySelector('section#projects')).toBeInTheDocument();
    expect(screen.getByText('Projects', { selector: '.section-kicker' })).toBeInTheDocument();
  });

  it('shows an introduction plus both buttons for every project', () => {
    render(<ProjectsSection projects={sample} />);
    const cards = screen.getAllByRole('article');
    expect(cards).toHaveLength(2);

    const alpha = within(cards[0]);
    expect(alpha.getByRole('heading', { level: 3, name: 'Alpha App' })).toBeInTheDocument();
    expect(alpha.getByText('Alpha introduction text.')).toBeInTheDocument();
    expect(alpha.getByText('React')).toBeInTheDocument();

    const view = alpha.getByRole('link', { name: 'View Project' });
    const gh = alpha.getByRole('link', { name: 'View on GitHub' });
    expect(view).toHaveAttribute('href', 'https://alpha.example.com/');
    expect(gh).toHaveAttribute('href', 'https://github.com/Dhrumin245/alpha');
  });

  it('opens both links in a new tab with noopener noreferrer (reverse-tabnabbing protection)', () => {
    render(<ProjectsSection projects={sample} />);
    for (const link of screen.getAllByRole('link')) {
      expect(link).toHaveAttribute('target', '_blank');
      expect(link.getAttribute('rel')).toMatch(/noopener/);
      expect(link.getAttribute('rel')).toMatch(/noreferrer/);
    }
  });

  it('does not make the whole card a link (no case-study page to open)', () => {
    render(<ProjectsSection projects={sample} />);
    for (const card of screen.getAllByRole('article')) {
      expect(card.tagName).toBe('ARTICLE');
      expect(card.closest('a')).toBeNull();
    }
  });

  it('never renders a dangerous URL as a link; shows a disabled button instead', () => {
    const evil = [{ ...sample[0], url: 'javascript:alert(document.cookie)', github: 'data:text/html,<script>alert(1)</script>' }];
    const { container } = render(<ProjectsSection projects={evil} />);
    expect(screen.queryAllByRole('link')).toHaveLength(0);
    expect(container.innerHTML).not.toMatch(/javascript:/i);
    expect(container.innerHTML).not.toMatch(/data:text\/html/i);
    const disabled = container.querySelectorAll('[aria-disabled="true"]');
    expect(disabled).toHaveLength(2);
  });

  it('escapes HTML in project text (no XSS through data)', () => {
    const xss = [{ ...sample[0], title: '<img src=x onerror=alert(1)>', description: '<script>alert(1)</script>', stack: ['<b>x</b>'] }];
    const { container } = render(<ProjectsSection projects={xss} />);
    expect(container.querySelector('img[onerror]')).toBeNull();
    expect(container.querySelector('script')).toBeNull();
    expect(container.querySelector('b')).toBeNull();
    expect(screen.getByText('<script>alert(1)</script>')).toBeInTheDocument();
  });

  it('is resilient to malformed data', () => {
    expect(() => render(<ProjectsSection projects={null} />)).not.toThrow();
    expect(() => render(<ProjectsSection projects={[{ title: 'Only title', stack: 'not-an-array' }]} />)).not.toThrow();
  });

  it('shows the default grid visual when no image is given', () => {
    const { container } = render(<ProjectsSection projects={sample} />);
    expect(container.querySelectorAll('.visual-grid')).toHaveLength(2);
  });

  it('ships a real default project list with valid https links', () => {
    expect(projectsData.length).toBeGreaterThan(0);
    for (const p of projectsData) {
      expect(p.title).toBeTruthy();
      expect(p.description).toBeTruthy();
      expect(p.url).toMatch(/^https:\/\//);
      expect(p.github).toMatch(/^https:\/\/github\.com\//);
    }
  });
});
