import { render, screen } from '@testing-library/react';
import App from './App';

describe('App', () => {
  it('renders without crashing', () => {
    const { container } = render(<App />);
    expect(container).toBeInTheDocument();
  });

  it('displays correct page title in header', () => {
    render(<App />);
    expect(screen.getByRole('heading', { name: 'ILP Network Visualizer' })).toBeInTheDocument();
  });

  it('displays version number from package.json', () => {
    render(<App />);
    // Version should be v0.1.0 (from package.json)
    expect(screen.getByText(/v0\.1\.0/)).toBeInTheDocument();
  });

  it('displays welcome message on home page', () => {
    render(<App />);
    expect(screen.getByText(/Welcome to ILP Network Visualizer/i)).toBeInTheDocument();
  });
});
