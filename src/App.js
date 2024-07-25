import React from 'react';
import { BrowserRouter as Router, Route, Routes } from 'react-router-dom';
import 'bootstrap/dist/css/bootstrap.min.css';
import '@fortawesome/fontawesome-free/css/all.css';
import './App.css';
import Navbar from './components/Navbar';
import LoginForm from './components/LoginForm';
import Dashboard from './components/Dashboard';
import RegisterForm from './components/RegisterForm';
import { AuthProvider } from './scripts/AuthContext'; // Importe o AuthProvider

function App() {
  return (
    <AuthProvider> {/* Envolva o aplicativo com o AuthProvider */}
      <Router>
        <div className="App">
          <div className="position-absolute top-0 start-0 end-0 bottom-0 d-flex flex-column navbar-expand-md vw-100 overflow-hidden">
            <Navbar />
            <div className="d-flex flex-column flex-grow-1 overflow-hidden">
              <div className="w-100 mainh flex-grow-1 position-relative">
                <div className="position-absolute top-0 start-0 end-0 bottom-0 overflow-overlay d-flex flex-column overflow-y">
                  <Routes>
                    <Route exact path="/" element={<LoginForm />} />
                    <Route path="/dashboard" element={<Dashboard />} />
                    <Route path="/register" element={<RegisterForm />} />
                  </Routes>
                </div>
              </div>
            </div>
          </div>
        </div>
      </Router>
    </AuthProvider>
  );
}

export default App;
