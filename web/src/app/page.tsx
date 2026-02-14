export default function Home() {
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: '100vh',
      gap: '1rem'
    }}>
      <h1 style={{ fontSize: '4rem', fontWeight: 'bold' }}>Tide</h1>
      <p style={{ color: 'var(--secondary-foreground)' }}>Minimalist. Local-First. Encrypted.</p>
    </div>
  );
}
