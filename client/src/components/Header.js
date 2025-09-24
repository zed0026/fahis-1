import React from 'react';
import styled from 'styled-components';
import { FiMenu, FiWifi, FiWifiOff, FiUser, FiMonitor } from 'react-icons/fi';
import { useState } from 'react';

const HeaderContainer = styled.header`
  background: linear-gradient(90deg, #1a1a1a 0%, #2d2d2d 100%);
  border-bottom: 1px solid #333;
  height: 60px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 20px;
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  z-index: 1000;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.3);
`;

const LeftSection = styled.div`
  display: flex;
  align-items: center;
  gap: 20px;
`;

const MenuButton = styled.button`
  background: none;
  border: none;
  color: #fff;
  font-size: 20px;
  cursor: pointer;
  padding: 8px;
  border-radius: 4px;
  transition: background-color 0.2s;

  &:hover {
    background-color: rgba(255, 255, 255, 0.1);
  }
`;

const Logo = styled.div`
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 18px;
  font-weight: bold;
  color: #00ff88;

  .logo-icon {
    width: 32px;
    height: 32px;
    background: linear-gradient(45deg, #00ff88, #00cc6a);
    border-radius: 6px;
    display: flex;
    align-items: center;
    justify-content: center;
    color: #000;
    font-weight: bold;
  }
`;

const RightSection = styled.div`
  display: flex;
  align-items: center;
  gap: 20px;
`;

const StatusIndicator = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 12px;
  background: ${props => props.connected ? 'rgba(40, 167, 69, 0.2)' : 'rgba(220, 53, 69, 0.2)'};
  border: 1px solid ${props => props.connected ? '#28a745' : '#dc3545'};
  border-radius: 20px;
  font-size: 14px;
  color: ${props => props.connected ? '#28a745' : '#dc3545'};
`;

const ClientInfo = styled.div`
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 16px;
  background: rgba(255, 255, 255, 0.05);
  border-radius: 20px;
  font-size: 14px;

  .client-icon {
    color: #00ff88;
  }

  .client-details {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .client-name {
    font-weight: 500;
    color: #fff;
  }

  .client-ip {
    font-size: 12px;
    color: #888;
  }
`;

const ViewTitle = styled.div`
  font-size: 16px;
  font-weight: 500;
  color: #fff;
  text-transform: capitalize;
`;

const Header = ({ 
  onToggleSidebar, 
  sidebarOpen, 
  currentView, 
  selectedClient 
}) => {
  const [connected, setConnected] = useState (true); // This would come from socket connection

  return (
    <HeaderContainer>
      <LeftSection>
        <MenuButton onClick={onToggleSidebar}>
          <FiMenu />
        </MenuButton>
        
        <Logo>
          <div className="logo-icon"></div>
          <span>FAHIS C2</span>
        </Logo>

        <ViewTitle>
          {currentView === 'terminal' && selectedClient 
            ? `Terminal - ${selectedClient.hostname}`
            : currentView
          }
        </ViewTitle>
      </LeftSection>

      <RightSection>
        <StatusIndicator connected={connected}>
          {connected ? <FiWifi /> : <FiWifiOff />}
          {connected ? 'Connected' : 'Disconnected'}
        </StatusIndicator>

        {selectedClient && (
          <ClientInfo>
            <FiMonitor className="client-icon" />
            <div className="client-details">
              <div className="client-name">{selectedClient.hostname}</div>
              <div className="client-ip">{selectedClient.ip}</div>
            </div>
          </ClientInfo>
        )}
      </RightSection>
    </HeaderContainer>
  );
};

export default Header;
