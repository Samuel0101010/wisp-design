// Slop fixture 07: hero metric template with large font + suffixed number
export function HeroMetric() {
  return (
    <section>
      <div style={{ fontFamily: 'sans-serif' }}>
        <style>{`
          .hero-number {
            font-size: 96px;
            font-weight: 900;
            line-height: 1;
          }
          .hero-number::after {
            content: '100k+';
          }
          .hero-subtitle {
            font-size: 96px;
            font-weight: 800;
          }
          .hero-subtitle::before {
            content: '$2M+';
          }
        `}</style>
        <div className="hero-number" />
        <p>Trusted by teams worldwide</p>
      </div>
    </section>
  );
}
