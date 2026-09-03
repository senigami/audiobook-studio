import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { Layout } from '@/components/layout/Layout';
import { setBookIdentity } from '@/app/layout/bookIdentityStore';

function LocationProbe() {
  const location = useLocation();
  return <div data-testid="pathname">{location.pathname}</div>;
}

describe('BookIdentityLine', () => {
  afterEach(() => {
    act(() => {
      setBookIdentity(null);
    });
  });

  it('renders the book identity line on book routes and navigates to publish when clicked', async () => {
    act(() => {
      setBookIdentity({
        id: 'book-1',
        title: 'Book One',
        author: 'Ada Lovelace',
        series: 'Analytical Tales',
        coverUrl: '/covers/book-one.png',
        runtimeSeconds: 90,
        predictedSeconds: 150,
      });
    });

    render(
      <MemoryRouter initialEntries={['/book/book-1/manuscript']}>
        <LocationProbe />
        <Layout>
          <div>Book route content</div>
        </Layout>
      </MemoryRouter>,
    );

    const identity = screen.getByRole('button', { name: 'Book One book identity' });
    expect(identity).toHaveTextContent('Ada Lovelace');
    expect(identity).toHaveTextContent('Analytical Tales');
    expect(identity).toHaveTextContent('Runtime 1m 30s');
    expect(identity).toHaveTextContent('Predicted 2m 30s');
    expect(screen.getByRole('img', { name: 'Book One cover' })).toHaveAttribute('src', '/covers/book-one.png');

    fireEvent.click(identity);

    expect(await screen.findByTestId('pathname')).toHaveTextContent('/book/book-1/publish');
  });

  it('does not render outside book routes', () => {
    act(() => {
      setBookIdentity({
        id: 'book-1',
        title: 'Book One',
        author: null,
        series: null,
        coverUrl: null,
        runtimeSeconds: 0,
        predictedSeconds: null,
      });
    });

    render(
      <MemoryRouter initialEntries={['/voices']}>
        <Layout>
          <div>Voices route content</div>
        </Layout>
      </MemoryRouter>,
    );

    expect(screen.queryByRole('button', { name: /Book One/i })).toBeNull();
  });
});
