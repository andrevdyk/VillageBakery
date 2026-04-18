import { Header } from '@/components/header'
import { StockTab } from './stock-tab'

export default function Page() {
  return (
    <main className="min-h-screen bg-background">
      <Header />
      <StockTab />
    </main>
  )
}