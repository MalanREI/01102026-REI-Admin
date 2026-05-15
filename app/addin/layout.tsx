import type { ReactNode } from 'react';
import Script from 'next/script';

export const metadata = {
  title: 'Alans Workspace',
};

export default function AddinLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <Script
        src="https://appsforoffice.microsoft.com/lib/1/hosted/office.js"
        strategy="afterInteractive"
      />
      <div className="addin-root min-h-screen bg-white text-gray-900">
        {children}
      </div>
    </>
  );
}
