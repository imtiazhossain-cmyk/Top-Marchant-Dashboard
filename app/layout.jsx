import './globals.css';
import { Inter, Space_Grotesk } from 'next/font/google';

const inter = Inter({ subsets: ['latin'], weight: ['400', '500', '600'], variable: '--font-body', display: 'swap' });
const grotesk = Space_Grotesk({ subsets: ['latin'], weight: ['500', '600', '700'], variable: '--font-display', display: 'swap' });

export const metadata = { title: 'Carry Bee · Top Merchant Analytics', description: 'Operations dashboard for Carry Bee top merchants' };

export default function RootLayout({ children }) {
  return (
    <html lang="en" className={`${inter.variable} ${grotesk.variable}`}>
      <body className="font-body">{children}</body>
    </html>
  );
}
