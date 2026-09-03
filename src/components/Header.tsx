import { Languages, Github } from 'lucide-react';

export function Header() {
  return (
    <header className="sticky top-0 z-40 border-b border-neutral-800 bg-neutral-950/80 backdrop-blur-xl">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3.5 sm:px-6 lg:px-8">
        <div className="flex items-center gap-3">
          <div className="relative flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-primary-500 to-primary-700 shadow-lg shadow-primary-900/40">
            <Languages className="h-5 w-5 text-white" />
          </div>
          <div>
            <h1 className="text-lg font-semibold tracking-tight text-neutral-50">VoxLip</h1>
            <p className="text-xs text-neutral-400">AI Video Translation & Voice Replacement</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="hidden items-center gap-1.5 rounded-full border border-neutral-800 bg-neutral-900 px-3 py-1.5 text-xs font-medium text-neutral-300 sm:flex">
            <span className="h-1.5 w-1.5 rounded-full bg-success-400 animate-pulse" />
            AI Engine Ready
          </span>
          <a
            href="https://github.com"
            target="_blank"
            rel="noopener noreferrer"
            className="flex h-9 w-9 items-center justify-center rounded-xl border border-neutral-800 bg-neutral-900 text-neutral-400 transition-colors hover:text-neutral-100 hover:bg-neutral-800"
            aria-label="Source code"
          >
            <Github className="h-4.5 w-4.5" />
          </a>
        </div>
      </div>
    </header>
  );
}
