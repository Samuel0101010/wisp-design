// Slop fixture 13: generic AI illustration via img + background-image CSS
export function FeatureSection() {
  return (
    <section>
      <img src="abstract-isometric.svg" alt="AI" />
      <img src="/assets/undraw-collaboration.svg" alt="Team collaboration" />
      <style>{`
        .hero-illustration {
          background-image: url('/images/undraw-success.svg');
          width: 400px;
          height: 300px;
          background-size: contain;
          background-repeat: no-repeat;
        }
        .feature-bg {
          background-image: url('https://assets.drawkit.com/illustration-hero.svg');
          background-size: cover;
        }
      `}</style>
      <div className="hero-illustration" />
    </section>
  );
}
