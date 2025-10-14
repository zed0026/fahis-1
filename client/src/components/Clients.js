import React, { useState, useEffect } from 'react';
import styled from 'styled-components';
import { 
  FiUsers, 
  FiMonitor, 
  FiUser, 
  FiWifi, 
  FiWifiOff,
  FiTerminal,
  FiFolder,
  FiShield,
  FiCamera,
  FiMoreVertical,
  FiRefreshCw,
  FiClock,
  FiHardDrive,
  FiArchive,
  FiX
} from 'react-icons/fi';
import { toast } from 'react-toastify';
import axios from 'axios';

const ClientsContainer = styled.div`
  padding: 20px;
  max-width: 1200px;
  margin: 0 auto;
`;

const Header = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 30px;
`;

const Title = styled.h1`
  font-size: 28px;
  font-weight: bold;
  color: #fff;
  display: flex;
  align-items: center;
  gap: 12px;
`;

const RefreshButton = styled.button`
  background: linear-gradient(135deg, #00ff88, #00cc6a);
  border: none;
  color: #000;
  padding: 12px 20px;
  border-radius: 8px;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 600;
  transition: all 0.2s;

  &:hover {
    transform: translateY(-1px);
    box-shadow: 0 4px 12px rgba(0, 255, 136, 0.3);
  }
`;

const StatsGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 20px;
  margin-bottom: 30px;
`;

const StatCard = styled.div`
  background: linear-gradient(135deg, #1a1a1a 0%, #2d2d2d 100%);
  border-radius: 12px;
  padding: 20px;
  border: 1px solid #333;
  text-align: center;
`;

const StatValue = styled.div`
  font-size: 32px;
  font-weight: bold;
  color: #00ff88;
  margin-bottom: 8px;
`;

const StatLabel = styled.div`
  color: #888;
  font-size: 14px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
`;

const ClientsGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(350px, 1fr));
  gap: 20px;
