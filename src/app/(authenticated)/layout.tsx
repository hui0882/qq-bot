// src/app/(authenticated)/layout.tsx
import { Sidebar } from '@/components/sidebar'

export default function AuthenticatedLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="ml-64 flex-1 p-6">{children}</main>
    </div>
  )
}
