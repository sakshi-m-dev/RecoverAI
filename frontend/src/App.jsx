import { BrowserRouter, Routes, Route } from 'react-router-dom'
import Navbar from './components/shared/Navbar'
import Dashboard from './components/Dashboard'
import CaseDetail from './components/CaseDetail'
import BatchRun from './components/BatchRun'
import { BatchProvider } from './context/BatchContext'

function App() {
  return (
    <BrowserRouter>
      <BatchProvider>
        <div className="min-h-screen bg-bg-primary text-text-primary font-sans">
          <Navbar />
          <main>
            <Routes>
              <Route path="/"         element={<Dashboard />} />
              <Route path="/case/:id" element={<CaseDetail />} />
              <Route path="/batch"    element={<BatchRun />} />
            </Routes>
          </main>
        </div>
      </BatchProvider>
    </BrowserRouter>
  )
}

export default App
