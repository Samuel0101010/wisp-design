// Slop fixture 12: purple-to-blue gradient in Tailwind arbitrary + inline
export function GradientHero() {
  return (
    <section>
      <div
        style={{
          background: 'linear-gradient(to right, #8b5cf6, #60a5fa)',
          padding: '64px 32px',
        }}
      >
        <h2>Start for free today</h2>
      </div>
      <style>{`
        .gradient-section {
          background: linear-gradient(135deg, #a855f7 0%, #1d4ed8 100%);
        }
      `}</style>
    </section>
  );
}
