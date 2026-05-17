import './globals.css';

export const metadata = {
  title: 'two.desk — dual trading agents',
  description: 'Two opinionated trading agents debate your setup.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
