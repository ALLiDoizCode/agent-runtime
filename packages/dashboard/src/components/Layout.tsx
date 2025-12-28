import { Outlet } from 'react-router-dom';
import packageJson from '../../package.json';

function Layout(): JSX.Element {
  return (
    <div className="min-h-screen flex flex-col">
      <header className="bg-gray-800 text-white py-4 px-6 shadow-lg">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <h1 className="text-2xl font-bold">ILP Network Visualizer</h1>
          <span className="text-sm text-gray-400">v{packageJson.version}</span>
        </div>
      </header>
      <main className="flex-1 max-w-7xl mx-auto w-full px-6 py-8">
        <Outlet />
      </main>
    </div>
  );
}

export default Layout;
