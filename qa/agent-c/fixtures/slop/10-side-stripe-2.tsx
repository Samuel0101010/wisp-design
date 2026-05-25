// Slop fixture 10: side-stripe via inline styles in TSX
export function FeatureCard({ title }: { title: string }) {
  return (
    <div style={{ position: 'relative', paddingLeft: '1rem' }}>
      <style>{`
        .stripe-card::before {
          content: '';
          position: absolute;
          left: 0;
          top: 0;
          width: 4px;
          height: 100%;
          background: linear-gradient(to bottom, purple, blue);
        }
      `}</style>
      <div className="stripe-card">
        <h3>{title}</h3>
      </div>
    </div>
  );
}
