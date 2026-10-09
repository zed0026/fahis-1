import React from 'react';
import styled from 'styled-components';
import { 
  FiHome, 
  FiUsers, 
  FiTerminal, 
  FiFolder, 
  FiShield, 
  FiCamera,
  FiChevronRight,
  FiMonitor,
  FiActivity
} from 'react-icons/fi';

const SidebarContainer = styled.aside`
  width: ${props => props.open ? '260px' : '0'};
  background: #12151c;
  border-right: 1px solid #2a3140;
  height: calc(100vh - 64px);
  position: fixed;
  left: 0;
  top: 64px;
  transition: width 0.28s ease;
  overflow: hidden;
  z-index: 999;
`;

const SidebarContent = styled.div`
  padding: 18px 12px;
  height: 100%;
  overflow-y: auto;
  width: 260px;
`;

const NavSection = styled.div`
  margin-bottom: 28px;
`;

const SectionTitle = styled.h3`
  color: #5c657a;
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.12em;
  margin: 0 8px 10px;
  font-weight: 600;
`;

const NavItem = styled.button`
  width: 100%;
  background: ${props => props.active ? 'rgba(198, 242, 62, 0.12)' : 'transparent'};
  border: 1px solid ${props => props.active ? 'rgba(198, 242, 62, 0.28)' : 'transparent'};
  color: ${props => props.active ? '#c6f23e' : '#aeb6c7'};
  padding: 11px 12px;
  text-align: left;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 12px;
  font-size: 14px;
  font-family: inherit;
  font-weight: ${props => props.active ? 600 : 500};
  border-radius: 10px;
  margin-bottom: 4px;
  transition: background 0.15s, color 0.15s, border-color 0.15s;

  &:hover {
    background: rgba(198, 242, 62, 0.08);
    color: #c6f23e;
    border-color: rgba(198, 242, 62, 0.18);
  }

  .icon {
    font-size: 16px;
    min-width: 16px;
  }

  .arrow {
    margin-left: auto;
    font-size: 12px;
    opacity: 0.6;
  }
`;

const ClientsList = styled.div`
  margin-top: 6px;
  max-height: 300px;
  overflow-y: auto;
`;

const ClientItem = styled.button`
  width: 100%;
  background: ${props => props.selected ? 'rgba(198, 242, 62, 0.1)' : 'transparent'};
  border: 1px solid ${props => props.selected ? 'rgba(198, 242, 62, 0.22)' : 'transparent'};
  color: ${props => props.selected ? '#c6f23e' : '#aeb6c7'};
  padding: 10px 12px;
  text-align: left;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 13px;
  font-family: inherit;
  border-radius: 10px;
  margin-bottom: 4px;
  transition: background 0.15s, color 0.15s;

  &:hover {
    background: rgba(255, 255, 255, 0.04);
    color: #eef1f6;
  }

  .status-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: ${props => props.active ? '#5ddea0' : '#ff6b7a'};
    flex-shrink: 0;
  }

  .client-info {
    flex: 1;
    min-width: 0;
  }

  .client-name {
    font-weight: 600;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .client-ip {
    font-size: 11px;
    color: #8b93a7;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
`;

const Sidebar = ({ 
  open, 
  currentView, 
  onViewChange, 
  clients, 
  onSessionSelect 
}) => {
  const [selectedClient, setSelectedClient] = React.useState(null);

  const handleClientClick = (client) => {
    setSelectedClient(client);
    onSessionSelect(client);
  };

  const navItems = [
    { id: 'dashboard', label: 'Dashboard', icon: FiHome },
    { id: 'users', label: 'User Management', icon: FiUsers }
  ];

  return (
    <SidebarContainer open={open}>
      <SidebarContent>
        <NavSection>
          <SectionTitle>Navigation</SectionTitle>
          {navItems.map(item => {
            const Icon = item.icon;
            return (
              <NavItem
                key={item.id}
                active={currentView === item.id}
                onClick={() => onViewChange(item.id)}
              >
                <Icon className="icon" />
                {item.label}
                {item.id === 'terminal' && selectedClient && (
                  <FiChevronRight className="arrow" />
                )}
              </NavItem>
            );
          })}
        </NavSection>

        {clients.length > 0 && (
          <NavSection>
            <SectionTitle>Sessions</SectionTitle>
            <ClientsList>
              {clients.map(client => {
                const sessionName = (() => {
                  try {
                    const names = JSON.parse(localStorage.getItem('sessionNames') || '{}');
                    return names[client.id] || client.hostname;
                  } catch {
                    return client.hostname;
                  }
                })();
                
                return (
                  <ClientItem
                    key={client.id}
                    active={client.active}
                    selected={selectedClient?.id === client.id}
                    onClick={() => handleClientClick(client)}
                  >
                    <div className="status-dot" />
                    <div className="client-info">
                      <div className="client-name">{sessionName}</div>
                      <div className="client-ip">{client.ip}</div>
                    </div>
                  </ClientItem>
                );
              })}
            </ClientsList>
          </NavSection>
        )}
      </SidebarContent>
    </SidebarContainer>
  );
};

export default Sidebar;