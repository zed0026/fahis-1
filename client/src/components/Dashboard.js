import React from 'react';
import styled from 'styled-components';
import { 
  FiUsers, 
  FiActivity, 
  FiShield, 
  FiMonitor,
  FiTrendingUp,
  FiAlertCircle,
  FiCheckCircle,
  FiClock
} from 'react-icons/fi';

const DashboardContainer = styled.div`
  padding: 20px;
  max-width: 1200px;
  margin: 0 auto;
`;

const WelcomeSection = styled.div`
  background: linear-gradient(135deg, #1a1a1a 0%, #2d2d2d 100%);
  border-radius: 12px;
  padding: 30px;
  margin-bottom: 30px;
  border: 1px solid #333;
  position: relative;
  overflow: hidden;

  &::before {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    height: 3px;
    background: linear-gradient(90deg, #00ff88, #00cc6a);
  }
`;

const WelcomeTitle = styled.h1`
  font-size: 28px;
  font-weight: bold;
  color: #fff;
  margin-bottom: 10px;
`;

const WelcomeSubtitle = styled.p`
  color: #888;
  font-size: 16px;
  margin-bottom: 20px;
`;

const StatsGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
  gap: 20px;
  margin-bottom: 30px;
`;

const StatCard = styled.div`
  background: linear-gradient(135deg, #1a1a1a 0%, #2d2d2d 100%);
  border-radius: 12px;
  padding: 24px;
  border: 1px solid #333;
  transition: transform 0.2s, box-shadow 0.2s;

  &:hover {
    transform: translateY(-2px);
    box-shadow: 0 8px 25px rgba(0, 0, 0, 0.3);
  }
`;

const StatHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16px;
`;

const StatIcon = styled.div`
  width: 48px;
  height: 48px;
  border-radius: 12px;
  background: ${props => props.color || 'linear-gradient(135deg, #00ff88, #00cc6a)'};
  display: flex;
  align-items: center;
  justify-content: center;
  color: #000;
  font-size: 20px;
`;

const StatValue = styled.div`
  font-size: 32px;
  font-weight: bold;
  color: #fff;
  margin-bottom: 4px;
`;

const StatLabel = styled.div`
  color: #888;
  font-size: 14px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
`;

const StatChange = styled.div`
  font-size: 12px;
  color: ${props => props.positive ? '#28a745' : '#dc3545'};
  display: flex;
  align-items: center;
  gap: 4px;
  margin-top: 8px;
`;

const ClientsSection = styled.div`
  background: linear-gradient(135deg, #1a1a1a 0%, #2d2d2d 100%);
  border-radius: 12px;
  padding: 24px;
  border: 1px solid #333;
`;

const SectionTitle = styled.h2`
  font-size: 20px;
  font-weight: 600;
  color: #fff;
  margin-bottom: 20px;
  display: flex;
  align-items: center;
  gap: 10px;
`;

const ClientsList = styled.div`
  display: grid;
  gap: 12px;
`;

const ClientCard = styled.div`
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid #333;
  border-radius: 8px;
  padding: 16px;
  cursor: pointer;
  transition: all 0.2s;
  display: flex;
  align-items: center;
  gap: 16px;

  &:hover {
    background: rgba(0, 255, 136, 0.1);
    border-color: #00ff88;
  }
`;

const ClientStatus = styled.div`
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background: ${props => props.active ? '#28a745' : '#dc3545'};
  flex-shrink: 0;
`;

const ClientInfo = styled.div`
  flex: 1;
`;

const ClientName = styled.div`
  font-weight: 500;
  color: #fff;
  margin-bottom: 4px;
`;

const ClientDetails = styled.div`
  font-size: 12px;
  color: #888;
  display: flex;
  gap: 16px;
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
  font-size: 12px;
  cursor: pointer;
  transition: all 0.2s;

  &:hover {
    background: rgba(0, 255, 136, 0.3);
  }
`;

const EmptyState = styled.div`
  text-align: center;
  padding: 40px 20px;
  color: #666;

  .icon {
    font-size: 48px;
    margin-bottom: 16px;
    opacity: 0.5;
  }

  h3 {
    font-size: 18px;
    margin-bottom: 8px;
    color: #888;
  }

  p {
    font-size: 14px;
    line-height: 1.5;
  }
`;

const Dashboard = ({ clients, onClientSelect }) => {
  const activeClients = clients.filter(client => client.active);
  const totalClients = clients.length;

  const stats = [
    {
      label: 'Total Clients',
      value: totalClients,
      icon: FiUsers,
      color: 'linear-gradient(135deg, #007bff, #0056b3)',
      change: '+2 this week',
      positive: true
    },
    {
      label: 'Active Sessions',
      value: activeClients.length,
      icon: FiActivity,
      color: 'linear-gradient(135deg, #28a745, #1e7e34)',
      change: activeClients.length > 0 ? 'All systems operational' : 'No active sessions',
      positive: activeClients.length > 0
    },
    {
      label: 'Security Status',
      value: 'Secure',
      icon: FiShield,
      color: 'linear-gradient(135deg, #ffc107, #e0a800)',
      change: 'Encrypted connections',
      positive: true
    },
    {
      label: 'Server Uptime',
      value: '99.9%',
      icon: FiMonitor,
      color: 'linear-gradient(135deg, #17a2b8, #138496)',
      change: 'Last 30 days',
      positive: true
    }
  ];

  return (
    <DashboardContainer>
      <WelcomeSection>
        <WelcomeTitle>Welcome to FAHIS C2</WelcomeTitle>
        <WelcomeSubtitle>
          Command and Control Dashboard - Monitor and manage your connected clients
        </WelcomeSubtitle>
      </WelcomeSection>

      <StatsGrid>
        {stats.map((stat, index) => {
          const Icon = stat.icon;
          return (
            <StatCard key={index}>
              <StatHeader>
                <StatIcon color={stat.color}>
                  <Icon />
                </StatIcon>
              </StatHeader>
              <StatValue>{stat.value}</StatValue>
              <StatLabel>{stat.label}</StatLabel>
              <StatChange positive={stat.positive}>
                <FiTrendingUp />
                {stat.change}
              </StatChange>
            </StatCard>
          );
        })}
      </StatsGrid>

      <ClientsSection>
        <SectionTitle>
          <FiUsers />
          Connected Clients
        </SectionTitle>
        
        {clients.length === 0 ? (
          <EmptyState>
            <FiUsers className="icon" />
            <h3>No Clients Connected</h3>
            <p>
              Start your Go client to establish a connection.<br />
              Clients will appear here once they connect to the server.
            </p>
          </EmptyState>
        ) : (
          <ClientsList>
            {clients.map(client => (
              <ClientCard key={client.id} onClick={() => onClientSelect(client)}>
                <ClientStatus active={client.active} />
                <ClientInfo>
                  <ClientName>{client.hostname}</ClientName>
                  <ClientDetails>
                    <span>IP: {client.ip}</span>
                    <span>User: {client.username}</span>
                    <span>MAC: {client.macAddress}</span>
                    <span>Connected: {new Date(client.connectedAt).toLocaleString()}</span>
                  </ClientDetails>
                </ClientInfo>
                <ClientActions>
                  <ActionButton onClick={(e) => {
                    e.stopPropagation();
                    onClientSelect(client);
                  }}>
                    Connect
                  </ActionButton>
                </ClientActions>
              </ClientCard>
            ))}
          </ClientsList>
        )}
      </ClientsSection>
    </DashboardContainer>
  );
};

export default Dashboard;
