// Ledgerly logo. The SVG files in client/public/brand are the single source:
// the dark variant is picked automatically with prefers-color-scheme, matching
// the colour tokens in styles.css. Use `mark` for the icon alone.
export default function Logo({ mark = false, height = 40 }) {
  const name = mark ? 'logo-mark' : 'logo';
  // The lockup is 253x64 and the mark 64x64; keep the ratio from the height.
  const width = mark ? height : Math.round((height * 253) / 64);
  return (
    <picture>
      <source srcSet={`/brand/${name}-dark.svg`} media="(prefers-color-scheme: dark)" />
      <img
        className="logo"
        src={`/brand/${name}.svg`}
        alt="Ledgerly"
        width={width}
        height={height}
      />
    </picture>
  );
}
