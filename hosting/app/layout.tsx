import type { Metadata } from 'next';
export const metadata: Metadata = { title: '潭行 Twin — 南投公共運輸營運決策', description: '6670旅運需求、班次配置與3D營運模擬' };
export default function RootLayout({children}: {children:React.ReactNode}) {return <html lang="zh-Hant"><body style={{margin:0}}>{children}</body></html>}
