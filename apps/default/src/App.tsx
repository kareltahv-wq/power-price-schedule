import { lazy } from 'react';
import { BrowserRouter, Route, Routes } from 'react-router-dom';

import { GenesisSection } from '@/lib/genesis';

/**
 * Pages are `React.lazy`-imported so one failed chunk cannot block the shell.
 * Add a sibling entry here for every new file in `src/pages/`.
 */
const HomePage = lazy(() => import('@/pages/HomePage'));

/**
 * The app shell: router, shared layout, and routes ONLY.
 *
 * Keep this file thin. Every page belongs in its own `src/pages/*.tsx` file,
 * registered here as one more `<Route>` - never grown inline in this component.
 * Wrap each route element in `<GenesisSection>` so a render-phase throw in one
 * page degrades to a localized card instead of white-screening the whole app.
 *
 * Do NOT mount a `ThemeProvider` here; `main.tsx` already provides one.
 */
export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route
          path="/"
          element={
            <GenesisSection name="Home">
              <HomePage />
            </GenesisSection>
          }
        />
      </Routes>
    </BrowserRouter>
  );
}
