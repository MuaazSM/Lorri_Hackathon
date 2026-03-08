import Navbar from './Navbar'
import Footer from './Footer'

export default function PageShell({ children }) {
  return (
    <div className="lorri-page">
      <Navbar />
      {children}
      <Footer />
    </div>
  )
}