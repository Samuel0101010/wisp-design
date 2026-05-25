// Slop fixture 05: glassmorphism via <style> block (CSS path, no JSX inline)
// JSX inline style objects use JS syntax (commas, camelCase, quoted values)
// which the extractor converts to kebab-CSS but leaves value quotes intact.
// The <style> block path is reliable for detecting backdrop-filter.
export function GlassCard({ children }: { children: React.ReactNode }) {
  return (
    <div className="glass-card">
      <style>{`
        .glass-card {
          backdrop-filter: blur(12px);
          background: rgba(255, 255, 255, 0.3);
          border: 1px solid rgba(255, 255, 255, 0.5);
          border-radius: 16px;
          padding: 24px;
        }
        .glass-modal {
          backdrop-filter: blur(8px);
          background: rgba(0, 0, 0, 0.25);
        }
      `}</style>
      {children}
    </div>
  );
}
