import React from 'react';
import styled from 'styled-components';
import { 
  FiHome, 
  FiUsers, 
  FiTerminal, 
  FiFolder, 
  FiShield, 
  FiCamera, 
  FiSettings,
  FiChevronRight,
  FiMonitor,
  FiActivity
} from 'react-icons/fi';

const SidebarContainer = styled.aside`
  width: ${props => props.open ? '280px' : '0'};
  background: linear-gradient(180deg, #1a1a1a 0%, #0f0f0f 100%);
  border-right: 1px solid #333;
  height: calc(100vh - 60px);
  position: fixed;
  left: 0;
  top: 60px;
  transition: width 0.3s ease;
  overflow: hidden;
  z-index: 999;
`;

const SidebarContent = styled.div`
  padding: 20px 0;
  height: 100%;
  overflow-y: auto;
`;

const NavSection = styled.div`
  margin-bottom: 30px;
`;

const SectionTitle = styled.h3`
  color: #666;
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 1px;
  margin: 0 0 10px 20px;
  font-weight: 500;
`;

const NavItem = styled.button`
  width: 100%;
  background: none;
  border: none;
  color: ${props => props.active ? '#00ff88' : '#ccc'};
  padding: 12px 20px;
  text-align: left;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 12px;
  font-size: 14px;
  transition: all 0.2s;
  position: relative;

  &:hover {
    background: rgba(0, 255, 136, 0.1);
    color: #00ff88;
  }

  ${props => props.active && `
    background: rgba(0, 255, 136, 0.15);
    
    &::before {
      content: '';
      position: absolute;
      left: 0;
      top: 0;
      bottom: 0;
      width: 3px;
      background: #00ff88;
    }
  `}

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
  margin-top: 10px;
  max-height: 300px;
  overflow-y: auto;
`;

const ClientItem = styled.button`
  width: 100%;
  background: none;
  border: none;
  color: #ccc;
  padding: 8px 20px 8px 40px;
  text-align: left;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 13px;
  transition: all 0.2s;
  position: relative;

  &:hover {
    background: rgba(255, 255, 255, 0.05);
    color: #fff;
  }

  ${props => props.selected && `
    background: rgba(0, 255, 136, 0.1);
    color: #00ff88;
  `}

  .status-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: ${props => props.active ? '#28a745' : '#dc3545'};
    flex-shrink: 0;
  }

  .client-info {
    flex: 1;
    min-width: 0;
  }

  .client-name {
    font-weight: 500;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .client-ip {
    font-size: 11px;
    color: #888;
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
  onClientSelect 
}) => {
  const [selectedClient, setSelectedClient] = React.useState(null);

  const handleClientClick = (client) => {
    setSelectedClient(client);
    onClientSelect(client);
  };

  const navItems = [
    { id: 'dashboard', label: 'Dashboard', icon: FiHome },
    { id: 'clients', label: 'Clients', icon: FiUsers },
    { id: 'terminal', label: 'Terminal', icon: FiTerminal },
    { id: 'files', label: 'File Manager', icon: FiFolder },
    { id: 'browser', label: 'Browser Data', icon: FiShield },
    { id: 'ransomware', label: 'Ransomware', icon: FiShield },
    { id: 'screenshots', label: 'Screenshots', icon: FiCamera },
    { id: 'settings', label: 'Settings', icon: FiSettings }
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
            <SectionTitle>Connected Clients ({clients.length})</SectionTitle>
            <ClientsList>
              {clients.map(client => (
                <ClientItem
                  key={client.id}
                  active={client.active}
                  selected={selectedClient?.id === client.id}
                  onClick={() => handleClientClick(client)}
                >
                  <div className="status-dot" />
                  <div className="client-info">
                    <div className="client-name">{client.hostname}</div>
                    <div className="client-ip">{client.ip}</div>
                  </div>
                </ClientItem>
              ))}
            </ClientsList>
          </NavSection>
        )}

        <NavSection>
          <SectionTitle>System Status</SectionTitle>
          <NavItem>
            <FiActivity className="icon" />
            <span>Server Online</span>
          </NavItem>
          <NavItem>
            <FiMonitor className="icon" />
            <span>Port 2026</span>
          </NavItem>
        </NavSection>
      </SidebarContent>
    </SidebarContainer>
  );
};

export default Sidebar;
