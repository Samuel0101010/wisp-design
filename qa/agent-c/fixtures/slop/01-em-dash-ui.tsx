// Slop fixture 01: em-dash in CSS content: string (adjacent to button/heading)
// The linter catches em-dashes in CSS content: strings reliably.
// The JSX-text path requires no newline between em-dash and closing tag.
export function SubscribeButton() {
  return (
    <div>
      <style>{`
        .cta-btn::after {
          content: 'Subscribe — get updates';
        }
        h1.tagline::before {
          content: 'Build fast — ship faster';
        }
      `}</style>
      <button className="cta-btn">Subscribe</button>
      <h1 className="tagline"></h1>
    </div>
  );
}
