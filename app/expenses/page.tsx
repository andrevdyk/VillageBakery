import { Header } from '@/components/header'
import ExpensesPage from './expenses-page'

export default function Page() {
  return (
    <main className="min-h-screen bg-background">
      <Header />
      <ExpensesPage />
    </main>
  )
}