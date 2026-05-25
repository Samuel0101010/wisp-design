// Slop fixture 03: gradient text headline (Tailwind utility classes)
export function HeroHeadline() {
  return (
    <div>
      <h1 className="bg-gradient-to-r from-purple-500 to-blue-500 bg-clip-text text-transparent text-5xl font-bold">
        Transform Your Business
      </h1>
      <style>{`
        h1 {
          background-clip: text;
          color: transparent;
        }
      `}</style>
    </div>
  );
}