`;

const ClientCard = styled.div`
  background: linear-gradient(135deg, #1a1a1a 0%, #2d2d2d 100%);
  border-radius: 12px;
  border: 1px solid #333;
  overflow: hidden;
  transition: all 0.3s;
  position: relative;

  &:hover {
    transform: translateY(-4px);
    box-shadow: 0 8px 25px rgba(0, 0, 0, 0.3);
    border-color: #00ff88;
  }

  ${props => props.active && `
    border-color: #00ff88;
    box-shadow: 0 0 20px rgba(0, 255, 136, 0.2);
  `}
`;

const ClientHeader = styled.div`
  background: linear-gradient(90deg, #2d2d2d 0%, #1a1a1a 100%);
  padding: 16px 20px;
  display: flex;
  align-items: center;
  justify-content: space-between;
`;

const ClientInfo = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
`;

const StatusIndicator = styled.div`
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background: ${props => props.active ? '#28a745' : '#dc3545'};
  animation: ${props => props.active ? 'pulse 2s infinite' : 'none'};
`;

const ClientName = styled.div`
  font-weight: 600;
  color: #fff;
  font-size: 16px;
`;

const ClientIP = styled.div`
  color: #888;
  font-size: 12px;
`;

const ClientActions = styled.div`
  display: flex;
  gap: 8px;
`;

const ActionButton = styled.button`
  background: rgba(0, 255, 136, 0.2);
  border: 1px solid #00ff88;
  color: #00ff88;
  padding: 6px 12px;
  border-radius: 6px;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  transition: all 0.2s;

  &:hover {
    background: rgba(0, 255, 136, 0.3);
  }

  &.primary {
    background: linear-gradient(135deg, #00ff88, #00cc6a);
    color: #000;
    border: none;

    &:hover {
      transform: translateY(-1px);
    }
  }
`;

const ClientBody = styled.div`
  padding: 20px;
`;

const InfoRow = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 12px;
  font-size: 14px;

  .icon {
    color: #00ff88;
    width: 16px;
    flex-shrink: 0;
  }

  .label {
    color: #888;
    min-width: 80px;
  }

  .value {
    color: #fff;
    flex: 1;
  }
`;

const ConnectionTime = styled.div`
  color: #666;
  font-size: 12px;
  margin-top: 16px;
  padding-top: 16px;
  border-top: 1px solid #333;
`;

const EmptyState = styled.div`
  text-align: center;
  padding: 60px 20px;
  color: #666;

  .icon {
    font-size: 64px;
    margin-bottom: 20px;
    opacity: 0.5;
  }

  h3 {
    font-size: 24px;
    margin-bottom: 12px;
    color: #888;
  }

  p {
    font-size: 16px;
    line-height: 1.5;
    max-width: 400px;
    margin: 0 auto;
  }
`;

// History Modal Styles
const ModalOverlay = styled.div`
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.8);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
`;

const ModalContent = styled.div`
  background: #1a1a1a;
  border-radius: 12px;
  padding: 24px;
  max-width: 800px;
  max-height: 80vh;
  width: 90%;
  overflow-y: auto;
  border: 1px solid #333;
`;

const ModalHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 20px;
  padding-bottom: 16px;
  border-bottom: 1px solid #333;
`;

const ModalTitle = styled.h2`
  color: #fff;
  font-size: 20px;
  font-weight: bold;
  display: flex;
  align-items: center;
  gap: 8px;
`;

const CloseButton = styled.button`
  background: none;
  border: none;
  color: #fff;
  font-size: 24px;
  cursor: pointer;
  padding: 4px;
  border-radius: 4px;
  
  &:hover {
    background: rgba(255, 255, 255, 0.1);
  }
`;

const HistorySection = styled.div`
  margin-bottom: 24px;
`;

const SectionTitle = styled.h3`
  color: #00ff88;
  font-size: 16px;
  font-weight: bold;
  margin-bottom: 12px;
  display: flex;
  align-items: center;
  gap: 8px;
`;

const SessionItem = styled.div`
  background: rgba(255, 255, 255, 0.05);
  border-radius: 8px;
  padding: 12px;
  margin-bottom: 8px;
  border-left: 3px solid #00ff88;
`;

const SessionInfo = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
`;

const SessionTime = styled.span`
  color: #888;
  font-size: 12px;
`;

const SessionDuration = styled.span`
  color: #00ff88;
  font-size: 12px;
  font-weight: 500;
`;

const CommandItem = styled.div`
  background: rgba(0, 255, 136, 0.1);
  border-radius: 6px;
  padding: 8px 12px;
  margin: 4px 0;
  font-family: 'Courier New', monospace;
  font-size: 12px;
  color: #fff;
  border-left: 2px solid #00ff88;
`;

const CommandTime = styled.span`
  color: #888;
  font-size: 10px;
  margin-right: 8px;
`;

const NoData = styled.div`
  color: #888;
  font-style: italic;
  text-align: center;
  padding: 20px;
`;

const Clients = ({ clients, onClientSelect, onDeleteClient }) => {
  const [refreshing, setRefreshing] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [selectedClient, setSelectedClient] = useState(null);
  const [clientHistory, setClientHistory] = useState(null);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [showAllHistory, setShowAllHistory] = useState(false);
  const [allClientsHistory, setAllClientsHistory] = useState([]);
  const [loadingAllHistory, setLoadingAllHistory] = useState(false);

  const handleRefresh = () => {
    setRefreshing(true);
    // Simulate refresh
    setTimeout(() => {
      setRefreshing(false);
      toast.success('Client list refreshed');
    }, 1000);
  };

  const handleShowHistory = async (client) => {
    setSelectedClient(client);
    setShowHistory(true);
    setLoadingHistory(true);
    
    try {
      const response = await axios.get(`/api/clients/${client.id}/history`);
      setClientHistory(response.data);
    } catch (error) {
      console.error('Error fetching client history:', error);
      toast.error('Failed to load client history');
    } finally {
      setLoadingHistory(false);
    }
  };

  const handleCloseHistory = () => {
    setShowHistory(false);
    setSelectedClient(null);
    setClientHistory(null);
  };

  const handleShowAllHistory = async () => {
    setShowAllHistory(true);
    setLoadingAllHistory(true);
    
    try {
      const response = await axios.get('/api/clients');
      setAllClientsHistory(response.data);
    } catch (error) {
      console.error('Error fetching all clients history:', error);
      toast.error('Failed to load clients history');
    } finally {
      setLoadingAllHistory(false);
    }
  };

  const handleCloseAllHistory = () => {
    setShowAllHistory(false);
    setAllClientsHistory([]);
  };

  const getConnectionTime = (connectedAt) => {
    const now = new Date();
    const connected = new Date(connectedAt);
    const diff = now - connected;
    
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    
    if (hours > 0) {
      return `${hours}h ${minutes}m ago`;
    } else {
      return `${minutes}m ago`;
    }
  };

  const activeClients = clients.filter(client => client.active);
  const totalClients = clients.length;

  if (clients.length === 0) {
    return (
      <ClientsContainer>
        <Header>
          <Title>
            <FiUsers />
            Connected Clients
          </Title>
        </Header>
        
        <EmptyState>
          <FiUsers className="icon" />
          <h3>No Clients Connected</h3>
          <p>
            Start your Go client to establish a connection. 
            Clients will appear here once they connect to the server.
          </p>
        </EmptyState>
      </ClientsContainer>
    );
  }

  return (
    <ClientsContainer>
      <Header>
        <Title>
          <FiUsers />
          Connected Clients
        </Title>
        <div style={{ display: 'flex', gap: '12px' }}>
          <ActionButton onClick={handleShowAllHistory}>
            <FiArchive />
            View All History
          </ActionButton>
          <RefreshButton onClick={handleRefresh} disabled={refreshing}>
            <FiRefreshCw className={refreshing ? 'spinner' : ''} />
            Refresh
          </RefreshButton>
        </div>
      </Header>

      <StatsGrid>
        <StatCard>
          <StatValue>{totalClients}</StatValue>
          <StatLabel>Total Clients</StatLabel>
        </StatCard>
        <StatCard>
          <StatValue>{activeClients.length}</StatValue>
          <StatLabel>Active Sessions</StatLabel>
        </StatCard>
        <StatCard>
          <StatValue>{totalClients - activeClients.length}</StatValue>
          <StatLabel>Disconnected</StatLabel>
        </StatCard>
      </StatsGrid>

      <ClientsGrid>
        {clients.map(client => (
          <ClientCard key={client.id} active={client.active}>
            <ClientHeader>
              <ClientInfo>
                <StatusIndicator active={client.active} />
                <div>
                  <ClientName>{client.hostname}</ClientName>
                  <ClientIP>{client.ip}</ClientIP>
                </div>
              </ClientInfo>
              
              <ClientActions>
                <ActionButton
                  className="primary"
                  onClick={() => onClientSelect(client)}
                >
                  <FiTerminal />
                  Connect
                </ActionButton>
                <ActionButton onClick={() => handleShowHistory(client)}>
                  <FiArchive />
                  History
                </ActionButton>
                {!client.active && (
                  <ActionButton onClick={() => onDeleteClient && onDeleteClient(client.id)}>
                    <FiMoreVertical /> Delete
                  </ActionButton>
                )}
              </ClientActions>
            </ClientHeader>

            <ClientBody>
              <InfoRow>
                <FiUser className="icon" />
                <span className="label">User:</span>
                <span className="value">{client.username}</span>
              </InfoRow>
              
              <InfoRow>
                <FiHardDrive className="icon" />
                <span className="label">MAC:</span>
                <span className="value">{client.macAddress}</span>
              </InfoRow>
              
              <InfoRow>
                {client.active ? <FiWifi className="icon" /> : <FiWifiOff className="icon" />}
                <span className="label">Status:</span>
                <span className="value">
                  {client.active ? 'Online' : 'Offline'}
                </span>
              </InfoRow>

              <ConnectionTime>
                <FiClock style={{ marginRight: '6px' }} />
                Connected {getConnectionTime(client.connectedAt)}
              </ConnectionTime>
            </ClientBody>
          </ClientCard>
        ))}
      </ClientsGrid>

      {/* History Modal */}
      {showHistory && (
        <ModalOverlay onClick={handleCloseHistory}>
          <ModalContent onClick={(e) => e.stopPropagation()}>
            <ModalHeader>
              <ModalTitle>
                <FiArchive />
                Client History - {selectedClient?.hostname}
              </ModalTitle>
              <CloseButton onClick={handleCloseHistory}>
                <FiX />
              </CloseButton>
            </ModalHeader>

            {loadingHistory ? (
              <NoData>Loading history...</NoData>
            ) : clientHistory ? (
              <>
                {/* Current Session */}
                {clientHistory.currentSession && (
                  <HistorySection>
                    <SectionTitle>
                      <FiWifi />
                      Current Session
                    </SectionTitle>
                    <SessionItem>
                      <SessionInfo>
                        <SessionTime>
                          Connected: {new Date(clientHistory.currentSession.connectTime).toLocaleString()}
                        </SessionTime>
                        <SessionDuration>
                          Duration: {getConnectionTime(clientHistory.currentSession.connectTime)}
                        </SessionDuration>
                      </SessionInfo>
                      <div>
                        <strong>IP:</strong> {clientHistory.currentSession.ipAddress}
                      </div>
                    </SessionItem>
                  </HistorySection>
                )}

                {/* Historical Sessions */}
                {clientHistory.historicalSessions && clientHistory.historicalSessions.length > 0 && (
                  <HistorySection>
                    <SectionTitle>
                      <FiClock />
                      Historical Sessions ({clientHistory.historicalSessions.length})
                    </SectionTitle>
                    {clientHistory.historicalSessions.map((session, index) => (
                      <SessionItem key={index}>
                        <SessionInfo>
                          <SessionTime>
                            {new Date(session.connectTime).toLocaleString()} - 
                            {session.disconnectTime ? new Date(session.disconnectTime).toLocaleString() : 'Active'}
                          </SessionTime>
                          {session.duration && (
                            <SessionDuration>
                              Duration: {Math.round(session.duration / 1000 / 60)} minutes
                            </SessionDuration>
                          )}
                        </SessionInfo>
                        <div>
                          <strong>IP:</strong> {session.ipAddress}
                        </div>
                      </SessionItem>
                    ))}
                  </HistorySection>
                )}

                {/* Commands */}
                {clientHistory.commands && clientHistory.commands.length > 0 && (
                  <HistorySection>
                    <SectionTitle>
                      <FiTerminal />
                      Recent Commands ({clientHistory.commands.length})
                    </SectionTitle>
                    {clientHistory.commands.slice(0, 20).map((cmd, index) => (
                      <CommandItem key={index}>
                        <CommandTime>
                          {new Date(cmd.timestamp).toLocaleString()}
                        </CommandTime>
                        {cmd.command}
                      </CommandItem>
                    ))}
                    {clientHistory.commands.length > 20 && (
                      <NoData>... and {clientHistory.commands.length - 20} more commands</NoData>
                    )}
                  </HistorySection>
                )}

                {(!clientHistory.currentSession && 
                  (!clientHistory.historicalSessions || clientHistory.historicalSessions.length === 0) && 
                  (!clientHistory.commands || clientHistory.commands.length === 0)) && (
                  <NoData>No history available for this client</NoData>
                )}
              </>
            ) : (
              <NoData>Failed to load history</NoData>
            )}
          </ModalContent>
        </ModalOverlay>
      )}

      {/* All History Modal */}
      {showAllHistory && (
        <ModalOverlay onClick={handleCloseAllHistory}>
          <ModalContent onClick={(e) => e.stopPropagation()}>
            <ModalHeader>
              <ModalTitle>
                <FiArchive />
                All Clients History
              </ModalTitle>
              <CloseButton onClick={handleCloseAllHistory}>
                <FiX />
              </CloseButton>
            </ModalHeader>

            {loadingAllHistory ? (
              <NoData>Loading all clients history...</NoData>
            ) : allClientsHistory && allClientsHistory.length > 0 ? (
              <div>
                {allClientsHistory.map((client) => (
                  <HistorySection key={client.id}>
                    <SectionTitle>
                      <FiMonitor />
                      {client.hostname} ({client.username})
                    </SectionTitle>
                    <SessionItem>
                      <SessionInfo>
                        <SessionTime>
                          Last Seen: {new Date(client.lastSeen).toLocaleString()}
                        </SessionTime>
                        <SessionDuration>
                          Total Connections: {client.totalConnections || 0}
                        </SessionDuration>
                      </SessionInfo>
                      <div>
                        <strong>IP:</strong> {client.ip} | 
                        <strong> OS:</strong> {client.os} | 
                        <strong> Status:</strong> {client.active ? 'Online' : 'Offline'}
                      </div>
                      <div style={{ marginTop: '8px' }}>
                        <ActionButton 
                          onClick={() => {
                            handleCloseAllHistory();
                            handleShowHistory(client);
                          }}
                          style={{ fontSize: '12px', padding: '4px 8px' }}
                        >
                          <FiArchive />
                          View Detailed History
                        </ActionButton>
                      </div>
                    </SessionItem>
                  </HistorySection>
                ))}
              </div>
            ) : (
              <NoData>No client history found</NoData>
            )}
          </ModalContent>
        </ModalOverlay>
      )}
    </ClientsContainer>
  );
};

export default Clients;