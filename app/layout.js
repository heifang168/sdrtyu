import "./globals.css";

export const metadata = {
  title: "My Website",
  description: "My first website deployed on Vercel"
};

export default function RootLayout({ children }) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
